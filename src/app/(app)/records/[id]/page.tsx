import { getT } from "@/lib/i18n/server";
import { actionText } from "@/lib/i18n/core";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile, getSettings, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CONF_HELP, CONF_LABEL, PRIORITY_LABEL, daysFromToday, dueText, fmtDate, fmtDateTime, officeName } from "@/lib/labels";
import { allowedActions, isOverdue } from "@/lib/workflow";
import { newestFirst } from "@/lib/history";
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
  barangay?: string | null;
  current_office_id: string;
  origin_office_id: string;
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
  from_office: { id: string; code: string; name: string } | null;
  to_office: { id: string; code: string; name: string } | null;
  actor: { full_name: string } | null;
};

export default async function RecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; scan?: string }> }) {
  const { t } = await getT();
  const { id } = await params;
  const { new: isNew, scan } = await searchParams;
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
  const deleted = Boolean(rec.deleted_at);

  const [, { data: routes }, { data: files }, { data: offices }, { data: binRows }] = await Promise.all([
    // Access history: every opened record is logged with who, when and from which IP (in parallel with the reads below).
    supabase.rpc("rms_log_access", { p_event: "view_record", p_record_id: rec.id }),
    supabase
      .from("rms_routes")
      .select("id, status, action_taken, remarks, created_at, from_office:rms_offices!rms_routes_from_office_id_fkey(id, code, name), to_office:rms_offices!rms_routes_to_office_id_fkey(id, code, name), actor:rms_profiles(full_name)")
      .eq("record_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("rms_attachments").select("id, file_name, mime_type, size_bytes, version, uploaded_at, uploader:rms_profiles(full_name)").eq("record_id", id).order("uploaded_at"),
    supabase.from("rms_offices").select("id, code, name").eq("is_active", true).order("code"),
    // Moved to the bin and restored (QA-013). Empty until the database update for it is run.
    supabase.rpc("rms_record_bin_history", { p_record_id: rec.id }),
  ]);

  // Same rule as rms_can_attach in the database, so the form only shows when the upload will be allowed (QA-010).
  const canAttach =
    !deleted &&
    rec.status !== "archived" &&
    (isCentral(me) || ((me.role === "dept_head" || me.role === "staff") && !!me.office_id && [rec.current_office_id, rec.origin_office_id].includes(me.office_id)));

  const actions = deleted ? [] : allowedActions({
    status: rec.status,
    direction: rec.direction,
    role: me.role,
    userOfficeId: me.office_id,
    currentOfficeId: rec.current_office_id,
  });
  const incoming = rec.direction === "incoming";
  const history = (routes ?? []) as unknown as Route[];
  type FileRow = { id: string; file_name: string; version: number; uploaded_at: string; uploader: { full_name: string } | null };
  // Uploaded files appear in the history too, placed just above the step they came after (history is newest first).
  const fileEvents = newestFirst((files ?? []) as unknown as FileRow[], (f) => f.uploaded_at).map((f) => ({
    ...f,
    before: (history.find((h) => h.created_at <= f.uploaded_at) ?? history.at(-1))?.id,
  }));
  type BinRow = { at: string; event: "deleted" | "restored"; actor: string | null; reason: string | null };
  const binEvents = newestFirst((binRows ?? []) as BinRow[], (e) => e.at).map((e, i) => ({
    ...e,
    key: `b${i}`,
    before: (history.find((h) => h.created_at <= e.at) ?? history.at(-1))?.id,
  }));
  const latest = history[0];
  // The step that brought the record to the office holding it now: who sent it, and any instruction they left.
  const arrival = history.find((r) => r.status === "forwarded" && r.to_office?.id === rec.current_office_id && r.from_office?.id !== rec.current_office_id);
  const instruction = arrival?.remarks;
  // Newer notes written after it arrived (e.g. "Missing delivery receipt") matter more than the forwarding note.
  const sinceArrival = arrival ? history.slice(0, history.indexOf(arrival)) : history;
  const latestNote = sinceArrival.find((r) => r.remarks || r.action_taken);
  const open = !["completed", "released", "archived"].includes(rec.status);
  const due = open ? dueText(rec.due_date, undefined, t) : "";
  const isLate = open && Boolean(rec.due_date) && daysFromToday(rec.due_date!.slice(0, 10)) < 0;

  const facts: [string, React.ReactNode][] = [
    [t("Received or sent out"), t(incoming ? "Received by the City" : "Sent out by the City")],
    [t("Document type"), rec.doc_type?.name],
    [t(incoming ? "From" : "To"), [incoming ? rec.sender_name : rec.recipient_name, incoming ? rec.sender_org : rec.recipient_org].filter(Boolean).join(", ") || "—"],
    ...(rec.barangay !== undefined ? [[t("Barangay"), rec.barangay ?? "—"] as [string, React.ReactNode]] : []),
    [t("Date on document"), fmtDate(rec.document_date)],
    [t("How it arrived"), rec.mode ? t(rec.mode[0].toUpperCase() + rec.mode.slice(1)) : "—"],
    [t("Subject area"), rec.category ?? "—"],
    [t("Search words"), rec.keywords.length ? rec.keywords.join(", ") : "—"],
    [t("Priority"), t(PRIORITY_LABEL[rec.priority])],
    [t("Who may see it"), `${t(CONF_LABEL[rec.confidentiality])}: ${t(CONF_HELP[rec.confidentiality]).toLowerCase()}`],
    [t("Started by office"), officeName(rec.origin_office)],
    [t("Logged in"), t("{date} by {name}", { date: fmtDateTime(rec.created_at), name: rec.creator?.full_name ?? "—" })],
    [t("Due date"), rec.due_date ? `${fmtDate(rec.due_date)}${due ? ` (${due})` : ""}` : "—"],
  ];

  return (
    <div className="space-y-4">
      {deleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-l-4 border-red-300 border-l-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">
          <span>
            {t("In the deleted-records bin since {date} by {name}. Reason:", { date: fmtDateTime(rec.deleted_at), name: rec.deleter?.full_name ?? "—" })} “{rec.delete_reason}”
          </span>
          <form action={restoreRecord}>
            <input type="hidden" name="record_id" value={rec.id} />
            <button className="btn-secondary">{t("Restore record")}</button>
          </form>
        </div>
      )}
      {isNew && (
        <div className="space-y-3 rounded-lg border border-l-4 border-emerald-300 border-l-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p>
          {scan === "1" && <>{t("Created from your scan.")}{" "}</>}
          {t("Saved. Tracking number")} <strong>{rec.tracking_no}</strong>.{" "}
          {t(incoming ? "Print the routing slip to attach to the paper copy, and the receipt to give the sender so they can track it online." : "Print the routing slip to attach to the paper copy.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/records/${rec.id}/slip`} className="btn-primary">{t("Print QR routing slip")}</Link>
          <Link href={`/records/${rec.id}/slip?size=sticker`} className="btn-secondary">{t("Print QR sticker")}</Link>
        </div>
        </div>
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
              {t("Now at")} <strong>{rec.current_office?.name}</strong>
            </span>
          </div>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto">
          <Link href={`/records/${rec.id}/slip`} className="btn-secondary">{t("Print routing slip")}</Link>
          {incoming && <Link href={`/records/${rec.id}/receipt`} className="btn-secondary">{t("Print receipt for the sender")}</Link>}
          <Link href="/records" className="btn-secondary">{t("Back to records")}</Link>
        </div>
      </div>

      {!deleted && (
        <section className="card border-l-4 border-l-brand-700 p-4" aria-label={t("Where this record is now")}>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-slate-600">{t("Now with")}</dt>
              <dd className="text-lg font-semibold">{officeName(rec.current_office)}</dd>
              {latest && (
                <dd className="text-sm text-slate-700">
                  {t("Last update by {name} on {date}", { name: latest.actor?.full_name ?? "—", date: fmtDate(latest.created_at) })}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-sm text-slate-600">{t("What needs to be done")}</dt>
              <dd className="font-medium">
                {!open
                  ? t("Nothing. This record is finished.")
                  : instruction
                    ? `“${instruction}”`
                    : rec.status === "forwarded"
                      ? t("{office} should mark it as received when the paper arrives.", { office: officeName(rec.current_office) })
                      : t("Act on the request, then add a note or send it on.")}
              </dd>
              {arrival && open && <dd className="text-sm text-slate-700">{t("Sent by {office}", { office: officeName(arrival.from_office) })}</dd>}
              {latestNote && open && latestNote !== arrival && (
                <dd className="mt-2 rounded-md border-l-4 border-gold-500 bg-amber-50 px-3 py-2 text-sm text-slate-800">
                  <span className="font-semibold">{t("Latest note:")}</span> “{latestNote.remarks || latestNote.action_taken}”
                  <span className="block text-slate-600">{latestNote.actor?.full_name ?? "—"}, {fmtDate(latestNote.created_at)}</span>
                </dd>
              )}
            </div>
            <div>
              <dt className="text-sm text-slate-600">{t("Due")}</dt>
              <dd className={`text-lg font-semibold ${isLate ? "text-red-700" : ""}`}>
                {rec.due_date ? fmtDate(rec.due_date) : t("No due date")}
              </dd>
              {due && <dd className={`text-sm font-medium ${isLate ? "text-red-700" : "text-slate-700"}`}>{due[0].toUpperCase() + due.slice(1)}</dd>}
            </div>
          </dl>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SummaryBox recordId={rec.id} initial={rec.ai_summary} aiBlocked={rec.confidentiality === "confidential" && settings.aiExcludeConfidential} />

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">{t("Details")}</h2>
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
                <summary className="cursor-pointer text-slate-600">{t("Document text (read by the assistant)")}</summary>
                <p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{rec.content_text}</p>
              </details>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">{t("History, actions and remarks")}</h2>
            <ol className="relative ml-2 border-l-2 border-slate-200">
              {history.map((r, i, all) => (
                <Fragment key={r.id}>
                {fileEvents.filter((f) => f.before === r.id).map((f) => (
                  <li key={`f${f.id}`} className="mb-4 ml-4">
                    <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-gold-500" />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="badge bg-amber-50 text-amber-900 ring-1 ring-amber-200">{t("File")}</span>
                      <span className="font-medium">{t("Attached {file}", { file: f.file_name })}{f.version > 1 ? ` (${t("version {n}", { n: f.version })})` : ""}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {fmtDateTime(f.uploaded_at)} · {f.uploader?.full_name ?? "—"}
                    </p>
                  </li>
                ))}
                {binEvents.filter((e) => e.before === r.id).map((e) => (
                  <li key={e.key} className="mb-4 ml-4">
                    <span className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white ${e.event === "deleted" ? "bg-red-600" : "bg-emerald-600"}`} />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`badge ring-1 ${e.event === "deleted" ? "bg-red-50 text-red-900 ring-red-200" : "bg-emerald-50 text-emerald-900 ring-emerald-200"}`}>
                        {t(e.event === "deleted" ? "Moved to bin" : "Restored")}
                      </span>
                      <span className="font-medium">{t(e.event === "deleted" ? "Moved to the deleted-records bin" : "Restored from the bin")}</span>
                    </div>
                    {e.reason && <p className="mt-1 text-sm text-slate-700">“{e.reason}”</p>}
                    <p className="mt-0.5 text-sm text-slate-600">
                      {fmtDateTime(e.at)} · {e.actor ?? "—"}
                    </p>
                  </li>
                ))}
                <li className="mb-4 ml-4">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {all[i + 1]?.status !== r.status || (r.status === "forwarded" && r.to_office?.code !== all[i + 1]?.to_office?.code) ? (
                      <StatusBadge status={r.status} />
                    ) : (
                      <span className="badge bg-white text-slate-600 ring-1 ring-slate-200">{t("Note")}</span>
                    )}
                    <span className="font-medium">{actionText(r.action_taken, t)}</span>
                    {r.status === "forwarded" && r.from_office && r.to_office && r.from_office.code !== r.to_office.code && (
                      <span className="text-slate-700">{t("from {a} to {b}", { a: r.from_office.name, b: r.to_office.name })}</span>
                    )}
                  </div>
                  {r.remarks && <p className="mt-1 text-sm text-slate-700">“{r.remarks}”</p>}
                  <p className="mt-0.5 text-sm text-slate-600">
                    {fmtDateTime(r.created_at)} · {r.actor?.full_name ?? "—"}
                  </p>
                </li>
                </Fragment>
              ))}
            </ol>
          </section>
        </div>

        {/* On narrow screens (phones, zoomed-in laptops) the action panel comes right after "Now with", not below the history */}
        <div className="order-first space-y-4 lg:order-none">
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">{t("Take action")}</h2>
            {actions.length > 0 && <p className="mb-2 text-sm text-slate-600">{t("Nothing is saved until you press Save and then confirm.")}</p>}
            {actions.length ? (
              <ActionForm
                recordId={rec.id}
                trackingNo={rec.tracking_no}
                actions={actions}
                offices={(offices ?? []).filter((o) => o.id !== rec.current_office_id)}
                returnTo={arrival?.from_office ?? null}
              />
            ) : (
              <p className="text-sm text-slate-500">
                {deleted
                  ? t("Deleted records are read-only until restored.")
                  : me.role === "viewer"
                    ? t("Your account is read-only.")
                    : rec.status === "archived"
                      ? t("This record is archived and read-only.")
                      : t("Only the office holding this record, or the records desk, can act on it.")}
              </p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">{t("Attachments")}</h2>
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
              {(files ?? []).length === 0 && <li className="text-slate-500">{t("No files attached.")}</li>}
            </ul>
            {canAttach ? (
              <AttachForm recordId={rec.id} />
            ) : (
              !deleted && rec.status !== "archived" && <p className="text-sm text-slate-500">{t("Only the office holding this record, the office that sent it, or the records desk can add files.")}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {t(settings.watermarkDownloads ? "Files open through a link that expires in 60 seconds and are stamped with your name and the date. Each download is logged." : "Files open through a link that expires in 60 seconds. Each download is logged.")}
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
