import { promises as fs } from "node:fs";
import { readConfig, type Route } from "./config";

export type RouteInfo = Route & { exists: boolean };
export type RoutesSnapshot = { routes: RouteInfo[]; active: string | null };

const isDir = (p: string) => fs.stat(p).then((s) => s.isDirectory(), () => false);

/** Rutas guardadas, con un indicador de si cada carpeta está disponible ahora mismo. */
export async function routesSnapshot(): Promise<RoutesSnapshot> {
  const cfg = await readConfig();
  const routes = await Promise.all(cfg.routes.map(async (r) => ({ ...r, exists: await isDir(r.path) })));
  return { routes, active: cfg.active };
}
