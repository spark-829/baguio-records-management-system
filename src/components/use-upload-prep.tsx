"use client";

import { useRef, useState, type RefObject } from "react";
import { useT } from "@/lib/i18n/client";
import { compressForUpload, makeThumb, sha256Hex } from "@/lib/compress-upload";
import { formatBytes, MAX_UPLOAD_BYTES } from "@/lib/upload-policy";

/** Swaps the files of an <input type="file"> in memory. Returns false when the browser cannot. */
function setInput(input: HTMLInputElement | null, file: File | null): boolean {
  if (!input) return false;
  if (!file) {
    input.value = "";
    return true;
  }
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    return true;
  } catch {
    // The original file stays in the input and uploads as it is.
    return false;
  }
}

/**
 * Compresses the chosen image in the browser, makes a thumbnail, and hashes the original.
 * Render `controls` near the file input and `fields` inside the form.
 */
export function useUploadPrep(fileRef: RefObject<HTMLInputElement | null>) {
  const t = useT();
  const thumbRef = useRef<HTMLInputElement>(null);
  const original = useRef<File | null>(null);
  const runId = useRef(0);
  const [keepFull, setKeepFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ from: number; to: number; image: boolean } | null>(null);
  const [hash, setHash] = useState("");
  const [origSize, setOrigSize] = useState("");

  function clear(keepInfo = false) {
    setInput(thumbRef.current, null);
    if (!keepInfo) setInfo(null);
    setHash("");
    setOrigSize("");
  }

  async function prepare(file?: File, full = keepFull) {
    const run = ++runId.current;
    // Re-running the same file (the full-quality toggle) keeps the checkbox on screen so focus is not lost.
    const same = Boolean(file) && file === original.current;
    original.current = file ?? null;
    clear(same);
    if (!file) {
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const [h, out] = await Promise.all([sha256Hex(file), compressForUpload(file, full)]);
      const thumb = await makeThumb(out.file);
      if (run !== runId.current) return;
      // Always swap, so the full-quality toggle restores the original. If the browser cannot swap,
      // the original stays in the input, so report its real size and send no thumbnail of another file.
      const swapped = setInput(fileRef.current, out.file);
      const sent = swapped ? out.file : file;
      if (swapped) setInput(thumbRef.current, thumb);
      setHash(h);
      setOrigSize(String(file.size));
      setInfo({ from: file.size, to: sent.size, image: file.type.startsWith("image/") });
    } finally {
      if (run === runId.current) setBusy(false);
    }
  }

  function reset() {
    runId.current++;
    original.current = null;
    clear();
    setBusy(false);
  }

  const fields = (
    <>
      <input ref={thumbRef} type="file" name="thumb" hidden tabIndex={-1} aria-hidden />
      <input type="hidden" name="original_sha256" value={hash} />
      <input type="hidden" name="original_size" value={origSize} />
    </>
  );

  const controls = (
    <>
      {info?.image && (
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="checkbox mt-0.5"
            checked={keepFull}
            onChange={(e) => {
              const v = e.target.checked;
              setKeepFull(v);
              void prepare(original.current ?? undefined, v);
            }}
          />
          <span>{t("Keep full quality (larger file)")}</span>
        </label>
      )}
      {busy && <p role="status" className="text-sm text-slate-600">{t("Preparing the file…")}</p>}
      {info && info.to < info.from && (
        <p className="text-sm text-slate-600">{t("Compressed {from} → {to}", { from: formatBytes(info.from), to: formatBytes(info.to) })}</p>
      )}
      {info && info.to > MAX_UPLOAD_BYTES && (
        <p role="alert" className="text-sm text-red-700">{t("This file is larger than 10 MB. Please upload a smaller file or a scan at a lower resolution.")}</p>
      )}
    </>
  );

  // Size after compression: this is what would be sent, so block the submit when it is over the limit.
  const tooBig = Boolean(info && info.to > MAX_UPLOAD_BYTES);
  return { prepare, reset, busy, tooBig, fields, controls };
}
