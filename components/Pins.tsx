"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PinInfo } from "@/lib/pins";
import { CloseIcon, PinIcon } from "./icons";

export const PINS_EVENT = "previewer:pins";

function usePins() {
  const [pins, setPins] = useState<PinInfo[] | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/pins", { cache: "no-store" });
      if (res.ok) setPins((await res.json()).pins);
    } catch {}
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(PINS_EVENT, refresh);
    return () => window.removeEventListener(PINS_EVENT, refresh);
  }, [refresh]);
  return pins;
}

async function mutate(method: "POST" | "DELETE", params: { r?: string; rel?: string; id?: string }) {
  const qs = method === "DELETE" ? `?${new URLSearchParams(params as Record<string, string>)}` : "";
  await fetch(`/api/pins${qs}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(params) : undefined,
  });
  window.dispatchEvent(new Event(PINS_EVENT));
}

/** Pin junto al título de la carpeta: naranja cuando está fijada. */
export function PinButton({ routeId, rel }: { routeId: string; rel: string }) {
  const pins = usePins();
  const pinned = !!pins?.some((p) => p.routeId === routeId && p.rel === rel);
  const [pop, setPop] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        setPop(true);
        setTimeout(() => setPop(false), 350);
        await mutate(pinned ? "DELETE" : "POST", { r: routeId, rel });
      }}
      title={pinned ? "Quitar de Pins" : "Fijar en Pins"}
      aria-label={pinned ? "Quitar de Pins" : "Fijar en Pins"}
      aria-pressed={pinned}
      className={`inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[color,background,transform] duration-300 ${
        pinned ? "bg-accent/12 text-accent hover:bg-accent/20" : "text-black/30 hover:bg-accent/10 hover:text-accent"
      } ${pop ? "scale-125" : "scale-100"}`}
    >
      <PinIcon filled={pinned} className={`size-5 transition-transform duration-300 ${pinned ? "rotate-0" : "rotate-45"}`} />
    </button>
  );
}

/** Menú "Pins" de la barra superior: lista de carpetas fijadas, un clic te lleva a cada una. */
export function PinsMenu({ active }: { active?: boolean }) {
  const pins = usePins();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${
          open || active ? "bg-accent/12 text-accent" : "text-black hover:text-accent"
        }`}
      >
        <PinIcon filled className="size-3.5 text-accent" />
        Pins
        {!!pins?.length && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white tabular-nums">{pins.length}</span>}
      </button>

      {open && (
        <div className="item-fade absolute left-0 top-[calc(100%+10px)] z-[60] w-[24rem] max-w-[90vw] overflow-hidden rounded-2xl border border-black/10 bg-white text-sm shadow-xl shadow-black/10">
          <div className="border-b border-black/5 px-4 py-3">
            <p className="font-medium text-ink">Pins</p>
            <p className="text-xs text-black/45">Carpetas fijadas. Fija una con el pin junto a su nombre.</p>
          </div>
          {pins === null ? null : pins.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-black/45">Aún no tienes carpetas fijadas.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {pins.map((p) => (
                <li key={p.id} className="group flex items-center gap-1 pr-2 transition-colors hover:bg-black/[0.03]">
                  <Link
                    href={`/browse?r=${p.routeId}&path=${encodeURIComponent(p.rel)}`}
                    onClick={() => setOpen(false)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 no-underline"
                  >
                    <PinIcon filled className="size-4 shrink-0 text-accent" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink group-hover:text-accent">{p.name}</span>
                      <span className="block truncate text-[11px] text-black/40">
                        {p.routeName ?? "Ruta eliminada"}
                        {p.parent ? ` / ${p.parent}` : ""}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => mutate("DELETE", { id: p.id })}
                    title="Quitar de Pins"
                    className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-black/30 opacity-0 transition-[color,opacity] hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
