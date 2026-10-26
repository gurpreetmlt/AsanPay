import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../src/app";
import { pgPool } from "../src/db/postgres";

// KYC images must never be reachable without auth — only through the owner / admin routes.

const app = createApp();
const DIR = path.join(process.cwd(), "uploads", "kyc", "accesstest");
const FILE = path.join(DIR, "panImage-test.png");

afterAll(async () => {
  await rm(DIR, { recursive: true, force: true });
  await pgPool.end();
});

describe("KYC document exposure", () => {
  it("does not serve uploads/kyc files statically", async () => {
    await mkdir(DIR, { recursive: true });
    await writeFile(FILE, Buffer.from("not-a-real-image"));
    const res = await request(app).get("/uploads/kyc/accesstest/panImage-test.png");
    expect(res.status).toBe(404);
  });

  it("requires auth for the owner document route", async () => {
    const res = await request(app).get("/api/kyc/documents/panCard");
    expect(res.status).toBe(401);
  });
});
