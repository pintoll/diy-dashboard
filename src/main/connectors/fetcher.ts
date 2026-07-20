import { resolveSecret } from "./credentials";
import { ConnectorFetchError, substitute, type TemplateVars } from "./parse";
import { assertSafeResolution, assertSafeUrl, UnsafeUrlError } from "./url-guard";
import type { Connector } from "./types";

// Executes one connector definition: build the URL, attach the credential, and
// fetch under strict limits. Response shaping lives in parse.ts. Everything
// provider-specific about a source lives in its definition, so this file never
// grows a per-provider branch.

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function buildUrl(connector: Connector, vars: TemplateVars): URL {
  const url = assertSafeUrl(connector.request.url, "request.url");
  for (const [key, raw] of Object.entries(connector.request.query ?? {})) {
    url.searchParams.set(key, substitute(raw, vars));
  }
  return url;
}

function buildHeaders(connector: Connector, url: URL): Headers {
  const headers = new Headers({ accept: "application/json" });
  for (const [key, value] of Object.entries(connector.request.headers ?? {})) {
    headers.set(key, value);
  }

  const auth = connector.request.auth;
  if (auth.mode === "none") return headers;

  // resolveSecret enforces the credential's host pin; a mismatch throws and the
  // request is never made.
  const secret = resolveSecret(auth.credential, url.hostname);
  switch (auth.mode) {
    case "query":
      url.searchParams.set(auth.param, secret);
      break;
    case "bearer":
      headers.set("authorization", `Bearer ${secret}`);
      break;
    case "header":
      headers.set(auth.header, `${auth.prefix ?? ""}${secret}`);
      break;
  }
  return headers;
}

async function readJsonCapped(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new ConnectorFetchError(
      `response is ${declared} bytes, over the ${MAX_RESPONSE_BYTES} byte limit`
    );
  }

  const body = response.body;
  if (!body) throw new ConnectorFetchError("response had no body");

  // Stream rather than response.text(): a server that lies about (or omits)
  // content-length must not be able to buffer unbounded data into the main
  // process.
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new ConnectorFetchError(
          `response exceeded the ${MAX_RESPONSE_BYTES} byte limit`
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    await body.cancel().catch(() => {});
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(merged);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ConnectorFetchError(
      `response was not valid JSON (starts with: ${text.slice(0, 80)})`
    );
  }
}

// Redirects are followed manually so each hop can be re-checked against the URL
// policy. fetch's automatic following would let a public endpoint bounce the
// request (and any attached credential) to an arbitrary host.
async function fetchWithPolicy(url: URL, headers: Headers): Promise<Response> {
  let current = url;
  for (let hop = 0; ; hop += 1) {
    await assertSafeResolution(current);
    const response = await fetch(current, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    if (hop >= MAX_REDIRECTS) {
      throw new ConnectorFetchError(`too many redirects (over ${MAX_REDIRECTS})`);
    }

    const next = assertSafeUrl(new URL(location, current).toString(), "redirect target");
    if (next.hostname !== current.hostname) {
      throw new ConnectorFetchError(
        `refused cross-host redirect ${current.hostname} -> ${next.hostname}`
      );
    }
    current = next;
  }
}

// Single HTTP round trip for a connector, returning the decoded JSON. Caching
// and concurrency limiting wrap this in runtime.ts.
export async function executeConnector(
  connector: Connector,
  vars: TemplateVars
): Promise<unknown> {
  let url: URL;
  let headers: Headers;
  try {
    url = buildUrl(connector, vars);
    headers = buildHeaders(connector, url);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new ConnectorFetchError(err.message);
    throw err;
  }

  let response: Response;
  try {
    response = await fetchWithPolicy(url, headers);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new ConnectorFetchError(err.message);
    if (err instanceof ConnectorFetchError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    // AbortSignal.timeout surfaces as a TimeoutError DOMException.
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ConnectorFetchError(
      timedOut ? `request timed out after ${REQUEST_TIMEOUT_MS}ms` : reason
    );
  }

  if (!response.ok) {
    throw new ConnectorFetchError(
      `request failed with HTTP ${response.status} ${response.statusText}`.trim()
    );
  }
  return readJsonCapped(response);
}
