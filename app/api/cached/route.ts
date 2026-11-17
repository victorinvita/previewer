import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveInsideRoot } from "@/lib/paths";
import { cachedStatus, type CachedStatus } from "@/lib/cache";
import { kindOf } from "@/lib/media";
import { listJobs } from "@/lib/jobs";
import { errorResponse } from "@/lib/http";
import { toRel } from "@/lib/platform";

export const dynamic = "force-dynamic";

/**
 * Qué vistas previas existen ya para los archivos de una carpeta.
 * Solo consulta nombre/tamaño/fecha y la caché local: no genera nada ni descarga de LucidLink.
 * "active" indica si hay algún "Generar vistas previas" en marcha (para saber si seguir actualizando).
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const { root, full } = await resolveInsideRoot(sp.get("r"), sp.get("rel") ?? "");
    const entries = await fs.readdir(full, { withFileTypes: true });
    const media = entries.filter((e) => !e.isDirectory() && kindOf(e.name) !== "other");

    const items: Record<string, CachedStatus> = {};
    let i = 0;
    await Promise.all(
      Array.from({ length: 16 }, async () => {
        while (i < media.length) {
          const e = media[i++];
          const file = path.join(full, e.name);
          const st = await fs.stat(file).catch(() => null);
          if (st) items[toRel(root, file)] = await cachedStatus(file, st.size, st.mtimeMs);
        }
      }),
    );

    const active = (await listJobs()).some((j) => j.status === "running" || j.status === "queued");
    return Response.json({ items, active });
  } catch (err) {
    return errorResponse(err);
  }
}
