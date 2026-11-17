import path from "node:path";
import { readConfig } from "@/lib/config";
import { clearFinished, controlJob, createJob, listJobs } from "@/lib/jobs";
import { getRoute, HttpError } from "@/lib/paths";
import { listMedia } from "@/lib/walk";
import { errorResponse } from "@/lib/http";
import { toRel } from "@/lib/platform";
import { baseRel } from "@/lib/relpath";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ jobs: await listJobs() });
}

/**
 * Crea un trabajo "Generar todo".
 * Desde la app: { r, rels, recursive }.
 * Desde el script local: { path, recursive } con una ruta completa que esté dentro de alguna ruta guardada.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { r?: string; rels?: string[]; path?: string; recursive?: boolean };
    let routeId = body.r ?? null;
    let rels = body.rels ?? [];

    if (body.path) {
      const target = path.resolve(body.path);
      const { routes } = await readConfig();
      const owner = routes
        .filter((r) => {
          const rel = path.relative(path.resolve(r.path), target);
          return !rel.startsWith("..") && !path.isAbsolute(rel);
        })
        .sort((a, b) => b.path.length - a.path.length)[0];
      if (!owner) throw new HttpError(400, "Esa carpeta no está dentro de ninguna ruta guardada. Crea una ruta que la contenga.");
      routeId = owner.id;
      rels = [toRel(path.resolve(owner.path), target)];
    }
    if (!rels.length) throw new HttpError(400, "Elige al menos una carpeta.");

    const route = await getRoute(routeId);
    const { items } = await listMedia(route.id, rels, !!body.recursive);
    if (!items.length) throw new HttpError(400, "No hay videos, imágenes ni audios en esa carpeta.");

    const title = rels.length === 1 ? baseRel(rels[0]) || route.name : `${rels.length} carpetas`;
    const job = await createJob(
      route.id,
      body.recursive ? `${title} (con subcarpetas)` : title,
      items.map((i) => ({ full: i.full, size: i.size, kind: i.kind })),
    );
    return Response.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  const { id, action } = (await req.json()) as { id?: string; action?: "pause" | "resume" | "cancel" };
  if (!id || !action) return Response.json({ error: "Faltan datos." }, { status: 400 });
  const ok = await controlJob(id, action);
  return ok ? Response.json({ jobs: await listJobs() }) : Response.json({ error: "No existe ese trabajo." }, { status: 404 });
}

export async function DELETE() {
  await clearFinished();
  return Response.json({ jobs: await listJobs() });
}
