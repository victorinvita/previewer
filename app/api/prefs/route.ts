import { promises as fs } from "node:fs";
import path from "node:path";
import { APP_DIR } from "@/lib/config";

export const dynamic = "force-dynamic";

// Preferencias de vista guardadas en este PC (no en el navegador): %LOCALAPPDATA%\Previewer\view-prefs.json
const FILE = path.join(APP_DIR, "view-prefs.json");

async function read(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function GET() {
  return Response.json(await read());
}

export async function PUT(req: Request) {
  const patch = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || JSON.stringify(patch).length > 4000) {
    return Response.json({ error: "Preferencias no válidas." }, { status: 400 });
  }
  const next = { ...(await read()), ...patch };
  await fs.mkdir(APP_DIR, { recursive: true });
  await fs.writeFile(`${FILE}.tmp`, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(`${FILE}.tmp`, FILE);
  return Response.json(next);
}
