import type { IncomingMessage, ServerResponse } from "http";

// Minimal method+path router for the agent API. Deliberately dependency-free:
// the whole surface is a handful of routes, and Node's built-in http is all
// the server needs.

export type RouteParams = Record<string, string>;

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: RouteParams,
  query: URLSearchParams
) => Promise<void> | void;

export type Route = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  // Path pattern; ":name" segments capture into params.
  pattern: string;
  handler: RouteHandler;
};

type Match =
  | { kind: "found"; handler: RouteHandler; params: RouteParams }
  | { kind: "method-mismatch" }
  | { kind: "not-found" };

function matchPattern(pattern: string, pathname: string): RouteParams | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: RouteParams = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i];
    const actual = pathParts[i];
    if (expected.startsWith(":")) {
      try {
        params[expected.slice(1)] = decodeURIComponent(actual);
      } catch {
        // Malformed percent-escape: treat as non-matching (404) instead of
        // letting the URIError escape route dispatch and hang the response.
        return null;
      }
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

export function matchRoute(routes: Route[], method: string, pathname: string): Match {
  let pathMatched = false;
  for (const route of routes) {
    const params = matchPattern(route.pattern, pathname);
    if (params === null) continue;
    pathMatched = true;
    if (route.method === method) {
      return { kind: "found", handler: route.handler, params };
    }
  }
  return pathMatched ? { kind: "method-mismatch" } : { kind: "not-found" };
}

const MAX_BODY_BYTES = 64 * 1024;

export class BodyError extends Error {}

/** Reads and parses a JSON request body; undefined when the body is empty. */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new BodyError(`Request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (size === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new BodyError("Request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}
