import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Todo lo que guarda la app vive en el disco local, nunca dentro de LucidLink.
import { APP_DIR } from "./platform";
export { APP_DIR };
const CONFIG_FILE = path.join(APP_DIR, "config.json");

/** Una "ruta" es un atajo con nombre a una carpeta. Buscar y explorar siempre ocurre dentro de una. */
export type Route = { id: string; name: string; path: string };
export type AppConfig = { routes: Route[]; active: string | null };

export const newId = () => randomUUID().slice(0, 8);

export async function readConfig(): Promise<AppConfig> {
  try {
    const data = JSON.parse(await fs.readFile(CONFIG_FILE, "utf8")) as Partial<AppConfig> & { root?: string };
    let routes = Array.isArray(data.routes) ? data.routes.filter((r) => r?.id && r?.path) : [];
    // Versión anterior: una sola carpeta raíz.
    if (!routes.length && typeof data.root === "string") {
      routes = [{ id: newId(), name: path.basename(data.root) || data.root, path: data.root }];
      const migrated = { routes, active: routes[0].id };
      await writeConfig(migrated);
      return migrated;
    }
    const active = routes.some((r) => r.id === data.active) ? data.active! : routes[0]?.id ?? null;
    return { routes, active };
  } catch {
    return { routes: [], active: null };
  }
}

export async function writeConfig(cfg: AppConfig): Promise<void> {
  await fs.mkdir(APP_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2), "utf8");
  await fs.rename(tmp, CONFIG_FILE);
}
