import { promises as fs } from "node:fs";
import path from "node:path";
import { getMeta } from "./cache";
import { makePoster, makeSprite, makeWaveform } from "./ffmpeg";
import { HttpError } from "./paths";
import { once, shared, type Semaphore } from "./queue";

const exists = (p: string) => fs.stat(p).then(() => true, () => false);

/**
 * Miniatura principal (o forma de onda si es audio). Si ya existe en la caché local, no lee nada.
 * Devuelve la ruta del archivo generado.
 */
export async function ensurePoster(full: string, signal?: AbortSignal, sem: Semaphore = shared.poster): Promise<string> {
  const { meta, dir, key } = await getMeta(full, signal);
  if (meta.failed) throw new HttpError(415, "Formato no compatible para vista previa.");
  if (meta.kind === "audio") {
    const out = path.join(dir, "wave.png");
    if (!(await exists(out))) await once(`${key}:wave`, () => sem.run(() => makeWaveform(full, out), signal));
    return out;
  }
  const out = path.join(dir, "poster.jpg");
  if (!(await exists(out))) {
    await once(`${key}:poster`, () =>
      sem.run(() => makePoster(full, out, { isImage: meta.kind === "image", duration: meta.duration ?? 0, grid: meta.grid }), signal),
    );
  }
  return out;
}

/** Cuadrícula de fotogramas para recorrer el video. Si ya existe en la caché local, no lee nada. */
export async function ensureSprite(full: string, sem: Semaphore = shared.sprite): Promise<string> {
  const { meta, dir, key } = await getMeta(full);
  if (meta.failed) throw new HttpError(415, "Formato no compatible para vista previa.");
  if (meta.kind !== "video" || !meta.sprite) throw new HttpError(404, "Sin fotogramas.");
  const out = path.join(dir, "sprite.jpg");
  if (!(await exists(out))) await once(`${key}:sprite`, () => sem.run(() => makeSprite(full, out, meta.sprite!)));
  return out;
}

export async function hasSprite(full: string) {
  const { dir } = await getMeta(full);
  return exists(path.join(dir, "sprite.jpg"));
}
