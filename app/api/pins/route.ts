import { addPin, listPins, removePin } from "@/lib/pins";
import { resolveInsideRoot } from "@/lib/paths";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ pins: await listPins() });
}

/** Fija una carpeta: { r, rel } */
export async function POST(req: Request) {
  try {
    const { r, rel } = (await req.json()) as { r?: string; rel?: string };
    const { route } = await resolveInsideRoot(r, rel ?? "");
    await addPin(route.id, rel ?? "");
    return Response.json({ pins: await listPins() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Quita un pin: ?id=… o ?r=…&rel=… */
export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams;
  await removePin({ id: sp.get("id") ?? undefined, routeId: sp.get("r") ?? undefined, rel: sp.get("rel") ?? undefined });
  return Response.json({ pins: await listPins() });
}
