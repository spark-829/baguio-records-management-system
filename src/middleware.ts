import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";

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
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  if (!data.user && !isLogin && !isPublic) return toLogin(request);
  if (data.user && isLogin && !request.nextUrl.searchParams.has("error")) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/";
    return NextResponse.redirect(new URL(next, request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|pdf)$).*)"],
};
