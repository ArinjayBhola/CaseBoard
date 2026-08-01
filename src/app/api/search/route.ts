import { withUser } from "@/server/http";
import { searchAll } from "@/server/services/search";

/** Cross-case content search. `?q=` is the query; returns [] for very short input. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return withUser((userId) => searchAll(userId, q));
}
