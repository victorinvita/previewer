import { promises as fs } from "node:fs";
import path from "node:path";
import { APP_DIR, newId, readConfig } from "./config";
import { normRel } from "./platform";
import { splitRel } from "./relpath";

/** Carpetas fijadas ("pins"). Se guardan en la carpeta local de la app (pins.json). */
export type Pin = { id: string; routeId: string; rel: string; createdAt: number };
export type PinInfo = Pin & { name: string; routeName: string | null; parent: string };

const FILE = path.join(APP_DIR, "pins.json");

async function readPins(): Promise<Pin[]> {
  try {
    const data = JSON.parse(await fs.readFile(FILE, "utf8"));
    // Pins de versiones anteriores podían usar "\\": se normalizan a "/".
    return Array.isArray(data.pins) ? data.pins.map((p: Pin) => ({ ...p, rel: normRel(p.rel) })) : [];
  } catch {
    return [];
  }
}

async function writePins(pins: Pin[]) {
  await fs.mkdir(APP_DIR, { recursive: true });
  await fs.writeFile(`${FILE}.tmp`, JSON.stringify({ pins }, null, 2), "utf8");
  await fs.rename(`${FILE}.tmp`, FILE);
}

export async function listPins(): Promise<PinInfo[]> {
  const [pins, { routes }] = await Promise.all([readPins(), readConfig()]);
  return pins.map((p) => {
    const route = routes.find((r) => r.id === p.routeId) ?? null;
    const parts = splitRel(p.rel);
    return {
      ...p,
      name: parts.at(-1) ?? route?.name ?? "Carpeta",
      routeName: route?.name ?? null,
      parent: parts.slice(0, -1).join(" / "),
    };
  });
}

export async function addPin(routeId: string, rel: string) {
  rel = normRel(rel);
  const pins = await readPins();
  if (!pins.some((p) => p.routeId === routeId && p.rel === rel)) {
    pins.unshift({ id: newId(), routeId, rel, createdAt: Date.now() });
    await writePins(pins);
  }
}

export async function removePin(match: { id?: string; routeId?: string; rel?: string }) {
  const pins = await readPins();
  const rel = match.rel != null ? normRel(match.rel) : undefined;
  await writePins(pins.filter((p) => !(p.id === match.id || (p.routeId === match.routeId && p.rel === rel))));
}
