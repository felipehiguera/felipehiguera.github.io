/**
 * Reordena `dist/` para el deploy en Cloudflare Pages bajo un solo host:
 *
 *   www.fhiguera.fyi/             -> landing/index.html
 *   www.fhiguera.fyi/portafolio/* -> todo lo que compiló Astro
 *
 * Astro con `base: "/portafolio"` ya genera las URLs con el prefijo, pero los
 * archivos salen planos en `dist/`. Acá se mueven bajo `dist/portafolio/`.
 * `robots.txt` y los sitemaps quedan TAMBIÉN en la raíz porque los crawlers
 * los buscan ahí (el sitemap lista URLs /portafolio/..., que es válido).
 *
 * Uso: `npm run build:pages`
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const SUB = join(DIST, "portafolio");

mkdirSync(SUB, { recursive: true });

for (const entry of readdirSync(DIST)) {
  if (entry === "portafolio") continue;
  renameSync(join(DIST, entry), join(SUB, entry));
}

cpSync(join("landing", "index.html"), join(DIST, "index.html"));

for (const entry of readdirSync(SUB)) {
  const esRobots = entry === "robots.txt";
  const esSitemap = entry.startsWith("sitemap") && entry.endsWith(".xml");
  if ((esRobots || esSitemap) && existsSync(join(SUB, entry))) {
    cpSync(join(SUB, entry), join(DIST, entry));
  }
}

console.log("dist/ listo: landing en raíz, portfolio en /portafolio/.");
