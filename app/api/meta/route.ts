import { resolveInsideRoot } from "@/lib/paths";
import { getMeta } from "@/lib/cache";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Datos técnicos de un archivo (duración, resolución, fps, códec). Solo lee la cabecera. */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const { full } = await resolveInsideRoot(sp.get("r"), sp.get("rel") ?? "");
    const { meta } = await getMeta(full, req.signal);
    return Response.json(meta);
  } catch (err) {
    return errorResponse(err);
  }
}
