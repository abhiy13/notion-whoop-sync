import assert from "node:assert/strict";
import test from "node:test";
import type { WhoopCycle } from "../src/types.js";
import { createWhoopClient } from "../src/whoop.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cycle(id: number): WhoopCycle {
  return {
    id,
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    start: "2026-09-20T00:00:00Z",
    score_state: "SCORED",
  };
}

async function withMockFetch(
  mock: typeof fetch,
  callback: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await callback();
  } finally {
    globalThis.fetch = original;
  }
}

test("collection requests authenticate, clamp limits, and paginate", async () => {
  const urls: URL[] = [];
  const authorizations: Array<string | null> = [];
  let waits = 0;

  await withMockFetch(
    (async (input, init) => {
      const url = new URL(String(input));
      urls.push(url);
      authorizations.push(new Headers(init?.headers).get("Authorization"));
      if (!url.searchParams.has("nextToken")) {
        return jsonResponse({ records: [cycle(1)], next_token: "page-two" });
      }
      return jsonResponse({ records: [cycle(2)] });
    }) as typeof fetch,
    async () => {
      const client = createWhoopClient("access-token", async () => {
        waits += 1;
      });
      const records = await client.allCycles({
        start: "2026-09-01T00:00:00Z",
        end: "2026-09-21T00:00:00Z",
        limit: 100,
      });

      assert.deepEqual(records.map((record) => record.id), [1, 2]);
    },
  );

  assert.equal(waits, 2);
  assert.equal(urls.length, 2);
  assert.equal(urls[0]?.pathname, "/developer/v2/cycle");
  assert.equal(urls[0]?.searchParams.get("limit"), "25");
  assert.equal(urls[0]?.searchParams.get("start"), "2026-09-01T00:00:00Z");
  assert.equal(urls[1]?.searchParams.get("nextToken"), "page-two");
  assert.deepEqual(authorizations, ["Bearer access-token", "Bearer access-token"]);
});

test("missing recovery is represented as null", async () => {
  await withMockFetch(
    (async () => new Response("not found", { status: 404 })) as typeof fetch,
    async () => {
      const client = createWhoopClient("access-token", async () => undefined);
      assert.equal(await client.recovery(42), null);
    },
  );
});

test("WHOOP errors include the endpoint, status, and a bounded response body", async () => {
  await withMockFetch(
    (async () => new Response("temporarily unavailable", { status: 503 })) as typeof fetch,
    async () => {
      const client = createWhoopClient("access-token", async () => undefined);
      await assert.rejects(
        client.sleep(42),
        /WHOOP \/cycle\/42\/sleep failed \(503\): temporarily unavailable/,
      );
    },
  );
});
