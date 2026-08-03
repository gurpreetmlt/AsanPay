import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, clearAuthCookies, getAuthCookies, setAuthCookies } from "@/lib/serverAuth";

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
      upstream = await forward(req, path, refreshJson.data.accessToken);
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

  const data = await upstream.text();
  return new NextResponse(data, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
