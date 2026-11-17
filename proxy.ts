import { NextResponse, type NextRequest } from "next/server";

/**
 * Seguridad: la app solo escucha en este equipo (127.0.0.1), pero el navegador podría ser usado por
 * una página web maliciosa para hablar con ella. Este filtro corre antes de cada petición y bloquea:
 * - Dominios disfrazados de este equipo ("DNS rebinding"): solo se aceptan 127.0.0.1, localhost o [::1].
 * - Peticiones enviadas desde otras webs (CSRF): la API solo responde a la propia app.
 * Los scripts locales (generar-carpeta, pruebas) no envían cabeceras de navegador y siguen funcionando.
 */
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

function isLocalOrigin(origin: string) {
  try {
    const u = new URL(origin);
    return u.protocol === "http:" && LOCAL_HOST.test(u.host);
  } catch {
    return false;
  }
}

const deny = (why: string) =>
  new NextResponse(JSON.stringify({ error: `Bloqueado por seguridad: ${why}` }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });

export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (!LOCAL_HOST.test(host)) return deny("dirección no permitida.");

  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");

  if (isApi) {
    // Los navegadores marcan si la petición viene de otra web; la API solo acepta la propia app.
    if (site && site !== "same-origin" && site !== "none") return deny("petición desde otra web.");
    if (origin && !isLocalOrigin(origin)) return deny("petición desde otra web.");
  } else if (req.method !== "GET" && req.method !== "HEAD" && origin && !isLocalOrigin(origin)) {
    return deny("petición desde otra web.");
  }

  const res = NextResponse.next();
  // Ninguna web puede incrustar la app dentro de un marco (evita clics engañosos).
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const config = {
  matcher: "/:path*",
};
