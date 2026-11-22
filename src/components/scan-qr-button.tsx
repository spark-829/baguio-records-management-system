"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { TRACKING_RE, parseScannedText, scanPath } from "@/lib/qr";

interface Detector {
  detect(src: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface DetectorCtor {
  new (o?: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

/** "Scan QR" button: opens the phone camera, reads a routing-slip QR and goes to its /r/ page. No library needed. */
export function ScanQrButton({ label }: { label?: string } = {}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [typed, setTyped] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const unsupported = "Your browser can't scan here. Open your phone's camera app and point it at the QR code on the slip; it will open the record.";
    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (!Ctor || !navigator.mediaDevices?.getUserMedia || !(await Ctor.getSupportedFormats()).includes("qr_code")) {
          setMsg(unsupported);
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        const detector = new Ctor({ formats: ["qr_code"] });
        timerRef.current = setInterval(async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const raw = found[0]?.rawValue;
            if (!raw) return;
            const path = parseScannedText(raw);
            if (path) {
              stop();
              setOpen(false);
              router.push(path);
            } else setMsg("This QR code is not a Baguio RMS routing slip.");
          } catch {
            /* keep trying */
          }
        }, 300);
      } catch {
        setMsg(unsupported);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, router, stop]);

  function toggle() {
    setMsg("");
    setOpen((o) => !o);
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    const v = typed.trim();
    if (!TRACKING_RE.test(v)) {
      setMsg("This QR code is not a Baguio RMS routing slip.");
      return;
    }
    setOpen(false);
    router.push(scanPath(v));
  }

  return (
    <div className="relative">
      <button type="button" className="btn-secondary" onClick={toggle} aria-expanded={open}>{t(label ?? "Scan QR")}</button>
      {open && (
        <div className="card absolute right-0 z-20 mt-2 w-80 max-w-[90vw] space-y-3 p-3">
          <video ref={videoRef} playsInline muted autoPlay className="aspect-square w-full rounded-lg bg-slate-900 object-cover" />
          {msg && <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t(msg)}</p>}
          <form onSubmit={go} className="space-y-1">
            <label htmlFor="scan-tn" className="label">{t("Or type the tracking number")}</label>
            <div className="flex gap-2">
              <input id="scan-tn" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="IN-2026-0001" />
              <button className="btn-primary">{t("Open")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
