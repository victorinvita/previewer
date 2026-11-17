export function errorResponse(err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  if (typeof e?.status === "number") return Response.json({ error: e.message }, { status: e.status });
  if (e?.code === "ENOENT") return Response.json({ error: "No existe esa ruta." }, { status: 404 });
  if (e?.code === "EPERM" || e?.code === "EACCES") return Response.json({ error: "Sin permiso de lectura." }, { status: 403 });
  if (e?.message === "aborted") return new Response(null, { status: 499 });
  return Response.json({ error: e?.message ?? "Error inesperado." }, { status: 500 });
}
