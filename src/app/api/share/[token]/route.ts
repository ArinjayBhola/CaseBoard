import { fetchSharedBoard, recordShareView } from "@/server/services/shareLinks";

type Params = { params: { token: string } };

/**
 * Public, unauthenticated: the read-only board behind a share token.
 *
 * Not covered by the auth middleware (it matches only /dashboard, /case,
 * /account), so anyone with the link reaches it. Revoke and expiry are enforced
 * on every call, so a lapsed link returns an error the viewer's poll turns into
 * a lock screen — access ends even mid-view.
 */
export async function GET(req: Request, { params }: Params) {
  const result = await fetchSharedBoard(params.token);

  // Count this viewer while the link is valid (best-effort, for the owner's
  // "N viewing now"). The `v` param is a stable per-tab id from the client.
  if (result.status === "ok") {
    const viewerId = new URL(req.url).searchParams.get("v");
    if (viewerId) void recordShareView(params.token, viewerId);
  }

  if (result.status === "expired") {
    return Response.json({ error: "This share link has expired" }, { status: 410 });
  }
  if (result.status === "notfound") {
    return Response.json({ error: "This share link is no longer active" }, { status: 404 });
  }

  return Response.json(
    { caseTitle: result.caseTitle, board: result.board, expiresAt: result.expiresAt },
    {
      // Never cache: the link can be revoked or expire at any moment.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
