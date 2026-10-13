/**
 * Sitemap dinámico: sale de D1, no del build. Con SSR los slugs no se
 * conocen al compilar, así que @astrojs/sitemap no sirve acá.
 */
import { getDB, listarProyectos } from "../db/portfolio";

export const prerender = false;

const ESTATICAS = ["", "proyectos", "cv", "soporte-it"];

export async function GET({ locals, site }: { locals: unknown; site?: URL }) {
  const base = site?.toString().replace(/\/$/, "") ?? "https://www.fhiguera.fyi";
  const prefijo = `${base}/portafolio`;

  let slugs: string[] = [];
  try {
    const proyectos = await listarProyectos(getDB(locals));
    slugs = proyectos.map((p) => p.slug);
  } catch {
    // Sin D1 (dev sin sembrar): sitemap solo con estáticas.
    slugs = [];
  }

  const urls = [
    ...ESTATICAS.map((p) => `${prefijo}/${p}`),
    ...slugs.map((s) => `${prefijo}/proyectos/${s}`),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
