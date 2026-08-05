import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, clearAuthCookies, getAuthCookies, setAuthCookies } from "@/lib/serverAuth";

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

  let upstream: Response;
  try {
    upstream = await forward(req, path, accessToken);
  } catch {
    return NextResponse.json(
      {
        success: false,
        message:
          "Cannot reach the API from admin-portal. Set Coolify env API_URL to the backend URL (e.g. https://api…/api) and redeploy.",
      },
      { status: 502 },
    );
  }

  if (!isAuth && upstream.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    const refreshJson = await refreshRes.json().catch(() => null);

    if (refreshRes.ok && refreshJson?.success) {
      await setAuthCookies(refreshJson.data.accessToken, refreshJson.data.refreshToken);
      try {
        upstream = await forward(req, path, refreshJson.data.accessToken);
      } catch {
        await clearAuthCookies();
        return NextResponse.json(
          { success: false, message: "Cannot reach the API after token refresh" },
          { status: 502 },
        );
      }
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

    const message =
      (typeof json?.message === "string" && json.message.trim()) ||
      (upstream.status === 401
        ? "Invalid username or password"
        : upstream.status >= 500
          ? `API error (${upstream.status}). Backend may be down — check Coolify backend status.`
          : `Login failed (HTTP ${upstream.status}). Check API_URL on admin-portal.`);

    return NextResponse.json(
      { success: false, message, code: json?.code },
      { status: upstream.status >= 400 ? upstream.status : 502 },
    );
  }

  const data = await upstream.text();
  return new NextResponse(data, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
