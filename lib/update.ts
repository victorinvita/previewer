import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { IS_WIN } from "./platform";

/**
 * Actualizaciones desde GitHub. Solo se hace algo cuando el usuario pulsa el botón:
 * primero se consulta qué hay de nuevo y, si acepta, un script aparte detiene la app,
 * descarga la versión nueva, la compila y la vuelve a abrir (si algo falla, vuelve a la anterior).
 */
const ROOT = process.cwd();

function git(args: string[], timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("git", args, {
      cwd: ROOT,
      windowsHide: true,
      // Nunca pedir usuario o contraseña: si GitHub no responde, se informa y ya.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => p.kill(), timeoutMs);
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `git terminó con código ${code}`));
    });
  });
}

export type UpdateInfo = {
  supported: boolean;
  version: string | null;
  date: string | null;
  behind?: number;
  changes?: string[];
  dirty?: boolean;
  error?: string;
};

/** Versión instalada (sin conectarse a nada). */
export async function currentVersion(): Promise<UpdateInfo> {
  if (!existsSync(path.join(ROOT, ".git"))) return { supported: false, version: null, date: null };
  try {
    const [version, date] = (await git(["log", "-1", "--format=%h|%cI"])).split("|");
    return { supported: true, version, date };
  } catch {
    return { supported: false, version: null, date: null };
  }
}

/** Consulta en GitHub si hay una versión más nueva y qué cambios trae. */
export async function checkUpdate(): Promise<UpdateInfo> {
  const cur = await currentVersion();
  if (!cur.supported) return { ...cur, error: "Esta copia no se instaló con el instalador; no se puede actualizar desde aquí." };
  try {
    await git(["fetch", "--quiet", "origin", "main"], 60000);
  } catch {
    return { ...cur, error: "No pude conectar con GitHub. Revisa la conexión a internet." };
  }
  const behind = Number(await git(["rev-list", "--count", "HEAD..origin/main"])) || 0;
  const changes = behind ? (await git(["log", "--format=%s", "-n", "15", "HEAD..origin/main"])).split("\n").filter(Boolean) : [];
  const dirty = !!(await git(["status", "--porcelain", "--untracked-files=no"]));
  return { ...cur, behind, changes, dirty };
}

/** Lanza el script de actualización en un proceso aparte (este servidor se detendrá y volverá a arrancar). */
export function startUpdate() {
  // En Windows se lanza con wscript (update.vbs): así PowerShell tiene su propia consola oculta
  // y no se cierra cuando este servidor se detiene.
  const child = IS_WIN
    ? spawn("wscript.exe", [path.join(ROOT, "launcher", "update.vbs")], { cwd: ROOT, detached: true, stdio: "ignore" })
    : spawn("/bin/bash", [path.join(ROOT, "launcher", "mac", "update.sh"), "--no-open"], { cwd: ROOT, detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}
