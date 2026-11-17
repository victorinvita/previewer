/** Limita cuántas tareas pesadas (ffmpeg) corren a la vez, para no saturar el PC ni la red. */
export class Semaphore {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire();
    try {
      // Si quien lo pidió ya se fue (p. ej. hiciste scroll), no gastamos lectura en LucidLink.
      if (signal?.aborted) throw new Error("aborted");
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire() {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) =>
      this.waiting.push(() => {
        this.active++;
        resolve();
      }),
    );
  }

  private release() {
    this.active--;
    this.waiting.shift()?.();
  }
}

type Shared = {
  probe: Semaphore;
  poster: Semaphore;
  sprite: Semaphore;
  job: Semaphore;
  inflight: Map<string, Promise<unknown>>;
};

// Un solo juego de colas para todo el servidor (aunque Next empaquete cada ruta por separado).
const g = globalThis as unknown as { __previewer?: Shared };
export const shared: Shared = (g.__previewer ??= {
  probe: new Semaphore(4),
  poster: new Semaphore(3),
  // 2 a la vez: mientras uno descarga de LucidLink, el otro usa la CPU.
  sprite: new Semaphore(2),
  // Trabajos en segundo plano ("Generar todo"): su propia cola para no frenar lo que miras.
  job: new Semaphore(2),
  inflight: new Map(),
});

/** Si dos peticiones piden lo mismo a la vez, se genera una sola vez. */
export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = shared.inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => shared.inflight.delete(key));
  shared.inflight.set(key, p);
  return p;
}
