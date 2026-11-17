import { promises as fs } from "node:fs";
import path from "node:path";
import { getRoute } from "@/lib/paths";
import { errorResponse } from "@/lib/http";
import { toRel } from "@/lib/platform";
import { kindOf, SKIP_DIRS, type Kind } from "@/lib/media";

export const dynamic = "force-dynamic";

const MAX_RESULTS = 200;

export type SearchHit = { name: string; rel: string; kind: Kind };

/**
 * Busca por nombre recorriendo carpetas por niveles. Solo lee nombres: no abre ni descarga archivos.
 * Responde en streaming (una línea JSON por evento) y se detiene si cambias la búsqueda o cierras la pestaña.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  let root: string;
  try {
    root = path.resolve((await getRoute(url.searchParams.get("r"))).path);
  } catch (err) {
    return errorResponse(err);
  }

  const terms = (url.searchParams.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const scope = url.searchParams.get("scope") ?? "all"; // all | folders | media
  if (!terms.length) return Response.json({ error: "Búsqueda vacía." }, { status: 400 });

  const signal = req.signal;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let found = 0;
      let scanned = 0;
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      const queue: string[] = [root];

      try {
        while (queue.length && found < MAX_RESULTS && !signal.aborted) {
          const dir = queue.shift()!;
          let entries;
          try {
            entries = await fs.readdir(dir, { withFileTypes: true });
          } catch {
            continue; // sin permiso o ya no existe
          }
          scanned++;
          for (const e of entries) {
            if (signal.aborted || found >= MAX_RESULTS) break;
            const isDir = e.isDirectory();
            if (isDir && (SKIP_DIRS.has(e.name) || e.name.startsWith("."))) continue;
            const full = path.join(dir, e.name);
            if (isDir) queue.push(full);

            const kind: Kind = isDir ? "folder" : kindOf(e.name);
            if (kind === "other") continue;
            if (scope === "folders" && kind !== "folder") continue;
            if (scope === "media" && kind === "folder") continue;

            const lower = e.name.toLowerCase();
            if (terms.every((t) => lower.includes(t))) {
              found++;
              const hit: SearchHit = { name: e.name, rel: toRel(root, full), kind };
              send({ type: "hit", hit });
            }
          }
          if (scanned % 20 === 0) send({ type: "progress", scanned });
        }
        if (!signal.aborted) send({ type: "done", scanned, found, capped: found >= MAX_RESULTS });
      } catch (err) {
        if (!signal.aborted) send({ type: "error", message: String(err) });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
