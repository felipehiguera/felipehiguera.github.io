/**
 * Proxy del portfolio: sirve `www.fhiguera.fyi/portafolio/*` desde el sitio
 * estático de GitHub Pages (`felipehiguera.github.io`), sin exponer ese
 * origen al público.
 *
 * Por qué existe: GitHub Pages no puede servir bajo un subpath. Astro compila
 * con `base: "/portafolio"`, así que todos los links y assets ya llevan el
 * prefijo; acá solo hay que sacarlo al pedir al origen y devolver tal cual.
 *
 * No toca `/api/*` (lo atiende el worker admin) ni la raíz `/` (el landing).
 */

const ORIGEN = "https://felipehiguera.github.io";
const PREFIJO = "/portafolio";

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // /portafolio exacto -> /portafolio/ (canonical con slash).
    if (url.pathname === PREFIJO) {
      url.pathname = `${PREFIJO}/`;
      return Response.redirect(url.toString(), 301);
    }

    if (!url.pathname.startsWith(`${PREFIJO}/`)) {
      return new Response("No encontrado", { status: 404 });
    }

    // Saca el prefijo: /portafolio/cv -> /cv. Query intacta.
    const destino = new URL(
      url.pathname.slice(PREFIJO.length) + url.search,
      ORIGEN,
    );

    const headers = new Headers(req.headers);
    headers.set("Host", destino.host);
    headers.set("X-Forwarded-Host", url.host);

    const respuesta = await fetch(
      new Request(destino.toString(), {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
        redirect: "manual",
      }),
    );

    // Reescribe redirects del origen para que no escapen al dominio crudo.
    const location = respuesta.headers.get("location");
    const salida = new Headers(respuesta.headers);
    if (location && location.startsWith(ORIGEN)) {
      salida.set("location", PREFIJO + location.slice(ORIGEN.length));
    }

    return new Response(respuesta.body, {
      status: respuesta.status,
      statusText: respuesta.statusText,
      headers: salida,
    });
  },
};