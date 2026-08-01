/**
 * y-websocket ships its server helpers as untyped CJS (bin/utils.cjs).
 * These are the pieces this project uses.
 */
declare module "y-websocket/bin/utils" {
  import type { IncomingMessage } from "node:http";
  import type { WebSocket } from "ws";
  import type * as Y from "yjs";
  import type { Awareness } from "y-protocols/awareness";

  export class WSSharedDoc extends Y.Doc {
    name: string;
    /** Live connections in this room. */
    conns: Map<WebSocket, Set<number>>;
    awareness: Awareness;
  }

  export const docs: Map<string, WSSharedDoc>;

  export function getYDoc(docname: string, gc?: boolean): WSSharedDoc;

  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean },
  ): void;

  export function setPersistence(
    persistence: {
      bindState: (docName: string, doc: WSSharedDoc) => void;
      writeState: (docName: string, doc: WSSharedDoc) => Promise<unknown>;
      provider?: unknown;
    } | null,
  ): void;
}
