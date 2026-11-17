import { pickFolder } from "@/lib/platform";

export const dynamic = "force-dynamic";

/** Abre el selector de carpetas nativo (Windows o Mac) y devuelve la carpeta elegida. */
export async function POST(req: Request) {
  const { initial } = (await req.json().catch(() => ({}))) as { initial?: string };
  const picked = await pickFolder(typeof initial === "string" && initial ? initial : undefined);
  return Response.json({ path: picked });
}
