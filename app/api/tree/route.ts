import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveInsideRoot } from "@/lib/paths";
import { kindOf, SKIP_DIRS, type Kind } from "@/lib/media";
import { errorResponse } from "@/lib/http";
import { normRel, toRel } from "@/lib/platform";

export const dynamic = "force-dynamic";

export type DirNode = { name: string; rel: string };
export type FileNode = { name: string; rel: string; kind: Kind; size?: number; mtime?: number };
export type DirListing = { rel: string; dirs: DirNode[]; files: FileNode[] };

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
// Archivos de sistema que solo meten ruido.
const NOISE = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);

/**
 * Contenido de una carpeta (un solo nivel): subcarpetas y archivos.
 * Solo lee nombres; con stat=1 añade tamaño y fecha (metadatos, no descarga nada).
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const rel = normRel(sp.get("rel") ?? "");
    const withStat = sp.get("stat") === "1";
    const { root, full } = await resolveInsideRoot(sp.get("r"), rel);
    const entries = await fs.readdir(full, { withFileTypes: true });
    const relOf = (name: string) => toRel(root, path.join(full, name));

    const dirs: DirNode[] = entries
      .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort(collator.compare)
      .map((name) => ({ name, rel: relOf(name) }));

    const files: FileNode[] = entries
      .filter((e) => !e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("._") && !NOISE.has(e.name.toLowerCase()))
      .map((e) => e.name)
      .sort(collator.compare)
      .map((name) => ({ name, rel: relOf(name), kind: kindOf(name) }));

    if (withStat) {
      let i = 0;
      await Promise.all(
        Array.from({ length: 32 }, async () => {
          while (i < files.length) {
            const f = files[i++];
            const st = await fs.stat(path.join(full, f.name)).catch(() => null);
            if (st) {
              f.size = st.size;
              f.mtime = st.mtimeMs;
            }
          }
        }),
      );
    }

    const body: DirListing = { rel, dirs, files };
    return Response.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
