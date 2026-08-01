"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";

type BoardStats = { people: number; connectors: number; groups: number };

type PendingImport = { board: unknown; stats: BoardStats; filename: string };

export function ExportMenu({
  caseId,
  caseTitle,
  captureRef,
  onImported,
}: {
  caseId: string;
  caseTitle: string;
  /** The canvas viewport element — what PNG and PDF exports rasterise. */
  captureRef: React.RefObject<HTMLElement>;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Fixed-viewport position for the dropdown. The board header is a horizontal
  // scroll container (overflow-x), which also clips vertically — an absolutely
  // positioned menu would be cut off. Positioning it fixed escapes that clip.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const toast = useToast();

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, []);

  const slug =
    caseTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "board";

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Keep the fixed menu pinned to the button if the layout shifts under it.
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  /** Rasterises the visible canvas. Loaded lazily so the board bundle stays small. */
  async function renderPng() {
    const node = captureRef.current;
    if (!node) throw new Error("Canvas not ready");

    const { toPng } = await import("html-to-image");
    return toPng(node, {
      pixelRatio: 2,
      backgroundColor: "#F8FAFC",
      // Skip on-canvas UI hints that shouldn't appear in an exported image.
      filter: (el) => !(el instanceof HTMLElement && el.dataset.exportIgnore === "true"),
    });
  }

  function download(href: string, filename: string) {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
  }

  async function run(kind: string, successMessage: string, fn: () => Promise<void>) {
    setBusy(kind);
    try {
      await fn();
      setOpen(false);
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  const exportPng = () =>
    run("png", "Board exported as PNG", async () => {
      download(await renderPng(), `${slug}-board.png`);
    });

  const exportPdf = () =>
    run("pdf", "Board exported as PDF", async () => {
      const dataUrl = await renderPng();

      const image = new Image();
      image.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not read the rendered image"));
      });

      const { jsPDF } = await import("jspdf");
      const landscape = image.width >= image.height;
      const pdf = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;

      // Fit the capture inside the page without distorting it.
      const scale = Math.min(
        (pageWidth - margin * 2) / image.width,
        (pageHeight - margin * 2) / image.height,
      );
      const w = image.width * scale;
      const h = image.height * scale;

      pdf.addImage(dataUrl, "PNG", (pageWidth - w) / 2, (pageHeight - h) / 2, w, h);
      pdf.save(`${slug}-board.pdf`);
    });

  const exportJson = () =>
    run("json", "Board exported as JSON", async () => {
      // Served by the API so the file matches the documented export shape exactly.
      download(`/api/cases/${caseId}/export`, `${slug}-board.json`);
    });

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setOpen(false);

    try {
      const board = JSON.parse(await file.text());
      if (!board || typeof board !== "object" || !Array.isArray(board.people)) {
        throw new Error("That file doesn't look like a CaseBoard export");
      }
      // Ask the server what's already here so the warning is accurate.
      const stats = await api.get<BoardStats>(`/api/cases/${caseId}/import`);
      setPending({ board, stats, filename: file.name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file");
    }
  }

  async function confirmImport() {
    if (!pending) return;
    setImporting(true);
    try {
      await api.post(`/api/cases/${caseId}/import`, {
        board: pending.board,
        replace: true,
      });
      const n = incoming?.people?.length ?? 0;
      setPending(null);
      onImported();
      toast.success(`Imported ${n} ${n === 1 ? "person" : "people"} and their connections`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const hasExisting =
    !!pending && (pending.stats.people > 0 || pending.stats.connectors > 0 || pending.stats.groups > 0);

  const incoming = pending?.board as
    | { people?: unknown[]; connectors?: unknown[]; groups?: unknown[] }
    | undefined;

  return (
    <div className="relative" ref={menuRef}>
      <button ref={triggerRef} className="btn-secondary" onClick={() => setOpen((o) => !o)}>
        Export
      </button>

      {open && pos ? (
        <div
          className="surface fixed z-50 w-56 py-1 shadow-panel"
          style={{ top: pos.top, right: pos.right }}
        >
          <MenuItem label="Export as PNG" busy={busy === "png"} onClick={exportPng} />
          <MenuItem label="Export as PDF" busy={busy === "pdf"} onClick={exportPdf} />
          <MenuItem label="Export as JSON" busy={busy === "json"} onClick={exportJson} />
          <div className="my-1 border-t border-cream-300" />
          <MenuItem label="Import from JSON…" onClick={() => fileRef.current?.click()} />
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onPickFile}
      />

      {pending ? (
        <Modal
          title="Import board"
          onClose={() => setPending(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                className={hasExisting ? "btn-danger" : "btn-primary"}
                onClick={confirmImport}
                disabled={importing}
              >
                {importing
                  ? "Importing…"
                  : hasExisting
                    ? "Replace board"
                    : "Import"}
              </button>
            </>
          }
        >
          <p className="text-sm text-stone-700">
            <span className="font-medium">{pending.filename}</span> contains{" "}
            {incoming?.people?.length ?? 0} people, {incoming?.connectors?.length ?? 0} connectors
            and {incoming?.groups?.length ?? 0} groups.
          </p>

          {hasExisting ? (
            <div className="mt-3 rounded-md border border-clay-500/30 bg-clay-500/10 px-3 py-2.5">
              <p className="text-sm font-medium text-clay-600">
                This will erase the current board
              </p>
              <p className="mt-1 text-sm text-stone-700">
                {pending.stats.people} people, {pending.stats.connectors} connectors and{" "}
                {pending.stats.groups} groups will be deleted, along with their uploaded photos.
                This cannot be undone — export the current board first if you want a backup.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-500">
              This board is empty, so nothing will be overwritten.
            </p>
          )}

          <p className="mt-3 text-xs text-stone-500">
            Photos are kept only for files you uploaded. Importing someone else&rsquo;s export
            rebuilds the board without their images.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

function MenuItem({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-stone-700 hover:bg-cream-200 disabled:opacity-50"
      onClick={onClick}
      disabled={busy}
    >
      {label}
      {busy ? <span className="text-xs text-stone-500">Working…</span> : null}
    </button>
  );
}
