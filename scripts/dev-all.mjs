// One command to bring up the whole local stack:
//
//   docker compose (LiveKit :7880 + Redis :6379)   — calls & screen share
//   npm run ws     (realtime sync :1234)            — board & whiteboard
//   npm run dev    (Next UI :3000)
//
// The two Node processes are the app; Docker is a best-effort convenience —
// if the daemon is off we warn and carry on, since board/whiteboard/auth all
// work without it. Only calls need LiveKit + Redis.
//
// Output from each process is line-prefixed so you can tell them apart, and a
// single Ctrl-C tears the whole thing down.
import { spawn } from "node:child_process";

const children = [];
let shuttingDown = false;

/** Spawn a child, prefix its output, and keep a handle for shutdown. */
function run(name, command, args, color) {
  const child = spawn(command, args, { shell: true, env: process.env });
  children.push(child);

  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  const prefix = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.length > 0) process.stdout.write(`${tag} ${line}\n`);
    }
  };
  child.stdout.on("data", prefix);
  child.stderr.on("data", prefix);

  child.on("exit", (code) => {
    // If one core process dies, take the rest down rather than leaving a
    // half-running stack that looks alive but isn't.
    if (!shuttingDown) {
      process.stdout.write(`${tag} exited (${code}). Stopping everything.\n`);
      shutdown();
    }
  });
  return child;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  // Give them a moment to close ports before the runner exits.
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Best-effort: bring up LiveKit + Redis. Failure here is not fatal.
const docker = spawn("docker", ["compose", "up", "-d"], { shell: true, env: process.env });
docker.on("exit", (code) => {
  if (code === 0) {
    process.stdout.write("\x1b[32m[docker]\x1b[0m LiveKit + Redis up.\n");
  } else {
    process.stdout.write(
      "\x1b[33m[docker]\x1b[0m couldn't start containers — is Docker Desktop running? " +
        "Board & whiteboard still work; calls need LiveKit + Redis.\n",
    );
  }
  // Start the app whether or not Docker came up.
  run("ws", "npm", ["run", "ws"], "36"); // cyan
  run("next", "npm", ["run", "dev"], "35"); // magenta
});
