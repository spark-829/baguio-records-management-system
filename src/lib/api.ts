import "server-only";
import { NextResponse } from "next/server";
import { AiUnavailableError } from "./ai";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/** Resolve the caller's session and profile for API routes; returns a 401 response if missing. */
export async function apiContext() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  const first = await supabase
    .from("rms_profiles")
    .select("id, full_name, role, office_id, is_active, locked_until, window_intake, office:rms_offices(code, name)")
    .eq("id", auth.user.id)
    .maybeSingle();
  // Deployed before the migrations: fall back to the old columns.
  const { data: me } = first.error
    ? await supabase
        .from("rms_profiles")
        .select("id, full_name, role, office_id, is_active, locked_until, office:rms_offices(code, name)")
        .eq("id", auth.user.id)
        .maybeSingle()
    : first;
  const locked = me?.locked_until && new Date(me.locked_until) > new Date();
  if (!me || !me.is_active || locked) return { error: NextResponse.json({ error: "No RMS access" }, { status: 403 }) } as const;
  return { supabase, me: me as unknown as Profile } as const;
}

export function aiError(err: unknown) {
  if (err instanceof AiUnavailableError) return NextResponse.json({ error: err.message }, { status: 503 });
  console.error(err);
  const message = err instanceof Error ? err.message : "AI request failed";
  return NextResponse.json({ error: message }, { status: 502 });
}

/** Admin setting: keep Confidential records out of AI features (on by default). */
export async function aiExcludesConfidential(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("rms_settings").select("value").eq("key", "ai_exclude_confidential").maybeSingle();
  return data?.value !== false;
}
