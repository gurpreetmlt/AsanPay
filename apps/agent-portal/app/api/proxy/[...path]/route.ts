import { NextRequest, NextResponse } from "next/server";
import {
  BACKEND_URL,
  clearAuthCookies,
  getAuthCookies,
  getTrustedBrowserCookie,
  setAuthCookies,
  setTrustedBrowserCookie,
} from "@/lib/serverAuth";

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
  // The backend only trusts X-AsanPay-Client-IP when the shared key matches. The last XFF hop is the
  // one our ingress appended; earlier entries are whatever the browser sent.
  const browserIp = realIp?.trim() || xff?.split(",").pop()?.trim() || "";
  const proxyKey = process.env.PROXY_SHARED_SECRET?.trim();
  return {
    ...(xff ? { "X-Forwarded-For": xff } : realIp ? { "X-Forwarded-For": realIp } : {}),
    ...(realIp ? { "X-Real-IP": realIp } : {}),
    ...(browserIp && proxyKey ? { "X-AsanPay-Client-IP": browserIp, "X-AsanPay-Proxy-Key": proxyKey } : {}),
  };
}

async function forward(
  req: NextRequest,
  path: string[],
  accessToken: string | null,
  bodyOverride?: string,
): Promise<Response> {
  const url = `${BACKEND_URL}/${path.join("/")}${req.nextUrl.search}`;
  const body =
    bodyOverride ?? (req.method === "GET" || req.method === "HEAD" ? undefined : await req.text());

  const idempotencyKey = req.headers.get("idempotency-key");
  const contentType = req.headers.get("content-type");
  const userAgent = req.headers.get("user-agent");
  const isReceiptPdf = path[path.length - 1] === "pdf" && path[path.length - 2] === "receipt";
  // Aadhaar OTP verify can wait on BestAPI → UIDAI longer than normal JSON calls.
  const isAadhaarOtp =
    path[0] === "kyc" && path[1] === "aadhaar" && path[2] === "otp";
  const timeoutMs = isReceiptPdf || isAadhaarOtp ? 45_000 : 30_000;
  return fetch(url, {
    method: req.method,
    headers: {
      // Do not force application/json on GET/binary (breaks some gateways / PDF streams).
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(userAgent ? { "User-Agent": userAgent } : {}),
      ...clientIpHeaders(req),
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function authSessionPayload(json: { data?: { user?: unknown; status?: unknown; isNewDevice?: unknown } }) {
  return {
    user: json.data?.user ?? null,
    accessToken: "cookie",
    refreshToken: "cookie",
    ...(typeof json.data?.status === "string" ? { status: json.data.status } : {}),
    ...(typeof json.data?.isNewDevice === "boolean" ? { isNewDevice: json.data.isNewDevice } : {}),
  };
}

/** Password login: this portal has the approval wait screen; add the 1-day trusted-browser token. */
async function passwordLoginBody(req: NextRequest): Promise<string> {
  const body = ((await req.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
  delete body.trustedBrowserToken;
  const trusted = await getTrustedBrowserCookie();
  return JSON.stringify({
    ...body,
    supportsLoginApproval: true,
    ...(trusted ? { trustedBrowserToken: trusted } : {}),
  });
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  try {
    const { path } = await ctx.params;
    const isAuth = path[0] === "auth";
    // Linked-account switch issues a new session: tokens go into cookies (never to browser JS),
    // and the current refresh cookie is sent along so the backend can revoke it.
    const isAccountSwitch =
      req.method === "POST" && path.length === 2 && path[0] === "linked-accounts" && path[1] === "switch";
    const { accessToken, refreshToken } = await getAuthCookies();

    let switchBody: Record<string, unknown> | null = null;
    if (isAccountSwitch) {
      switchBody = ((await req.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
      delete switchBody.refreshToken;
    }
    const switchBodyWith = (token: string | null) =>
      switchBody ? JSON.stringify(token ? { ...switchBody, refreshToken: token } : switchBody) : undefined;

    const isPasswordLogin = req.method === "POST" && path.length === 2 && isAuth && path[1] === "login";
    const loginBody = isPasswordLogin ? await passwordLoginBody(req) : undefined;

    let upstream = await forward(req, path, accessToken, loginBody ?? switchBodyWith(refreshToken));

    // Credential-entry endpoints (login/otp/mpin/signup) are always POST and a 401 there means
    // "wrong credentials", not "expired access token" — never retry those. GET auth endpoints
    // (e.g. /auth/me) only ever fail 401 because the access cookie expired, so they need the same
    // silent-refresh treatment as everything else.
    const canRetry = !isAuth || req.method === "GET";
    if (canRetry && upstream.status === 401 && refreshToken) {
      const refreshed = await refreshOnce(refreshToken);

      if (refreshed) {
        await setAuthCookies(refreshed.accessToken, refreshed.refreshToken);
        upstream = await forward(req, path, refreshed.accessToken, switchBodyWith(refreshed.refreshToken));
      } else {
        await clearAuthCookies();
      }
    }

    if (isAuth || isAccountSwitch) {
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
        if (typeof json.data.trustedBrowserToken === "string" && typeof json.data.trustedBrowserExpiresAt === "string") {
          await setTrustedBrowserCookie(json.data.trustedBrowserToken, json.data.trustedBrowserExpiresAt);
        }
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
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    const causeMsg =
      err instanceof Error && err.cause instanceof Error
        ? err.cause.message
        : typeof (err as { cause?: { code?: string } })?.cause?.code === "string"
          ? String((err as { cause: { code: string } }).cause.code)
          : "";
    const timedOut =
      name === "TimeoutError" ||
      name === "AbortError" ||
      /aborted|timeout/i.test(msg) ||
      /aborted|timeout/i.test(causeMsg);
    const message = timedOut
      ? "Aadhaar verification timed out. Tap Resend OTP and try again."
      : "Could not reach the API. Try again in a moment.";
    return NextResponse.json(
      {
        success: false,
        message,
        code: timedOut ? "PROXY_TIMEOUT" : "PROXY_UNREACHABLE",
      },
      { status: 502 },
    );
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
