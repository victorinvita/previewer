"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Kind } from "@/lib/media";
import type { RouteInfo } from "@/lib/routes";
import TopBar from "./TopBar";
import { FILE_MANAGER } from "@/lib/os";
import RouteSwitcher from "./RouteSwitcher";
import {
  AudioIcon, CloseIcon, FolderIcon, ImageIcon, PlusIcon, RevealIcon, SearchIcon, SpinnerIcon, VideoIcon, RevealOSIcon,
} from "./icons";

type Hit = { name: string; rel: string; kind: Kind };
type Scope = "all" | "folders" | "media";
type Status =
  | { state: "idle" }
  | { state: "searching"; scanned: number }
  | { state: "done"; scanned: number; found: number; capped: boolean; ms: number }
  | { state: "error"; message: string };

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "folders", label: "Carpetas" },
  { id: "media", label: "Medios" },
];

const KIND_STYLE: Record<Kind, { icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  folder: { icon: FolderIcon, tint: "text-ink bg-ink/[0.06]" },
  video: { icon: VideoIcon, tint: "text-accent bg-accent/10" },
  image: { icon: ImageIcon, tint: "text-electric bg-electric/10" },
  audio: { icon: AudioIcon, tint: "text-emerald-700 bg-emerald-600/10" },
  other: { icon: FolderIcon, tint: "text-black/50 bg-black/5" },
};

