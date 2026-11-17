import { listMedia } from "@/lib/walk";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export type { ListItem } from "@/lib/walk";

/** Lista videos, imágenes y audios de una o varias carpetas (nombre, tamaño, fecha). No abre los archivos. */
export async function POST(req: Request) {
  try {
    const { r, rels, recursive } = (await req.json()) as { r?: string; rels?: string[]; recursive?: boolean };
    if (!Array.isArray(rels) || !rels.length) return Response.json({ error: "Elige al menos una carpeta." }, { status: 400 });
    const { items, truncated } = await listMedia(r, rels, !!recursive, req.signal);
    // La ruta completa no hace falta en el navegador.
    return Response.json({ items: items.map(({ full: _full, ...rest }) => rest), truncated });
  } catch (err) {
    return errorResponse(err);
  }
}
