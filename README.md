# CaseBoard — Phases 1–3

Investigation workspace.

- **Phase 1** — auth, case management, board with draggable person cards.
- **Phase 2** — labelled connectors with confidence levels, groups, filter over link
  labels, PNG/PDF/JSON export and JSON import.
- **Phase 3** — realtime multiplayer via Yjs, case sharing, Excalidraw whiteboard.
- **Phase 4** — video/audio calls and scoped screen share via self-hosted LiveKit.
- **Phase 5** — enforced edit permissions, version history, polish.

## Running it

Three processes:

```
docker compose up -d   # LiveKit on :7880, Redis on :6379
npm run dev            # Next app on :3000
npm run ws             # realtime server on :1234
```

The board does not sync without the realtime server; calls need LiveKit.
`npm test` runs the unit suite.

## Setup

1. **Create a Neon database.** Sign up at https://console.neon.tech, create a project,
   copy the connection string.

2. **Create `.env`** in the project root (copy `.env.example`):

   ```
   DATABASE_URL="postgresql://...@....neon.tech/neondb?sslmode=require"
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="<random 32-byte base64 string>"
   STORAGE_DRIVER="r2"
   R2_ACCOUNT_ID="your-cloudflare-account-id"
   R2_ACCESS_KEY_ID="your-r2-access-key"
   R2_SECRET_ACCESS_KEY="your-r2-secret-key"
   R2_BUCKET="caseboard"
   R2_PUBLIC_URL="https://cdn.example.com"
   ```

   Generate a secret with `openssl rand -base64 32`, or in PowerShell:

   ```powershell
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
   ```

3. **Push the schema and run:**

   ```
   npm run db:push
   npm run dev
   ```

Open http://localhost:3000, sign up, and create a case.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run db:push` | Sync Prisma schema to the database (no migration files) |
| `npm run db:migrate` | Create a versioned migration instead |
| `npm run db:studio` | Browse data in Prisma Studio |

## Structure

```
src/
  app/
    api/                  Route handlers — thin HTTP adapters only
    login, signup         Auth pages
    dashboard             Case list
    case/[id]             Investigation board
    account               Password change, sign out
  server/
    services/             All business logic. No Next.js imports.
    schemas.ts            Zod request validation
    errors.ts             Transport-agnostic ApiError
    http.ts               Next-specific glue (auth + error mapping)
  lib/
    storage/              File storage behind a driver interface
    api.ts                Browser API client
    auth.ts, prisma.ts
  components/
    board/
      Board.tsx           Canvas orchestration + the pointer gesture state machine
      geometry.ts         Connector routing, bundling, hit testing — pure functions
      ConnectorLayer.tsx  SVG connector rendering
      GroupLayer.tsx      Group boxes
      *Editor.tsx         Person / connector / group modals
      ExportMenu.tsx      PNG, PDF, JSON export and import
    whiteboard/           Excalidraw + its Yjs reconciliation
  lib/realtime/
    entities.ts           Entity shapes shared by client, doc helpers, and server
    boardDoc.ts           Yjs document layout and read/write helpers
    useYRoom.ts           Websocket + IndexedDB provider, presence
    useBoardRoom.ts       Board mutations, all routed through Yjs
    token.ts              Realtime token signing/verifying, room naming
server/ws/                 Realtime server (own process, own port)
  index.ts                Upgrade handling and auth
  persistence.ts          Hydration, snapshot scheduling, Postgres projection
```

Every canvas interaction is one variant of the `Gesture` union in `Board.tsx` —
pan, marquee, drawGroup, cards, group, groupResize, link. The global
pointermove/pointerup handlers switch on that single value, so adding a gesture
means adding a variant rather than another pair of refs.

### Splitting out an Express server later (Phase 3+)

Business logic lives in `src/server/services/*` and imports nothing from Next.
Moving to Express means:

1. Copy `src/server/` into the new server package as-is.
2. Replace `src/server/http.ts` with Express middleware doing the same job
   (resolve user from session, map `ApiError.status` to a response).
3. Point the frontend at it by setting `NEXT_PUBLIC_API_BASE` — `src/lib/api.ts`
   already prefixes every request with it, so no component changes.

### Cloudflare R2 storage

Uploads use `src/lib/storage/r2.ts`. Configure an R2 bucket and a public custom domain (or R2.dev URL) in the environment above. Image and PDF uploads are stored under owner-scoped keys, and returned URLs are the configured public URL.

