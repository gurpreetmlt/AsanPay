import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => {
  const state = {
    row: null as { token: string; expiresAtMs: number } | null,
    saves: 0,
    lockTail: Promise.resolve() as Promise<unknown>,
  };
  return { state, sendSlackAlert: vi.fn(async () => undefined) };
});

vi.mock("../src/modules/providers/noble/tokenStore", () => ({
  readNobleSession: async () => (shared.state.row ? { ...shared.state.row } : null),
  readNobleSessionRow: async () => null,
  withNobleLoginLock: async <T>(fn: (store: unknown) => Promise<T>): Promise<T> => {
    const prev = shared.state.lockTail;
    let release!: () => void;
    shared.state.lockTail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await fn({
        read: async () => (shared.state.row ? { ...shared.state.row } : null),
        save: async (token: string, expiresAtMs: number) => {
          shared.state.row = { token, expiresAtMs };
          shared.state.saves += 1;
        },
      });
    } finally {
      release();
    }
  },
}));
vi.mock("../src/utils/alert", () => ({ sendSlackAlert: shared.sendSlackAlert }));
vi.mock("../src/config/env", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/config/env")>();
  return {
    ...orig,
    isNobleConfigured: () => true,
    env: {
      ...orig.env,
      NOBLE_API_KEY: "test-key",
      NOBLE_API_VALUE: "test-value",
      NOBLE_BASE_SERVICE: "https://service.test",
      NOBLE_BASE_RECHARGE: "https://recharge.test",
    },
  };
});

function jwt(id: string, expMs = Date.now() + 24 * 3600 * 1000): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000), id })).toString("base64url");
  return `h.${payload}.s`;
}

const fetchMock = vi.fn();
let loginCount = 0;

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) };
}

function loginOk() {
  loginCount += 1;
  return reply({ status: 1, responseData: [{ token: jwt(`T${loginCount}`) }] });
}

/** A fresh module instance = a separate process (API, Jobs, script) sharing one DB. */
async function newProcess() {
  vi.resetModules();
  return import("../src/modules/providers/noble/client");
}

beforeEach(() => {
  shared.state.row = null;
  shared.state.saves = 0;
  shared.state.lockTail = Promise.resolve();
  shared.sendSlackAlert.mockClear();
  loginCount = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const isLogin = (url: unknown) => String(url).includes("/client_auth/login");

describe("shared provider token", () => {
  it("reuses the DB token in another process without logging in again", async () => {
    fetchMock.mockImplementation(async () => loginOk());
    const api = await newProcess();
    const t1 = await api.getNobleToken();

    const jobs = await newProcess();
    const t2 = await jobs.getNobleToken();

    expect(t2).toBe(t1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(shared.state.saves).toBe(1);
  });

  it("logs in once when several processes need a token at the same time", async () => {
    fetchMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return loginOk();
    });
    const a = await newProcess();
    const b = await newProcess();
    const tokens = await Promise.all([a.getNobleToken(), b.getNobleToken(), a.getNobleToken()]);

    expect(new Set(tokens).size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses a newer DB token after a rejected token instead of logging in", async () => {
    const stale = jwt("stale");
    const fresh = jwt("fresh");
    shared.state.row = { token: stale, expiresAtMs: Date.now() + 3600_000 };
    const api = await newProcess();
    fetchMock.mockImplementation(async (url: unknown, init: { headers: Record<string, string> }) => {
      if (isLogin(url)) return loginOk();
      if (init.headers.Authorization === `Bearer ${stale}`) {
        shared.state.row = { token: fresh, expiresAtMs: Date.now() + 3600_000 };
        return reply({ status: -1, statusCode: "AE0026", message: "Invalid token" });
      }
      return reply({ status: 1, responseData: [] });
    });

    const r = await api.noblePost("recharge", "/v1.0/recharge/recharge_status", {});

    expect(r.json.status).toBe(1);
    expect(fetchMock.mock.calls.filter(([u]) => isLogin(u))).toHaveLength(0);
  });

  it("logs in again when the rejected token is still the one in the DB", async () => {
    const stale = jwt("stale");
    shared.state.row = { token: stale, expiresAtMs: Date.now() + 3600_000 };
    const api = await newProcess();
    fetchMock.mockImplementation(async (url: unknown, init: { headers: Record<string, string> }) => {
      if (isLogin(url)) return loginOk();
      if (init.headers.Authorization === `Bearer ${stale}`) return reply({ status: -1, statusCode: "AE0027" });
      return reply({ status: 1, responseData: [] });
    });

    const r = await api.noblePost("recharge", "/v1.0/recharge/recharge_status", {});

    expect(r.json.status).toBe(1);
    expect(fetchMock.mock.calls.filter(([u]) => isLogin(u))).toHaveLength(1);
    expect(shared.state.row?.token).not.toBe(stale);
  });

  it("stops on the daily login limit without retrying and alerts once", async () => {
    fetchMock.mockImplementation(async () =>
      reply({ status: 0, statusCode: "AE0031", description: "Daily token generation limit exceeded. Maximum 5 tokens allowed per day." }),
    );
    const api = await newProcess();

    await expect(api.getNobleToken()).rejects.toMatchObject({ statusCode: 503, code: "NOBLE_TOKEN_LIMIT" });
    await expect(api.getNobleToken()).rejects.toMatchObject({ code: "NOBLE_TOKEN_LIMIT" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(shared.sendSlackAlert).toHaveBeenCalledTimes(1);
    expect(shared.state.row).toBeNull();
  });
});
