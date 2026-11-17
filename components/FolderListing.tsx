"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DirListing } from "@/app/api/tree/route";
import type { CachedStatus } from "@/lib/cache";
import { fmtSize } from "@/lib/format";
import { gridStyle, SORT_LABELS, type SortBy, type SortRule, type ViewPrefs } from "@/lib/viewPrefs";
import ViewControls from "./ViewControls";
import { EntryCard, EntryRow, extOf, ROW_COLS, type Entry } from "./Entries";
import { JOBS_EVENT } from "./JobsIndicator";
import { joinRel, splitRel } from "@/lib/relpath";
import { PinButton } from "./Pins";
import { CheckIcon, RevealOSIcon, SearchIcon, SpinnerIcon } from "./icons";
import { FILE_MANAGER } from "@/lib/os";

export { KIND_ICON } from "./Entries";

const RENDER_LIMIT = 1000;

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
const stem = (n: string) => (n.lastIndexOf(".") > 0 ? n.slice(0, n.lastIndexOf(".")) : n);

/** Comparador de varios niveles. Lo que no tiene dato (p. ej. duración sin vista previa) va al final. */
function makeComparator(sorts: SortRule[], status: Record<string, CachedStatus>) {
  const value = (e: Entry, by: SortBy): string | number | null => {
    const m = status[e.rel]?.meta;
    switch (by) {
      case "name":
        return stem(e.name);
      case "type":
        return e.kind === "folder" ? "" : extOf(e.name);
      case "size":
        return e.size ?? null;
      case "mtime":
        return e.mtime ?? null;
      case "duration":
        return e.kind === "image" ? null : m?.duration ?? null;
      case "resolution":
        return m?.width && m?.height ? m.width * m.height : null;
    }
  };
  return (a: Entry, b: Entry) => {
    for (const { by, dir } of sorts) {
      const va = value(a, by);
      const vb = value(b, by);
      if (va == null && vb == null) continue;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : collator.compare(String(va), String(vb));
      if (c !== 0) return dir === "asc" ? c : -c;
    }
    return collator.compare(a.name, b.name);
  };
}
const POLL_MS = 2500;

/**
 * Contenido de una carpeta. Muestra las vistas previas que ya existan en este PC (sin generar nada)
 * y, mientras se generan en segundo plano, va actualizando cada tarjeta por separado.
 */
