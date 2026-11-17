import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveInsideRoot, HttpError } from "@/lib/paths";
import { revealInFileManager } from "@/lib/platform";

export const dynamic = "force-dynamic";

/** Carpetas que se están abriendo ahora mismo: un segundo clic no abre otra ventana. */
const opening = new Set<string>();

/**
 * Abre el Explorador (Windows) o el Finder (Mac) con uno o varios archivos seleccionados,
 * listos para arrastrar a Premiere. Se usa la carpeta del primero; los de otras carpetas se ignoran.
 */
export async function POST(req: Request) {
  let key: string | null = null;
  try {
    const body = (await req.json()) as { r?: string; rel?: string; rels?: string[] };
    const rels = Array.isArray(body.rels) ? body.rels.filter((x) => typeof x === "string") : typeof body.rel === "string" ? [body.rel] : [];
    if (!rels.length) throw new HttpError(400, "Falta la ruta.");
    const fulls = await Promise.all(rels.slice(0, 500).map(async (rel) => (await resolveInsideRoot(body.r, rel)).full));
    const dir = path.dirname(fulls[0]);
    const same = fulls.filter((f) => path.dirname(f) === dir);
    const k = dir.toLowerCase();
    if (opening.has(k)) return Response.json({ ok: true, busy: true });
    opening.add(k);
    key = k;
    await fs.access(same[0]);
    await revealInFileManager(same);
    return Response.json({ ok: true, count: same.length });
  } catch (err) {
    const known = typeof (err as HttpError)?.status === "number";
    const status = known ? (err as HttpError).status : 404;
    const message = known ? (err as HttpError).message : "No encuentro ese archivo.";
    return Response.json({ error: message }, { status });
  } finally {
    if (key) opening.delete(key);
  }
}