export default function Home({ routes, initialRoute }: { routes: RouteInfo[]; initialRoute: string | null }) {
  const [routeId, setRouteId] = useState(initialRoute);
  const revealing = useRef(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const route = routes.find((r) => r.id === routeId) ?? null;

  // Tecla "/" enfoca la búsqueda, Esc la limpia.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement?.tagName === "INPUT";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runSearch = useCallback(async (q: string, sc: Scope, r: string) => {
    abortRef.current?.abort();
    if (q.trim().length < 2) {
      setHits([]);
      setStatus({ state: "idle" });
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    setHits([]);
    setStatus({ state: "searching", scanned: 0 });

    try {
      const res = await fetch(`/api/search?r=${r}&q=${encodeURIComponent(q)}&scope=${sc}`, { signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setStatus({ state: "error", message: err.error ?? "Error al buscar." });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let batch: Hit[] = [];
      let lastFlush = performance.now();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "hit") batch.push(ev.hit);
          else if (ev.type === "progress") setStatus({ state: "searching", scanned: ev.scanned });
          else if (ev.type === "done")
            setStatus({ state: "done", scanned: ev.scanned, found: ev.found, capped: ev.capped, ms: performance.now() - t0 });
          else if (ev.type === "error") setStatus({ state: "error", message: ev.message });
        }
        // Agrupa resultados para no redibujar en cada línea.
        if (batch.length && performance.now() - lastFlush > 80) {
          const b = batch;
          batch = [];
          lastFlush = performance.now();
          setHits((h) => [...h, ...b]);
        }
      }
      if (batch.length) setHits((h) => [...h, ...batch]);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setStatus({ state: "error", message: "Se perdió la conexión con el servidor local." });
    }
  }, []);

  useEffect(() => {
    if (!routeId) return;
    const t = setTimeout(() => runSearch(query, scope, routeId), 300);
    return () => clearTimeout(t);
  }, [query, scope, routeId, runSearch]);

  const reveal = async (rel: string) => {
    if (revealing.current) return;
    revealing.current = true;
    setToast(`Abriendo en el ${FILE_MANAGER}…`);
    let msg = "No se pudo abrir";
    try {
      const res = await fetch("/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ r: routeId, rel }),
      });
      const data = await res.json().catch(() => ({}));
      msg = res.ok ? `Abierto en el ${FILE_MANAGER}` : data.error ?? msg;
    } catch {}
    revealing.current = false;
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const hasResults = hits.length > 0 || status.state !== "idle";

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Luces de fondo */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[-10%] h-[70vh]">
        <div className="leaks absolute inset-[-20%]" />
      </div>

      <TopBar active="search" />

      <main
        className={`relative mx-auto flex max-w-3xl flex-col px-6 transition-[padding] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          hasResults ? "pt-32" : "pt-[28vh]"
        }`}
      >
        <p className="hero-rise text-center text-xs font-medium uppercase tracking-[0.18em] text-black/45">
          LucidLink · vista local
        </p>
        <h1 className="hero-rise hero-rise-delay-1 mt-4 text-center font-serif text-[clamp(2.25rem,5.5vw,3.75rem)] leading-[1.05] tracking-[-0.02em] text-ink">
          Encuentra el plano <em className="text-accent">exacto</em>.
        </h1>

        {!routes.length ? (
          <div className="hero-rise hero-rise-delay-2 mx-auto mt-9 w-full max-w-md rounded-[2rem] border border-black/10 bg-white/75 p-6 text-center backdrop-blur-sm">
            <p className="text-sm font-medium text-ink">Aún no tienes rutas</p>
            <p className="mt-1 text-sm text-black/50">Crea una ruta por cada carpeta donde quieras buscar, así cada búsqueda es rápida.</p>
            <Link
              href="/routes"
              className="diag-fill mt-5 inline-flex items-center gap-2 rounded-full border-2 border-electric bg-coal px-5 py-2.5 text-sm text-white no-underline transition-colors duration-500"
            >
              <PlusIcon className="size-4" /> Crear ruta
            </Link>
          </div>
        ) : (
          <>
            {/* Búsqueda */}
            <div className="hero-rise hero-rise-delay-2 relative z-20 mt-9">
              <div className="group flex items-center gap-2 rounded-full border border-black/10 bg-white/85 py-2 pl-2 pr-2 shadow-lg shadow-black/5 backdrop-blur-md transition-[border-color,box-shadow] duration-300 focus-within:border-accent/60 focus-within:shadow-[0_10px_40px_-10px_rgba(229,107,59,0.35)]">
                <RouteSwitcher routes={routes} value={routeId} onChange={setRouteId} className="max-w-[45%] shrink-0" />
                <SearchIcon className="ml-1 size-5 shrink-0 text-black/40 transition-colors duration-300 group-focus-within:text-accent" />
                <input
                  ref={inputRef}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={route ? `Buscar en ${route.name}…` : "Busca un cliente, carpeta o clip…"}
                  className="min-w-0 flex-1 bg-transparent py-2 text-base text-ink outline-none placeholder:text-black/35"
                  spellCheck={false}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    aria-label="Limpiar"
                    className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-black/45 transition-colors hover:bg-black/5 hover:text-black"
                  >
                    <CloseIcon className="size-4" />
                  </button>
                ) : (
                  <kbd className="mr-2 hidden rounded-md border border-black/10 px-2 py-0.5 font-mono text-xs text-black/40 sm:block">/</kbd>
                )}
              </div>

              <div className="mt-4 flex items-center justify-center gap-1.5">
                {SCOPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setScope(s.id)}
                    className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors duration-300 ${
                      scope === s.id ? "bg-ink text-cream" : "text-black/55 hover:bg-black/5 hover:text-ink"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {route && !route.exists && (
                <p className="mt-3 text-center text-xs text-red-600">
                  La carpeta de esta ruta no está disponible ahora. ¿Está montado LucidLink?
                </p>
              )}
            </div>

            <StatusLine status={status} />

            {/* Resultados */}
            {hits.length > 0 && (
              <ul className="mb-24 mt-3 overflow-hidden rounded-[1.75rem] border border-black/10 bg-white/75 backdrop-blur-sm">
                {hits.map((h, i) => (
                  <ResultRow key={h.rel} hit={h} index={i} query={query} routeId={routeId!} onReveal={reveal} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {!hasResults && routes.length > 0 && (
        <p className="hero-rise hero-rise-delay-3 pointer-events-none fixed inset-x-0 bottom-6 text-center text-xs text-black/40">
          Solo lectura · nada se escribe ni se descarga de LucidLink hasta que lo pidas
        </p>
      )}

      {toast && (
        <div className="item-fade fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-cream shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.state === "idle") return null;
  return (
    <div className="mt-8 flex min-h-5 items-center gap-2 px-2 text-sm text-black/50">
      {status.state === "searching" && (
        <>
          <SpinnerIcon className="spin size-4 text-accent" />
          <span>Recorriendo carpetas… {status.scanned > 0 && <span className="font-mono text-xs">{status.scanned}</span>}</span>
        </>
      )}
      {status.state === "done" && (
        <span>
          {status.found === 0 ? "Sin resultados" : `${status.found} resultado${status.found === 1 ? "" : "s"}`}
          {status.capped && " (mostrando los primeros 200, afina la búsqueda)"}
          <span className="text-black/35"> · {status.scanned} carpetas en {(status.ms / 1000).toFixed(1)} s</span>
        </span>
      )}
      {status.state === "error" && <span className="text-red-600">{status.message}</span>}
    </div>
  );
}

function ResultRow({
  hit,
  index,
  query,
  routeId,
  onReveal,
}: {
  hit: Hit;
  index: number;
  query: string;
  routeId: string;
  onReveal: (rel: string) => void;
}) {
  const { icon: Icon, tint } = KIND_STYLE[hit.kind];
  const parent = hit.rel.slice(0, Math.max(0, hit.rel.length - hit.name.length - 1));
  const target = hit.kind === "folder" ? hit.rel : parent;
  const goHref = `/browse?r=${routeId}&path=${encodeURIComponent(target)}${hit.kind === "folder" ? "" : `&file=${encodeURIComponent(hit.rel)}`}`;
  return (
    <li
      className="item-fade group flex items-center gap-4 border-t border-black/5 px-5 py-3 transition-colors first:border-t-0 hover:bg-black/[0.03]"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="size-[18px]" />
      </span>
      <Link href={goHref} className="min-w-0 flex-1 no-underline">
        <p className="truncate text-[15px] font-medium text-ink transition-colors group-hover:text-accent">
          <Highlight text={hit.name} query={query} />
        </p>
        {parent && <p className="truncate font-mono text-xs text-black/40">{parent}</p>}
      </Link>
      <span className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100">
        <Link
          href={goHref}
          className="diag-fill-dark inline-flex items-center gap-2 rounded-full border-2 border-ink/15 bg-white px-4 py-1.5 text-xs font-normal text-ink no-underline transition-colors duration-500"
        >
          <RevealIcon className="size-3.5" />
          Ir a carpeta
        </Link>
        <button
          type="button"
          onClick={() => onReveal(hit.rel)}
          className="diag-fill inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-electric bg-coal px-4 py-1.5 text-xs font-normal text-white transition-colors duration-500"
        >
          <RevealOSIcon className="size-3.5" />
          Mostrar en carpeta
        </button>
      </span>
    </li>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  for (const t of terms) {
    let i = lower.indexOf(t);
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) marks[k] = true;
      i = lower.indexOf(t, i + t.length);
    }
  }
  const parts: React.ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      const chunk = text.slice(start, i);
      parts.push(marks[start] ? <mark key={start} className="bg-transparent text-accent">{chunk}</mark> : chunk);
      start = i;
    }
  }
  return <>{parts}</>;
}
