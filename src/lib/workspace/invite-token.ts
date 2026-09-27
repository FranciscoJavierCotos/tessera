import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

/** 32 random bytes, base64url without padding: 43 characters. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/**
 * Hex sha256 of an invite token. Only the hash is stored
 * (`invites.token_hash`); it matches `private.hash_invite_token` in the DB.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A fresh invite token and the hash to store for it. */
export function createInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

/** Absolute accept link for `token`. */
export function inviteUrl(siteUrl: string, token: string): string {
  return new URL(`/invite/${token}`, siteUrl).toString();
}
