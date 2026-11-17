"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { CachedStatus } from "@/lib/cache";
import type { Kind } from "@/lib/media";
import { fmtDate, fmtDuration, fmtSize } from "@/lib/format";
import { aspectValue, type Aspect } from "@/lib/viewPrefs";
import { AudioIcon, FileIcon, FolderIcon, ImageIcon, RevealOSIcon, VideoIcon } from "./icons";
import { FILE_MANAGER } from "@/lib/os";

export const KIND_ICON: Record<Kind, { icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  folder: { icon: FolderIcon, tint: "text-ink/70" },
  video: { icon: VideoIcon, tint: "text-accent" },
  image: { icon: ImageIcon, tint: "text-electric" },
  audio: { icon: AudioIcon, tint: "text-emerald-700" },
  other: { icon: FileIcon, tint: "text-black/40" },
};

export type Entry = { name: string; rel: string; kind: Kind; size?: number; mtime?: number };

export const ROW_COLS = "grid-cols-[88px_minmax(0,1fr)_60px_92px_56px_76px_104px_32px]";
const ROW_THUMB = { w: 88, h: 56 };

export const extOf = (name: string) => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toUpperCase() : "";
};

/**
 * Miniatura de un archivo. Solo muestra lo que ya existe en la caché local (nunca genera nada).
 * Si aún no hay vista previa, muestra el icono; cuando llega, aparece con un fundido, sin mover nada.
 */
