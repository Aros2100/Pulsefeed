import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface TokenPayload {
  sub: string;   // subscriberId (UUID)
  email: string; // email at time of generation
  iat: number;   // issued-at (ms since epoch)
}

export interface VerifyResult {
  subscriberId: string | null;
  email: string | null;
  isValid: boolean;
  isExpired: boolean;
}

function b64url(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}

function fromb64url(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

function sign(payload: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET is not configured");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Generates a 30-day HMAC-SHA256 signed unsubscribe token.
 * The subscriber ID is embedded in the token — never in the URL directly.
 */
export function generateUnsubscribeToken(
  subscriberId: string,
  email: string
): string {
  const payload = b64url(
    JSON.stringify({ sub: subscriberId, email, iat: Date.now() } satisfies TokenPayload)
  );
  return `${payload}.${sign(payload)}`;
}

/**
 * Verifies an unsubscribe token.
 * Returns { isValid: true } only if the signature is correct AND the token is within TTL.
 * Returns { isExpired: true } if the signature is valid but the token has expired.
 */
export function verifyUnsubscribeToken(token: string): VerifyResult {
  const invalid: VerifyResult = {
    subscriberId: null,
    email: null,
    isValid: false,
    isExpired: false,
  };

  if (!token || typeof token !== "string") return invalid;

  const dot = token.lastIndexOf(".");
  if (dot === -1) return invalid;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let expectedSig: string;
  try {
    expectedSig = sign(payload);
  } catch {
    return invalid;
  }

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return invalid;
  }

  let parsed: TokenPayload;
  try {
    parsed = JSON.parse(fromb64url(payload)) as TokenPayload;
  } catch {
    return invalid;
  }

  if (
    typeof parsed.sub !== "string" ||
    typeof parsed.email !== "string" ||
    typeof parsed.iat !== "number"
  ) {
    return invalid;
  }

  const isExpired = Date.now() - parsed.iat > TTL_MS;

  return {
    subscriberId: parsed.sub,
    email: parsed.email,
    isValid: !isExpired,
    isExpired,
  };
}
