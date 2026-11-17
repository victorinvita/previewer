import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { APP_DIR } from "./config";
import { kindOf, type Kind } from "./media";
import { probe, spritePlan, type Probe, type SpritePlan } from "./ffmpeg";
import { once, shared } from "./queue";

export const CACHE_DIR = path.join(APP_DIR, "cache");

export type Meta = Partial<Probe> & {
  kind: Kind;
  size: number;
  mtime: number;
  failed?: boolean;
  sprite: SpritePlan | null;
  /** Versión de la lectura. Las fotos leídas antes de la 2 tenían mal el tamaño de las HEIC en mosaicos. */
  v?: number;
};

const META_VERSION = 2;

/** Dónde estaría la caché local de un archivo. Cambia si el archivo cambia (tamaño o fecha). */
export function cacheDirOf(full: string, size: number, mtime: number) {
  const key = createHash("sha1").update(`${full.toLowerCase()}|${size}|${mtime}`).digest("hex").slice(0, 24);
  return { key, dir: path.join(CACHE_DIR, key.slice(0, 2), key) };
}

export async function cacheFor(full: string) {
  const st = await fs.stat(full);
  const { key, dir } = cacheDirOf(full, st.size, st.mtimeMs);
  await fs.mkdir(dir, { recursive: true });
  return { dir, key, size: st.size, mtime: st.mtimeMs };
}

export type CachedStatus = { poster: boolean; sprite: boolean; meta: Meta | null };

const exists = (p: string) => fs.stat(p).then(() => true, () => false);

/** Qué hay ya generado para un archivo. Solo mira la caché local; no lee el archivo. */
export async function cachedStatus(full: string, size: number, mtime: number): Promise<CachedStatus> {
  const { dir } = cacheDirOf(full, size, mtime);
  const [poster, wave, sprite, meta] = await Promise.all([
    exists(path.join(dir, "poster.jpg")),
    exists(path.join(dir, "wave.png")),
    exists(path.join(dir, "sprite.jpg")),
    fs.readFile(path.join(dir, "meta.json"), "utf8").then((t) => JSON.parse(t) as Meta, () => null),
  ]);
  return { poster: poster || wave, sprite, meta };
}

/** Ruta de una imagen ya generada, o null si no existe (no genera nada). */
export async function cachedFile(full: string, type: "poster" | "sprite"): Promise<string | null> {
  const st = await fs.stat(full);
  const { dir } = cacheDirOf(full, st.size, st.mtimeMs);
  const names = type === "sprite" ? ["sprite.jpg"] : ["poster.jpg", "wave.png"];
  for (const n of names) if (await exists(path.join(dir, n))) return path.join(dir, n);
  return null;
}

export async function getMeta(full: string, signal?: AbortSignal): Promise<{ meta: Meta; dir: string; key: string }> {
  const { dir, key, size, mtime } = await cacheFor(full);
  const file = path.join(dir, "meta.json");
  try {
    const cached = JSON.parse(await fs.readFile(file, "utf8")) as Meta;
    if (cached.kind !== "image" || (cached.v ?? 1) >= META_VERSION) return { meta: cached, dir, key };
  } catch {}

  const kind = kindOf(full);
  const meta = await once(`${key}:meta`, async (): Promise<Meta> => {
    try {
      const info = await shared.probe.run(() => probe(full), signal);
      return { kind, size, mtime, v: META_VERSION, ...info, sprite: kind === "video" ? spritePlan(info.duration) : null };
    } catch (err) {
      if ((err as Error).message === "aborted") throw err;
      return { kind, size, mtime, v: META_VERSION, failed: true, sprite: null };
    }
  });
  await fs.writeFile(file, JSON.stringify(meta), "utf8");
  return { meta, dir, key };
}