Photos are stored outside `public/`, so `/api/files/[...key]` serves them and
requires a session.

## Board controls

- **Pan** — drag the background
- **Zoom** — scroll wheel (zooms at the cursor), or the header `−` / `+` / Reset
- **Move a card** — drag it; position autosaves 600 ms after you let go
- **Edit a card** — click it
- **Connect two people** — drag the ● handle on a card's right edge onto another card,
  or right-click a card → "Connect to…" when the target is offscreen
- **Edit a connector** — click the line
- **Select several cards** — shift-drag a marquee, then "Group" in the bottom bar
- **Draw a group** — "Draw group" in the header, then drag a rectangle; cards fully
  inside become members
- **Move a group** — drag its box; members travel with it. Drag the corner to resize
- **Filter** — matches person names, tags, connector labels and group labels.
  Non-matching cards, links and groups dim rather than disappear
- **Esc** — cancels the current drag, selection, or draw mode

### Connector confidence

| Confidence | Line |
| --- | --- |
| Confirmed | Solid, warm grey |
| Alleged | Dashed, muted terracotta |
| Unconfirmed | Dotted, pale stone |

Multiple connectors between the same two people fan out sideways so each stays
separately visible and clickable.

## Export and import

`Export` in the header offers PNG, PDF, and JSON.

- **PNG / PDF** render the *current viewport* client-side (html-to-image, then jsPDF
  for the PDF). What you see is what you get — pan and zoom first.
- **JSON** is served by `GET /api/cases/:id/export` in the documented shape
  (`{ case, people, connectors, groups }`), so the file is authoritative rather than
  a client-side reconstruction.
- **Import** validates the file with Zod before writing. Ids in the file are treated
  as local references only — every person gets a fresh cuid and connectors/groups are
  rewired, so one file can be imported into many cases. If the target board already
  has data, the confirm dialog names exactly what will be destroyed.

Photos survive an import only if you uploaded them. Upload keys are namespaced per
user (`users/<userId>/people/<uuid>`) and `/api/files` refuses keys outside the
caller's own prefix, so importing someone else's export rebuilds the board without
their images rather than serving files you have no right to.

## Realtime (Phase 3)

```
React  <->  Yjs doc (in memory, synced live)  <->  Postgres (periodic snapshot)
```

The Yjs document is the source of truth on the client. React state is a read-only
mirror rebuilt on every doc change — there is no second write path that could
drift from what peers see. Postgres is a backup taken on a schedule, not the live
write path.

### Rooms

| Room | Contents |
| --- | --- |
| `board:<caseId>` | People, connectors, groups |
| `whiteboard:<caseId>` | Excalidraw elements |

Entities are `Y.Map`s keyed by id rather than `Y.Array`s, so two people editing
different fields of the same card never conflict. Only a genuine same-field
collision falls back to last-write-wins.

### Persistence timing

The websocket server writes a snapshot when edits go quiet for **5s**, when
continuous editing passes **30s** since the last write, or when the last client
leaves a room. Worst-case loss on a server crash is 30 seconds.

When the last client leaves a room, the snapshot is **compacted**: the document is
rebuilt from its current visible content, discarding edit history and delete-set
tombstones that `encodeStateAsUpdate` would otherwise carry forever. This resets
client ids, so it is only ever done with the room empty — doing it mid-session
would desynchronise everyone connected.

Each snapshot also **projects the Yjs state back into the Person/Connector/Group
tables**. Without that, everything still reading those tables — JSON export,
dashboard thumbnails and counts, board import — would drift the moment realtime
editing began.

### Hydration order

A room loads from the Postgres snapshot only when nobody is in it. If clients are
already connected, the joining client syncs from them, since they hold the freshest
state. Cases created before Phase 3 have no Yjs snapshot, so their first room load
seeds the document from the relational tables.

`setupWSConnection` sends sync step 1 synchronously and never awaits the
persistence layer, so hydration is done explicitly in the upgrade handler *before*
the connection is wired up. Hydrating inside `bindState` would let a joining client
briefly see an empty board.

### Auth

The websocket server runs on its own port, so the browser cannot send it the
NextAuth cookie. Instead `POST /api/realtime/token` checks case membership and
mints a 10-minute HS256 token signed with `NEXTAUTH_SECRET`; the websocket server
verifies the signature and that the token's `caseId` matches the room being joined.
Both processes must load the same `NEXTAUTH_SECRET`.

