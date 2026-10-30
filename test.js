// test.js
// Prove the service is single-use under concurrency.

import assert from "node:assert/strict";
import { issueToken, consumeToken, closeRedis } from "./token-service.js";

async function main() {
  try {
    const id = await issueToken({ userId: 42 }, 60);
    console.log("issued token:", id);

    // All five consumers race concurrently for the same one-time token.
    const results = await Promise.all([
      consumeToken(id),
      consumeToken(id),
      consumeToken(id),
      consumeToken(id),
      consumeToken(id),
    ]);

    const winners = results.filter((result) => result.ok).length;
    console.log("winners:", winners);

    assert.equal(winners, 1, "Expected exactly one consumer to win");
    const losers = results.filter((result) => !result.ok);
    assert.equal(losers.length, 4);
    assert.ok(losers.every((result) => result.reason === "invalid"));

    console.log("PASS: token was single-use.");
  } finally {
    await closeRedis();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
