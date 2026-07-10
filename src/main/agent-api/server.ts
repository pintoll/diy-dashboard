import { createServer, type Server } from "http";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { app } from "electron";
import { nanoid } from "nanoid";
import { getSettings, setSettings } from "../settings/store";
import { NotFoundError, ValidationError } from "../todos/types";
import { BodyError, matchRoute, sendError, type Route } from "./router";
import { todosRoutes } from "./todos-routes";

// Local agent API: lets an external local process (a CLI agent, Claude Code,
// a script) read and mutate app data while the app runs. This HTTP surface is
// the contract — agents must NOT open the SQLite files directly, which are
// WAL-journaled and owned by the running app.
//
// - Binds 127.0.0.1 only; there is nothing to serve off-machine.
// - Every route except GET /api/health requires `Authorization: Bearer <token>`.
//   A localhost bind alone would still let any local process or a
//   DNS-rebinding browser page fire blind requests; the token closes that
//   hole and costs an agent nothing, since it already reads the port file.
// - Discovery: <userData>/agent-api.json holds { port, token, pid, startedAt }.
//   Agents read that file instead of hardcoding a port. The pid lets them
//   detect a stale file after a crash. When the app is not running there is
//   no daemon and requests fail with ECONNREFUSED — by design.

const DEFAULT_PORT = 8799;
const PORT_FILE = "agent-api.json";

let server: Server | null = null;

function ensureToken(): string {
  const existing = getSettings().agentApiToken;
  if (existing && existing.length > 0) return existing;
  const token = nanoid(32);
  setSettings({ agentApiToken: token });
  return token;
}

function preferredPort(): number {
  const configured = getSettings().agentApiPort;
  return typeof configured === "number" && configured > 0 ? configured : DEFAULT_PORT;
}

function portFilePath(): string {
  return path.join(app.getPath("userData"), PORT_FILE);
}

function writePortFile(port: number, token: string): void {
  const payload = {
    port,
    token,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(portFilePath(), JSON.stringify(payload, null, 2), "utf8");
}

function buildServer(routes: Route[], token: string): Server {
  return createServer(async (req, res) => {
    // The bind is loopback-only, but a browser page can still reach 127.0.0.1
    // via DNS rebinding — those requests arrive with a foreign Host header.
    // Reject anything not addressed to localhost before touching any route.
    const host = (req.headers.host ?? "").replace(/:\d+$/, "").toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
      sendError(res, 403, "Invalid Host header");
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/api/health") {
      const address = server?.address();
      const port = typeof address === "object" && address !== null ? address.port : null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: app.getVersion(), port }));
      return;
    }

    if (req.headers.authorization !== `Bearer ${token}`) {
      sendError(res, 401, "Missing or invalid bearer token");
      return;
    }

    const match = matchRoute(routes, req.method ?? "", url.pathname);
    if (match.kind === "not-found") {
      sendError(res, 404, "Unknown route");
      return;
    }
    if (match.kind === "method-mismatch") {
      sendError(res, 405, "Method not allowed");
      return;
    }

    try {
      await match.handler(req, res, match.params, url.searchParams);
    } catch (error) {
      if (error instanceof ValidationError || error instanceof BodyError) {
        sendError(res, 400, error.message);
      } else if (error instanceof NotFoundError) {
        sendError(res, 404, error.message);
      } else {
        console.error("agent-api handler failed:", error);
        sendError(res, 500, "Internal error");
      }
    }
  });
}

export function startAgentApi(): void {
  if (server !== null) return;
  const token = ensureToken();
  const instance = buildServer(todosRoutes, token);
  server = instance;

  // Attached with `once` rather than passed to listen(): a listen() callback is
  // registered as a one-shot "listening" listener that survives a failed bind,
  // so passing it to both the preferred and the fallback listen would fire it
  // twice on the fallback's success.
  instance.once("listening", () => {
    const address = instance.address();
    if (typeof address === "object" && address !== null) {
      try {
        writePortFile(address.port, token);
      } catch (error) {
        console.error("agent-api: failed to write port file:", error);
      }
      console.log(`agent-api listening on 127.0.0.1:${address.port}`);
    }
  });

  let retriedOnBusyPort = false;
  instance.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE" && !retriedOnBusyPort) {
      // The preferred port is taken (another app, or a second instance of this
      // one). Fall back to an OS-assigned port; agents discover it via the file.
      retriedOnBusyPort = true;
      console.warn(`agent-api: port ${preferredPort()} in use, falling back to ephemeral`);
      instance.listen(0, "127.0.0.1");
      return;
    }
    console.error("agent-api failed to start:", error);
    server = null;
  });

  instance.listen(preferredPort(), "127.0.0.1");
}

export function stopAgentApi(): void {
  if (server === null) return;
  server.close();
  server = null;
  removeOwnPortFile();
}

// Only remove the discovery file if this process wrote it. The single-instance
// lock makes overlap rare, but a restart can race the dying instance's quit
// path: if the new instance has already rewritten the file, the old one must
// not delete it and leave agents unable to discover the running app.
function removeOwnPortFile(): void {
  try {
    const raw = JSON.parse(readFileSync(portFilePath(), "utf8")) as { pid?: number };
    if (raw.pid !== process.pid) return;
    unlinkSync(portFilePath());
  } catch {
    // No file, unreadable, or already gone — nothing to clean up.
  }
}
