import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { hardenCookie } from "@/lib/session-cookie";

/** The caller's IP and browser, passed to the database so audit and access logs can record them. */
export async function requestMeta() {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = (h.get("user-agent") ?? "").slice(0, 300);
  return { ip, ua };
}

/** Supabase client bound to the signed-in user's session, so row-level security applies. */
export async function createClient() {
  const cookieStore = await cookies();
  const { ip, ua } = await requestMeta();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // The database only trusts the IP and browser headers when they come with this server-held key (QA-005).
      global: { headers: { "x-rms-client-ip": ip, "x-rms-user-agent": ua, ...(process.env.RMS_PROXY_KEY ? { "x-rms-proxy-key": process.env.RMS_PROXY_KEY } : {}) } },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // HttpOnly, Secure, SameSite=Lax and at most 12 hours, instead of readable by scripts for 400 days (QA-089).
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, hardenCookie(options, process.env.NODE_ENV === "production")));
          } catch {
            // Called from a Server Component; the middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
