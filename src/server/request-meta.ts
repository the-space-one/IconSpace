import { createHash } from "crypto";

/** Client identity + origin checks for the signup route. */

const IP_HEADERS = ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"] as const;

function normalizeOrigin(raw: string) {
  try {
    return new URL(raw).origin.toLowerCase();
  } catch {
    return null;
  }
}

function sanitizeIp(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Bare IPv6 (no dots) — leave as-is; the port-stripping below would corrupt it.
  if (trimmed.includes(":") && !trimmed.includes(".")) {
    return trimmed;
  }

  return trimmed.replace(/:\d+$/, "");
}

function getFirstForwardedIp(value: string) {
  return sanitizeIp(value.split(",")[0] ?? "");
}

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  const origins = raw
    .split(",")
    .map((value) => normalizeOrigin(value.trim()))
    .filter((value): value is string => Boolean(value));

  return new Set(origins);
}

/** When no IP header is present, bucket by user-agent so the limiter still has
 *  some key to work with instead of lumping every such request together. */
function getUserAgentFallbackKey(headers: Headers) {
  const userAgent = headers.get("user-agent")?.trim() || "unknown";
  const hash = createHash("sha256").update(userAgent).digest("hex").slice(0, 16);
  return `unknown:${hash}`;
}

export function resolveClientIp(headers: Headers) {
  for (const headerName of IP_HEADERS) {
    const value = headers.get(headerName);
    if (!value) {
      continue;
    }

    if (headerName === "x-forwarded-for") {
      const forwardedIp = getFirstForwardedIp(value);
      if (forwardedIp) {
        return forwardedIp;
      }

      continue;
    }

    const sanitized = sanitizeIp(value);
    if (sanitized) {
      return sanitized;
    }
  }

  return null;
}

export function getRateLimitKey(headers: Headers) {
  const ip = resolveClientIp(headers);
  if (ip) {
    return `ip:${ip}`;
  }

  return getUserAgentFallbackKey(headers);
}

/** Same-origin requests always pass. A cross-origin request only passes if it
 *  is listed in ALLOWED_ORIGINS. Requests with no Origin header (curl, server
 *  to server) are allowed — the header is set by browsers, so its absence is
 *  not evidence of an attack and blocking it would break non-browser clients. */
export function isRequestOriginAllowed(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return true;
  }

  const requestOrigin = normalizeOrigin(request.url);
  const normalizedOrigin = normalizeOrigin(originHeader);
  if (!requestOrigin || !normalizedOrigin) {
    return false;
  }

  if (normalizedOrigin === requestOrigin) {
    return true;
  }

  const allowedOrigins = parseAllowedOrigins();
  if (allowedOrigins.size === 0) {
    return false;
  }

  return allowedOrigins.has(normalizedOrigin);
}
