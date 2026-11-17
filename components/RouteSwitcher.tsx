"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RouteInfo } from "@/lib/routes";
import { CheckIcon, ChevronDownIcon, FolderIcon, PencilIcon, SearchIcon } from "./icons";

/** Desplegable para elegir en qué ruta buscar o explorar. Recuerda la elección. */
export default function RouteSwitcher({
  routes,
  value,
  onChange,
  className = "",
  compact = false,
}: {
  routes: RouteInfo[];
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const current = routes.find((r) => r.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (id: string) => {
    setOpen(false);
    setFilter("");
    if (id === value) return;
    onChange(id);
    fetch("/api/routes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: true }),
    }).catch(() => {});
  };

  const shown = filter
    ? routes.filter((r) => `${r.name} ${r.path}`.toLowerCase().includes(filter.toLowerCase()))
    : routes;

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={current?.path}
        className={`flex max-w-full cursor-pointer items-center gap-2 rounded-full transition-colors duration-300 ${
          compact
            ? "px-3 py-1.5 text-sm text-ink hover:bg-black/5"
            : "border border-black/10 bg-cream/70 py-2 pl-3.5 pr-3 text-sm font-medium text-ink hover:border-accent/50"
        }`}
      >
        <FolderIcon className={`size-4 shrink-0 ${current?.exists === false ? "text-black/30" : "text-accent"}`} />
        <span className="truncate">{current?.name ?? "Elige ruta"}</span>
        <ChevronDownIcon className={`size-3.5 shrink-0 text-black/45 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="item-fade absolute left-0 top-[calc(100%+8px)] z-[60] w-[22rem] max-w-[90vw] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl shadow-black/10">
          {routes.length > 6 && (
            <label className="flex items-center gap-2 border-b border-black/5 px-4 py-2.5">
              <SearchIcon className="size-4 text-black/35" />
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar rutas…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/35"
              />
            </label>
          )}
          <ul className="max-h-80 overflow-y-auto py-1.5">
            {shown.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => pick(r.id)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-black/[0.04]"
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${r.exists ? "bg-emerald-500" : "bg-black/20"}`}
                    title={r.exists ? "Disponible" : "No disponible ahora"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${r.id === value ? "font-semibold text-ink" : "text-ink"}`}>{r.name}</span>
                    <span className="block truncate font-mono text-[11px] text-black/40">{r.path}</span>
                  </span>
                  {r.id === value && <CheckIcon className="size-4 shrink-0 text-accent" />}
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-4 py-3 text-sm text-black/45">Sin coincidencias</li>}
          </ul>
          <Link
            href="/routes"
            className="flex items-center gap-2 border-t border-black/5 px-4 py-2.5 text-sm text-black/60 no-underline transition-colors hover:bg-accent/10 hover:text-accent"
          >
            <PencilIcon className="size-4" /> Editar rutas
          </Link>
        </div>
      )}
    </div>
  );
}
