import { createClient } from "@supabase/supabase-js";
import { buildHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

// Anonymous, cookie-free check that the app and the database both answer.
export async function GET() {
  let dbOk = false;
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const { error } = await supabase.rpc("rms_today").abortSignal(ctrl.signal);
      dbOk = !error;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    dbOk = false;
  }
  const { status, body } = buildHealth({ dbOk, checkedAt: new Date() });
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
