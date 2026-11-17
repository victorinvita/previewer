import { promises as fs } from "node:fs";
import path from "node:path";
import { APP_DIR } from "./config";
import type { Kind } from "./media";
import { ensurePoster, ensureSprite } from "./generate";
import { shared } from "./queue";

/**
 * Trabajos en segundo plano: "Generar todo" para una o varias carpetas.
 * Los ejecuta el servidor local, no la pestaña del navegador: siguen aunque cierres la pestaña.
 * La cola se guarda en %LOCALAPPDATA%\Previewer\jobs.json y se retoma sola al reiniciar el servidor.
 * Nada se copia: ffmpeg lee cada archivo a través de LucidLink y solo se guardan las miniaturas.
 */

export type JobStatus = "queued" | "running" | "paused" | "done" | "canceled";
type JobFile = { full: string; size: number; kind: Kind };

export type Job = {
  id: string;
  routeId: string;
  title: string;
  files: JobFile[];
  status: JobStatus;
  done: number;
  failed: number;
  doneBytes: number;
  totalBytes: number;
  createdAt: number;
  runStartedAt?: number;
  runStartBytes?: number;
  finishedAt?: number;
  current: string[];
  errors: string[];
};

export type JobSummary = Omit<Job, "files"> & { total: number };

const FILE = path.join(APP_DIR, "jobs.json");
const WORKERS = 2;
const KEEP_FINISHED = 15;

type State = { jobs: Job[]; loaded: Promise<void> | null; running: boolean; saveTimer?: ReturnType<typeof setTimeout> };
const g = globalThis as unknown as { __previewerJobs?: State };
const S: State = (g.__previewerJobs ??= { jobs: [], loaded: null, running: false });

function load() {
  S.loaded ??= (async () => {
    try {
      S.jobs = (JSON.parse(await fs.readFile(FILE, "utf8")).jobs ?? []) as Job[];
    } catch {
      S.jobs = [];
    }
    for (const j of S.jobs) {
      if (j.status === "running") j.status = "queued"; // el servidor se reinició a mitad
      j.current = [];
    }
  })();
  return S.loaded;
}

function save(now = false) {
  clearTimeout(S.saveTimer);
  const write = async () => {
    await fs.mkdir(APP_DIR, { recursive: true });
    await fs.writeFile(`${FILE}.tmp`, JSON.stringify({ jobs: S.jobs }), "utf8");
    await fs.rename(`${FILE}.tmp`, FILE);
  };
  if (now) return write().catch(() => {});
  S.saveTimer = setTimeout(() => write().catch(() => {}), 800);
}

export const summarize = (j: Job): JobSummary => {
  const { files, ...rest } = j;
  return { ...rest, total: files.length, current: j.current.map((f) => path.basename(f)) };
};

export async function listJobs(): Promise<JobSummary[]> {
  await load();
  return S.jobs.map(summarize).reverse();
}

export async function createJob(routeId: string, title: string, files: JobFile[]): Promise<JobSummary> {
  await load();
  // Videos primero: son los que más tardan y los que más se recorren.
  const order: Record<Kind, number> = { video: 0, image: 1, audio: 2, folder: 3, other: 4 };
  files.sort((a, b) => order[a.kind] - order[b.kind]);
  const job: Job = {
    id: Math.random().toString(36).slice(2, 10),
    routeId,
    title,
    files,
    status: "queued",
    done: 0,
    failed: 0,
    doneBytes: 0,
    totalBytes: files.reduce((s, f) => s + f.size, 0),
    createdAt: Date.now(),
    current: [],
    errors: [],
  };
  S.jobs.push(job);
  // Se guardan solo los últimos trabajos terminados.
  const finished = S.jobs.filter((j) => j.status === "done" || j.status === "canceled");
  if (finished.length > KEEP_FINISHED) {
    const drop = new Set(finished.slice(0, finished.length - KEEP_FINISHED).map((j) => j.id));
    S.jobs = S.jobs.filter((j) => !drop.has(j.id));
  }
  await save(true);
  void runLoop();
  return summarize(job);
}

export async function controlJob(id: string, action: "pause" | "resume" | "cancel"): Promise<boolean> {
  await load();
  const job = S.jobs.find((j) => j.id === id);
  if (!job) return false;
  if (action === "pause" && (job.status === "running" || job.status === "queued")) job.status = "paused";
  if (action === "resume" && job.status === "paused") job.status = "queued";
  if (action === "cancel" && job.status !== "done") job.status = "canceled";
  await save(true);
  void runLoop();
  return true;
}

export async function clearFinished() {
  await load();
  S.jobs = S.jobs.filter((j) => j.status !== "done" && j.status !== "canceled");
  await save(true);
}

/** Se llama al arrancar el servidor: retoma lo que quedó pendiente. */
export async function resumeJobs() {
  await load();
  void runLoop();
}

async function runLoop() {
  if (S.running) return;
  S.running = true;
  try {
    for (;;) {
      const job = S.jobs.find((j) => j.status === "queued");
      if (!job) break;
      await runJob(job);
    }
  } finally {
    S.running = false;
  }
}

async function runJob(job: Job) {
  job.status = "running";
  // Al retomar se vuelve a contar desde cero: lo ya generado se salta al instante (está en caché).
  job.done = 0;
  job.failed = 0;
  job.doneBytes = 0;
  job.errors = [];
  job.current = [];
  job.runStartedAt = Date.now();
  job.runStartBytes = 0;
  save();

  let cursor = 0;
  const worker = async () => {
    while (job.status === "running" && cursor < job.files.length) {
      const f = job.files[cursor++];
      job.current.push(f.full);
      const t0 = Date.now();
      try {
        await ensurePoster(f.full, undefined, shared.job);
        if (f.kind === "video") await ensureSprite(f.full, shared.job);
      } catch (err) {
        job.failed++;
        if (job.errors.length < 20) job.errors.push(`${path.basename(f.full)}: ${(err as Error).message.split("\n")[0]}`);
      } finally {
        job.current = job.current.filter((x) => x !== f.full);
        job.done++;
        job.doneBytes += f.size;
        // Lo que ya estaba en caché (menos de 1 s) no cuenta para estimar el tiempo restante.
        if (Date.now() - t0 < 1000) job.runStartBytes = (job.runStartBytes ?? 0) + f.size;
        save();
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));

  if (job.status === "running") {
    job.status = "done";
    job.finishedAt = Date.now();
  }
  await save(true);
}
