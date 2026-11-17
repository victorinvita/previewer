export function fmtDuration(s: number | undefined | null) {
  if (s == null || !isFinite(s)) return "";
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function fmtSize(bytes: number) {
  if (!bytes) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

export function fmtDate(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

export function baseName(rel: string) {
  const i = rel.lastIndexOf("/");
  return i === -1 ? rel : rel.slice(i + 1);
}