const Thumb = memo(function Thumb({
  routeId,
  entry,
  status,
  fit,
  row,
  aspect,
}: {
  routeId: string;
  entry: Entry;
  status: CachedStatus | undefined;
  fit: "contain" | "cover";
  row: boolean;
  aspect: Aspect;
}) {
  const [loaded, setLoaded] = useState(false);
  const [spriteReady, setSpriteReady] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const q = `r=${routeId}&rel=${encodeURIComponent(entry.rel)}&v=${entry.mtime ?? 0}&cached=1`;
  const meta = status?.meta ?? null;
  const plan = status?.sprite ? meta?.sprite ?? null : null;
  const spriteUrl = `/api/thumb?type=sprite&${q}`;
  const hasPoster = !!status?.poster;

  const ar = meta?.width && meta?.height ? meta.width / meta.height : 16 / 9;
  const boxAR = row ? ROW_THUMB.w / ROW_THUMB.h : aspectValue(aspect);
  const cover = fit === "cover" && entry.kind !== "audio";
  const wide = ar > boxAR;
  const frameSize = cover ? (wide ? { height: "100%" } : { width: "100%" }) : wide ? { width: "100%" } : { height: "100%" };

  // Si la cuadrícula de fotogramas aparece mientras el cursor ya está encima, se carga en ese momento.
  useEffect(() => {
    if (!plan || spriteReady || hoverX == null) return;
    const img = new Image();
    img.onload = () => setSpriteReady(true);
    img.src = spriteUrl;
  }, [plan, spriteReady, hoverX, spriteUrl]);

  const frame = plan && hoverX != null ? Math.min(plan.count - 1, Math.floor(hoverX * plan.count)) : null;
  const scrubbing = spriteReady && frame != null && plan;
  const { icon: Icon, tint } = KIND_ICON[entry.kind];
  const showImage = hasPoster && loaded;

  return (
    <div
      className={`relative overflow-hidden transition-colors duration-500 ${showImage ? "bg-[#111]" : "bg-black/[0.035]"} ${row ? "shrink-0 rounded-lg" : ""}`}
      style={row ? { width: ROW_THUMB.w, height: ROW_THUMB.h } : { aspectRatio: aspect }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHoverX(Math.max(0, Math.min(0.9999, (e.clientX - r.left) / r.width)));
      }}
      onMouseLeave={() => setHoverX(null)}
    >
      {/* Icono mientras no hay vista previa */}
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${showImage ? "opacity-0" : "opacity-100"}`}>
        <Icon className={`${row ? "size-5" : "size-10"} ${tint} opacity-80`} />
      </div>

      {hasPoster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/thumb?type=poster&${q}`}
          alt=""
          loading="lazy"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 size-full transition-opacity duration-500 ${
            entry.kind === "audio" ? `object-contain ${row ? "p-1.5" : "p-6"}` : cover ? "object-cover" : "object-contain"
          } ${loaded ? "opacity-100" : "opacity-0"} ${scrubbing ? "invisible" : ""}`}
        />
      )}

      {scrubbing && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <div
            style={{
              ...frameSize,
              flexShrink: 0,
              aspectRatio: String(ar),
              backgroundImage: `url(${spriteUrl})`,
              backgroundSize: `${plan.cols * 100}% ${plan.rows * 100}%`,
              backgroundPosition: `${plan.cols > 1 ? ((frame % plan.cols) / (plan.cols - 1)) * 100 : 0}% ${
                plan.rows > 1 ? (Math.floor(frame / plan.cols) / (plan.rows - 1)) * 100 : 0
              }%`,
            }}
          />
        </div>
      )}

      {/* Insignias */}
      {!row && meta?.width && showImage ? (
        <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] tabular-nums text-white/85 backdrop-blur-sm">
          {meta.width}×{meta.height}
        </span>
      ) : null}
      {!showImage && !row && (
        <span className="absolute bottom-2 left-2 rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-black/50">{extOf(entry.name)}</span>
      )}
      {entry.kind !== "image" && meta?.duration && showImage ? (
        <span
          className={`absolute rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] tabular-nums text-white/90 backdrop-blur-sm ${
            row ? "bottom-1 right-1" : "bottom-2 right-2"
          }`}
        >
          {scrubbing ? fmtDuration((frame + 0.5) * plan.step) : fmtDuration(meta.duration)}
        </span>
      ) : null}
      {scrubbing && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
          <span className="block h-full bg-accent" style={{ width: `${((frame + 1) / plan.count) * 100}%` }} />
        </span>
      )}
    </div>
  );
});

function RevealBtn({ onReveal, className = "" }: { onReveal: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onReveal();
      }}
      title={`Mostrar en el ${FILE_MANAGER}`}
      className={`inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-black/40 transition-colors duration-200 hover:bg-accent/12 hover:text-accent ${className}`}
    >
      <RevealOSIcon className="size-3.5" />
    </button>
  );
}

function useScrollIntoView(highlighted: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted]);
  return ref;
}

type EntryProps = {
  routeId: string;
  entry: Entry;
  status: CachedStatus | undefined;
  highlighted: boolean;
  aspect: Aspect;
  fit: "contain" | "cover";
  // Funciones estables (no cambian entre renders) para que solo se redibuje la tarjeta que cambia.
  selected: boolean;
  onClick: (e: Entry, ev: React.MouseEvent) => void;
  onDoubleClick: (e: Entry) => void;
  onReveal: (rel: string) => void;
};

/** Evita que Mayús/Ctrl+clic seleccione texto de la página. */
const noTextSelect = (ev: React.MouseEvent) => {
  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) ev.preventDefault();
};

const isMedia = (k: Kind) => k === "video" || k === "image" || k === "audio";

export const EntryCard = memo(function EntryCard(p: EntryProps) {
  const ref = useScrollIntoView(p.highlighted);
  const { icon: Icon, tint } = KIND_ICON[p.entry.kind];
  const meta = p.status?.meta;
  const sub =
    p.entry.kind === "folder"
      ? "Carpeta"
      : [meta?.fps ? `${meta.fps} fps` : null, meta?.codec?.toUpperCase(), fmtSize(p.entry.size ?? 0)].filter(Boolean).join(" · ");
  return (
    <div
      ref={ref}
      onClick={(ev) => p.onClick(p.entry, ev)}
      onMouseDown={noTextSelect}
      onDoubleClick={() => p.onDoubleClick(p.entry)}
      title={p.entry.name}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-[1.25rem] border bg-white/80 transition-[border-color,box-shadow] duration-300 ${
        p.selected ? "border-accent shadow-[0_0_0_3px_rgba(229,107,59,0.25)]" : "border-black/10 hover:border-black/25"
      }`}
    >
      {isMedia(p.entry.kind) ? (
        <Thumb routeId={p.routeId} entry={p.entry} status={p.status} fit={p.fit} aspect={p.aspect} row={false} />
      ) : (
        <div className="relative flex items-center justify-center bg-black/[0.035]" style={{ aspectRatio: p.aspect }}>
          <Icon className={`size-10 ${tint} opacity-80`} />
          {p.entry.kind === "other" && (
            <span className="absolute bottom-2 left-2 rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-black/50">{extOf(p.entry.name)}</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3 pt-2.5">
        <div className="min-w-0">
          <p className={`truncate text-[13px] font-medium ${p.selected ? "text-accent" : "text-ink"}`}>{p.entry.name}</p>
          <p className="truncate text-[11px] tabular-nums text-black/45">{sub}</p>
        </div>
        <RevealBtn onReveal={() => p.onReveal(p.entry.rel)} />
      </div>
    </div>
  );
});

export const EntryRow = memo(function EntryRow(p: EntryProps) {
  const ref = useScrollIntoView(p.highlighted);
  const { icon: Icon, tint } = KIND_ICON[p.entry.kind];
  const meta = p.status?.meta;
  return (
    <div
      ref={ref}
      onClick={(ev) => p.onClick(p.entry, ev)}
      onMouseDown={noTextSelect}
      onDoubleClick={() => p.onDoubleClick(p.entry)}
      title={p.entry.kind === "folder" ? "Abrir carpeta" : `Doble clic: mostrar en el ${FILE_MANAGER}`}
      className={`group grid cursor-pointer ${ROW_COLS} items-center gap-3 border-t border-black/5 px-3 py-1.5 text-[13.5px] transition-colors first:border-t-0 ${
        p.selected ? (p.highlighted ? "row-flash" : "bg-accent/10") : "hover:bg-black/[0.03]"
      }`}
    >
      {isMedia(p.entry.kind) ? (
        <Thumb routeId={p.routeId} entry={p.entry} status={p.status} fit={p.fit} aspect={p.aspect} row />
      ) : (
        <span className="flex items-center justify-center rounded-lg bg-black/[0.035]" style={{ width: ROW_THUMB.w, height: ROW_THUMB.h }}>
          <Icon className={`size-5 ${tint} opacity-80`} />
        </span>
      )}
      <span className={`truncate ${p.entry.kind === "folder" ? "font-medium" : ""} ${p.selected ? "font-medium text-accent" : "text-ink"}`}>
        {p.entry.name}
      </span>
      <span className="text-[11px] tabular-nums text-black/45">{p.entry.kind !== "image" && meta?.duration ? fmtDuration(meta.duration) : ""}</span>
      <span className="text-[11px] tabular-nums text-black/45">{meta?.width ? `${meta.width}×${meta.height}` : ""}</span>
      <span className="truncate text-[11px] text-black/45">{p.entry.kind === "folder" ? "Carpeta" : extOf(p.entry.name)}</span>
      <span className="text-right text-[11px] tabular-nums text-black/45">{fmtSize(p.entry.size ?? 0)}</span>
      <span className="text-[11px] tabular-nums text-black/45">{fmtDate(p.entry.mtime ?? 0)}</span>
      <RevealBtn onReveal={() => p.onReveal(p.entry.rel)} className="opacity-0 group-hover:opacity-100" />
    </div>
  );
});
