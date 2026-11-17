"use client";

import Link from "next/link";
import { useState } from "react";
import type { RouteInfo } from "@/lib/routes";
import TopBar from "./TopBar";
import { EXAMPLE_PATH } from "@/lib/os";
import { CheckIcon, FolderIcon, GripIcon, PencilIcon, PlusIcon, SearchIcon, SpinnerIcon, TrashIcon } from "./icons";

type Snapshot = { routes: RouteInfo[]; active: string | null };

async function api(method: string, body?: unknown, query = ""): Promise<Snapshot & { error?: string; created?: string }> {
  const res = await fetch(`/api/routes${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error");
  return data;
}

export default function RoutesManager({ initial }: { initial: Snapshot }) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [editing, setEditing] = useState<string | "new" | null>(initial.routes.length ? null : "new");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const setActive = async (id: string) => setSnap(await api("PATCH", { id, active: true }));

  const remove = async (id: string) => {
    setConfirmDelete(null);
    setSnap(await api("DELETE", undefined, `?id=${encodeURIComponent(id)}`));
  };

  const drop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = snap.routes.map((r) => r.id);
    ids.splice(ids.indexOf(dragId), 1);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    // Reordena al instante y guarda en segundo plano.
    setSnap((s) => ({ ...s, routes: ids.map((id) => s.routes.find((r) => r.id === id)!) }));
    setSnap(await api("PATCH", { order: ids }));
  };

  const shown = filter
    ? snap.routes.filter((r) => `${r.name} ${r.path}`.toLowerCase().includes(filter.toLowerCase()))
    : snap.routes;

  return (
    <div className="min-h-screen">
      <TopBar active="routes" />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-32">
        <div className="hero-rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-black/45">Atajos</p>
            <h1 className="mt-2 font-serif text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] tracking-[-0.02em] text-ink">
              Tus <em className="text-accent">rutas</em>.
            </h1>
            <p className="mt-2 max-w-md text-sm text-black/50">
              Una ruta es una carpeta con nombre. Buscar y explorar ocurre solo dentro de la ruta elegida, así no recorres todo el vault.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="diag-fill inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-electric bg-coal px-5 py-2.5 text-sm text-white transition-colors duration-500"
          >
            <PlusIcon className="size-4" /> Nueva ruta
          </button>
        </div>

        {snap.routes.length > 6 && (
          <label className="hero-rise hero-rise-delay-1 mt-8 flex items-center gap-3 rounded-full border border-black/10 bg-white/80 px-5 py-2.5 focus-within:border-accent/60">
            <SearchIcon className="size-4 text-black/40" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar rutas…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/35"
            />
          </label>
        )}

        {editing === "new" && (
          <RouteForm
            onCancel={snap.routes.length ? () => setEditing(null) : undefined}
            onSave={async (name, path) => {
              const s = await api("POST", { name, path });
              setSnap(s);
              setEditing(null);
            }}
          />
        )}

        <ul className="hero-rise hero-rise-delay-2 mt-6 overflow-hidden rounded-[1.75rem] border border-black/10 bg-white/75 backdrop-blur-sm empty:hidden">
          {shown.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="border-t border-black/5 first:border-t-0">
                <RouteForm
                  inline
                  initialName={r.name}
                  initialPath={r.path}
                  onCancel={() => setEditing(null)}
                  onSave={async (name, path) => {
                    setSnap(await api("PATCH", { id: r.id, name, path }));
                    setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li
                key={r.id}
                draggable={!filter}
                onDragStart={() => setDragId(r.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(r.id);
                }}
                onDrop={() => drop(r.id)}
                className={`group flex items-center gap-3 border-t border-black/5 px-4 py-3 transition-colors first:border-t-0 hover:bg-black/[0.03] ${
                  overId === r.id && dragId && dragId !== r.id ? "bg-accent/[0.07]" : ""
                } ${dragId === r.id ? "opacity-40" : ""}`}
              >
                {!filter && <GripIcon className="size-4 shrink-0 cursor-grab text-black/25 group-hover:text-black/45" />}
                <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <FolderIcon className="size-5" />
                  <span
                    title={r.exists ? "Disponible" : "No encontrada ahora (¿LucidLink desmontado?)"}
                    className={`absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-white ${r.exists ? "bg-emerald-500" : "bg-black/25"}`}
                  />
                </span>
                <button type="button" onClick={() => setActive(r.id)} title="Usar esta ruta" className="min-w-0 flex-1 cursor-pointer text-left">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-ink">{r.name}</span>
                    {snap.active === r.id && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-cream">
                        <CheckIcon className="size-3" /> Activa
                      </span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-xs text-black/40">{r.path}</span>
                </button>

                {confirmDelete === r.id ? (
                  <span className="item-fade flex shrink-0 items-center gap-2 text-sm">
                    <span className="text-black/55">¿Eliminar?</span>
                    <button type="button" onClick={() => remove(r.id)} className="cursor-pointer rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700">
                      Sí
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="cursor-pointer rounded-full px-3 py-1 text-xs text-black/55 hover:bg-black/5">
                      No
                    </button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
                    <Link
                      href={`/?r=${r.id}`}
                      onClick={() => setActive(r.id)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-black/60 no-underline transition-colors hover:bg-accent/10 hover:text-accent"
                    >
                      Buscar
                    </Link>
                    <Link
                      href={`/browse?r=${r.id}`}
                      onClick={() => setActive(r.id)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-black/60 no-underline transition-colors hover:bg-accent/10 hover:text-accent"
                    >
                      Explorar
                    </Link>
                    <IconBtn title="Editar" onClick={() => setEditing(r.id)}>
                      <PencilIcon className="size-4" />
                    </IconBtn>
                    <IconBtn title="Eliminar" danger onClick={() => setConfirmDelete(r.id)}>
                      <TrashIcon className="size-4" />
                    </IconBtn>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>

        {!snap.routes.length && editing !== "new" && (
          <p className="mt-10 text-center text-sm text-black/45">Aún no tienes rutas.</p>
        )}
        {snap.routes.length > 1 && !filter && (
          <p className="mt-4 text-center text-xs text-black/40">Arrastra para reordenar · clic en el nombre para activarla</p>
        )}
      </main>
    </div>
  );
}

function IconBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-black/45 transition-colors ${
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-accent/10 hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

function RouteForm({
  initialName = "",
  initialPath = "",
  inline = false,
  onSave,
  onCancel,
}: {
  initialName?: string;
  initialPath?: string;
  inline?: boolean;
  onSave: (name: string, path: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [path, setPath] = useState(initialPath);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "pick" | null>(null);

  const pick = async () => {
    setBusy("pick");
    try {
      const res = await fetch("/api/pick-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial: path }),
      });
      const data = await res.json();
      if (data.path) {
        setPath(data.path);
        if (!name.trim()) setName(data.path.split(/[\\/]/).filter(Boolean).pop() ?? "");
      }
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setError(null);
    try {
      await onSave(name, path);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={inline ? "bg-accent/[0.04] px-4 py-4" : "item-fade mt-8 rounded-[1.75rem] border border-accent/30 bg-white/85 p-5 shadow-lg shadow-black/5"}
    >
      {!inline && <p className="mb-3 text-sm font-medium text-ink">Nueva ruta</p>}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="block">
          <span className="mb-1 block text-xs text-black/50">Nombre</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cliente · Footage"
            maxLength={60}
            className="w-full rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent/60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-black/50">Carpeta</span>
          <span className="flex gap-2">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="C:\Volumes\Empresa\Proyectos\Cliente"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 py-2.5 font-mono text-xs text-ink outline-none transition-colors focus:border-accent/60"
            />
            <button
              type="button"
              onClick={pick}
              disabled={busy !== null}
              title="Abrir el selector de carpetas de Windows"
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-wait disabled:opacity-60"
            >
              {busy === "pick" ? <SpinnerIcon className="spin size-3.5" /> : <FolderIcon className="size-3.5" />}
              Examinar…
            </button>
          </span>
        </label>
      </div>
      {busy === "pick" && <p className="mt-2 text-xs text-black/45">Se abrió el selector de carpetas de Windows (puede estar detrás del navegador).</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy !== null || !path.trim()}
          className="cursor-pointer rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors duration-300 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "save" ? "Guardando…" : "Guardar"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="cursor-pointer rounded-full px-4 py-2.5 text-sm text-black/55 transition-colors hover:text-accent">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
