import { getT } from "@/lib/i18n/server";
import { durationText, stepsView, canUndoStep, type ServiceStep } from "@/lib/charter";
import { fmtMinutes } from "@/lib/step-times";
import { CharterStepButton } from "./charter-step-button";

/** The Citizen's Charter steps of a record: what is done, what is next, and how long each took. Buttons only when allowed. */
export async function CharterSteps({
  recordId,
  steps,
  title,
  totalText,
  canMark,
  canUndo,
  meId,
  nowIso,
  readOnly,
  desk,
}: {
  recordId: string;
  steps: ServiceStep[];
  title: string | null;
  totalText: string | null;
  canMark: boolean;
  /** Same rule as canMark, but still true when every step is done */
  canUndo?: boolean;
  meId: string;
  nowIso: string;
  readOnly?: boolean;
  /** Records desk layout: the buttons are in the Actions sidebar */
  desk?: boolean;
}) {
  const { t } = await getT();
  const v = stepsView(steps, nowIso);
  const mins = (n: number) => { const f = fmtMinutes(n); return t(f.key, f.vars); };
  const collapse = v.rows.length > 6;
  const doneRows = collapse ? v.rows.filter((r) => r.state === "done") : [];
  const lastDone = [...v.rows].reverse().find((r) => r.state === "done");
  const showRows = collapse ? v.rows.filter((r) => r.state !== "done") : v.rows;

  const Row = ({ r }: { r: (typeof v.rows)[number] }) => (
    <li className="grid gap-1 py-3 sm:grid-cols-[2rem_minmax(0,1fr)]">
      <span className="font-bold tabular-nums text-slate-700">{r.n}.</span>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-start gap-2">
          <span className="min-w-0 break-words font-semibold">{r.action}</span>
          {r.state === "done" && <span className="badge bg-emerald-100 text-emerald-900">{t("Done")}</span>}
          {r.state === "next" && <span className="badge bg-slate-100 text-slate-800">{t("Next")}</span>}
          {r.slow && <span className="badge bg-amber-100 text-amber-900">{t("Slow")}</span>}
        </div>
        <p className="text-sm text-slate-600">
          {r.by ? `${t("Who")}: ${r.by} · ` : ""}
          {r.minutes != null ? t("Standard {m}", { m: mins(r.minutes) }) : t("No standard time")}
          {r.state === "done" && r.n > 1 && r.took != null ? ` · ${t("Took {took}", { took: mins(r.took) })}` : ""}
        </p>
        {r.state === "next" && canMark && !readOnly && <CharterStepButton recordId={recordId} step={r.n} />}
        {r.state === "done" && !readOnly && (canUndo ?? canMark) && lastDone?.n === r.n && canUndoStep(steps, r.n, meId, nowIso ? Date.parse(nowIso) : 0) && (
          <CharterStepButton recordId={recordId} step={r.n} undo />
        )}
      </div>
    </li>
  );

  return (
    <section className="card p-4" aria-labelledby="charter-h">
      <h2 id="charter-h" className="font-semibold">{t("Charter steps")}</h2>
      {title && (
        <p className="break-words text-sm text-slate-600">
          {title}{totalText ? ` · ${t("standard total {total}", { total: durationText(totalText, t) })}` : ""}
        </p>
      )}
      {doneRows.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand-700">{doneRows.length === 1 ? t("Show 1 done step") : t("Show {n} done steps", { n: doneRows.length })}</summary>
          <ol className="divide-y divide-line">{doneRows.map((r) => <Row key={r.n} r={r} />)}</ol>
        </details>
      )}
      <ol className="mt-1 divide-y divide-line">{showRows.map((r) => <Row key={r.n} r={r} />)}</ol>
      <p className="mt-2 text-sm text-slate-700">
        {t("Total so far: {a} of {b} standard.", { a: mins(v.spent), b: mins(v.standard) })}{" "}
        {v.standard > 0 && (v.over ? <span className="font-semibold text-amber-800">{t("Over the charter time.")}</span> : t("Within the charter time."))}
      </p>
      {v.allDone && <p className="mt-1 text-sm font-semibold text-emerald-800">{t(desk ? "All charter steps are done. Use Actions to mark it as done or send it out." : "All charter steps are done. Use Take action to mark it as done or release it.")}</p>}
    </section>
  );
}
