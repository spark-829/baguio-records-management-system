import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { SEEN_COOKIE, SEEN_REFRESH_SEC, SESSION_MAX_AGE, hardenCookie, isBackgroundRequest, sessionExpired, readSeen, signSeen } from "@/lib/session-cookie";

// Control characters such as %00 in the address are refused up front instead of ending in an error page (QA-092).
const BAD_ESCAPE = /%(?:0[0-8bcef]|1[0-9a-f]|7f)/i;
const SECURE = process.env.NODE_ENV === "production";

// The public tracking and developer pages are open to citizens without an account.
const PUBLIC_PATHS = ["/track", "/survey", "/developer", "/api/health"];

function toLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { pathname, search } = request.nextUrl;
  url.pathname = "/login";
  url.search = "";
  if (request.method === "GET" && pathname !== "/" && !pathname.startsWith("/api/")) {
    const next = safeNextPath(pathname + search);
    if (next) url.searchParams.set("next", next);
  }
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  if (BAD_ESCAPE.test(request.nextUrl.search) || BAD_ESCAPE.test(request.nextUrl.pathname)) return new NextResponse("Bad request", { status: 400 });
  const isLogin = request.nextUrl.pathname.startsWith("/login");
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  // No Supabase sign-in cookie means nobody is signed in: skip building the auth client (QA-076, CPU per request).
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasSession) return isLogin || isPublic ? NextResponse.next({ request }) : toLogin(request);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, hardenCookie(options, SECURE)));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  if (!data.user && !isLogin && !isPublic) return toLogin(request);

  // Server-side idle limit (QA-089): the browser countdown can be switched off, this check cannot.
  const key = process.env.RMS_SESSION_KEY || process.env.RMS_PROXY_KEY;
  if (data.user && key && !isLogin && !isPublic) {
    const now = Math.floor(Date.now() / 1000);
    const raw = request.cookies.get(SEEN_COOKIE)?.value;
    const seen = await readSeen(key, data.user.id, raw);
    if (!seen || sessionExpired(seen, now)) {
      await supabase.rpc("rms_log_access", { p_event: "idle_logout", p_detail: { reason: seen ? "server-session-limit" : "no-activity-cookie" } });
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = seen && now - seen.start <= SESSION_MAX_AGE ? "?error=idle" : "?error=expired";
      const out = NextResponse.redirect(url, { status: 303 });
      response.cookies.getAll().forEach((c) => out.cookies.set(c));
      out.cookies.set(SEEN_COOKIE, "", { path: "/", maxAge: 0 });
      return out;
    }
    if (now - seen.seen >= SEEN_REFRESH_SEC && !isBackgroundRequest(request.headers)) {
      response.cookies.set(SEEN_COOKIE, await signSeen(key, data.user.id, { ...seen, seen: now }), hardenCookie({}, SECURE));
    }
  }
  if (data.user && isLogin && !request.nextUrl.searchParams.has("error")) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/";
    return NextResponse.redirect(new URL(next, request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|pdf)$).*)"],
};
