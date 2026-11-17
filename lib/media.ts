export type Kind = "video" | "image" | "audio" | "folder" | "other";

const VIDEO = ["mp4", "mov", "m4v", "mxf", "avi", "mkv", "webm", "mts", "m2ts", "wmv", "mpg", "mpeg", "3gp", "braw", "r3d"];
const IMAGE = ["jpg", "jpeg", "png", "webp", "gif", "tif", "tiff", "bmp", "heic", "heif", "psd", "dng", "cr2", "cr3", "arw", "nef", "avif"];
const AUDIO = ["wav", "mp3", "aac", "m4a", "flac", "ogg", "aif", "aiff", "wma", "opus"];

export function kindOf(name: string): Kind {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (VIDEO.includes(ext)) return "video";
  if (IMAGE.includes(ext)) return "image";
  if (AUDIO.includes(ext)) return "audio";
  return "other";
}

// Carpetas de sistema que nunca vale la pena recorrer.
export const SKIP_DIRS = new Set(["$RECYCLE.BIN", "System Volume Information", ".Trash", ".Trashes"]);
