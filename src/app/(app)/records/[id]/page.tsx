import { txLabel } from "@/lib/transaction-type";
import { getT } from "@/lib/i18n/server";
import { actionText } from "@/lib/i18n/core";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile, getSettings, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { seriesLabel } from "@/lib/doc-types";
import { CONF_HELP, CONF_LABEL, PRIORITY_LABEL, daysFromToday, dueText, fmtDate, fmtDateTime, officeName } from "@/lib/labels";
import { allowedActions, canAttach, isOverdue, primaryAction } from "@/lib/workflow";
import { foldMiddle, newestFirst } from "@/lib/history";
import { ARTA_LABEL, artaProgress, artaText, isArtaClass, manilaDay } from "@/lib/arta";
import type { Direction, Status, Priority, Confidentiality } from "@/lib/types";
import { ConfBadge, OverdueBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { BoxMoveForm } from "./paper-forms";
import { SendingCard, type Dispatch } from "./sending-card";
import { boxWhere } from "@/lib/boxes";
import { canRecordDelivery } from "@/lib/dispatch";
import { ActionForm, AssignForm, AttachForm, CopyDecisionForm, CopyReleaseForm, DeleteForm, NoteForm } from "./forms";
import { COPY_TYPE, canDecide, canRelease, dpoTag, type DpoStatus, type DpoTone } from "@/lib/copy-request";
import { assignableStaff, assignmentEvents, canAssign } from "@/lib/assign";
import { restoreRecord } from "./actions";
import { SummaryBox } from "./summary-box";
import { isComplaint, replyClock, replyDueAt } from "@/lib/complaint";
import { recordsBackHref } from "@/lib/back-link";
import { fmtMinutes, slowSteps } from "@/lib/step-times";
import { isOversight } from "@/lib/office-features";
import { formatBytes } from "@/lib/upload-policy";
import { DEFAULT_REF_LABEL } from "@/lib/reference-no";
import { canMarkStep, charterSlowByRoute, parseSteps } from "@/lib/charter";
import { CharterSteps } from "./charter-steps";
import { OversightView } from "./oversight-view";
import { parseCsv } from "@/lib/csv";

type CopyRow = {
  source_tracking_no: string;
  pages: number | null;
  fee_php: string | number | null;
  requester_kind: "owner" | "representative";
  id_checked: boolean;
  authorization_checked: boolean;
  dpo_required: boolean;
  dpo_status: DpoStatus;
  dpo_at: string | null;
  released_to: string | null;
  released_at: string | null;
  source: { id: string; tracking_no: string; confidentiality: string } | null;
  dpo: { full_name: string } | null;
  releaser: { full_name: string } | null;
};

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
  arta_class?: string | null;
  in_reply_to?: string | null;
  current_office_id: string;
  origin_office_id: string;
  deleted_at: string | null;
  delete_reason: string | null;
  deleter: { full_name: string } | null;
  doc_type: { name: string; series_code?: string | null; series_title?: string | null } | null;
  transaction_type?: string | null;
  assigned_to?: string | null;
  assignee?: { full_name: string } | null;
  current_office: { code: string; name: string } | null;
  origin_office: { code: string; name: string } | null;
  creator: { full_name: string } | null;
  box_id?: string | null;
  box?: { id: string; code: string; room: string; shelf: string | null } | null;
  intake_window?: boolean | null;
  reference_no?: string | null;
  reference_label?: string | null;
  service_id?: string | null;
  service_steps?: unknown;
  service?: { title: string; total_text: string | null } | null;
};

type Route = {
  id: string;
  status: Status;
  action_taken: string | null;
  remarks: string | null;
  assigned_to?: string | null;
  created_at: string;
  from_office: { id: string; code: string; name: string } | null;
  to_office: { id: string; code: string; name: string } | null;
  actor: { full_name: string } | null;
};

