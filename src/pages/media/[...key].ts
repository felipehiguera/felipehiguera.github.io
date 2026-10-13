import type { APIRoute } from "astro";
import { getBucket } from "../../db/portfolio";

/**
 * Sirve los binarios de R2 bajo /portafolio/media/<clave>.
 *
 * El panel sube portadas, planos y modelos a R2 y guarda esta URL en D1.
 * Cache largo: las claves llevan slug + nombre, y al reemplazar un archivo
 * cambia la clave (el panel no sobrescribe).
 */
export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? "";
  if (!key || key.includes("..") || key.startsWith("/")) {
    return new Response("No encontrado", { status: 404 });
  }

  const obj = await getBucket().get(key);
  if (!obj) {
    return new Response("No encontrado", { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType ?? "application/octet-stream",
  );
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
};
