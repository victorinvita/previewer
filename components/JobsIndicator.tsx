"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobSummary } from "@/lib/jobs";
import { fmtSize } from "@/lib/format";
import { CheckIcon, CloseIcon, SpinnerIcon } from "./icons";

export const JOBS_EVENT = "previewer:jobs";

/** Avisa al indicador de que hay un trabajo nuevo. */
export async function startGenerateJob(body: { r?: string | null; rels: string[]; recursive: boolean }): Promise<string | null> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  window.dispatchEvent(new Event(JOBS_EVENT));
  return res.ok ? null : data.error ?? "No se pudo iniciar.";
}

function eta(j: JobSummary) {
  if (j.status !== "running" || !j.runStartedAt) return null;
  const elapsed = (Date.now() - j.runStartedAt) / 1000;
  const processed = j.doneBytes - (j.runStartBytes ?? 0);
  if (elapsed < 5 || processed <= 0) return "calculando…";
  const secs = (j.totalBytes - j.doneBytes) / (processed / elapsed);
  if (secs < 60) return "menos de 1 min";
  if (secs < 3600) return `~${Math.round(secs / 60)} min`;
  return `~${(secs / 3600).toFixed(1)} h`;
}

const STATUS: Record<JobSummary["status"], string> = {
  queued: "En cola",
  running: "Generando",
  paused: "En pausa",
  done: "Listo",
  canceled: "Cancelado",
};

/** Progreso de "Generar todo" en la barra superior. Los trabajos siguen aunque cierres la pestaña. */
export default function JobsIndicator() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const active = jobs.filter((j) => j.status === "running" || j.status === "queued");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      if (res.ok) setJobs((await res.json()).jobs);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener(JOBS_EVENT, on);
    return () => window.removeEventListener(JOBS_EVENT, on);
  }, [refresh]);

  // Cada 2 s mientras hay trabajo; cada 20 s si no.
  useEffect(() => {
    const t = setInterval(refresh, active.length ? 2000 : 20000);
    return () => clearInterval(t);
  }, [active.length, refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const control = async (id: string, action: "pause" | "resume" | "cancel") => {
    const res = await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (res.ok) setJobs((await res.json()).jobs);
  };

  const clear = async () => {
    const res = await fetch("/api/jobs", { method: "DELETE" });
    if (res.ok) setJobs((await res.json()).jobs);
  };

  if (!jobs.length) return null;
  const main = active[0] ?? null;
  const pct = main ? Math.round((main.done / Math.max(1, main.total)) * 100) : 100;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Trabajos en segundo plano"
        className={`flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors duration-300 ${
          main ? "bg-accent/10 text-accent hover:bg-accent/15" : "text-black/50 hover:bg-black/5 hover:text-ink"
        }`}
      >
        {main ? (
          <>
            <Ring pct={pct} />
            <span className="font-medium tabular-nums">
              {main.done}/{main.total}
            </span>
            <span className="hidden text-black/45 lg:inline">· {eta(main)}</span>
          </>
        ) : (
          <>
            <CheckIcon className="size-4" />
            <span className="hidden lg:inline">Fotogramas</span>
          </>
        )}
      </button>

      {open && (
        <div className="item-fade absolute right-0 top-[calc(100%+10px)] z-[60] w-[24rem] max-w-[90vw] overflow-hidden rounded-2xl border border-black/10 bg-white text-sm shadow-xl shadow-black/10">
          <div className="border-b border-black/5 px-4 py-3">
            <p className="font-medium text-ink">Generar en segundo plano</p>
            <p className="text-xs text-black/45">Sigue aunque cierres esta pestaña. Solo se guardan miniaturas en este PC.</p>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {jobs.map((j) => {
              const p = Math.round((j.done / Math.max(1, j.total)) * 100);
              return (
                <li key={j.id} className="border-t border-black/5 px-4 py-3 first:border-t-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-medium text-ink" title={j.title}>
                      {j.title}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
                        j.status === "running"
                          ? "bg-accent/12 text-accent"
                          : j.status === "done"
                            ? "bg-emerald-600/10 text-emerald-700"
                            : "bg-black/5 text-black/50"
                      }`}
                    >
                      {STATUS[j.status]}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${p}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs tabular-nums text-black/50">
                    <span>
                      {j.done}/{j.total} archivos · {fmtSize(j.doneBytes) || "0 B"} de {fmtSize(j.totalBytes)}
                    </span>
                    <span>{j.status === "running" ? eta(j) : j.failed ? `${j.failed} sin vista previa` : ""}</span>
                  </div>
                  {j.status === "running" && j.current.length > 0 && (
                    <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-black/40">
                      <SpinnerIcon className="spin size-3 shrink-0 text-accent" /> {j.current.join(" · ")}
                    </p>
                  )}
                  {j.errors.length > 0 && j.status !== "running" && (
                    <details className="mt-1 text-[11px] text-black/45">
                      <summary className="cursor-pointer">Ver archivos con error</summary>
                      <ul className="mt-1 space-y-0.5">
                        {j.errors.map((e, i) => (
                          <li key={i} className="truncate" title={e}>
                            {e}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {(j.status === "running" || j.status === "queued" || j.status === "paused") && (
                    <div className="mt-2 flex items-center gap-1.5">
                      {j.status === "paused" ? (
                        <SmallBtn onClick={() => control(j.id, "resume")}>Reanudar</SmallBtn>
                      ) : (
                        <SmallBtn onClick={() => control(j.id, "pause")}>Pausar</SmallBtn>
                      )}
                      <SmallBtn danger onClick={() => control(j.id, "cancel")}>
                        <CloseIcon className="size-3" /> Cancelar
                      </SmallBtn>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {jobs.some((j) => j.status === "done" || j.status === "canceled") && (
            <button
              type="button"
              onClick={clear}
              className="w-full cursor-pointer border-t border-black/5 px-4 py-2.5 text-left text-xs text-black/50 transition-colors hover:bg-black/[0.03] hover:text-accent"
            >
              Limpiar terminados
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SmallBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-full border border-black/10 px-3 py-1 text-xs transition-colors ${
        danger ? "text-black/55 hover:border-red-200 hover:bg-red-50 hover:text-red-600" : "text-black/60 hover:border-accent/40 hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] -rotate-90">
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.2" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700" />
    </svg>
  );
}
