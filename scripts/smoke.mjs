// Prueba de humo: arranca Previewer y comprueba que lo esencial funciona en este sistema.
// La usa GitHub Actions en Windows y en Mac. Requiere haber compilado antes (npm run build).
//   node scripts/smoke.mjs
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 47999; // distinto al de uso normal para no chocar
const BASE = `http://127.0.0.1:${PORT}`;
const IS_WIN = process.platform === "win32";
const tmp = mkdtempSync(path.join(os.tmpdir(), "previewer-smoke-"));
const dataDir = path.join(tmp, "data");
const media = path.join(tmp, "Media Root");
const sub = path.join(media, "Cliente Uno", "Toma 01");
mkdirSync(sub, { recursive: true });

function ffmpegPath() {
  const exe = IS_WIN ? "ffmpeg.exe" : "ffmpeg";
  const local = path.join("node_modules", "ffmpeg-static", exe);
  return existsSync(local) ? local : "ffmpeg";
}

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.arrayBuffer();
  return { status: res.status, type, data };
}

console.log(`Sistema: ${process.platform} ${process.arch} · Node ${process.version}`);
console.log("Creando archivos de prueba…");
const ff = ffmpegPath();
execFileSync(ff, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30", "-t", "6", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(sub, "clip_vertical.mp4")]);
execFileSync(ff, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1600x900", "-frames:v", "1", path.join(sub, "foto.jpg")]);
execFileSync(ff, ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", path.join(sub, "voz.wav")]);

console.log("Arrancando servidor…");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(PORT)], {
  env: { ...process.env, PREVIEWER_DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

try {
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try {
      up = (await fetch(`${BASE}/api/routes`)).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!up) throw new Error("El servidor no arrancó");
  ok("servidor en marcha");

  // Rutas
  const created = await api("POST", "/api/routes", { name: "Prueba", path: media });
  check(created.status === 200 && created.data.created, "crear ruta");
  const r = created.data.created;

  // Árbol: rutas relativas con "/" en todos los sistemas
  const t1 = await api("GET", `/api/tree?r=${r}&rel=`);
  check(t1.data.dirs?.[0]?.rel === "Cliente Uno", "árbol: primer nivel");
  const folder = "Cliente Uno/Toma 01";
  const t2 = await api("GET", `/api/tree?r=${r}&rel=${encodeURIComponent(folder)}&stat=1`);
  const names = (t2.data.files ?? []).map((f) => f.rel);
  check(names.includes(`${folder}/clip_vertical.mp4`), `árbol: archivos con "/" (${names.join(", ")})`);

  // Búsqueda
  const s = await fetch(`${BASE}/api/search?r=${r}&q=clip&scope=media`).then((x) => x.text());
  check(s.includes(`"rel":"${folder}/clip_vertical.mp4"`), "búsqueda");

  // Nada generado todavía
  const c0 = await api("GET", `/api/cached?r=${r}&rel=${encodeURIComponent(folder)}`);
  check(Object.values(c0.data.items ?? {}).every((x) => !x.poster), "al abrir no se genera nada");
  const none = await api("GET", `/api/thumb?type=poster&cached=1&r=${r}&rel=${encodeURIComponent(`${folder}/clip_vertical.mp4`)}`);
  check(none.status === 404, "miniatura no generada → 404 (sin leer el archivo)");

  // Datos técnicos (ffprobe)
  const clip = encodeURIComponent(`${folder}/clip_vertical.mp4`);
  const meta = await api("GET", `/api/meta?r=${r}&rel=${clip}`);
  check(meta.data.width === 1080 && meta.data.height === 1920 && Math.round(meta.data.duration) === 6, `ffprobe: ${meta.data.width}x${meta.data.height}, ${meta.data.duration}s`);
  check(meta.data.sprite?.count === 18, `plan de fotogramas: ${meta.data.sprite?.count} (3 por segundo)`);

  // Generar en segundo plano toda la carpeta
  const job = await api("POST", "/api/jobs", { r, rels: [folder], recursive: false });
  check(job.status === 200 && job.data.job?.total === 3, "trabajo creado (3 archivos)");
  let status = "";
  for (let i = 0; i < 120; i++) {
    const j = await api("GET", "/api/jobs");
    status = j.data.jobs?.[0]?.status;
    if (status === "done" || status === "canceled") break;
    await new Promise((res) => setTimeout(res, 1000));
  }
  check(status === "done", `trabajo terminado (${status})`);

  const c1 = await api("GET", `/api/cached?r=${r}&rel=${encodeURIComponent(folder)}`);
  const st = c1.data.items?.[`${folder}/clip_vertical.mp4`];
  check(st?.poster && st?.sprite, "video: miniatura y fotogramas generados");
  check(c1.data.items?.[`${folder}/foto.jpg`]?.poster, "imagen: miniatura generada");
  check(c1.data.items?.[`${folder}/voz.wav`]?.poster, "audio: forma de onda generada");

  const sprite = await api("GET", `/api/thumb?type=sprite&cached=1&r=${r}&rel=${clip}`);
  check(sprite.status === 200 && sprite.type.includes("image/jpeg") && sprite.data.byteLength > 1000, `fotogramas servidos (${sprite.data.byteLength} bytes)`);

  // Pins
  await api("POST", "/api/pins", { r, rel: folder });
  const pins = await api("GET", "/api/pins");
  check(pins.data.pins?.[0]?.rel === folder && pins.data.pins?.[0]?.name === "Toma 01", "pins");

  // Seguridad: no se puede salir de la ruta
  const escape = await api("GET", `/api/tree?r=${r}&rel=${encodeURIComponent("../..")}`);
  check(escape.status === 403, "bloquea rutas fuera de la carpeta");

  // Páginas
  for (const p of ["/", "/browse", "/routes"]) {
    const res = await fetch(BASE + p);
    check(res.ok, `página ${p}`);
  }
} catch (err) {
  fail(String(err));
} finally {
  server.kill();
}

if (failures) {
  console.log(`\n${failures} prueba(s) fallaron. Registro del servidor:\n${serverLog.slice(-4000)}`);
  process.exit(1);
}
console.log("\nTodo bien ✓");
process.exit(0);