export default function FolderListing({
  routeId,
  routeName,
  rel,
  listing,
  highlight,
  onOpen,
  onHighlight,
  onReveal,
  onGenerate,
  prefs,
  updatePrefs,
}: {
  routeId: string;
  routeName: string;
  rel: string;
  listing: DirListing | "loading" | { error: string };
  highlight: string | null;
  onOpen: (rel: string) => void;
  onHighlight: (rel: string) => void;
  onReveal: (rel: string | string[]) => void;
  onGenerate: () => void;
  prefs: ViewPrefs;
  updatePrefs: (p: Partial<ViewPrefs>) => void;
}) {
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState<Record<string, CachedStatus>>({});
  const [jobActive, setJobActive] = useState(false);

  // ---------- Estado de las vistas previas (solo caché local) ----------
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/cached?r=${routeId}&rel=${encodeURIComponent(rel)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Record<string, CachedStatus>; active: boolean };
      setJobActive(data.active);
      // Solo se reemplaza lo que cambió: así únicamente se redibujan esas tarjetas.
      setStatus((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [k, v] of Object.entries(data.items)) {
          if (!prev[k] || JSON.stringify(prev[k]) !== JSON.stringify(v)) {
            next[k] = v;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch {}
  }, [routeId, rel]);

  useEffect(() => {
    setStatus({});
    setFilter("");
    setShowAll(false);
    poll();
  }, [poll]);

  useEffect(() => {
    if (!jobActive) return;
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [jobActive, poll]);

  useEffect(() => {
    const on = () => setTimeout(poll, 400);
    window.addEventListener(JOBS_EVENT, on);
    return () => window.removeEventListener(JOBS_EVENT, on);
  }, [poll]);

  // ---------- Selección de varios elementos (Ctrl/Cmd+clic suma o quita, Mayús+clic elige un rango) ----------
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const anchor = useRef<string | null>(null);
  const orderRef = useRef<Entry[]>([]);

  // Al cambiar de carpeta o resaltar un archivo (clic, árbol o búsqueda), ese archivo pasa a ser la selección.
  useEffect(() => {
    setPicked(highlight ? new Set([highlight]) : new Set());
    anchor.current = highlight;
  }, [routeId, rel, highlight]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && pickedRef.current.size) setPicked(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- Funciones estables para las tarjetas ----------
  const handlers = useRef({ onOpen, onHighlight, onReveal });
  handlers.current = { onOpen, onHighlight, onReveal };
  const clickEntry = useCallback((e: Entry, ev: React.MouseEvent) => {
    if (ev.ctrlKey || ev.metaKey) {
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(e.rel)) next.delete(e.rel);
        else next.add(e.rel);
        return next;
      });
      anchor.current = e.rel;
      return;
    }
    if (ev.shiftKey && anchor.current) {
      const list = orderRef.current;
      const a = list.findIndex((x) => x.rel === anchor.current);
      const b = list.findIndex((x) => x.rel === e.rel);
      if (a >= 0 && b >= 0) {
        setPicked(new Set(list.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.rel)));
        return;
      }
    }
    anchor.current = e.rel;
    if (e.kind === "folder") return handlers.current.onOpen(e.rel);
    setPicked(new Set([e.rel]));
    handlers.current.onHighlight(e.rel);
  }, []);
  /** Si el elemento forma parte de una selección, se muestra toda la selección (empezando por él). */
  const revealEntry = useCallback((r: string) => {
    const sel = pickedRef.current;
    if (sel.size > 1 && sel.has(r)) handlers.current.onReveal([r, ...[...sel].filter((x) => x !== r)]);
    else handlers.current.onReveal(r);
  }, []);
  const doubleEntry = useCallback((e: Entry) => (e.kind === "folder" ? handlers.current.onOpen(e.rel) : revealEntry(e.rel)), [revealEntry]);

  const segments = splitRel(rel);
  const title = segments.at(-1) ?? routeName;
  const data = typeof listing === "object" && "dirs" in listing ? listing : null;

  const { entries, total, bytes, media, ready } = useMemo(() => {
    if (!data) return { entries: [] as Entry[], total: 0, bytes: 0, media: 0, ready: 0 };
    const f = filter.toLowerCase();
    const match = (n: string) => !f || n.toLowerCase().includes(f);
    // Las carpetas siempre van primero; dentro de cada grupo se aplica el orden elegido.
    const cmp = makeComparator(prefs.sorts, status);
    const all: Entry[] = [
      ...data.dirs
        .filter((d) => match(d.name))
        .map((d) => ({ name: d.name, rel: d.rel, kind: "folder" as const }))
        .sort(cmp),
      ...data.files.filter((x) => match(x.name)).sort(cmp),
    ];
    const mediaFiles = data.files.filter((x) => x.kind !== "other");
    const readyCount = mediaFiles.filter((x) => {
      const s = status[x.rel];
      return s && (s.meta?.failed || (s.poster && (x.kind !== "video" || s.sprite)));
    }).length;
    return {
      entries: all,
      total: all.length,
      bytes: data.files.reduce((s, x) => s + (x.size ?? 0), 0),
      media: mediaFiles.length,
      ready: readyCount,
    };
  }, [data, filter, status, prefs.sorts]);

  /** Clic en un encabezado: si ya es la primera columna, invierte el orden; si no, pasa a ser la primera. */
  const sortByHeader = (by: SortBy) => {
    const first = prefs.sorts[0];
    if (first?.by === by) return updatePrefs({ sorts: [{ by, dir: first.dir === "asc" ? "desc" : "asc" }, ...prefs.sorts.slice(1)] });
    updatePrefs({ sorts: [{ by, dir: "asc" }, ...prefs.sorts.filter((s) => s.by !== by)] });
  };
  const header = (by: SortBy, label: string, right = false) => {
    const rule = prefs.sorts[0]?.by === by ? prefs.sorts[0] : null;
    return (
      <button
        type="button"
        onClick={() => sortByHeader(by)}
        title={`Ordenar por ${SORT_LABELS[by].toLowerCase()}`}
        className={`flex cursor-pointer items-center gap-1 uppercase tracking-[0.1em] transition-colors hover:text-accent ${right ? "justify-end" : ""} ${
          rule ? "text-ink" : ""
        }`}
      >
        {label}
        {rule && <span className="text-accent">{rule.dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    );
  };

  const shown = showAll ? entries : entries.slice(0, RENDER_LIMIT);
  orderRef.current = shown;
  const allReady = media > 0 && ready === media;
  const generating = jobActive && !allReady;

  return (
    <div className="hero-rise">
      {/* Cabecera */}
      <div className="sticky top-[5.25rem] z-30 -mx-1 mb-4 rounded-2xl bg-cream/85 px-1 pb-3 pt-3 backdrop-blur-md">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-black/45">
          <button type="button" onClick={() => onOpen("")} className="cursor-pointer hover:text-accent">
            {routeName}
          </button>
          {segments.map((s, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-black/25">/</span>
              <button type="button" onClick={() => onOpen(joinRel(segments.slice(0, i + 1)))} className="cursor-pointer hover:text-accent">
                {s}
              </button>
            </span>
          ))}
        </nav>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="truncate font-serif text-[clamp(1.5rem,2.6vw,2.1rem)] leading-tight tracking-[-0.01em] text-ink">{title}</h1>
              <PinButton routeId={routeId} rel={rel} />
            </div>
            {data && (
              <p className="mt-0.5 text-xs tabular-nums text-black/45">
                {data.dirs.length} carpetas · {data.files.length} archivos · {fmtSize(bytes) || "0 B"}
                {media > 0 && (
                  <>
                    {" · "}
                    <span className={allReady ? "text-emerald-700" : generating ? "text-accent" : ""}>
                      {ready}/{media} con vista previa
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 focus-within:border-accent/60">
              <SearchIcon className="size-3.5 text-black/40" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar aquí…"
                className="w-32 bg-transparent text-xs outline-none placeholder:text-black/35"
              />
            </label>
            {picked.size > 1 && (
              <span className="inline-flex h-9 items-center gap-1 rounded-full border border-accent/30 bg-accent/10 pl-3 pr-1 text-xs font-medium text-accent">
                <button
                  type="button"
                  onClick={() => onReveal([...picked])}
                  title={`Mostrar los ${picked.size} seleccionados en el ${FILE_MANAGER}`}
                  className="inline-flex cursor-pointer items-center gap-1.5 hover:underline"
                >
                  <RevealOSIcon className="size-3.5" /> {picked.size} seleccionados
                </button>
                <button
                  type="button"
                  onClick={() => setPicked(new Set())}
                  title="Quitar la selección (Esc)"
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-accent/15"
                >
                  ✕
                </button>
              </span>
            )}
            <ViewControls prefs={prefs} update={updatePrefs} layoutKey="listingLayout" />
            <button
              type="button"
              onClick={() => onReveal(rel)}
              title={`Abrir esta carpeta en el ${FILE_MANAGER}`}
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full border border-black/10 bg-white/80 text-black/55 transition-colors hover:text-accent"
            >
              <RevealOSIcon className="size-3.5" />
            </button>
            {media > 0 &&
              (allReady ? (
                <span className="inline-flex h-9 items-center gap-2 rounded-full border border-emerald-600/20 bg-emerald-600/10 px-4 text-xs font-medium text-emerald-700">
                  <CheckIcon className="size-3.5" /> Vistas previas listas
                </span>
              ) : generating ? (
                <span className="inline-flex h-9 items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 text-xs font-medium text-accent">
                  <SpinnerIcon className="spin size-3.5" /> Generando {ready}/{media}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onGenerate}
                  title="Genera miniaturas y fotogramas en segundo plano. Sigue aunque cierres la pestaña; solo se guardan imágenes pequeñas en este PC."
                  className="diag-fill inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border-2 border-electric bg-coal px-4 text-xs text-white transition-colors duration-500"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="size-3.5">
                    <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
                  </svg>
                  {ready > 0 ? `Generar las ${media - ready} que faltan` : "Generar vistas previas"}
                </button>
              ))}
          </div>
        </div>
      </div>

      {listing === "loading" && (
        <p className="flex items-center gap-2 text-sm text-black/50">
          <SpinnerIcon className="spin size-4 text-accent" /> Leyendo la carpeta…
        </p>
      )}
      {typeof listing === "object" && "error" in listing && <p className="text-sm text-red-600">{listing.error}</p>}
      {data && total === 0 && (
        <p className="py-6 text-center text-sm text-black/45">{filter ? "Nada coincide con el filtro." : "Carpeta vacía."}</p>
      )}

      {data && total > 0 && prefs.listingLayout === "grid" && (
        <div className="grid gap-3" style={gridStyle(prefs)}>
          {shown.map((e) => (
            <EntryCard
              key={e.rel}
              routeId={routeId}
              entry={e}
              status={status[e.rel]}
              highlighted={highlight === e.rel}
              selected={picked.has(e.rel)}
              aspect={prefs.aspect}
              fit={prefs.fit}
              onClick={clickEntry}
              onDoubleClick={doubleEntry}
              onReveal={revealEntry}
            />
          ))}
        </div>
      )}

      {data && total > 0 && prefs.listingLayout === "list" && (
        <div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white/75 backdrop-blur-sm">
          <div className={`grid ${ROW_COLS} items-center gap-3 border-b border-black/5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-black/40`}>
            <span />
            {header("name", "Nombre")}
            {header("duration", "Duración")}
            {header("resolution", "Resolución")}
            {header("type", "Tipo")}
            {header("size", "Peso", true)}
            {header("mtime", "Modificado")}
            <span />
          </div>
          {shown.map((e) => (
            <EntryRow
              key={e.rel}
              routeId={routeId}
              entry={e}
              status={status[e.rel]}
              highlighted={highlight === e.rel}
              selected={picked.has(e.rel)}
              aspect={prefs.aspect}
              fit={prefs.fit}
              onClick={clickEntry}
              onDoubleClick={doubleEntry}
              onReveal={revealEntry}
            />
          ))}
        </div>
      )}

      {total > shown.length && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-3 w-full cursor-pointer py-3 text-sm text-black/55 hover:text-accent">
          Mostrar los {total} elementos
        </button>
      )}
    </div>
  );
}
