import { checkUpdate, currentVersion, startUpdate } from "@/lib/update";

export const dynamic = "force-dynamic";

/** GET: versión instalada. GET ?check=1: además consulta GitHub (solo cuando el usuario lo pide). */
export async function GET(req: Request) {
  const check = new URL(req.url).searchParams.get("check") === "1";
  return Response.json(check ? await checkUpdate() : await currentVersion());
}

/** POST: actualiza a la última versión. La app se reinicia sola. */
export async function POST() {
  const info = await checkUpdate();
  if (info.error) return Response.json({ error: info.error }, { status: 409 });
  if (info.dirty) return Response.json({ error: "Hay cambios locales en el código; no actualizo para no perderlos." }, { status: 409 });
  if (!info.behind) return Response.json({ error: "Ya tienes la última versión." }, { status: 409 });
  startUpdate();
  return Response.json({ ok: true, from: info.version });
}
