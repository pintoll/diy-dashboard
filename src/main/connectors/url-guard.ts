import { lookup } from "dns/promises";

// Connectors are the first path in this app that fetches a URL supplied from
// outside the source tree (settings file / agent API). These guards keep that
// capability pointed at public HTTPS APIs: without them a connector could be
// aimed at the loopback interface and used to reach the app's own agent API or
// anything else listening locally.

export class UnsafeUrlError extends Error {}

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost"];

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

// Extracts the embedded IPv4 address from an IPv4-mapped IPv6 address. Both
// spellings have to be handled: DNS lookups return the dotted form
// (::ffff:127.0.0.1), while the WHATWG URL parser normalizes that same address
// to hex (::ffff:7f00:1), so matching only the readable one leaves a hole.
function mappedIpv4(addr: string): string | null {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (dotted) return dotted[1];

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (addr === "::1" || addr === "::") return true;
  // Unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd]/.test(addr)) return true;
  if (/^fe[89ab]/.test(addr)) return true;
  const mapped = mappedIpv4(addr);
  if (mapped) return isBlockedIpv4(mapped);
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost") return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (isBlockedIpv4(host)) return true;
  if (host.includes(":") && isBlockedIpv6(host)) return true;
  return false;
}

// Static checks only — no DNS. Safe to call during validation, where blocking
// on a network round trip would make saving a connector fail whenever the
// machine is offline.
export function assertSafeUrl(raw: string, what: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`${what} must be a valid absolute URL`);
  }
  if (url.protocol !== "https:") {
    throw new UnsafeUrlError(`${what} must use https (got ${url.protocol})`);
  }
  if (isBlockedHostname(url.hostname)) {
    throw new UnsafeUrlError(
      `${what} points at a private or loopback address (${url.hostname})`
    );
  }
  return url;
}

// Resolution check, run immediately before the request. Catches a public
// hostname whose DNS record points into the private range. This is not a
// defense against DNS rebinding (the name is resolved again by fetch, and can
// answer differently); it is a guard against misconfiguration and against a
// connector definition crafted to reach localhost through a public name.
export async function assertSafeResolution(url: URL): Promise<void> {
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    // Let the fetch itself surface DNS failures with its own error message.
    return;
  }
  for (const { address, family } of addresses) {
    const blocked = family === 6 ? isBlockedIpv6(address) : isBlockedIpv4(address);
    if (blocked) {
      throw new UnsafeUrlError(
        `${url.hostname} resolves to a private or loopback address (${address})`
      );
    }
  }
}
