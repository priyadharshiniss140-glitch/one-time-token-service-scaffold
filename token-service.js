// token-service.js
// A single-use, expiring token service backed by Redis.

import crypto from "node:crypto";
import Redis from "ioredis";
import "dotenv/config";

const redis = new Redis(process.env.REDIS_URL);

// Helper: build the Redis key for a token id.
const keyFor = (id) => "token:" + id;

/**
 * Issue a single-use token that expires after ttlSeconds.
 *
 * SET stores the JSON payload and expiry atomically. NX also guards against
 * the extraordinarily unlikely event that a randomly generated key exists.
 *
 * @param {object} payload Any JSON-serialisable data (e.g. { userId: 42 }).
 * @param {number} ttlSeconds Seconds until the token expires.
 * @returns {Promise<string>} The token id to hand to the user.
 */
export async function issueToken(payload, ttlSeconds) {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new TypeError("ttlSeconds must be a positive integer");
  }

  const value = JSON.stringify(payload);
  if (value === undefined) {
    throw new TypeError("payload must be JSON-serialisable");
  }

  // Retry only if NX reports a key collision; SET EX NX is atomic each time.
  while (true) {
    const tokenId = crypto.randomBytes(16).toString("hex");
    const stored = await redis.set(keyFor(tokenId), value, "EX", ttlSeconds, "NX");
    if (stored === "OK") return tokenId;
  }
}

/**
 * Consume a token exactly once using Redis GETDEL (atomic read + delete).
 *
 * @param {string} tokenId
 * @returns {Promise<{ ok: true, payload: object } | { ok: false, reason: "invalid" }>}
 */
export async function consumeToken(tokenId) {
  const value = await redis.getdel(keyFor(tokenId));

  if (value === null) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, payload: JSON.parse(value) };
}

// Allow other files to close the connection cleanly (used by test.js).
export function closeRedis() {
  return redis.quit();
}
