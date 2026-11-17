import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Todo lo que depende del sistema operativo vive aquí.
 * El resto de la app es igual en Windows y en Mac.
 */
export const IS_WIN = process.platform === "win32";
export const IS_MAC = process.platform === "darwin";

/** Carpeta local de la app (configuración, caché de miniaturas, trabajos). Nunca dentro de LucidLink. */
export const APP_DIR =
  process.env.PREVIEWER_DATA_DIR ??
  (IS_WIN
    ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Previewer")
    : IS_MAC
      ? path.join(os.homedir(), "Library", "Application Support", "Previewer")
      : path.join(os.homedir(), ".local", "share", "Previewer"));

/**
 * Las rutas relativas que viajan entre el servidor y el navegador siempre usan "/",
 * en los dos sistemas. (En Windows, una "\" heredada de versiones anteriores se convierte.)
 */
export function toRel(root: string, full: string) {
  const r = path.relative(root, full);
  return IS_WIN ? r.split(path.sep).join("/") : r;
}

export function normRel(rel: string) {
  return IS_WIN ? rel.replace(/\\/g, "/") : rel;
}

/** ffmpeg/ffprobe. En Mac, al abrir la app desde el Dock el PATH no incluye Homebrew, así que se busca ahí. */
const binCache = new Map<string, string>();
export function bin(name: "ffmpeg" | "ffprobe"): string {
  const hit = binCache.get(name);
  if (hit) return hit;
  let found: string = name;
  const dir = process.env.PREVIEWER_FFMPEG_DIR;
  const exe = IS_WIN ? `${name}.exe` : name;
  const modules = path.join(process.cwd(), "node_modules");
  const candidates = [
    ...(dir ? [path.join(dir, exe)] : []),
    // Instalado en el sistema (Homebrew en Mac).
    ...(IS_WIN ? [] : [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`]),
    // Incluido con la app (lo instala el instalador de Mac si no hay ffmpeg en el sistema).
    name === "ffmpeg"
      ? path.join(modules, "ffmpeg-static", exe)
      : path.join(modules, "ffprobe-static", "bin", process.platform, process.arch, exe),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      found = c;
      break;
    }
  }
  binCache.set(name, found);
  return found;
}

/**
 * Windows: si ya hay una ventana del Explorador en esa carpeta, la reutiliza; si no, abre una nueva.
 * Deja seleccionados todos los archivos pedidos (todos de la misma carpeta) y trae la ventana al frente
 * en vez de dejarla parpadeando en la barra.
 */
function revealScriptWin(fulls: string[]) {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return `
    $target = ${q(fulls[0])}
    $dir = (Split-Path $target -Parent).TrimEnd('\\')
    $leaves = @(${fulls.map((f) => q(path.basename(f))).join(", ")})
    Add-Type @"
using System; using System.Runtime.InteropServices;
public static class PvWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
}
"@
    function Front($h) {
      if ([PvWin]::IsIconic($h)) { [PvWin]::ShowWindow($h, 9) | Out-Null }
      # Un movimiento de ratón nulo permite a este proceso cambiar la ventana activa.
      [PvWin]::mouse_event(1, 0, 0, 0, [UIntPtr]::Zero)
      [PvWin]::SetForegroundWindow($h) | Out-Null
      [PvWin]::BringWindowToTop($h) | Out-Null
    }
    $sh = New-Object -ComObject Shell.Application
    function Find {
      foreach ($w in @($sh.Windows())) {
        try { if ($w.Document.Folder.Self.Path.TrimEnd('\\') -ieq $dir) { return $w } } catch {}
      }
      return $null
    }
    # Selecciona solo los pedidos (el primero quita la selección anterior y se enfoca). Devuelve si pudo.
    function SelectAll($w) {
      try {
        $first = $true
        foreach ($leaf in $leaves) {
          $item = $w.Document.Folder.ParseName($leaf)
          if (-not $item) { continue }
          $w.Document.SelectItem($item, $(if ($first) { 29 } else { 1 }))
          $first = $false
        }
        return -not $first
      } catch { return $false }
    }
    $w = Find
    if (-not $w) {
      Start-Process explorer.exe -ArgumentList ('/select,"' + $target + '"')
      for ($i = 0; $i -lt 60 -and -not $w; $i++) { Start-Sleep -Milliseconds 200; $w = Find }
      if (-not $w) { exit }
    }
    Front ([IntPtr]$w.HWND)
    # Una ventana recién abierta puede tardar un poco en tener la lista lista.
    for ($j = 0; $j -lt 15 -and -not (SelectAll $w); $j++) { Start-Sleep -Milliseconds 200 }
  `;
}

/** Abre el Finder con varios archivos seleccionados. */
function revealScriptMac(fulls: string[]) {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `set l to {${fulls.map((f) => `POSIX file "${esc(f)}" as alias`).join(", ")}}
tell application "Finder"
  reveal l
  select l
  activate
end tell`;
}

/**
 * Abre el gestor de archivos con los archivos seleccionados (Explorador o Finder).
 * Todos deben estar en la misma carpeta. Termina cuando la ventana ya está abierta.
 */
export function revealInFileManager(fulls: string[]): Promise<void> {
  return new Promise((resolve) => {
    const child = IS_WIN
      ? spawn(
          "powershell.exe",
          ["-NoProfile", "-STA", "-EncodedCommand", Buffer.from(revealScriptWin(fulls), "utf16le").toString("base64")],
          { windowsHide: true, stdio: "ignore" },
        )
      : IS_MAC
        ? fulls.length > 1
          ? spawn("osascript", ["-e", revealScriptMac(fulls)], { stdio: "ignore" })
          : // "open -R" ya reutiliza la ventana del Finder y lo trae al frente.
            spawn("open", ["-R", fulls[0]], { stdio: "ignore" })
        : spawn("xdg-open", [path.dirname(fulls[0])], { stdio: "ignore" });
    const done = () => resolve();
    child.on("error", done);
    child.on("close", done);
    setTimeout(done, 15000);
  });
}

function capture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = "";
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(out.trim()));
    p.on("error", () => resolve(""));
  });
}

/** Selector de carpetas nativo del sistema. Devuelve la carpeta elegida o null si se cancela. */
export async function pickFolder(initial?: string): Promise<string | null> {
  if (IS_WIN) {
    const start = initial ? `$d.SelectedPath = '${initial.replace(/'/g, "''")}';` : "";
    const script = `
      [Console]::OutputEncoding = [Text.Encoding]::UTF8
      Add-Type -AssemblyName System.Windows.Forms
      $d = New-Object System.Windows.Forms.FolderBrowserDialog
      $d.Description = 'Elige la carpeta para esta ruta de Previewer'
      $d.ShowNewFolderButton = $false
      ${start}
      $owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
      if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }
    `;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    return (await capture("powershell.exe", ["-NoProfile", "-STA", "-EncodedCommand", encoded])) || null;
  }
  if (IS_MAC) {
    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const from = initial && existsSync(initial) ? ` default location (POSIX file "${esc(initial)}")` : "";
    const script = `try
  set f to choose folder with prompt "Elige la carpeta para esta ruta de Previewer"${from}
  return POSIX path of f
on error
  return ""
end try`;
    const out = await capture("osascript", ["-e", 'tell application "System Events" to activate', "-e", script]);
    return out ? out.replace(/\/$/, "") || "/" : null;
  }
  return (await capture("zenity", ["--file-selection", "--directory"])) || null;
}
