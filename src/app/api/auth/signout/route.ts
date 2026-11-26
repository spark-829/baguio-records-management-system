import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/same-origin";

const REASONS = new Set(["idle", "locked", "no-access"]);

function toLogin(origin: string, reason: string) {
  const to = new URL("/login", origin);
  if (REASONS.has(reason)) to.searchParams.set("error", reason);
  return NextResponse.redirect(to, { status: 303 });
}

/**
 * Signs the user out (logging why) and returns to the sign-in page. Used by idle timeout and "Cancel and sign out".
 * POST only, from this site's own pages: a link or image on another site can no longer sign people out (QA-091).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!isSameOrigin(req.headers, url.origin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const reason = String(form?.get("reason") ?? url.searchParams.get("reason") ?? "");
  const supabase = await createClient();
  await supabase.rpc("rms_log_access", { p_event: reason === "idle" ? "idle_logout" : "logout", p_detail: reason ? { reason } : null });
  await supabase.auth.signOut();
  return toLogin(url.origin, reason);
}

/**
 * A plain visit only signs out an account that really has no access any more (locked or switched off);
 * the server pages send those users here. Anyone else is sent back to the start page, still signed in.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const reason = url.searchParams.get("reason") ?? "";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return toLogin(url.origin, "");
  const { data: role } = await supabase.rpc("rms_my_role");
  if (role) return NextResponse.redirect(new URL("/", url.origin), { status: 303 });
  await supabase.rpc("rms_log_access", { p_event: "logout", p_detail: { reason: reason || "no-access" } });
  await supabase.auth.signOut();
  return toLogin(url.origin, REASONS.has(reason) && reason !== "idle" ? reason : "no-access");
}
