"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Layout = "grid" | "list";
export type Aspect = "1/1" | "16/9" | "9/16";
export type SortBy = "name" | "duration" | "resolution" | "type" | "size" | "mtime";
export type SortDir = "asc" | "desc";

export type ViewPrefs = {
  listingLayout: Layout;
  previewLayout: Layout;
  columns: number; // 0 = ajustar automáticamente
  cardSize: number; // px, solo cuando columns = 0
  aspect: Aspect;
  fit: "contain" | "cover";
  // Orden en varios niveles: primero por el 1º; si empatan, por el 2º; etc.
  sorts: SortRule[];
};

export type SortRule = { by: SortBy; dir: SortDir };

export const DEFAULT_PREFS: ViewPrefs = {
  listingLayout: "list",
  previewLayout: "grid",
  columns: 0,
  cardSize: 220,
  aspect: "1/1",
  fit: "contain",
  sorts: [{ by: "name", dir: "asc" }],
};

export const SORT_LABELS: Record<SortBy, string> = {
  name: "Nombre (sin extensión)",
  duration: "Duración",
  resolution: "Resolución",
  type: "Tipo",
  size: "Peso",
  mtime: "Fecha de modificación",
};

const KEY = "previewer.view.v1";

const sanitize = (p: ViewPrefs): ViewPrefs => {
  const valid = Array.isArray(p.sorts) ? p.sorts.filter((s) => s && s.by in SORT_LABELS && (s.dir === "asc" || s.dir === "desc")) : [];
  return { ...p, sorts: valid.length ? valid : DEFAULT_PREFS.sorts };
};

/**
 * Preferencias de vista. Se guardan en este PC (servidor local) para siempre;
 * el navegador solo guarda una copia para que la vista aparezca al instante.
 */
export function useViewPrefs() {
  const [prefs, setPrefs] = useState<ViewPrefs>(DEFAULT_PREFS);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs(sanitize({ ...DEFAULT_PREFS, ...JSON.parse(raw) }));
    } catch {}
    fetch("/api/prefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((saved) => {
        if (saved && Object.keys(saved).length) {
          setPrefs((p) => {
            const next = sanitize({ ...p, ...saved });
            try {
              localStorage.setItem(KEY, JSON.stringify(next));
            } catch {}
            return next;
          });
        }
      })
      .catch(() => {});
  }, []);

  const update = useCallback((patch: Partial<ViewPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch("/api/prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
      }, 400);
      return next;
    });
  }, []);

  return [prefs, update] as const;
}

export function gridStyle(p: ViewPrefs): React.CSSProperties {
  return {
    gridTemplateColumns: p.columns > 0 ? `repeat(${p.columns}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${p.cardSize}px, 1fr))`,
  };
}

export const aspectValue = (a: Aspect) => (a === "1/1" ? 1 : a === "16/9" ? 16 / 9 : 9 / 16);