export default async function RecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; scan?: string; file?: string; back?: string; copy?: string; delivered?: string; scope?: string }> }) {
  const { t } = await getT();
  const { id } = await params;
  const { new: isNew, scan, file, back, copy: copyFlag, delivered, scope } = await searchParams;
  const backHref = recordsBackHref(back);
  const [me, settings] = await Promise.all([getProfile(), getSettings()]);
  const oversight = isOversight({ role: me.role, officeCode: me.office?.code, features: me.office?.features });
  // City oversight (CMO and CAO heads): a read-only view that never opens the record itself.
  if (oversight && scope === "city") return <OversightView id={id} meId={me.id} />;
  const supabase = await createClient();
  const { data } = await supabase
    .from("rms_records")
    .select(
      "*, doc_type:rms_document_types(name, series_code, series_title), current_office:rms_offices!rms_records_current_office_id_fkey(code, name), origin_office:rms_offices!rms_records_origin_office_id_fkey(code, name), creator:rms_profiles!rms_records_created_by_fkey(full_name), deleter:rms_profiles!rms_records_deleted_by_fkey(full_name), assignee:rms_profiles!rms_records_assigned_to_fkey(full_name), box:rms_boxes!rms_records_box_id_fkey(id, code, room, shelf), service:rms_services!rms_records_service_id_fkey(title, total_text)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    if (oversight) return <OversightView id={id} meId={me.id} />;
    notFound();
  }
  const rec = data as unknown as Rec;
  const deleted = Boolean(rec.deleted_at);

  const mayAssign = canAssign({
    role: me.role,
    userOfficeId: me.office_id,
    currentOfficeId: rec.current_office_id,
    status: rec.status,
    deleted,
  });
  const [, { data: routes }, { data: files }, { data: offices }, { data: binRows }, { data: parent }, { data: replyRows }, { data: staffRows }, { data: copyRow }, { data: boxRows }, { data: dispatchRow }, { data: sameRef }] = await Promise.all([
    // Access history: every opened record is logged with who, when and from which IP (in parallel with the reads below).
    supabase.rpc("rms_log_access", { p_event: "view_record", p_record_id: rec.id }),
    supabase
      .from("rms_routes")
      .select("id, status, action_taken, remarks, assigned_to, created_at, from_office:rms_offices!rms_routes_from_office_id_fkey(id, code, name), to_office:rms_offices!rms_routes_to_office_id_fkey(id, code, name), actor:rms_profiles(full_name)")
      .eq("record_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("rms_attachments").select("id, file_name, mime_type, size_bytes, version, thumb_path, uploaded_at, uploader:rms_profiles(full_name)").eq("record_id", id).order("uploaded_at"),
    supabase.from("rms_offices").select("id, code, name").eq("is_active", true).order("code"),
    // Moved to the bin and restored (QA-013). Empty until the database update for it is run.
    supabase.rpc("rms_record_bin_history", { p_record_id: rec.id }),
    // Reply links (empty until the database update for them is run)
    rec.in_reply_to
      ? supabase.from("rms_records").select("id, tracking_no").eq("id", rec.in_reply_to).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("rms_records").select("id, tracking_no").eq("in_reply_to", id).is("deleted_at", null).order("created_at"),
    // Who can be assigned: active staff and the head of the office holding the record (only read for those who may assign).
    mayAssign
      ? supabase.from("rms_profiles").select("id, full_name, role").eq("office_id", rec.current_office_id).eq("is_active", true).in("role", ["staff", "dept_head"])
      : Promise.resolve({ data: [] as { id: string; full_name: string; role: string }[] }),
    // Request for copy details (only read for that type).
    rec.doc_type?.name === COPY_TYPE
      ? supabase
          .from("rms_copy_requests")
          .select("*, source:rms_records!rms_copy_requests_source_record_id_fkey(id, tracking_no, confidentiality), dpo:rms_profiles!rms_copy_requests_dpo_by_fkey(full_name), releaser:rms_profiles!rms_copy_requests_released_by_fkey(full_name)")
          .eq("record_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Box codes for the box field's suggestions (records desk only).
    me.role === "records_officer"
      ? supabase.from("rms_boxes").select("code, room, shelf").order("code").limit(1000)
      : Promise.resolve({ data: [] as { code: string; room: string; shelf: string | null }[] }),
    // How an outgoing record was sent (admins cannot read it).
    rec.direction === "outgoing" && me.role !== "admin"
      ? supabase
          .from("rms_dispatches")
          .select("method, courier, tracking_no, sent_on, received_by, received_on, delivery_note, sender:rms_profiles!rms_dispatches_sent_by_fkey(full_name)")
          .eq("record_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Other records with the same reference number (never blocks anything).
    rec.reference_no
      ? supabase.from("rms_records").select("id, tracking_no").eq("reference_no", rec.reference_no).neq("id", id).is("deleted_at", null).limit(3)
      : Promise.resolve({ data: [] as { id: string; tracking_no: string }[] }),
  ]);
  const dispatch = dispatchRow as unknown as Dispatch | null;
  const deliveryOpen = Boolean(dispatch && !dispatch.received_by && rec.status === "released");
  const canDeliver =
    Boolean(dispatch) &&
    canRecordDelivery({
      role: me.role,
      userOfficeId: me.office_id,
      originOfficeId: rec.origin_office_id,
      currentOfficeId: rec.current_office_id,
      status: rec.status,
      deleted,
      received: Boolean(dispatch?.received_by),
    });
  const copyReq = copyRow as unknown as CopyRow | null;
  const isCopy = rec.doc_type?.name === COPY_TYPE;
  const mayDecide = !deleted && !!copyReq && canDecide({
    role: me.role,
    officeCode: me.office_id && me.office_id === rec.current_office_id ? rec.current_office?.code : null,
    currentOfficeCode: rec.current_office?.code ?? null,
    status: rec.status,
    dpoStatus: copyReq.dpo_status,
    sourceConfidential: copyReq.source?.confidentiality === "confidential",
  });
  const mayRelease = !!copyReq && canRelease({
    role: me.role,
    userOfficeId: me.office_id,
    currentOfficeId: rec.current_office_id,
    status: rec.status,
    dpoStatus: copyReq.dpo_status,
    releasedAt: copyReq.released_at,
    deleted,
    sourceConfidential: copyReq.source?.confidentiality === "confidential",
  });
  const TONE: Record<DpoTone, string> = { amber: "bg-amber-100 text-amber-900", emerald: "bg-emerald-100 text-emerald-900", red: "bg-red-100 text-red-900", slate: "bg-slate-100 text-slate-800" };
  const replies = (replyRows ?? []) as { id: string; tracking_no: string }[];

  // Same rule as rms_can_attach in the database, so the form only shows when the upload will be allowed (QA-010).
  const mayAttach = canAttach({
    role: me.role,
    userOfficeId: me.office_id,
    currentOfficeId: rec.current_office_id,
    originOfficeId: rec.origin_office_id,
    status: rec.status,
    deleted,
  });

  const actions = deleted ? [] : allowedActions({
    status: rec.status,
    direction: rec.direction,
    role: me.role,
    userOfficeId: me.office_id,
    currentOfficeId: rec.current_office_id,
  });
  const primary = primaryAction(rec.status, rec.direction, actions);
  const deskButtons = actions.filter((a) => a !== "remark");
  const incoming = rec.direction === "incoming";
  const history = (routes ?? []) as unknown as Route[];
  const staff = assignableStaff((staffRows ?? []) as { id: string; full_name: string; role: string }[], rec.confidentiality);
  // Names for people assigned earlier who are not in the list above (usually none).
  const nameById = new Map<string, string>(staff.map((p) => [p.id, p.full_name]));
  const missingIds = [...new Set(history.map((h) => h.assigned_to).filter((x): x is string => Boolean(x) && !nameById.has(x as string)))];
  if (missingIds.length) {
    const { data: extra } = await supabase.from("rms_profiles").select("id, full_name").in("id", missingIds);
    for (const p of extra ?? []) nameById.set(p.id, p.full_name);
  }
  const assignEvents = assignmentEvents(
    [...history].reverse().map((h) => ({ id: h.id, assigned_to: h.assigned_to ?? null, from_office_id: h.from_office?.id ?? null, to_office_id: h.to_office?.id ?? null })),
  );
  const charterSteps = parseSteps(rec.service_steps);
  const slow = {
    ...slowSteps(
      [...history].reverse().map((h) => ({ id: h.id, status: h.status, assigned_to: h.assigned_to ?? null, from_office_id: h.from_office?.id ?? null, to_office_id: h.to_office?.id ?? null, created_at: h.created_at })),
      charterSteps ? {} : settings.stepMinutes,
    ),
    ...charterSlowByRoute(charterSteps),
  };
  const fmtTook = (n: number) => { const f = fmtMinutes(n); return t(f.key, f.vars); };
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
  const complaintClock = isComplaint(rec.doc_type?.name) ? replyClock({ createdAt: rec.created_at, now: new Date(), replied: !open || replies.length > 0 }) : null;
  const arta = isArtaClass(rec.arta_class) ? rec.arta_class : null;
  // History is newest first, so the last finishing step is the oldest one.
  const finStep = history.filter((r) => ["completed", "released", "archived"].includes(r.status)).at(-1);
  const artaLine =
    arta && arta !== "none" && rec.due_date
      ? artaText(artaProgress({ registered: manilaDay(rec.created_at), due: rec.due_date.slice(0, 10), asOf: open ? manilaDay() : manilaDay(finStep?.created_at ?? new Date()), finished: !open }), t)
      : "";

  const paperCopy = rec.box ? (
    <>
      {boxWhere(rec.box.room, rec.box.shelf)}, {t("Box")}{" "}
      <Link href={`/boxes/${rec.box.id}`} className="whitespace-nowrap font-mono">{rec.box.code}</Link>
    </>
  ) : (
    <span className="text-slate-600">{t("Not filed in a box yet")}</span>
  );
  const facts: [string, React.ReactNode][] = [
    [t("Received or sent out"), t(incoming ? "Received by the City" : "Sent out by the City")],
    [t("Document type"), rec.doc_type && seriesLabel(rec.doc_type) ? <>{rec.doc_type.name}<span className="block text-sm text-slate-600">{t("File plan: {series}", { series: seriesLabel(rec.doc_type) })}</span></> : rec.doc_type?.name],
    ...(incoming
      ? [[t("Received at"), rec.intake_window ? t("{office} window", { office: rec.origin_office?.name ?? "" }) : t("Records Section (City General Services Office)")] as [string, React.ReactNode]]
      : []),
    ...(rec.reference_no
      ? [[t(rec.reference_label ?? DEFAULT_REF_LABEL), <span key="ref" className="font-mono">{rec.reference_no}</span>] as [string, React.ReactNode]]
      : []),
    ...((sameRef ?? []).length > 0
      ? [[
          t("Same reference number"),
          <span key="same" className="flex flex-wrap gap-x-3">
            {(sameRef ?? []).map((x) => <Link key={x.id} href={`/records/${x.id}`} className="font-mono">{x.tracking_no}</Link>)}
          </span>,
        ] as [string, React.ReactNode]]
      : []),
    [t("Transaction type"), t(txLabel(rec.transaction_type))],
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
    ...(me.role !== "admin"
      ? [[
          t("Paper copy"),
          paperCopy,
        ] as [string, React.ReactNode]]
      : []),
  ];

  const shownKeys = new Set(["Received or sent out", incoming ? "From" : "To", "Document type", "Transaction type", "Priority", "Who may see it", "Started by office", "Logged in"].map((k) => t(k)));
  const deskShown = facts.filter(([k]) => shownKeys.has(k)).map(([k, v]) => [k === t("Logged in") ? t("Logged") : k, v] as [string, React.ReactNode]);
  const deskMore = facts.filter(([k]) => !shownKeys.has(k) && k !== t("Paper copy"));
  const notGiven = <span className="text-slate-600">{t("Not given")}</span>;
  const factRow = ([k, v]: [string, React.ReactNode]) => (
    <div key={k} className="min-w-0">
      <dt className="text-[15px] text-slate-600">{k}</dt>
      <dd className="break-words text-[17px] text-ink">{v === "—" || v === "" || v == null ? notGiven : v}</dd>
    </div>
  );
  const fileThumb = (f: { id: string; mime_type: string; thumb_path: string | null }) =>
    f.thumb_path ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/attachments/${f.id}?thumb=1`} alt="" loading="lazy" width={40} height={40} className="h-10 w-10 shrink-0 rounded border border-slate-200 object-cover" />
    ) : (
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
        {f.mime_type === "application/pdf" ? "PDF" : "IMG"}
      </span>
    );
  const assignBlock = (
    <>
      <p className="mb-2 text-sm font-medium">{rec.assignee ? t("Assigned to: {name}", { name: rec.assignee.full_name }) : t("Assigned to: no one yet")}</p>
      {mayAssign && (
        <details className="mb-3 rounded border border-line p-2 text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-brand-700">{t(rec.assigned_to ? "Change person" : "Assign a person")}</summary>
          {staff.length ? (
            <AssignForm recordId={rec.id} people={staff} currentId={rec.assigned_to ?? null} />
          ) : (
            <p className="mt-2 text-slate-600">{t("No active staff in this office.")}</p>
          )}
        </details>
      )}
    </>
  );
  // History is newest first; the page reads it oldest first.
  const timelineItems = history.flatMap((r, i, all) => [
    ...fileEvents.filter((f) => f.before === r.id).map((f) => (
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
    )),
    ...binEvents.filter((e) => e.before === r.id).map((e) => (
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
    )),
    <li key={r.id} className="mb-4 ml-4">
      <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {r.assigned_to ? (
          <span className="badge bg-white text-slate-600 ring-1 ring-slate-200">{t("Assigned")}</span>
        ) : all[i + 1]?.status !== r.status || (r.status === "forwarded" && r.to_office?.code !== all[i + 1]?.to_office?.code) ? (
          <StatusBadge status={r.status} />
        ) : (
          <span className="badge bg-white text-slate-600 ring-1 ring-slate-200">{t("Note")}</span>
        )}
        {slow[r.id] && <span className="badge bg-amber-50 text-amber-900 ring-1 ring-amber-200">{t("Slow")}</span>}
        <span className="font-medium">
          {r.assigned_to
            ? t("{head} assigned this to {name}", { head: r.actor?.full_name ?? "—", name: nameById.get(r.assigned_to) ?? "—" })
            : actionText(r.action_taken, t)}
        </span>
        {r.status === "forwarded" && r.from_office && r.to_office && r.from_office.code !== r.to_office.code && (
          <span className="text-slate-700">{t("from {a} to {b}", { a: r.from_office.name, b: r.to_office.name })}</span>
        )}
      </div>
      {r.remarks && <p className="mt-1 text-sm text-slate-700">“{r.remarks}”</p>}
      {slow[r.id] && <p className="mt-1 text-sm text-slate-700">{t("Took {took}, standard {std}", { took: fmtTook(slow[r.id].took), std: fmtTook(slow[r.id].standard) })}</p>}
      {assignEvents[r.id]?.kind === "cleared" && <p className="mt-1 text-sm text-slate-600">{t("Assignment cleared.")}</p>}
      <p className="mt-0.5 text-sm text-slate-600">
        {fmtDateTime(r.created_at)} · {r.actor?.full_name ?? "—"}
      </p>
    </li>,
  ]);
  const fold = foldMiddle([...timelineItems].reverse());
  type AttachRow = { id: string; file_name: string; mime_type: string; size_bytes: number; version: number; thumb_path: string | null; uploaded_at: string; uploader: { full_name: string } | null };
  const attachRows = (files ?? []) as unknown as AttachRow[];
  const KIND: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP" };

  return (
    <div className="space-y-4">
      {me.role === "records_officer" && (
        <datalist id="box-codes">
          {(boxRows ?? []).map((b) => <option key={b.code} value={b.code}>{`${b.code} · ${boxWhere(b.room, b.shelf)}`}</option>)}
        </datalist>
      )}
      {deleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
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
        <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
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
      {file === "failed" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("The record was saved, but the file could not be attached. Attach it again under Attachments below.")}
        </div>
      )}
      {copyFlag === "failed" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("Copy details were not recorded for this request.")}</div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link prefetch={false} href={backHref} className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700 underline underline-offset-4">
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3 5 8l5 5" /></svg>
            {t(backHref !== "/records" ? "Back to search results" : "Back to records")}
          </Link>
          <p className="font-mono text-sm text-slate-500">{rec.tracking_no}</p>
          <h1 className="break-words text-2xl font-bold">{rec.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={rec.status} />
            <PriorityBadge priority={rec.priority} />
            <ConfBadge level={rec.confidentiality} />
            {isOverdue(rec.due_date, rec.status) && <OverdueBadge />}
            <span className="text-sm text-slate-600">
              {t("Now at")} <strong>{rec.current_office?.name}</strong>
            </span>
          </div>
          {(parent || replies.length > 0) && (
            <p className="mt-2 text-sm">
              {parent && (
                <>
                  {t("In reply to")} <Link href={`/records/${parent.id}`} className="font-mono">{parent.tracking_no}</Link>
                </>
              )}
              {parent && replies.length > 0 && " · "}
              {replies.length > 0 && (
                <>
                  {t("Replies:")}{" "}
                  {replies.map((r, i) => (
                    <Fragment key={r.id}>
                      {i > 0 && ", "}
                      <Link href={`/records/${r.id}`} className="font-mono">{r.tracking_no}</Link>
                    </Fragment>
                  ))}
                </>
              )}
            </p>
          )}
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto">
          <Link href={`/records/${rec.id}/slip`} className="btn-secondary">{t("Print routing slip")}</Link>
          {incoming && <Link href={`/records/${rec.id}/receipt`} className="btn-secondary">{t("Print receipt for the sender")}</Link>}
          {incoming && !deleted && me.role !== "viewer" && me.role !== "admin" && (
            <Link href={`/records/new?reply_to=${encodeURIComponent(rec.tracking_no)}`} className="btn-secondary">{t("Write a reply")}</Link>
          )}
        </div>
      </div>

      {!deleted && (
        <section className="card p-5" aria-label={t("Where this record is now")}>
          <dl className="grid gap-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line">
            <div className="sm:px-4 first:pl-0 last:pr-0">
              <dt className="text-sm text-slate-600">{t("Now with")}</dt>
              <dd className="text-lg font-semibold">{officeName(rec.current_office)}</dd>
              {latest && (
                <dd className="text-sm text-slate-700">
                  {t("Last update by {name} on {date}", { name: latest.actor?.full_name ?? "—", date: fmtDate(latest.created_at) })}
                </dd>
              )}
            </div>
            <div className="sm:px-4 first:pl-0 last:pr-0">
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
                <dd className="mt-2 rounded-md bg-gold-100 px-3 py-2 text-sm text-slate-800">
                  <span className="font-semibold">{t("Latest note:")}</span> “{latestNote.remarks || actionText(latestNote.action_taken, t)}”
                  <span className="block text-slate-600">{latestNote.actor?.full_name ?? "—"}, {fmtDate(latestNote.created_at)}</span>
                </dd>
              )}
            </div>
            <div className="sm:px-4 first:pl-0 last:pr-0">
              <dt className="text-sm text-slate-600">{t("Due")}</dt>
              <dd className={`text-lg font-semibold ${isLate ? "text-red-700" : ""}`}>
                {rec.due_date ? fmtDate(rec.due_date) : t("No due date")}
              </dd>
              {due && <dd className={`text-sm font-medium ${isLate ? "text-red-700" : "text-slate-700"}`}>{due[0].toUpperCase() + due.slice(1)}</dd>}
              {complaintClock && complaintClock.kind !== "replied" && (
                <dd className={`text-sm ${complaintClock.kind === "late" ? "font-medium text-red-700" : "text-slate-700"}`}>
                  {t("Reply due {date}", { date: fmtDateTime(replyDueAt(rec.created_at).toISOString()) })} · {complaintClock.kind === "late" ? t("Late by {n} hours", { n: complaintClock.hours }) : t("{n} hours left", { n: complaintClock.hours })}
                </dd>
              )}
              {arta && (
                <dd className={`text-sm ${isLate ? "font-medium text-red-700" : "text-slate-700"}`}>
                  {t(ARTA_LABEL[arta])}{artaLine ? ` · ${artaLine}` : ""}
                </dd>
              )}
            </div>
          </dl>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_auto_1fr] lg:items-start">
        {/* DOM order = phone order: actions first, then the record, then files. On wide screens Actions, Details and Attachments sit on the right. */}
        <section className="card p-4 lg:col-start-2 lg:row-start-1">
          <h2 className="mb-2 font-semibold">{t("Actions")}</h2>
          {mayDecide && copyReq && (
            <div className="mb-3 rounded border border-line p-2">
              <CopyDecisionForm recordId={rec.id} />
            </div>
          )}
          {mayRelease && copyReq && (
            <div className="mb-3 rounded border border-line p-2">
              <CopyReleaseForm recordId={rec.id} idRequired={copyReq.dpo_required} />
            </div>
          )}
          {copyReq?.dpo_status === "pending" && !mayDecide && !deleted && (
            <p className="mb-3 text-sm text-slate-700">{t("You can release the copy after the Data Privacy Officer approves.")}</p>
          )}
          {deskButtons.length > 0 && <p className="mb-2 text-sm text-slate-600">{t("Nothing is saved until you press Save and then confirm.")}</p>}
          {actions.length ? (
            !deskButtons.length ? null : (
              <ActionForm
                recordId={rec.id}
                trackingNo={rec.tracking_no}
                actions={actions}
                offices={(offices ?? []).filter((o) => o.id !== rec.current_office_id)}
                returnTo={arrival?.from_office ?? null}
                extras={{ today: manilaDay(), boxField: me.role === "records_officer", currentBox: rec.box?.code ?? null, deliveryOpen }}
                primary={primary}
              />
            )
          ) : (
            <p className="text-sm text-slate-500">
              {deleted
                ? t("Deleted records are read-only until restored.")
                : me.role === "admin"
                  ? t("Administrators can look up records but do not act on them.")
                  : me.role === "viewer"
                  ? t("Your account is read-only.")
                  : rec.status === "archived"
                    ? t("This record is archived and read-only.")
                    : t("Only the office holding this record, or the records desk, can act on it.")}
            </p>
          )}
          <div className="mt-4 border-t border-line pt-3">{assignBlock}</div>
        </section>

        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-span-3 lg:row-start-1">
          {(rec.description || rec.content_text) && (
            <section className="card p-4" aria-labelledby="desc-h">
              <h2 id="desc-h" className="mb-2 font-semibold">{t("Description")}</h2>
              {rec.description && <p className="break-words text-slate-700">{rec.description}</p>}
              {rec.content_text && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-slate-600">{t("Document text (read by the assistant)")}</summary>
                  <p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{rec.content_text}</p>
                </details>
              )}
            </section>
          )}
          {charterSteps && me.role !== "admin" && (
            <CharterSteps
              recordId={rec.id}
              steps={charterSteps}
              title={rec.service?.title ?? null}
              totalText={rec.service?.total_text ?? null}
              canMark={!deleted && canMarkStep({
                role: me.role,
                meId: me.id,
                meOfficeId: me.office_id,
                windowFlag: me.window_intake,
                record: { status: rec.status, current_office_id: rec.current_office_id, assigned_to: rec.assigned_to ?? null, service_steps: charterSteps },
              })}
              canUndo={!deleted && canMarkStep({
                ignoreDone: true,
                role: me.role,
                meId: me.id,
                meOfficeId: me.office_id,
                windowFlag: me.window_intake,
                record: { status: rec.status, current_office_id: rec.current_office_id, assigned_to: rec.assigned_to ?? null, service_steps: charterSteps },
              })}
              meId={me.id}
              nowIso={new Date().toISOString()}
            />
          )}
          {rec.category === "CSS summary" && rec.content_text && (() => {
            const [head, ...body] = parseCsv(rec.content_text);
            if (!head) return null;
            // A column is numeric when every filled cell is a number: right align it (D-NUM-1).
            const numCol = head.map((_, j) => body.some((r) => (r[j] ?? "").trim() !== "") && body.every((r) => { const c = (r[j] ?? "").trim(); return c === "" || /^[+\-]?\d[\d,]*(\.\d+)?%?$/.test(c); }));
            const align = (j: number) => (numCol[j] ? "p-2 text-right tabular-nums" : "p-2");
            return (
              <section className="card min-w-0 p-4" aria-labelledby="css-h">
                <h2 id="css-h" className="mb-2 font-semibold">{t("Satisfaction summary")}</h2>
                <p className="mb-2 text-sm text-slate-600">{t("The numbers are kept in the record itself. There is no file to download.")}</p>
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("Satisfaction summary")}>
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead><tr className="border-b border-line">{head.map((h, j) => <th key={h} scope="col" className={align(j)}>{t(h)}</th>)}</tr></thead>
                    <tbody>
                      {body.map((r, i) => (
                        <tr key={i} className="border-b border-line last:border-0">{r.map((c, j) => <td key={j} className={align(j)}>{c.trim() === "" ? "—" : c}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })()}
          <SummaryBox recordId={rec.id} initial={rec.ai_summary} aiBlocked={rec.confidentiality === "confidential" && settings.aiExcludeConfidential} />

          {isCopy && (
            <section className="card p-4" aria-labelledby="copy-h">
              <h2 id="copy-h" className="mb-3 font-semibold">{t("Copy request")}</h2>
              {copyReq ? (
                (() => {
                  const tag = dpoTag({ dpo_status: copyReq.dpo_status, dpo_name: copyReq.dpo?.full_name, dpo_at: copyReq.dpo_at }, fmtDate);
                  return (
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div className="flex gap-2 border-b border-slate-100 py-1">
                        <dt className="w-40 shrink-0 text-slate-500">{t("Copy of")}</dt>
                        <dd className="font-medium">
                          {copyReq.source ? <Link href={`/records/${copyReq.source.id}`} className="font-mono">{copyReq.source.tracking_no}</Link> : <span className="font-mono">{copyReq.source_tracking_no}</span>}
                        </dd>
                      </div>
                      <div className="flex gap-2 border-b border-slate-100 py-1">
                        <dt className="w-40 shrink-0 text-slate-500">{t("Number of pages")}</dt>
                        <dd className="font-medium">{copyReq.pages ?? "—"}</dd>
                      </div>
                      <div className="flex gap-2 border-b border-slate-100 py-1">
                        <dt className="w-40 shrink-0 text-slate-500">{t("Fee (₱)")}</dt>
                        <dd className="font-medium">{copyReq.fee_php != null ? `₱${Number(copyReq.fee_php).toFixed(2)}` : "—"}</dd>
                      </div>
                      <div className="flex gap-2 border-b border-slate-100 py-1">
                        <dt className="w-40 shrink-0 text-slate-500">{t("Who is asking?")}</dt>
                        <dd className="font-medium">
                          {t(copyReq.requester_kind === "owner" ? "The owner" : "A representative")}
                          {copyReq.id_checked ? ` · ${t("Valid ID checked")}` : ""}
                          {copyReq.authorization_checked ? ` · ${t("Authorization letter or SPA checked")}` : ""}
                        </dd>
                      </div>
                      <div className="flex gap-2 border-b border-slate-100 py-1">
                        <dt className="w-40 shrink-0 text-slate-500">{t("Data Privacy Officer")}</dt>
                        <dd>
                          <span className={`badge ${TONE[tag.tone]}`}>{t(tag.label, { name: tag.name ?? "", date: tag.date ?? "" })}</span>
                        </dd>
                      </div>
                      {copyReq.released_at && (
                        <div className="flex gap-2 border-b border-slate-100 py-1">
                          <dt className="w-40 shrink-0 text-slate-500">{t("Copy released")}</dt>
                          <dd className="font-medium">{t("Released to {name}, {date}", { name: copyReq.released_to ?? "—", date: fmtDate(copyReq.released_at) })}</dd>
                        </div>
                      )}
                    </dl>
                  );
                })()
              ) : (
                <p className="text-sm text-slate-700">{t("Copy details were not recorded for this request.")}</p>
              )}
            </section>
          )}

          {dispatch && (
            <SendingCard recordId={rec.id} trackingNo={rec.tracking_no} dispatch={dispatch} canDeliver={canDeliver} justDelivered={delivered === "1"} today={manilaDay()} />
          )}

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">{t("History and notes")}</h2>
            <ol className="relative ml-2 border-l-2 border-slate-200">
              {fold.head}
              {fold.hidden.length > 0 && (
                <li className="mb-4 ml-4">
                  <details>
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand-700">{t("Show {n} earlier steps", { n: fold.hidden.length })}</summary>
                    <ol className="-ml-4 mt-2">{fold.hidden}</ol>
                  </details>
                </li>
              )}
              {fold.tail}
            </ol>
            {actions.includes("remark") && <NoteForm recordId={rec.id} />}
          </section>
        </div>

        <section className="card p-4 lg:col-start-2 lg:row-start-2" aria-labelledby="details-h">
          <h2 id="details-h" className="mb-3 font-semibold">{t("Details")}</h2>
          <dl className="space-y-3">{deskShown.map(factRow)}</dl>
          {deskMore.length > 0 && (
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-brand-700">{t("More details")}</summary>
              <dl className="mt-2 space-y-3">{deskMore.map(factRow)}</dl>
            </details>
          )}
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-[15px] text-slate-600">{t("Paper copy")}</h3>
            <p className="break-words text-[17px] text-ink">{paperCopy}</p>
            {me.role === "records_officer" && !deleted && (
              <details className="mt-3 rounded border border-line p-2 text-sm">
                <summary className="min-h-11 cursor-pointer py-2 font-medium text-brand-700">{t(rec.box ? "Move to another box" : "Put in a box")}</summary>
                <BoxMoveForm recordId={rec.id} trackingNo={rec.tracking_no} currentBox={rec.box?.code ?? null} />
              </details>
            )}
          </div>
        </section>

        <section id="attachments" className="card p-4 lg:col-start-2 lg:row-start-3">
          <h2 className="mb-2 font-semibold">{t("Attachments")}</h2>
          <ul className="mb-3 space-y-3 text-sm">
            {attachRows.map((f) => (
              <li key={f.id} className="min-w-0">
                <a href={`/api/attachments/${f.id}`} target="_blank" className="flex min-w-0 items-start gap-2 text-brand-700 hover:underline">
                  {fileThumb(f)}
                  <span className="min-w-0 break-all font-medium">{f.file_name}</span>
                </a>
                <p className="mt-1 pl-12 text-slate-600">
                  {[KIND[f.mime_type] ?? t("File"), formatBytes(f.size_bytes), fmtDate(f.uploaded_at), f.uploader?.full_name ?? "—", ...(f.version > 1 ? [t("version {n}", { n: f.version })] : [])].join(" · ")}
                </p>
              </li>
            ))}
            {attachRows.length === 0 && <li className="text-slate-600">{t("No files yet.")}</li>}
          </ul>
          {mayAttach ? (
            <AttachForm recordId={rec.id} />
          ) : (
            !deleted && rec.status !== "archived" && <p className="text-sm text-slate-500">{me.role === "admin" ? t("Administrators do not add files to records.") : t("Only the office holding this record, the office that sent it, or the records desk can add files.")}</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {t(settings.watermarkDownloads ? "Files open through a link that expires in 60 seconds and are stamped with your name and the date. Each download is logged." : "Files open through a link that expires in 60 seconds. Each download is logged.")}
          </p>
        </section>
      </div>

      {isCentral(me) && !deleted && (
        <section className="border-t border-line pt-6">
          <DeleteForm recordId={rec.id} />
        </section>
      )}
    </div>
  );
}
