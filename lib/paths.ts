import path from "node:path";
import { readConfig, type Route } from "./config";
import { normRel } from "./platform";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Devuelve la ruta pedida (o la activa si no se indica ninguna). */
export async function getRoute(id: string | null | undefined): Promise<Route> {
  const { routes, active } = await readConfig();
  if (!routes.length) throw new HttpError(409, "Aún no tienes rutas. Crea una con el icono del lápiz.");
  const route = id ? routes.find((r) => r.id === id) : routes.find((r) => r.id === active) ?? routes[0];
  if (!route) throw new HttpError(404, "Esa ruta ya no existe.");
  return route;
}

/** Resuelve una ruta relativa dentro de la ruta elegida y garantiza que no se salga de ella. */
export async function resolveInsideRoot(routeId: string | null | undefined, rel: string) {
  const route = await getRoute(routeId);
  const root = path.resolve(route.path);
  const full = path.resolve(root, normRel(rel));
  const r = path.relative(root, full);
  if (r.startsWith("..") || path.isAbsolute(r)) throw new HttpError(403, "Ruta fuera de la carpeta permitida.");
  return { root, full, route };
}
