import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile, getSettings, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CONF_LABEL, PRIORITY_LABEL, fmtDate, fmtDateTime } from "@/lib/labels";
import { allowedActions, isOverdue } from "@/lib/workflow";
import type { Direction, Status, Priority, Confidentiality } from "@/lib/types";
import { ConfBadge, OverdueBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { ActionForm, AttachForm, DeleteForm } from "./forms";
import { restoreRecord } from "./actions";
import { SummaryBox } from "./summary-box";

type Rec = {
  id: string;
  tracking_no: string;
  direction: Direction;
  subject: string;
  description: string | null;
  category: string | null;
  keywords: string[];
  priority: Priority;
  confidentiality: Confidentiality;
  sender_name: string | null;
  sender_org: string | null;
  recipient_name: string | null;
  recipient_org: string | null;
  mode: string | null;
  document_date: string | null;
  status: Status;
  due_date: string | null;
  created_at: string;
  ai_summary: string | null;
  content_text: string | null;
  current_office_id: string;
  deleted_at: string | null;
  delete_reason: string | null;
  deleter: { full_name: string } | null;
  doc_type: { name: string } | null;
  current_office: { code: string; name: string } | null;
  origin_office: { code: string; name: string } | null;
  creator: { full_name: string } | null;
};

type Route = {
  id: string;
  status: Status;
  action_taken: string | null;
  remarks: string | null;
  created_at: string;
  from_office: { code: string } | null;
  to_office: { code: string } | null;
  actor: { full_name: string } | null;
};

export default async function RecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const [me, settings] = await Promise.all([getProfile(), getSettings()]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("rms_records")
    .select(
      "*, doc_type:rms_document_types(name), current_office:rms_offices!rms_records_current_office_id_fkey(code, name), origin_office:rms_offices!rms_records_origin_office_id_fkey(code, name), creator:rms_profiles!rms_records_created_by_fkey(full_name), deleter:rms_profiles!rms_records_deleted_by_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const rec = data as unknown as Rec;
  // Access history: every opened record is logged with who, when and from which IP.
  await supabase.rpc("rms_log_access", { p_event: "view_record", p_record_id: rec.id });
  const deleted = Boolean(rec.deleted_at);

  const [{ data: routes }, { data: files }, { data: offices }] = await Promise.all([
    supabase
      .from("rms_routes")
      .select("id, status, action_taken, remarks, created_at, from_office:rms_offices!rms_routes_from_office_id_fkey(code), to_office:rms_offices!rms_routes_to_office_id_fkey(code), actor:rms_profiles(full_name)")
      .eq("record_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("rms_attachments").select("id, file_name, mime_type, size_bytes, version, uploaded_at").eq("record_id", id).order("uploaded_at"),
    supabase.from("rms_offices").select("id, code, name").eq("is_active", true).order("code"),
  ]);

  const actions = deleted ? [] : allowedActions({
    status: rec.status,
    direction: rec.direction,
    role: me.role,
    userOfficeId: me.office_id,
    currentOfficeId: rec.current_office_id,
  });
  const incoming = rec.direction === "incoming";

  const facts: [string, React.ReactNode][] = [
    ["Direction", incoming ? "Incoming" : "Outgoing"],
    ["Document type", rec.doc_type?.name],
    [incoming ? "From" : "To", [incoming ? rec.sender_name : rec.recipient_name, incoming ? rec.sender_org : rec.recipient_org].filter(Boolean).join(", ") || "—"],
    ["Date on document", fmtDate(rec.document_date)],
    ["Mode", rec.mode ? rec.mode[0].toUpperCase() + rec.mode.slice(1) : "—"],
    ["Category", rec.category ?? "—"],
    ["Keywords", rec.keywords.length ? rec.keywords.join(", ") : "—"],
    ["Priority", PRIORITY_LABEL[rec.priority]],
    ["Confidentiality", CONF_LABEL[rec.confidentiality]],
    ["Originating office", rec.origin_office ? `${rec.origin_office.code} · ${rec.origin_office.name}` : "—"],
    ["Registered", `${fmtDateTime(rec.created_at)} by ${rec.creator?.full_name ?? "—"}`],
    ["Due date", fmtDate(rec.due_date)],
  ];

  return (
    <div className="space-y-4">
      {deleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-l-4 border-red-300 border-l-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">
          <span>
            In the deleted-records bin since {fmtDateTime(rec.deleted_at)} by {rec.deleter?.full_name ?? "—"}. Reason: “{rec.delete_reason}”
          </span>
          <form action={restoreRecord}>
            <input type="hidden" name="record_id" value={rec.id} />
            <button className="btn-secondary">Restore record</button>
          </form>
        </div>
      )}
      {isNew && (
        <p className="rounded-lg border border-l-4 border-emerald-300 border-l-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Saved. Tracking number <strong>{rec.tracking_no}</strong> issued. Print the routing slip to attach to the paper copy.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-slate-500">{rec.tracking_no}</p>
          <h1 className="text-2xl font-bold">{rec.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={rec.status} />
            <PriorityBadge priority={rec.priority} />
            <ConfBadge level={rec.confidentiality} />
            {isOverdue(rec.due_date, rec.status) && <OverdueBadge />}
            <span className="text-sm text-slate-600">
              Now at <strong>{rec.current_office?.name}</strong>
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/records/${rec.id}/slip`} className="btn-secondary">Routing slip (QR)</Link>
          <Link href="/records" className="btn-secondary">Back to records</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SummaryBox recordId={rec.id} initial={rec.ai_summary} aiBlocked={rec.confidentiality === "confidential" && settings.aiExcludeConfidential} />

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">Details</h2>
            {rec.description && <p className="mb-3 text-sm text-slate-700">{rec.description}</p>}
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k} className="flex gap-2 border-b border-slate-100 py-1">
                  <dt className="w-40 shrink-0 text-slate-500">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {rec.content_text && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-600">Document text (read by the assistant)</summary>
                <p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{rec.content_text}</p>
              </details>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">History, actions and remarks</h2>
            <ol className="relative ml-2 border-l-2 border-slate-200">
              {((routes ?? []) as unknown as Route[]).map((r, i, all) => (
                <li key={r.id} className="mb-4 ml-4">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {all[i + 1]?.status !== r.status || (r.status === "forwarded" && r.to_office?.code !== all[i + 1]?.to_office?.code) ? (
                      <StatusBadge status={r.status} />
                    ) : (
                      <span className="badge bg-white text-slate-600 ring-1 ring-slate-200">Note</span>
                    )}
                    <span className="font-medium">{r.action_taken}</span>
                    {r.status === "forwarded" && r.from_office && r.to_office && r.from_office.code !== r.to_office.code && (
                      <span className="text-slate-500">{r.from_office.code} → {r.to_office.code}</span>
                    )}
                  </div>
                  {r.remarks && <p className="mt-1 text-sm text-slate-700">“{r.remarks}”</p>}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {fmtDateTime(r.created_at)} · {r.actor?.full_name ?? "—"}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Take action</h2>
            {actions.length ? (
              <ActionForm recordId={rec.id} actions={actions} offices={(offices ?? []).filter((o) => o.id !== rec.current_office_id)} />
            ) : (
              <p className="text-sm text-slate-500">
                {deleted
                  ? "Deleted records are read-only until restored."
                  : me.role === "viewer"
                    ? "Your account is read-only."
                    : rec.status === "archived"
                      ? "This record is archived and read-only."
                      : "Only the office holding this record, or the records desk, can act on it."}
              </p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Attachments</h2>
            <ul className="mb-3 space-y-2 text-sm">
              {(files ?? []).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <a href={`/api/attachments/${f.id}`} target="_blank" className="truncate text-brand-700 hover:underline">
                    {f.file_name}
                  </a>
                  <span className="shrink-0 text-xs text-slate-500">
                    v{f.version} · {Math.max(1, Math.round(f.size_bytes / 1024))} KB
                  </span>
                </li>
              ))}
              {(files ?? []).length === 0 && <li className="text-slate-500">No files attached.</li>}
            </ul>
            {rec.status !== "archived" && !deleted && me.role !== "viewer" && <AttachForm recordId={rec.id} />}
            <p className="mt-2 text-xs text-slate-500">
              Files open through a link that expires in 60 seconds{settings.watermarkDownloads ? " and are stamped with your name and the date" : ""}. Each download is logged.
            </p>
          </section>

          {isCentral(me) && !deleted && (
            <section className="card p-4">
              <DeleteForm recordId={rec.id} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
