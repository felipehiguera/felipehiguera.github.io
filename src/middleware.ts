import { defineMiddleware } from "astro:middleware";
import { getWaitUntil } from "./db/portfolio";

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

export const onRequest = defineMiddleware(async (context, next) => {
  const ua = context.request.headers.get("user-agent") ?? "";
  if (ua === "" || BOT_TONTOS.test(ua)) {
    return new Response("No disponible", { status: 403 });
  }

  const res = await next();

  // Headers de seguridad en toda respuesta del sitio. SAMEORIGIN (no DENY)
  // porque el modal de edición embebe /admin en iframe del mismo origen.
  // También sobre HIT de caché: el contenido ya salió de acá.
  const conSeguras = (r: Response, extras?: Record<string, string>): Response => {
    const headers = new Headers(r.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
    if (extras) {
      for (const [k, v] of Object.entries(extras)) headers.set(k, v);
    }
    return new Response(r.body, {
      status: r.status,
      statusText: r.statusText,
      headers,
    });
  };

  // Sin caché para lo no cacheable: pasa directo, con headers igual.
  if (!esCacheable(context.request)) return conSeguras(res);

  // Hard refresh (Ctrl+Shift+R) regenera: el navegador manda
  // `Cache-Control: no-cache` y eso invalida la entrada guardada. Así, tras
  // guardar en el panel, recargar muestra los cambios al tiro.
  const control = context.request.headers.get("cache-control") ?? "";
  const pragma = context.request.headers.get("pragma") ?? "";
  const fresco = /no-cache/.test(control) || /no-cache/.test(pragma);

  const cache = caches.default;
  if (!fresco) {
    const cached = await cache.match(context.request);
    if (cached) {
      const vence = Number(cached.headers.get("X-Cache-Expires") ?? 0);
      if (vence > Date.now()) {
        return conSeguras(cached, { "X-Cache": "HIT" });
      }
      // Expirado: se sigue y se regenera abajo.
      await cache.delete(context.request);
    }
  } else {
    await cache.delete(context.request);
  }

  const tipo = res.headers.get("content-type") ?? "";
  if (res.ok && tipo.includes("text/html")) {
    const guardar = conSeguras(res, {
      "Cache-Control": `public, max-age=30, s-maxage=${TTL_EDGE}`,
      "X-Cache": "MISS",
      "X-Cache-Expires": String(Date.now() + TTL_EDGE * 1000),
    });
    // Guardar sin frenar la respuesta. Sin ctx (dev), se espera igual.
    const tarea = cache.put(context.request, guardar.clone());
    const esperar = getWaitUntil(context.locals);
    if (esperar) esperar(tarea);
    else await tarea;
    return guardar;
  }
  return conSeguras(res);
});
