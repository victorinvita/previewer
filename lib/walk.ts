import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveInsideRoot } from "./paths";
import { kindOf, SKIP_DIRS, type Kind } from "./media";
import { toRel } from "./platform";
import { parentRel } from "./relpath";

export const MAX_ITEMS = 5000;

export type ListItem = { name: string; rel: string; full: string; folder: string; kind: Kind; size: number; mtime: number };

/**
 * Videos, imágenes y audios de una o varias carpetas de una ruta, con tamaño y fecha.
 * Solo lee nombres y metadatos: no abre ni descarga los archivos.
 */
export async function listMedia(
  routeId: string | null | undefined,
  rels: string[],
  recursive: boolean,
  signal?: AbortSignal,
): Promise<{ items: ListItem[]; truncated: boolean }> {
  const files: { full: string; root: string; kind: Kind }[] = [];
  let truncated = false;

  for (const rel of rels) {
    const { root, full } = await resolveInsideRoot(routeId, rel);
    const queue = [full];
    while (queue.length && !truncated) {
      if (signal?.aborted) throw new Error("aborted");
      const dir = queue.shift()!;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (e.isDirectory()) {
          if (recursive && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) queue.push(path.join(dir, e.name));
          continue;
        }
        const kind = kindOf(e.name);
        if (kind === "other") continue;
        if (files.length >= MAX_ITEMS) {
          truncated = true;
          break;
        }
        files.push({ full: path.join(dir, e.name), root, kind });
      }
    }
  }

  const items: ListItem[] = new Array(files.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: 32 }, async () => {
      while (i < files.length) {
        const idx = i++;
        const f = files[idx];
        const st = await fs.stat(f.full).catch(() => null);
        const rel = toRel(f.root, f.full);
        items[idx] = {
          name: path.basename(f.full),
          rel,
          full: f.full,
          folder: parentRel(rel),
          kind: f.kind,
          size: st?.size ?? 0,
          mtime: st?.mtimeMs ?? 0,
        };
      }
    }),
  );
  return { items, truncated };
}
