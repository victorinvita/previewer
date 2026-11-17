import path from "node:path";
import { newId, readConfig, writeConfig, type Route } from "@/lib/config";
import { routesSnapshot as snapshot } from "@/lib/routes";

export const dynamic = "force-dynamic";

function clean(body: { name?: unknown; path?: unknown }) {
  const p = typeof body.path === "string" ? body.path.trim().replace(/^"|"$/g, "") : "";
  if (!p) throw new Error("Escribe o elige una carpeta.");
  if (!path.isAbsolute(p)) throw new Error("La ruta debe ser completa, por ejemplo C:\\Volumes\\… o /Volumes/…");
  const full = path.resolve(p);
  const name = (typeof body.name === "string" ? body.name.trim() : "").slice(0, 60) || path.basename(full) || full;
  return { name, path: full };
}

const bad = (err: unknown) => Response.json({ error: (err as Error).message }, { status: 400 });

/** Lista de rutas, con un indicador de si la carpeta está disponible ahora mismo. */
export async function GET() {
  return Response.json(await snapshot());
}

/** Crea una ruta. Se permite aunque la carpeta no esté disponible (p. ej. LucidLink desmontado). */
export async function POST(req: Request) {
  try {
    const data = clean(await req.json());
    const cfg = await readConfig();
    const route = { id: newId(), ...data };
    cfg.routes.push(route);
    if (!cfg.active) cfg.active = route.id;
    await writeConfig(cfg);
    return Response.json({ ...(await snapshot()), created: route.id });
  } catch (err) {
    return bad(err);
  }
}

/** Edita nombre/carpeta, marca como activa o reordena. */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; name?: string; path?: string; active?: boolean; order?: string[] };
    const cfg = await readConfig();

    if (Array.isArray(body.order)) {
      const byId = new Map(cfg.routes.map((r) => [r.id, r]));
      const sorted = body.order.map((id) => byId.get(id)).filter((r): r is Route => !!r);
      cfg.routes = [...sorted, ...cfg.routes.filter((r) => !body.order!.includes(r.id))];
    }

    if (body.id) {
      const route = cfg.routes.find((r) => r.id === body.id);
      if (!route) return Response.json({ error: "Esa ruta ya no existe." }, { status: 404 });
      if (body.name !== undefined || body.path !== undefined) {
        Object.assign(route, clean({ name: body.name ?? route.name, path: body.path ?? route.path }));
      }
      if (body.active) cfg.active = route.id;
    }

    await writeConfig(cfg);
    return Response.json(await snapshot());
  } catch (err) {
    return bad(err);
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const cfg = await readConfig();
  cfg.routes = cfg.routes.filter((r) => r.id !== id);
  if (cfg.active === id) cfg.active = cfg.routes[0]?.id ?? null;
  await writeConfig(cfg);
  return Response.json(await snapshot());
}
