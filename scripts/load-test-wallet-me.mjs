#!/usr/bin/env node
/**
 * Concurrent wallet-read smoke (not a full 500-txn money load test).
 * Run against a live API from Mac Terminal after deploy:
 *
 *   BASE_URL=https://api.example.com ACCESS_TOKEN=... CONCURRENCY=50 node scripts/load-test-wallet-me.mjs
 *
 * Full 500 concurrent money posts need EC2 + seeded wallets — do not run against prod.
 */
const BASE_URL = (process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const TOKEN = process.env.ACCESS_TOKEN || "";
const CONCURRENCY = Number(process.env.CONCURRENCY || 50);

if (!TOKEN) {
  console.error("Set ACCESS_TOKEN (agent JWT)");
  process.exit(1);
}

async function one(i) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/wallet/me`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const ms = Date.now() - t0;
  const ok = res.ok;
  return { i, ok, status: res.status, ms };
}

async function main() {
  console.log(`Hitting ${BASE_URL}/api/wallet/me x${CONCURRENCY}`);
  const results = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => one(i)));
  const ok = results.filter((r) => r.ok).length;
  const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  const max = Math.max(...results.map((r) => r.ms));
  console.log(`ok=${ok}/${results.length} avgMs=${avg} maxMs=${max}`);
  if (ok < results.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
