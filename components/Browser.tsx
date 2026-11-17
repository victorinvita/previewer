"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DirListing } from "@/app/api/tree/route";
import type { RouteInfo } from "@/lib/routes";
import { useViewPrefs } from "@/lib/viewPrefs";
import { ancestorsRel, parentRel } from "@/lib/relpath";
import { FILE_MANAGER } from "@/lib/os";
import TopBar from "./TopBar";
import RouteSwitcher from "./RouteSwitcher";
import FolderListing, { KIND_ICON } from "./FolderListing";
import { startGenerateJob } from "./JobsIndicator";
import { FolderIcon, SpinnerIcon } from "./icons";

type Loadable<T> = T | "loading" | { error: string };

const TREE_FILE_LIMIT = 200;

const parentOf = parentRel;
const ancestors = ancestorsRel;
const isLoaded = (v: Loadable<DirListing> | undefined): v is DirListing => typeof v === "object" && v !== null && "dirs" in v;

export default function Browser({
  routes,
  initialRoute,
  initialPath,
  initialFile,
}: {
  routes: RouteInfo[];
  initialRoute: string | null;
  initialPath: string | null;
  initialFile: string | null;
}) {
  const [routeId, setRouteId] = useState(initialRoute);
  const route = routes.find((r) => r.id === routeId) ?? null;
  const routeRef = useRef(routeId);
  const revealing = useRef(false);
  routeRef.current = routeId;
  const pending = useRef<{ path: string; file: string | null } | null>(initialPath != null ? { path: initialPath, file: initialFile } : null);

  // Árbol
  const [tree, setTree] = useState<Record<string, Loadable<DirListing>>>({});
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recursive, setRecursive] = useState(false);

  // Carpeta abierta
  const [opened, setOpened] = useState<string | null>(null);
  const [listing, setListing] = useState<Loadable<DirListing>>("loading");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [prefs, updatePrefs] = useViewPrefs();

  const [toast, setToast] = useState<string | null>(null);
  const openSeq = useRef(0);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showToast = useCallback((msg: string, ms = 2600) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const loadChildren = useCallback(async (rel: string) => {
    const r = routeRef.current;
    setTree((t) => ({ ...t, [rel]: "loading" }));
    try {
      const res = await fetch(`/api/tree?r=${r}&rel=${encodeURIComponent(rel)}`);
      const data = await res.json();
      if (r !== routeRef.current) return;
      setTree((t) => ({ ...t, [rel]: res.ok ? data : { error: data.error ?? "Error" } }));
    } catch {
      setTree((t) => ({ ...t, [rel]: { error: "Sin conexión con el servidor local" } }));
    }
  }, []);

  /** Abre el árbol hasta una carpeta (cargando lo que falte). */
  const expandTo = useCallback(
    async (rel: string) => {
      const chain = ancestors(rel);
      setExpanded((s) => new Set([...s, ...chain.filter(Boolean)]));
      for (const a of chain) if (!isLoaded(treeRef.current[a])) await loadChildren(a);
    },
    [loadChildren],
  );

  /** Abre una carpeta: nombres, tipo, peso, fecha y las vistas previas que ya existan. No genera nada. */
  const openFolder = useCallback(
    async (rel: string, file: string | null = null) => {
      const seq = ++openSeq.current;
      const r = routeRef.current;
      setOpened(rel);
      setHighlight(file);
      setSelected(new Set([rel]));
      setListing("loading");
      expandTo(rel);
      try {
        const res = await fetch(`/api/tree?r=${r}&rel=${encodeURIComponent(rel)}&stat=1`);
        const data = await res.json();
        if (seq !== openSeq.current) return;
        setListing(res.ok ? data : { error: data.error ?? "Error al leer la carpeta." });
      } catch {
        if (seq === openSeq.current) setListing({ error: "Sin conexión con el servidor local." });
      }
    },
    [expandTo],
  );

  // Al cambiar de ruta se empieza de cero. Si vienes desde la búsqueda, se abre esa carpeta.
  useEffect(() => {
    setTree({});
    treeRef.current = {};
    setExpanded(new Set());
    setSelected(new Set());
    setOpened(null);
    setHighlight(null);
    if (!routeId) return;
    const target = pending.current;
    pending.current = null;
    if (target) openFolder(target.path, target.file);
    else loadChildren("");
  }, [routeId, loadChildren, openFolder]);

  const toggleExpand = (rel: string) => {
    const opening = !expanded.has(rel);
    if (opening && !isLoaded(tree[rel]) && tree[rel] !== "loading") loadChildren(rel);
    setExpanded((s) => {
      const n = new Set(s);
      if (opening) n.add(rel);
      else n.delete(rel);
      return n;
    });
  };

  const clickFolder = (rel: string, additive: boolean) => {
    if (!additive) return openFolder(rel);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(rel)) n.delete(rel);
      else n.add(rel);
      return n;
    });
  };

  const clickFile = (fileRel: string) => {
    const parent = parentOf(fileRel);
    if (opened === parent) setHighlight(fileRel);
    else openFolder(parent, fileRel);
  };

  const reveal = useCallback(
    async (target: string | string[]) => {
      if (revealing.current) return;
      revealing.current = true;
      const rels = Array.isArray(target) ? target : [target];
      showToast(`Abriendo en el ${FILE_MANAGER}…`, 15000);
      try {
        const res = await fetch("/api/reveal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ r: routeRef.current, rels }),
        });
        const data = await res.json().catch(() => ({}));
        const what = data.count > 1 ? `${data.count} seleccionados` : "Abierto";
        showToast(res.ok ? `${what} en el ${FILE_MANAGER} · arrástralo a Premiere` : data.error ?? "No se pudo abrir");
      } catch {
        showToast("No se pudo abrir");
      } finally {
        revealing.current = false;
      }
    },
    [showToast],
  );

  const generate = useCallback(
    async (rels: string[], rec: boolean) => {
      const error = await startGenerateJob({ r: routeRef.current, rels, recursive: rec });
      showToast(error ?? "Generando en segundo plano · las tarjetas se irán actualizando solas", 3200);
    },
    [showToast],
  );

  const selectedList = [...selected];

  return (
    <div className="min-h-screen">
      <TopBar active="browse" />

      {!routes.length ? (
        <div className="hero-rise mx-auto max-w-md px-6 pt-48 text-center">
          <p className="font-serif text-3xl text-ink">Aún no tienes rutas</p>
          <a href="/routes" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-white no-underline transition-colors hover:bg-accent">
            Crear ruta
          </a>
        </div>
      ) : (
        <div className="mx-auto flex max-w-[1400px] gap-5 px-4 pt-24">
          {/* Árbol */}
          <aside className="hero-rise sticky top-24 flex h-[calc(100vh-7.5rem)] w-80 shrink-0 flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-white/75 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2 border-b border-black/5 px-3 pb-2 pt-3">
              <RouteSwitcher routes={routes} value={routeId} onChange={setRouteId} compact className="min-w-0" />
              {selected.size > 0 && (
                <button type="button" onClick={() => setSelected(new Set())} className="shrink-0 cursor-pointer px-2 text-xs text-black/45 transition-colors hover:text-accent">
                  Limpiar
                </button>
              )}
            </div>
            {route && !route.exists && (
              <p className="px-5 pt-3 text-xs text-red-600">Esta carpeta no está disponible ahora. ¿Está montado LucidLink?</p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1 text-[13.5px]">
              <TreeLevel
                rel=""
                depth={0}
                tree={tree}
                expanded={expanded}
                selected={selected}
                highlight={highlight}
                onToggle={toggleExpand}
                onFolder={clickFolder}
                onFolderDouble={(rel) => openFolder(rel)}
                onFile={clickFile}
                onFileDouble={reveal}
                onMore={(rel) => openFolder(rel)}
              />
            </div>

            {/* Generar en lote (una o varias carpetas) */}
            <div className="border-t border-black/5 p-4">
              <label className="mb-3 flex cursor-pointer select-none items-center gap-2 text-xs text-black/60">
                <input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} className="size-3.5 accent-[#e56b3b]" />
                Incluir subcarpetas
              </label>
              <button
                type="button"
                disabled={!selected.size}
                onClick={() => generate(selectedList, recursive)}
                className="diag-fill-dark inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-ink/15 bg-white px-5 py-2.5 text-sm text-ink transition-colors duration-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="size-4">
                  <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
                </svg>
                {selected.size > 1 ? `Generar vistas previas (${selected.size} carpetas)` : "Generar vistas previas"}
              </button>
              <p className="mt-2 text-center text-[11px] text-black/40">Ctrl + clic para elegir varias carpetas</p>
            </div>
          </aside>

          {/* Contenido */}
          <main className="min-w-0 flex-1 pb-24">
            {opened != null && route && routeId ? (
              <FolderListing
                routeId={routeId}
                routeName={route.name}
                rel={opened}
                listing={listing}
                highlight={highlight}
                onOpen={openFolder}
                onHighlight={setHighlight}
                onReveal={reveal}
                onGenerate={() => generate([opened], recursive)}
                prefs={prefs}
                updatePrefs={updatePrefs}
              />
            ) : (
              <div className="hero-rise flex h-[calc(100vh-7.5rem)] flex-col items-center justify-center text-center">
                <p className="font-serif text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight tracking-[-0.01em] text-ink">
                  Elige una carpeta para ver <em className="text-accent">qué hay dentro</em>.
                </p>
                <p className="mt-3 max-w-md text-sm text-black/50">
                  Abrir carpetas solo lee nombres. Las vistas previas que ya existan aparecen solas; las nuevas se generan con «Generar vistas previas».
                </p>
              </div>
            )}
          </main>
        </div>
      )}

      {toast && (
        <div className="item-fade fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-cream shadow-lg">{toast}</div>
      )}
    </div>
  );
}

