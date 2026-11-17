import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bin } from "./platform";

export const FRAME_HEIGHT = 180; // alto de cada fotograma del recorrido (px)
export const POSTER_HEIGHT = 360; // alto de la miniatura principal (px)
export const MAX_FRAMES = 300;
const SPRITE_COLS = 10;
const SEEK_WORKERS = 3;

export type Probe = {
  duration: number;
  width: number;
  height: number;
  fps: number | null;
  codec: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Foto partida en mosaicos (HEIC/AVIF del iPhone): ffmpeg la recompone como un grupo de streams. */
  grid?: boolean;
};

export type SpritePlan = {
  count: number;
  cols: number;
  rows: number;
  step: number; // segundos entre fotogramas
  mode: "decode" | "seek";
};

/**
 * Regla de fotogramas para el recorrido con el cursor: 3 por segundo, con un máximo de 300.
 * Un clip de hasta 100 s tiene 3 por segundo; uno más largo tiene 300 repartidos a lo largo del clip.
 * (Medido con material real: 3 por segundo cuesta lo mismo que 1, porque el clip se lee entero igual.
 * El máximo de 300 evita que cada cuadrícula ocupe demasiada memoria en el navegador.)
 *
 * Cómo se leen: los clips de cámara/móvil suelen tener un keyframe cada ~8 s, así que saltar de
 * keyframe en keyframe daría fotogramas repetidos. Por eso se lee el clip de una pasada ("decode").
 * Solo cuando los fotogramas quedan a 10 s o más (clips de ~50 min o más) se salta entre keyframes
 * ("seek"), que lee una fracción pequeña del archivo.
 */
export function spritePlan(duration: number): SpritePlan | null {
  if (!(duration > 0)) return null;
  const count = Math.max(1, Math.min(MAX_FRAMES, Math.round(duration * 3)));
  const cols = Math.min(SPRITE_COLS, count);
  return {
    count,
    cols,
    rows: Math.ceil(count / cols),
    step: duration / count,
    mode: duration / count >= 10 ? "seek" : "decode",
  };
}

function run(bin: string, args: string[], capture = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true, stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    let out = "";
    let err = "";
    p.stdout?.on("data", (d) => (out += d));
    p.stderr?.on("data", (d) => {
      if (err.length < 4000) err += d;
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `${bin} terminó con código ${code}`))));
  });
}

/** Lee solo la cabecera del archivo (duración, resolución, códec). */
export async function probe(file: string): Promise<Probe> {
  const base = ["-v", "error", "-print_format", "json", "-show_format", "-show_streams"];
  // "-show_stream_groups" solo existe desde ffmpeg 7.1; si el ffprobe es más antiguo, se repite sin él.
  const json = await run(bin("ffprobe"), [...base, "-show_stream_groups", file], true).catch(() => run(bin("ffprobe"), [...base, file], true));
  type Stream = {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    r_frame_rate?: string;
    duration?: string;
    disposition?: { attached_pic?: number };
    tags?: { rotate?: string };
    side_data_list?: { rotation?: number }[];
  };
  type Group = {
    type?: string;
    components?: { width?: number; height?: number; side_data_list?: { rotation?: number }[] }[];
  };
  const data = JSON.parse(json) as { streams?: Stream[]; stream_groups?: Group[]; format?: { duration?: string } };
  const grid = data.stream_groups?.find((g) => g.type === "Tile Grid")?.components?.[0];
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === "audio");

  let width = grid?.width ?? v?.width ?? 0;
  let height = grid?.height ?? v?.height ?? 0;
  const rotation = Number(
    (grid ?? v)?.side_data_list?.find((x) => x.rotation != null)?.rotation ?? v?.tags?.rotate ?? 0,
  );
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];

  const rate = (r?: string) => {
    if (!r) return null;
    const [n, d] = r.split("/").map(Number);
    return d ? n / d : n || null;
  };
  const fps = rate(v?.avg_frame_rate) || rate(v?.r_frame_rate);

  return {
    duration: parseFloat(data.format?.duration ?? v?.duration ?? "0") || 0,
    width,
    height,
    fps: fps && fps < 1000 ? Math.round(fps * 100) / 100 : null,
    codec: v?.codec_name ?? a?.codec_name ?? null,
    hasVideo: !!v,
    hasAudio: !!a,
    ...(grid ? { grid: true, fps: null, duration: 0 } : {}),
  };
}