### Offline

`y-indexeddb` caches each room locally. A refresh repaints before the network
answers, and edits made while disconnected merge back in on reconnect.

### Whiteboard sync

Excalidraw has no official Yjs binding, so elements live in a `Y.Map` keyed by
element id and the merge is delegated to Excalidraw's own exported
`reconcileElements` — the same function its first-party collaboration uses.

The bookkeeping around it lives in `src/components/whiteboard/sync.ts`, separate
from the React component so it can be tested directly. Three rules make it safe:

- **Merge, never replace.** `reconcileElements` receives local elements *and*
  local app state, so anything drawn since the last push, and anything the user is
  currently dragging, survives an incoming update.
- **`shadow` tracks the last version seen in each direction.** A remote element is
  recorded there when it wins the merge, so the `onChange` it triggers finds
  nothing new and the echo stops. Where the *local* copy wins, the shadow is
  deliberately left stale so the next push publishes it.
- **Deletion is a tombstone, never an absence.** Excalidraw marks elements
  `isDeleted` and purges them later on its own schedule; treating absence as
  deletion races that purge and can resurrect shapes on peers.

Z-order comes from Excalidraw's fractional `index`, sorted on read — `Y.Map`
iteration is insertion order, which would otherwise scramble stacking between
clients.

```
npm test
```

Covers convergence, deterministic tie-breaking, echo termination, tombstone
propagation, z-ordering, and in-progress edits surviving remote updates.

## Calls and screen share (Phase 4)

"Call" in a case opens a panel that joins a LiveKit room scoped to that case.
Nothing connects until you press Start — opening a case never switches on a
camera or microphone, and both begin muted.

The room stays up while anyone is in it and disappears shortly after the last
person leaves. There are no scheduled calls.

### Scoped screen share

A plain `getDisplayMedia` call lets the user pick their whole desktop — every
other window, tab, and notification along with it. For a journalist working with
sources that is a real exposure, so the share is built around a dedicated route
rather than constrained after the fact:

- `/case/[id]/share` renders **only** the board or whiteboard. Its layout has no
  nav, no links, no case list, and is marked `noindex`. Anything added to that
  layout becomes visible to everyone the user shares with — treat additions as a
  source-protection decision, not a styling one.
- The capture request sets `monitorTypeSurfaces: "exclude"`, which removes whole
  screens from the browser picker entirely, plus `preferCurrentTab` and
  `surfaceSwitching: "exclude"` so the tab is preselected and cannot be swapped
  mid-share.
- The share connects to LiveKit as a **separate identity** (`<userId>__share`)
  whose token grant permits screen-share sources only. Even if that connection
  were misused, the grant itself forbids it from publishing camera or microphone.
  Asserted in `src/lib/livekit/server.test.ts`.
- Switching between sharing the board and the whiteboard swaps what the share tab
  renders over a `BroadcastChannel`. The published track is never touched, so the
  call and the share both continue.

The setup prompt in the share tab disappears once capture begins, so viewers see
the board alone. Stop sharing from the case tab, or close the share tab.

### Call log

`CallSession` / `CallParticipant` record who joined and when, surfaced in the call
panel as "Call history" — the point being that the case owner can see who saw the
material.

LiveKit is the source of truth for who is connected; these tables are only a log.
Every read reconciles against `listParticipants` first, because a browser that
crashed or lost power never gets to report that it left. If LiveKit is
unreachable, reconciliation is skipped rather than marking everyone as departed.

## Edit permissions (Phase 5)

The model is **baseline ∩ call override**:

| Situation | Who can edit |
| --- | --- |
| No call running | Owner and every case member — the Phase 3 behaviour |
| Call running | Owner and host always; everyone else **view-only until granted** |
| Call ends | All restrictions lift, baseline resumes |

Two rules are structural, not UI:

- **New joiners default to view-only.** Silence means "not yet", never "go ahead".
- **The case owner can never be demoted.** Otherwise a guest who started a call
  could lock the journalist out of their own investigation.

### Enforcement

Hiding buttons is not enforcement — a participant can call the Yjs API from
devtools. So the check lives on the socket, in `server/ws/permissions.ts`:

- Every inbound frame is decoded before y-websocket's own handler sees it.
  Sync step 2 and update messages from a view-only client are **dropped** and
  never reach the shared document.
