"use client";

import { useEffect, useState } from "react";
import { useLang, useT } from "@/lib/i18n/client";
import { fmtDateTime } from "@/lib/labels";
import { SIGNIN_NOTE_COOKIE, decodeSigninNote, type SigninNote as Note } from "@/lib/signin-extras";

/**
 * "Last signed in" note on the first page after sign-in (like bank and GitHub sign-in alerts), with a warning
 * when this sign-in comes from a new device or network. Read once from a short cookie, then the cookie is cleared,
 * so the server does no extra work on any page.
 */
export function SigninNote() {
  const t = useT();
  const lang = useLang();
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${SIGNIN_NOTE_COOKIE}=`));
    if (!raw) return;
    document.cookie = `${SIGNIN_NOTE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    setNote(decodeSigninNote(raw.slice(SIGNIN_NOTE_COOKIE.length + 1)));
  }, []);
  if (!note) return null;
  const warn = !note.first && (note.newIp || note.newDevice);
  return (
    <div
      role="status"
      className={`mb-5 flex flex-wrap items-start gap-x-4 gap-y-2 rounded-lg border p-4 ${warn ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-300 bg-white text-slate-800"}`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p>
          {note.first
            ? t("This is the first sign-in on record for this account.")
            : t("Last signed in {when} using {device}. If that was not you, tell the administrator.", { when: fmtDateTime(note.at, lang), device: note.device })}
        </p>
        {warn && (
          <p className="font-semibold">
            {t("This is the first time this account signs in from this device or network.")}
          </p>
        )}
      </div>
      <button type="button" onClick={() => setNote(null)} className="btn-secondary min-h-11 px-4">
        {t("OK")}
      </button>
    </div>
  );
}
