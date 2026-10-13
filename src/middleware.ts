import { defineMiddleware } from "astro:middleware";

/**
 * Filtro de scrapers en el edge.
 *
 * No es un rate limiter (eso vive en el dashboard: Bot Fight Mode + regla
 * WAF): esto corta los bots tontos que se anuncian solos. Solo mira el
 * User-Agent y deja pasar todo lo demás, incluidos Googlebot/Bing (SEO) y
 * navegadores reales. Barato: corre antes de tocar D1.
 */
const BOT_TONTOS =
  /^(curl|wget|python-requests|python-urllib|scrapy|go-http-client|libwww|php\/|perl|axios\/|httpclient|okhttp\/[0-3]\.)/i;

/**
 * TTL del caché edge en segundos. Las ediciones del panel se ven como
 * máximo este tiempo después: equilibrio entre velocidad y frescura.
 */
const TTL_EDGE = 60;

const esCacheable = (req: Request): boolean => {
  if (req.method !== "GET") return false;
  const { pathname } = new URL(req.url);
  // El admin nunca se cachea (contenido por sesión) ni la API.
  return !pathname.includes("/admin");
};

type Ctx = { waitUntil?: (p: Promise<unknown>) => void };

function ctxDe(locals: unknown): Ctx | undefined {
  const runtime = (locals as { runtime?: { ctx?: unknown } }).runtime;
  if (runtime && typeof runtime.ctx === "object" && runtime.ctx !== null) {
    return runtime.ctx as Ctx;
  }
  return undefined;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const ua = context.request.headers.get("user-agent") ?? "";
  if (ua === "" || BOT_TONTOS.test(ua)) {
    return new Response("No disponible", { status: 403 });
  }

  // Sin caché para lo no cacheable: pasa directo.
  if (!esCacheable(context.request)) return next();

  const cache = caches.default;
  const cached = await cache.match(context.request);
  if (cached) {
    const vence = Number(cached.headers.get("X-Cache-Expires") ?? 0);
    if (vence > Date.now()) {
      const headers = new Headers(cached.headers);
      headers.set("X-Cache", "HIT");
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    // Expirado: se sigue y se regenera abajo.
    await cache.delete(context.request);
  }

  const res = await next();
  const tipo = res.headers.get("content-type") ?? "";
  if (res.ok && tipo.includes("text/html")) {
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", `public, max-age=30, s-maxage=${TTL_EDGE}`);
    headers.set("X-Cache", "MISS");
    headers.set("X-Cache-Expires", String(Date.now() + TTL_EDGE * 1000));
    const guardar = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
    // Guardar sin frenar la respuesta. Sin ctx (dev), se espera igual.
    const tarea = cache.put(context.request, guardar.clone());
    const ctx = ctxDe(context.locals);
    if (ctx?.waitUntil) ctx.waitUntil(tarea);
    else await tarea;
    return guardar;
  }
  return res;
});
