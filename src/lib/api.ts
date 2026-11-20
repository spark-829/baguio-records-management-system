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
  const { data: me } = await supabase
    .from("rms_profiles")
    .select("id, full_name, role, office_id, is_active, office:rms_offices(code, name)")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!me || !me.is_active) return { error: NextResponse.json({ error: "No RMS access" }, { status: 403 }) } as const;
  return { supabase, me: me as unknown as Profile } as const;
}

export function aiError(err: unknown) {
  if (err instanceof AiUnavailableError) return NextResponse.json({ error: err.message }, { status: 503 });
  console.error(err);
  const message = err instanceof Error ? err.message : "AI request failed";
  return NextResponse.json({ error: message }, { status: 502 });
}