type TreeProps = {
  rel: string;
  depth: number;
  tree: Record<string, Loadable<DirListing>>;
  expanded: Set<string>;
  selected: Set<string>;
  highlight: string | null;
  onToggle: (rel: string) => void;
  onFolder: (rel: string, additive: boolean) => void;
  onFolderDouble: (rel: string) => void;
  onFile: (rel: string) => void;
  onFileDouble: (rel: string) => void;
  onMore: (rel: string) => void;
};

function TreeLevel(props: TreeProps) {
  const { rel, depth, tree, expanded, selected, highlight, onToggle, onFolder, onFolderDouble, onFile, onFileDouble, onMore } = props;
  const node = tree[rel];
  const pad = { paddingLeft: `${depth * 14 + 8}px` };
  if (!node || node === "loading")
    return (
      <div style={pad} className="flex items-center gap-2 py-1.5 text-xs text-black/40">
        <SpinnerIcon className="spin size-3.5 text-accent" /> Cargando…
      </div>
    );
  if ("error" in node) return <div style={pad} className="py-1.5 text-xs text-red-600">{node.error}</div>;
  if (!node.dirs.length && !node.files.length)
    return (
      <div style={pad} className="py-1 pl-6 text-xs italic text-black/35">
        Vacía
      </div>
    );

  const files = node.files.slice(0, TREE_FILE_LIMIT);
  return (
    <ul>
      {node.dirs.map((d) => {
        const open = expanded.has(d.rel);
        const isSel = selected.has(d.rel);
        return (
          <li key={d.rel}>
            <div
              style={pad}
              className={`group flex items-center gap-1 rounded-xl pr-2 transition-colors duration-200 ${isSel ? "bg-accent/12 text-ink" : "hover:bg-black/[0.04]"}`}
            >
              <button
                type="button"
                onClick={() => onToggle(d.rel)}
                aria-label={open ? "Contraer" : "Expandir"}
                className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-black/40 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className={`size-3.5 transition-transform duration-300 ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => onFolder(d.rel, e.ctrlKey || e.metaKey)}
                onDoubleClick={() => onFolderDouble(d.rel)}
                title={d.rel}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left"
              >
                <FolderIcon className={`size-4 shrink-0 ${isSel ? "text-accent" : "text-black/45"}`} />
                <span className={`truncate ${isSel ? "font-medium" : ""}`}>{d.name}</span>
              </button>
            </div>
            {open && <TreeLevel {...props} rel={d.rel} depth={depth + 1} />}
          </li>
        );
      })}
      {files.map((f) => {
        const { icon: Icon, tint } = KIND_ICON[f.kind];
        const hl = highlight === f.rel;
        return (
          <li key={f.rel}>
            <button
              type="button"
              style={{ paddingLeft: `${depth * 14 + 8 + 28}px` }}
              onClick={() => onFile(f.rel)}
              onDoubleClick={() => onFileDouble(f.rel)}
              title={`${f.name}\nDoble clic: mostrar en el ${FILE_MANAGER}`}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-xl py-1 pr-2 text-left text-[12.5px] transition-colors ${
                hl ? "bg-accent/12 font-medium text-accent" : "text-black/55 hover:bg-black/[0.04] hover:text-ink"
              }`}
            >
              <Icon className={`size-3.5 shrink-0 ${hl ? "text-accent" : tint} opacity-80`} />
              <span className="truncate">{f.name}</span>
            </button>
          </li>
        );
      })}
      {node.files.length > TREE_FILE_LIMIT && (
        <li>
          <button
            type="button"
            style={{ paddingLeft: `${depth * 14 + 8 + 28}px` }}
            onClick={() => onMore(rel)}
            className="cursor-pointer py-1 text-xs text-black/45 hover:text-accent"
          >
            +{node.files.length - TREE_FILE_LIMIT} archivos más · ver lista
          </button>
        </li>
      )}
    </ul>
  );
}