- Sync step 1 (a read request) and awareness (presence, cursors) stay allowed, so
  a view-only participant still sees the board and is still visible to others.
- Malformed frames are rejected rather than guessed at — a frame that fails to
  parse is exactly what a bypass attempt looks like.
- Implemented as a proxy over the socket's `message` listener, because
  y-websocket attaches its own handler inside `setupWSConnection` and an
  EventEmitter offers no way to stop propagation afterwards.

Covered by `server/ws/permissions.test.ts`, which builds real protocol frames
rather than asserting on hand-written bytes.

Client-side there is a second, non-authoritative guard: an `UndoManager` reverts
locally-originated transactions while view-only, including ones with no origin
(i.e. run straight from devtools). Without it a bypass would leave that user
looking at a board nobody else can see. The server is what actually protects
other people; this only stops the local view from lying.

State lives in Redis, keyed `case:{caseId}:permissions:{userId}`, because it is
read on every Yjs update and does not need to survive a restart. Changes publish
over Redis pub/sub and reach both the websocket server and the affected browser
(via SSE) immediately, not on next reconnect.

> **Operational note — this fails closed.** If Redis is unreachable, the server
> cannot tell whether a call is currently restricting someone, so non-owners are
> denied edit access until it returns. Owners are unaffected (their status comes
> from the signed token, not Redis). Wrongly denying an edit is recoverable;
> wrongly allowing one is not. If Redis is down, editing stops for members —
> that is deliberate, and worth knowing before you debug it.

## Version history

Automatic snapshots are taken every 5 minutes per live room by the websocket
server — the only process holding current document state. Unchanged rooms are
skipped. You can also save a named version ("Before I re-organised the timeline")
at any time from the History button.

Retention: last 50 versions per case, or 30 days, whichever bites first.

- **Preview** decodes a stored snapshot server-side and returns plain data. The
  live document is never touched, so looking is always safe.
- **Restore** rewrites the live document and broadcasts to everyone connected. If
  nobody is connected it writes the snapshot row instead and the next reader
  hydrates from it. Yjs has no "replace document" operation — applying an old
  update would merge, leaving anything added since — so current content is
  explicitly cleared inside the same transaction, which peers receive atomically.
- The pre-restore state is saved as "Before restore" first, so an accidental
  restore is itself reversible.

## Sharing

"Share" on a case adds a `CaseMember` row by email. Each member has a **role**:

| Role | Baseline access |
| --- | --- |
| Editor (default) | Full edit, same as the owner |
| Viewer | Read-only — sees the board and cursors, cannot change anything |

The role is the baseline **ceiling**: a call host can restrict an editor to
view-only for the duration of a call, but can never lift a viewer above their
baseline (`resolvePermission` short-circuits a viewer to `view` before Redis is
even consulted, so it also holds during a Redis outage). The owner is always an
editor and cannot be demoted. Only the owner can add, remove, or change roles;
a role change is pushed over the permission channel and takes effect inside the
member's live session rather than on next reconnect.

Enforcement is the same socket guard as call permissions — a viewer's document
frames are dropped in `server/ws/permissions.ts`, so hiding the buttons is not
what protects the board. The invitee needs an existing account; there are no
invite emails. Deleting a whole case stays with its owner.

## A note on the board's REST API: as of Phase 3 the board is edited exclusively
through Yjs, and the old `POST/PATCH/DELETE` routes for people, connectors, and
groups have been **removed**. They wrote tables that the next Yjs projection
overwrites, so calling them looked like it worked and then silently reverted.
Export and import remain, since they operate outside a live session.

## Mobile

The case list, editors, call panel, and version history work on a phone. The
infinite canvas is desktop-primary and says so: pan, zoom, marquee-select and
card dragging on a dense graph via touch is a different interaction design, not a
CSS problem. On a narrow screen the board shows a dismissible notice rather than
pretending otherwise — the board underneath is still readable.

## Known limits

- Permissions fail closed on a Redis outage (see the operational note above).
- Version restore of a **whiteboard** clears and rewrites elements; anyone with
  an in-progress stroke at that exact moment will lose it.
- `docker compose` ships throwaway LiveKit dev keys on purpose so the stack runs
  out of the box. Generate real ones before this leaves your machine.
- Screen-share picker hardening (`monitorTypeSurfaces`, `preferCurrentTab`) is
  Chromium-only. The dedicated route and the token grant hold everywhere.
