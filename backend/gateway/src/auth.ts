/**
 * Supabase JWT verification - the single auth chokepoint for a user's backend.
 *
 * The gateway trusts no shared secret. It fetches Supabase's *public* signing
 * keys from the project JWKS endpoint and verifies every incoming token's
 * signature, issuer, audience, and expiry against them. It then enforces that
 * the token's `sub` equals the one Supabase user this machine was provisioned
 * for, so a valid token for user A can never read user B's backend.
 */
import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthOptions {
  /** Key resolver: `createRemoteJWKSet(...)` in prod, `createLocalJWKSet(...)` in tests. */
  jwks: JWTVerifyGetKey;
  /** Expected token issuer, `${SUPABASE_URL}/auth/v1`. */
  issuer: string;
  /** The Supabase user id this machine belongs to. */
  hermesUserId: string;
}

/**
 * Verify a raw `Authorization: Bearer <jwt>` header value and return the
 * decoded payload. Throws AuthError(401) for a missing/invalid/expired token
 * and AuthError(403) when the token belongs to a different user.
 */
export async function requireUser(
  authHeader: string | undefined | null,
  opts: AuthOptions,
): Promise<JWTPayload> {
  const match = /^Bearer (.+)$/i.exec((authHeader ?? "").trim());
  if (!match) {
    throw new AuthError(401, "missing bearer token");
  }
  const token = match[1]!;

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, opts.jwks, {
      issuer: opts.issuer,
      audience: "authenticated",
    }));
  } catch (err) {
    throw new AuthError(401, `invalid token: ${(err as Error).message}`);
  }

  if (payload.sub !== opts.hermesUserId) {
    // A valid token, but for a different user's backend.
    throw new AuthError(403, "token does not belong to this backend");
  }
  return payload;
}