async function writeAtomic(out: string, make: (tmp: string) => Promise<void>) {
  const tmp = out.replace(/(\.\w+)$/, ".tmp$1");
  await make(tmp);
  await fs.rename(tmp, out);
}

/** Miniatura principal: un solo fotograma cerca del inicio (o la imagen reducida). */
export async function makePoster(file: string, out: string, opts: { isImage: boolean; duration: number; grid?: boolean }) {
  const seek = opts.isImage ? [] : ["-ss", String(Math.min(opts.duration * 0.1, 3)), "-noaccurate_seek"];
  const scale = `scale=-2:${POSTER_HEIGHT}`;
  // En una foto en mosaicos, ffmpeg ya une los trozos con su propio filtro: la reducción va encadenada a ese grupo.
  const filter = (grid: boolean) => (grid ? ["-filter_complex", `[0:g:0]${scale}[o]`, "-map", "[o]"] : ["-vf", scale]);
  const make = (grid: boolean) =>
    writeAtomic(out, (tmp) =>
      run(bin("ffmpeg"), ["-v", "error", "-y", ...seek, "-i", file, "-frames:v", "1", "-an", ...filter(grid), "-q:v", "4", tmp]).then(() => {}),
    );
  try {
    await make(!!opts.grid);
  } catch (err) {
    if (!opts.isImage || opts.grid || !/complex filtergraph/i.test((err as Error).message)) throw err;
    await make(true);
  }
}

/** Forma de onda para audios. */
export async function makeWaveform(file: string, out: string) {
  await writeAtomic(out, (tmp) =>
    run(bin("ffmpeg"), ["-v", "error", "-y", "-i", file, "-filter_complex", "showwavespic=s=800x240:colors=0xE56B3B", "-frames:v", "1", tmp]).then(() => {}),
  );
}

/** Genera una sola imagen (sprite) con todos los fotogramas del recorrido en cuadrícula. */
export async function makeSprite(file: string, out: string, plan: SpritePlan) {
  const tile = `tile=${plan.cols}x${plan.rows}`;
  const scale = `scale=-2:${FRAME_HEIGHT}`;

  if (plan.mode === "decode") {
    const fps = (1 / plan.step).toFixed(6);
    await writeAtomic(out, (tmp) =>
      run(bin("ffmpeg"), ["-v", "error", "-y", "-i", file, "-an", "-sn", "-dn", "-vf", `fps=${fps},${scale},${tile}`, "-frames:v", "1", "-q:v", "5", tmp]).then(() => {}),
    );
    return;
  }

  // Modo "seek": un salto por fotograma. ffmpeg va directo al keyframe más cercano
  // y solo lee ese trozo del archivo, no el video entero.
  const dir = `${out}.frames`;
  await fs.mkdir(dir, { recursive: true });
  try {
    const name = (i: number) => path.join(dir, `${String(i + 1).padStart(4, "0")}.jpg`);
    let next = 0;
    const worker = async () => {
      while (next < plan.count) {
        const i = next++;
        const t = Math.min((i + 0.5) * plan.step, plan.count * plan.step - 0.05);
        await run(bin("ffmpeg"), ["-v", "error", "-y", "-ss", t.toFixed(3), "-noaccurate_seek", "-i", file, "-frames:v", "1", "-an", "-vf", scale, "-q:v", "5", name(i)]).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: SEEK_WORKERS }, worker));

    // Si algún salto falló, se rellena con el fotograma vecino para no romper la cuadrícula.
    const ok: boolean[] = [];
    for (let i = 0; i < plan.count; i++) ok[i] = await fs.stat(name(i)).then(() => true, () => false);
    const firstOk = ok.indexOf(true);
    if (firstOk === -1) throw new Error("No se pudo extraer ningún fotograma.");
    let last = firstOk;
    for (let i = 0; i < plan.count; i++) {
      if (ok[i]) last = i;
      else await fs.copyFile(name(last), name(i));
    }

    await writeAtomic(out, (tmp) =>
      run(bin("ffmpeg"), ["-v", "error", "-y", "-framerate", "1", "-i", path.join(dir, "%04d.jpg"), "-vf", tile, "-frames:v", "1", "-q:v", "4", tmp]).then(() => {}),
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
