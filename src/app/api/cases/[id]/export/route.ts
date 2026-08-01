import { NextResponse } from "next/server";
import { toErrorResponse } from "@/server/http";
import { currentUserId } from "@/lib/auth";
import { unauthorized } from "@/server/errors";
import { exportBoard } from "@/server/services/boardIo";

type Params = { params: { id: string } };

/** Full board state as JSON, served as a download. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await currentUserId();
    if (!userId) throw unauthorized();

    const board = await exportBoard(userId, params.id);
    const slug =
      board.case.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "board";

    return new NextResponse(JSON.stringify(board, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${slug}-board.json"`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
