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

export const onRequest = defineMiddleware(async (context, next) => {
  const ua = context.request.headers.get("user-agent") ?? "";
  if (ua === "" || BOT_TONTOS.test(ua)) {
    return new Response("No disponible", { status: 403 });
  }
  return next();
});
