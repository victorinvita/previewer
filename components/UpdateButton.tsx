"use client";

import { useEffect, useRef, useState } from "react";
import type { UpdateInfo } from "@/lib/update";
import { CheckIcon, SpinnerIcon } from "./icons";

type State =
  | { s: "idle" }
  | { s: "checking" }
  | { s: "result"; info: UpdateInfo }
  | { s: "updating"; from: string | null; seenDown: boolean; since: number }
  | { s: "done"; version: string | null }
  | { s: "error"; msg: string };

const POLL_MS = 3000;
const MAX_WAIT_MS = 15 * 60 * 1000;

/**
 * Botón de actualizaciones. No consulta nada por su cuenta: solo cuando el usuario lo pulsa
 * mira GitHub y, si hay versión nueva, la instala al pulsar "Actualizar ahora".
 */
export default function UpdateButton() {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<State>({ s: "idle" });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (st.s !== "updating" && box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open, st.s]);

  const check = async () => {
    setOpen(true);
    if (st.s === "updating") return;
    setSt({ s: "checking" });
    try {
      const info = (await (await fetch("/api/update?check=1", { cache: "no-store" })).json()) as UpdateInfo;
      setSt(info.error ? { s: "error", msg: info.error } : { s: "result", info });
    } catch {
      setSt({ s: "error", msg: "No pude consultar las actualizaciones." });
    }
  };

  const update = async () => {
    try {
      const res = await fetch("/api/update", { method: "POST" });
      const data = await res.json();
      if (!res.ok) return setSt({ s: "error", msg: data.error ?? "No se pudo actualizar." });
      setSt({ s: "updating", from: data.from ?? null, seenDown: false, since: Date.now() });
    } catch {
      setSt({ s: "error", msg: "No se pudo actualizar." });
    }
  };

  // Mientras actualiza, la app se apaga y vuelve a arrancar: se espera a que vuelva y se comprueba la versión.
  useEffect(() => {
    if (st.s !== "updating") return;
    const t = setTimeout(async () => {
      if (Date.now() - st.since > MAX_WAIT_MS) {
        return setSt({ s: "error", msg: "La actualización está tardando demasiado. Cierra y vuelve a abrir Previewer." });
      }
      try {
        const res = await fetch("/api/update", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const info = (await res.json()) as UpdateInfo;
        if (info.version && info.version !== st.from) return setSt({ s: "done", version: info.version });
        if (st.seenDown) {
          return setSt({ s: "error", msg: "No se pudo actualizar; sigues con la versión anterior. Detalles en launcher/update.log." });
        }
        setSt({ ...st }); // aún no se ha apagado: se vuelve a mirar
      } catch {
        setSt({ ...st, seenDown: true });
      }
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [st]);

  useEffect(() => {
    if (st.s !== "done") return;
    const t = setTimeout(() => window.location.reload(), 1500);
    return () => clearTimeout(t);
  }, [st.s]);

  const busy = st.s === "checking" || st.s === "updating";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => (open && !busy ? setOpen(false) : check())}
        title="Buscar actualizaciones"
        aria-label="Buscar actualizaciones"
        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-black/55 transition-colors duration-300 hover:bg-accent/10 hover:text-accent"
      >
        {busy ? (
          <SpinnerIcon className="spin size-4 text-accent" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
            <path d="M4 3v5h5" />
            <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
            <path d="M20 21v-5h-5" />
          </svg>
        )}
      </button>

      {open && (
        <div className="hero-rise absolute right-0 top-12 w-80 rounded-2xl border border-black/10 bg-white/95 p-4 text-sm shadow-xl shadow-black/10 backdrop-blur-md">
          {st.s === "checking" && <p className="text-black/60">Buscando actualizaciones…</p>}

          {st.s === "result" && !st.info.behind && (
            <p className="flex items-center gap-2 text-emerald-700">
              <CheckIcon className="size-4" /> Tienes la última versión
            </p>
          )}

          {st.s === "result" && !!st.info.behind && (
            <>
              <p className="font-medium text-ink">
                Hay una versión nueva ({st.info.behind} {st.info.behind === 1 ? "cambio" : "cambios"})
              </p>
              {!!st.info.changes?.length && (
                <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-4 text-xs text-black/60">
                  {st.info.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              {st.info.dirty ? (
                <p className="mt-3 text-xs text-black/50">Hay cambios locales en el código: actualiza con git a mano.</p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={update}
                    className="diag-fill mt-3 inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-full border-2 border-electric bg-coal px-4 text-xs text-white transition-colors duration-500"
                  >
                    Actualizar ahora
                  </button>
                  <p className="mt-2 text-[11px] text-black/45">
                    La app se cierra un momento y vuelve sola. Tus rutas, pins y vistas previas se conservan.
                  </p>
                </>
              )}
            </>
          )}

          {st.s === "updating" && (
            <p className="flex items-start gap-2 text-black/70">
              <SpinnerIcon className="spin mt-0.5 size-4 shrink-0 text-accent" />
              Actualizando… puede tardar unos minutos. No cierres esta pestaña: se recargará sola.
            </p>
          )}

          {st.s === "done" && (
            <p className="flex items-center gap-2 text-emerald-700">
              <CheckIcon className="size-4" /> Actualizado. Recargando…
            </p>
          )}

          {st.s === "error" && <p className="text-red-600">{st.msg}</p>}

          {st.s === "result" && st.info.version && (
            <p className="mt-3 border-t border-black/5 pt-2 text-[11px] text-black/40">Versión instalada: {st.info.version}</p>
          )}
        </div>
      )}
    </div>
  );
}
