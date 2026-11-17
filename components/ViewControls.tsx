"use client";

import { useEffect, useRef, useState } from "react";
import { SORT_LABELS, type Layout, type SortBy, type SortDir, type SortRule, type ViewPrefs } from "@/lib/viewPrefs";
import { CloseIcon, GridIcon, ListIcon, PlusIcon } from "./icons";

const SlidersIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);

/** Controles de vista estilo iconik: cuadros o lista, columnas, tamaño, formato y encuadre. */
export default function ViewControls({
  prefs,
  update,
  layoutKey,
  showFit = true,
}: {
  prefs: ViewPrefs;
  update: (p: Partial<ViewPrefs>) => void;
  layoutKey: "listingLayout" | "previewLayout";
  showFit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const layout = prefs[layoutKey];
  const setLayout = (l: Layout) => update({ [layoutKey]: l } as Partial<ViewPrefs>);

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

  const layoutBtn = (l: Layout, Icon: typeof GridIcon, label: string) => (
    <button
      type="button"
      onClick={() => setLayout(l)}
      title={label}
      aria-label={label}
      aria-pressed={layout === l}
      className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors duration-300 ${
        layout === l ? "bg-ink text-cream" : "text-black/50 hover:text-ink"
      }`}
    >
      <Icon className="size-4" />
    </button>
  );

  return (
    <div ref={box} className="relative flex items-center gap-1.5">
      <div className="flex items-center rounded-full border border-black/10 bg-white/80 p-0.5">
        {layoutBtn("grid", GridIcon, "Cuadros")}
        {layoutBtn("list", ListIcon, "Lista")}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Opciones de vista"
        aria-label="Opciones de vista"
        className={`inline-flex size-9 cursor-pointer items-center justify-center rounded-full border transition-colors duration-300 ${
          open ? "border-accent/50 bg-accent/10 text-accent" : "border-black/10 bg-white/80 text-black/55 hover:text-accent"
        }`}
      >
        <SlidersIcon className="size-4" />
      </button>

      {open && (
        <div className="item-fade absolute right-0 top-[calc(100%+8px)] z-[60] max-h-[75vh] w-[23rem] overflow-y-auto rounded-2xl border border-black/10 bg-white p-4 text-sm shadow-xl shadow-black/10">
          <Field label="Diseño">
            <Seg
              value={layout}
              onChange={setLayout}
              options={[
                ["grid", "Cuadros"],
                ["list", "Lista"],
              ]}
            />
          </Field>

          <div className={layout === "list" ? "pointer-events-none opacity-40" : ""}>
            <Field label="Columnas">
              <div className="flex w-full items-center gap-3">
                <button
                  type="button"
                  onClick={() => update({ columns: prefs.columns ? 0 : 4 })}
                  className={`shrink-0 cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    prefs.columns === 0 ? "bg-ink text-cream" : "border border-black/10 text-black/55 hover:text-ink"
                  }`}
                >
                  Ajustar
                </button>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={prefs.columns || 4}
                  onChange={(e) => update({ columns: Number(e.target.value) })}
                  className={`min-w-0 flex-1 accent-[#e56b3b] ${prefs.columns === 0 ? "opacity-40" : ""}`}
                />
                <span className="w-5 shrink-0 text-right font-mono text-xs text-black/55">{prefs.columns || "—"}</span>
              </div>
            </Field>

            {prefs.columns === 0 && (
              <Field label="Tamaño">
                <div className="flex w-full items-center gap-3">
                  <input
                    type="range"
                    min={120}
                    max={420}
                    step={10}
                    value={prefs.cardSize}
                    onChange={(e) => update({ cardSize: Number(e.target.value) })}
                    className="min-w-0 flex-1 accent-[#e56b3b]"
                  />
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-black/55">{prefs.cardSize}px</span>
                </div>
              </Field>
            )}

            <Field label="Formato">
              <Seg
                value={prefs.aspect}
                onChange={(aspect) => update({ aspect })}
                options={[
                  ["1/1", "1:1"],
                  ["16/9", "16:9"],
                  ["9/16", "9:16"],
                ]}
              />
            </Field>
          </div>

          {showFit && (
            <Field label="Encuadre">
              <Seg
                value={prefs.fit}
                onChange={(fit) => update({ fit })}
                options={[
                  ["contain", "Completo"],
                  ["cover", "Recortado"],
                ]}
              />
            </Field>
          )}

          <SortEditor sorts={prefs.sorts} onChange={(sorts) => update({ sorts })} />

          <p className="mt-3 border-t border-black/5 pt-3 text-[11px] text-black/40">Se guarda en este PC para siempre</p>
        </div>
      )}
    </div>
  );
}

/** Orden en varios niveles: columna + dirección; "+" añade otro nivel para desempatar. */
function SortEditor({ sorts, onChange }: { sorts: SortRule[]; onChange: (s: SortRule[]) => void }) {
  const used = new Set(sorts.map((s) => s.by));
  const free = (Object.keys(SORT_LABELS) as SortBy[]).filter((k) => !used.has(k));
  const set = (i: number, patch: Partial<SortRule>) => onChange(sorts.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="mt-1 border-t border-black/5 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink">Ordenar por</span>
        <button
          type="button"
          onClick={() => free.length && onChange([...sorts, { by: free[0], dir: "asc" }])}
          disabled={!free.length}
          title="Añadir otra columna para desempatar"
          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full border border-black/10 text-black/55 transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {sorts.map((s, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-9 shrink-0 text-[11px] text-black/40">{i === 0 ? "Por" : "Luego"}</span>
            <select
              value={s.by}
              onChange={(e) => set(i, { by: e.target.value as SortBy })}
              className="min-w-0 flex-1 cursor-pointer rounded-full border border-black/10 bg-cream/60 px-3 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
            >
              {(Object.keys(SORT_LABELS) as SortBy[])
                .filter((k) => k === s.by || !used.has(k))
                .map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
            </select>
            <div className="flex shrink-0 items-center rounded-full border border-black/10 bg-cream/60 p-0.5">
              {(["asc", "desc"] as SortDir[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set(i, { dir: d })}
                  title={d === "asc" ? "De menor a mayor (A→Z)" : "De mayor a menor (Z→A)"}
                  aria-pressed={s.dir === d}
                  className={`inline-flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors ${
                    s.dir === d ? "bg-ink text-cream" : "text-black/50 hover:text-ink"
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                    {d === "asc" ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
                  </svg>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onChange(sorts.filter((_, j) => j !== i))}
              disabled={sorts.length === 1}
              title="Quitar este nivel"
              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-black/35 transition-colors hover:bg-red-50 hover:text-red-600 disabled:invisible"
            >
              <CloseIcon className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="w-20 shrink-0 text-[13px] font-medium text-ink">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex items-center rounded-full border border-black/10 bg-cream/60 p-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300 ${
            value === id ? "bg-ink text-cream" : "text-black/55 hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
