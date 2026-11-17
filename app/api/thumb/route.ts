import { promises as fs } from "node:fs";
import { resolveInsideRoot, HttpError } from "@/lib/paths";
import { cachedFile } from "@/lib/cache";
import { ensurePoster, ensureSprite } from "@/lib/generate";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * type=poster → miniatura principal (o forma de onda si es audio)
 * type=sprite → cuadrícula de fotogramas para recorrer el video con el cursor
 * cached=1    → solo devuelve lo que ya existe en la caché local; nunca genera ni lee el archivo.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { full } = await resolveInsideRoot(url.searchParams.get("r"), url.searchParams.get("rel") ?? "");
    const type = url.searchParams.get("type") === "sprite" ? "sprite" : "poster";

    let out: string | null;
    if (url.searchParams.get("cached") === "1") {
      out = await cachedFile(full, type);
      if (!out) throw new HttpError(404, "Aún no generada.");
    } else {
      out = type === "sprite" ? await ensureSprite(full) : await ensurePoster(full, req.signal);
    }

    const body = await fs.readFile(/*turbopackIgnore: true*/ out);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": out.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
