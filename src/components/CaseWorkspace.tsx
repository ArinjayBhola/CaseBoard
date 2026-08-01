"use client";

import Link from "next/link";
import { useState } from "react";
import { Board } from "@/components/board/Board";
import { CallPanel } from "@/components/call/CallPanel";
import { MembersDialog } from "@/components/MembersDialog";
import { Whiteboard } from "@/components/whiteboard/Whiteboard";
import { ArrowLeftIcon } from "@/components/ui/icons";

type Tab = "board" | "whiteboard";

export function CaseWorkspace({ caseId, caseTitle }: { caseId: string; caseTitle: string }) {
  const [tab, setTab] = useState<Tab>("board");
  const [showMembers, setShowMembers] = useState(false);
  const [showCall, setShowCall] = useState(false);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-cream-300 bg-cream-50 px-3 sm:gap-3 sm:px-4">
        <Link
          href="/dashboard"
          className="btn-ghost btn-sm -ml-1 shrink-0"
          aria-label="Back to cases"
        >
          <ArrowLeftIcon size={16} />
          <span className="hidden sm:inline">Cases</span>
        </Link>

        <h1 className="max-w-[8rem] shrink-0 truncate text-sm font-semibold text-stone-800 sm:max-w-[16rem]">
          {caseTitle}
        </h1>

        {/* Segmented control reads as one switch rather than two loose buttons. */}
        <nav
          className="ml-1 flex shrink-0 items-center rounded-md border border-cream-300 bg-cream-100 p-0.5"
          aria-label="Case sections"
        >
          <TabButton active={tab === "board"} onClick={() => setTab("board")}>
            Board
          </TabButton>
          <TabButton active={tab === "whiteboard"} onClick={() => setTab("whiteboard")}>
            Whiteboard
          </TabButton>
        </nav>

        <div className="flex-1" />

        <button
          className={`${showCall ? "btn-primary" : "btn-secondary"} btn-sm shrink-0`}
          onClick={() => setShowCall((c) => !c)}
          aria-pressed={showCall}
        >
          Call
        </button>

        <button
          className="btn-secondary btn-sm shrink-0"
          onClick={() => setShowMembers(true)}
        >
          Share
        </button>
      </div>

      {/*
        Both tabs stay mounted. Unmounting would tear down that tab's websocket
        and IndexedDB provider, so switching back would resync from scratch and
        drop presence — cheap to keep alive, expensive to rebuild.
      */}
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className={tab === "board" ? "h-full" : "hidden"}>
            <Board caseId={caseId} caseTitle={caseTitle} />
          </div>
          <div className={tab === "whiteboard" ? "h-full" : "hidden"}>
            <Whiteboard caseId={caseId} />
          </div>
        </div>

        {/*
          Kept mounted only while open — an unmounted CallPanel means no LiveKit
          connection and no chance of a stray published track. On a phone it
          takes the whole width rather than squeezing the board into nothing.
        */}
        {showCall ? (
          <div className="absolute inset-0 z-40 sm:static sm:z-auto sm:w-auto">
            <CallPanel caseId={caseId} onClose={() => setShowCall(false)} />
          </div>
        ) : null}
      </div>

      {showMembers ? (
        <MembersDialog caseId={caseId} onClose={() => setShowMembers(false)} />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded px-2.5 py-1 text-xs transition-colors sm:text-sm ${
        active
          ? "bg-cream-50 font-medium text-stone-800 shadow-card"
          : "text-stone-500 hover:text-stone-700"
      }`}
    >
      {children}
    </button>
  );
}
