import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, clearAuthCookies, getAuthCookies, setAuthCookies } from "@/lib/serverAuth";

// The dashboard (and other pages) fire several API calls in parallel. If the access-token cookie
// is expired, each of those requests independently hits this 401 branch — without de-duping,
// they'd each call /auth/refresh with the SAME (not-yet-rotated) refresh token. The backend
// rotates + revokes the old refresh token on first use, so the 2nd/3rd concurrent calls look
// like refresh-token reuse (a replay attack) and the backend responds by revoking every device
// for the user — silently logging them out and breaking Welcome-back MPIN. This process is a
// single long-running Node server (not multi-instance serverless), so an in-memory map safely
// coalesces concurrent refreshes for the same token into one upstream call.
const inFlightRefreshes = new Map<string, Promise<{ accessToken: string; refreshToken: string } | null>>();

async function refreshOnce(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const existing = inFlightRefreshes.get(refreshToken);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const refreshRes = await fetch(`${BACKEND_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
      const refreshJson = await refreshRes.json().catch(() => null);
      if (refreshRes.ok && refreshJson?.success) {
        return { accessToken: refreshJson.data.accessToken as string, refreshToken: refreshJson.data.refreshToken as string };
      }
      return null;
    } finally {
      inFlightRefreshes.delete(refreshToken);
    }
  })();

  inFlightRefreshes.set(refreshToken, promise);
  return promise;
}

/** Pass browser IP through so backend rate limits are not shared across all portal users. */
function clientIpHeaders(req: NextRequest): Record<string, string> {
  const xff = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  if (!xff && !realIp) return {};
  return {
    ...(xff ? { "X-Forwarded-For": xff } : realIp ? { "X-Forwarded-For": realIp } : {}),
    ...(realIp ? { "X-Real-IP": realIp } : {}),
  };
}

async function forward(req: NextRequest, path: string[], accessToken: string | null): Promise<Response> {
  const url = `${BACKEND_URL}/${path.join("/")}${req.nextUrl.search}`;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const idempotencyKey = req.headers.get("idempotency-key");
  return fetch(url, {
    method: req.method,
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...clientIpHeaders(req),
    },
    body,
    cache: "no-store",
  });
}

function authSessionPayload(json: { data?: { user?: unknown } }) {
  return {
    user: json.data?.user ?? null,
    accessToken: "cookie",
    refreshToken: "cookie",
  };
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const { path } = await ctx.params;
  const isAuth = path[0] === "auth";
  const { accessToken, refreshToken } = await getAuthCookies();

  let upstream = await forward(req, path, accessToken);

  // Credential-entry endpoints (login/otp/mpin/signup) are always POST and a 401 there means
  // "wrong credentials", not "expired access token" — never retry those. GET auth endpoints
  // (e.g. /auth/me) only ever fail 401 because the access cookie expired, so they need the same
  // silent-refresh treatment as everything else.
  const canRetry = !isAuth || req.method === "GET";
  if (canRetry && upstream.status === 401 && refreshToken) {
    const refreshed = await refreshOnce(refreshToken);

    if (refreshed) {
      await setAuthCookies(refreshed.accessToken, refreshed.refreshToken);
      upstream = await forward(req, path, refreshed.accessToken);
    } else {
      await clearAuthCookies();
    }
  }

  if (isAuth) {
    const json = await upstream.json().catch(() => null);

    if (path[1] === "logout") {
      await clearAuthCookies();
    }

    if (
      upstream.ok &&
      json?.success &&
      typeof json?.data?.accessToken === "string" &&
      typeof json?.data?.refreshToken === "string"
    ) {
      await setAuthCookies(json.data.accessToken, json.data.refreshToken);
      return NextResponse.json(
        {
          success: true,
          message: json.message,
          data: authSessionPayload(json),
        },
        { status: upstream.status },
      );
    }

    return NextResponse.json(json ?? { success: false, message: "Request failed" }, { status: upstream.status });
  }

  // Use arrayBuffer (not text) so binary responses like PDF receipts pass through unmangled.
  const data = await upstream.arrayBuffer();
  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") || "application/json",
  };
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers["Content-Disposition"] = disposition;
  return new NextResponse(data, { status: upstream.status, headers });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
