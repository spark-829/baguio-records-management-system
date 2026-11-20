import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const REASONS = new Set(["idle", "locked", "no-access"]);

/** Signs the user out (logging why) and returns to the sign-in page. Used for idle timeout and locked accounts. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const reason = url.searchParams.get("reason") ?? "";
  const supabase = await createClient();
  await supabase.rpc("rms_log_access", { p_event: reason === "idle" ? "idle_logout" : "logout", p_detail: reason ? { reason } : null });
  await supabase.auth.signOut();
  const to = new URL("/login", url.origin);
  if (REASONS.has(reason)) to.searchParams.set("error", reason);
  return NextResponse.redirect(to, { status: 303 });
}
