#!/usr/bin/env node
/**
 * Concurrent wallet-read load smoke (up to 500).
 *
 * EC2 / Mac:
 *   BASE_URL=https://api.yourdomain.com ACCESS_TOKEN=... CONCURRENCY=500 \
 *     node scripts/load-test-wallet-me.mjs
 *
 * Do not point CONCURRENCY=500 money-write tests at production without a dedicated staging tenant.
 */
const BASE_URL = (process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const TOKEN = process.env.ACCESS_TOKEN || "";
const CONCURRENCY = Math.min(Math.max(Number(process.env.CONCURRENCY || 50), 1), 500);
const PATH = process.env.PATH_SUFFIX || "/api/wallet/me";

if (!TOKEN) {
  console.error("Set ACCESS_TOKEN (agent JWT)");
  process.exit(1);
}

async function one(i) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${PATH}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    return { i, ok: res.ok, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return { i, ok: false, status: 0, ms: Date.now() - t0, err: String(e) };
  }
}

async function main() {
  console.log(`Hitting ${BASE_URL}${PATH} x${CONCURRENCY}`);
  const results = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => one(i)));
  const ok = results.filter((r) => r.ok).length;
  const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  const max = Math.max(...results.map((r) => r.ms));
  const statuses = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] || 0) + 1;
  console.log(`ok=${ok}/${results.length} avgMs=${avg} maxMs=${max}`);
  console.log("statusCounts", statuses);
  if (ok < results.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
