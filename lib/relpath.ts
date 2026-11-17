/**
 * Rutas relativas dentro de una ruta de Previewer. Siempre con "/" (en Windows y en Mac).
 * Este archivo lo usa también el navegador.
 */
export const splitRel = (rel: string) => (rel ? rel.split("/") : []);
export const joinRel = (parts: string[]) => parts.join("/");
export const parentRel = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
export const baseRel = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);
/** "" y cada carpeta intermedia hasta rel: "a/b" → ["", "a", "a/b"] */
export const ancestorsRel = (rel: string) => {
  const parts = splitRel(rel);
  return ["", ...parts.map((_, i) => joinRel(parts.slice(0, i + 1)))];
};
