/**
 * Tests de humo post-deploy. Cero dependencias: fetch global de Node 22.
 *
 * Cubre lo funcional (páginas, contenido, auth) y lo no funcional básico
 * (TTFB, peso, caché edge, sitemap válido). Falla con mensaje claro.
 *
 * Uso: `node tests/smoke.mjs [base]` (default https://www.fhiguera.fyi)
 *
 * OJO: el middleware bloquea User-Agents vacíos o de librería, así que todo
 * request lleva UA de navegador. Sin eso, todo daría 403.
 */
const BASE = (process.argv[2] ?? "https://www.fhiguera.fyi").replace(/\/$/, "");
const RAIZ = `${BASE}/portafolio`;
const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};
// Bypass del rate limiting para CI (regla WAF Skip). En local no existe y
// los tests corren igual, solo más expuestos al rate limit.
const BYPASS = process.env.SMOKE_BYPASS
  ? { "X-Smoke": process.env.SMOKE_BYPASS }
  : {};

const fallos = [];
let checks = 0;

function ok(cond, nombre, detalle = "") {
  checks++;
  if (!cond) fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ""}`);
  else console.log(`  ✓ ${nombre}`);
}

async function get(path, opts = {}) {
  const t0 = performance.now();
  const r = await fetch(`${BASE}${path}`, {
    headers: { ...UA, ...BYPASS },
    redirect: "manual",
    ...opts,
  });
  const ttfb = Math.round(performance.now() - t0);
  const texto = r.status === 200 ? await r.text() : "";
  return { r, texto, ttfb };
}

/** Saca comentarios HTML: el TODO de og:image vive en uno y no cuenta. */
const sinComentarios = (html) => html.replace(/<!--[\s\S]*?-->/g, "");

console.log("Funcionales:");
{
  // Home: hero + carrusel con destacadas (la regresión que se busca acá).
  const { r, texto } = await get("/portafolio/");
  ok(r.status === 200, "home 200", `fue ${r.status}`);
  ok(texto.includes("Felipe Higuera"), "home tiene hero");
  const slides = (texto.match(/embla__slide/g) ?? []).length;
  ok(slides >= 3, "home con carrusel de destacadas", `${slides} slides`);
}
{
  // Proyectos: grilla con casos.
  const { r, texto } = await get("/portafolio/proyectos/");
  ok(r.status === 200, "proyectos 200", `fue ${r.status}`);
  const cards = (texto.match(/<article/g) ?? []).length;
  ok(cards >= 1, "proyectos con casos", `${cards} cards`);
}
{
  // Cada URL del sitemap responde y tiene lo mínimo.
  const { r, texto } = await get("/portafolio/sitemap-index.xml");
  ok(r.status === 200, "sitemap 200", `fue ${r.status}`);
  const locs = [...texto.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(locs.length >= 4, "sitemap con URLs", `${locs.length} urls`);
  ok(
    locs.every((u) => u.startsWith(`${RAIZ}/`)),
    "sitemap con URLs absolutas del sitio",
  );
  for (const u of locs) {
    const path = new URL(u).pathname;
    const { r: rr, texto: tt } = await get(path);
    ok(rr.status === 200, `sitemap: ${path} 200`, `fue ${rr.status}`);
    if (path.includes("/proyectos/") && path !== "/portafolio/proyectos/") {
      ok(tt.includes("<h1"), `sitemap: ${path} tiene h1`);
      ok(tt.includes("<time"), `sitemap: ${path} tiene time`);
      // Modal de edición: markup + puente con el iframe (sin esto el botón
      // Editar no abre nada).
      ok(tt.includes('id="er-modal"'), `sitemap: ${path} tiene modal de edición`);
      ok(tt.includes('id="er-frame"'), `sitemap: ${path} tiene iframe de edición`);
      ok(tt.includes("embed=1"), `sitemap: ${path} apunta al admin en modo embed`);
      ok(
        tt.includes("proyecto-guardado"),
        `sitemap: ${path} escucha el guardado del iframe`,
      );
    }
  }
}
{
  // CV con descarga y sin TODOs visibles.
  const { r, texto } = await get("/portafolio/cv/");
  ok(r.status === 200, "cv 200", `fue ${r.status}`);
  ok(texto.includes("CV-Felipe-Higuera.pdf"), "cv con enlace al PDF");
}
{
  // Soporte IT renderiza.
  const { r } = await get("/portafolio/soporte-it/");
  ok(r.status === 200, "soporte-it 200", `fue ${r.status}`);
}
{
  // Sin marcadores TODO: visibles en páginas públicas.
  for (const p of ["/portafolio/", "/portafolio/proyectos/", "/portafolio/cv/"]) {
    const { texto } = await get(p);
    ok(!sinComentarios(texto).includes("TODO:"), `sin TODO: en ${p}`);
  }
}
{
  // Auth: sin sesión, admin y API rebotan al login de Access.
  const { r } = await get("/portafolio/admin/");
  ok(
    r.status === 302 && (r.headers.get("location") ?? "").includes("cloudflareaccess.com"),
    "admin sin sesión va al login",
    `fue ${r.status}`,
  );
  const t0 = performance.now();
  const ra = await fetch(`${RAIZ}/admin/api`, {
    method: "POST",
    headers: { ...UA, ...BYPASS, "Content-Type": "application/json" },
    body: "{}",
    redirect: "manual",
  });
  void performance.now() - t0;
  ok(
    ra.status === 302 || ra.status === 401,
    "api sin sesión no entra",
    `fue ${ra.status}`,
  );
}

console.log("No funcionales:");
{
  // TTFB y peso por página pública.
  for (const p of ["/portafolio/", "/portafolio/proyectos/", "/portafolio/cv/"]) {
    const { r, texto, ttfb } = await get(p);
    ok(r.status === 200 && ttfb < 2500, `TTFB ${p} < 2.5s`, `${ttfb}ms`);
    const kb = Math.round(Buffer.byteLength(texto) / 1024);
    ok(kb < 150, `peso ${p} < 150KB`, `${kb}KB`);
  }
}
{
  // El caché edge responde HIT en la segunda pasada.
  await get("/portafolio/");
  const t0 = performance.now();
  const r = await fetch(`${RAIZ}/`, { headers: { ...UA, ...BYPASS } });
  await r.text();
  void performance.now() - t0;
  ok(r.headers.get("x-cache") === "HIT", "edge cache con HIT en 2da pasada");
}
{
  // robots.txt existe y apunta al sitemap.
  const { r, texto } = await get("/robots.txt");
  ok(r.status === 200 && texto.includes("sitemap"), "robots.txt con sitemap");
}

console.log("SEO y accesibilidad por página:");
{
  // Cada URL del sitemap: idioma, título, descripción, canonical, OG, un h1,
  // skip-link y alts en imágenes.
  const { texto: sm } = await get("/portafolio/sitemap-index.xml");
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const u of locs) {
    const path = new URL(u).pathname;
    const { texto: tt } = await get(path);
    const tag = `seo ${path}`;
    ok(tt.includes('lang="es-CL"'), `${tag} lang`);
    const titulo = (tt.match(/<title>([^<]+)<\/title>/) ?? [])[1] ?? "";
    ok(titulo.length >= 10, `${tag} title`, titulo.slice(0, 40));
    ok(tt.includes('name="description"'), `${tag} description`);
    const canon = (tt.match(/rel="canonical" href="([^"]+)"/) ?? [])[1] ?? "";
    ok(canon.startsWith("https://"), `${tag} canonical absoluta`);
    ok(tt.includes("og:title"), `${tag} og`);
    ok((tt.match(/<h1/g) ?? []).length === 1, `${tag} un solo h1`);
    ok(tt.includes('class="skip-link"'), `${tag} skip-link`);
    const imgsSinAlt = [...tt.matchAll(/<img(?![^>]*alt=)[^>]*>/g)].length;
    ok(imgsSinAlt === 0, `${tag} imgs con alt`, `${imgsSinAlt} sin alt`);
  }
}
{
  // Contacto del footer presente en el home.
  const { texto } = await get("/portafolio/");
  ok(texto.includes("mailto:"), "footer con mailto");
  ok(texto.includes("tel:"), "footer con tel");
  ok(texto.includes("linkedin.com"), "footer con linkedin");
}
console.log("Links internos:");
{
  // Crawl: todo href interno de home y proyectos responde 200.
  const vistos = new Set();
  const pendientes = ["/portafolio/", "/portafolio/proyectos/"];
  const malos = [];
  while (pendientes.length > 0 && vistos.size < 30) {
    const p = pendientes.shift();
    if (vistos.has(p)) continue;
    vistos.add(p);
    const { r, texto } = await get(p);
    // /admin sin sesión redirige al login: es lo esperado, no un roto.
    if (p.startsWith("/portafolio/admin")) {
      ok(
        r.status === 302,
        `admin protegido (${p})`,
        `fue ${r.status}`,
      );
      continue;
    }
    if (r.status !== 200) {
      malos.push(`${p} -> ${r.status}`);
      continue;
    }
    for (const m of texto.matchAll(/href="(\/portafolio\/[^"]*)"/g)) {
      const href = m[1].split("#")[0].replace(/\/$/, "") || "/portafolio/";
      if (!vistos.has(href) && !href.match(/\.(pdf|png|ico|glb|webp)$/)) {
        pendientes.push(href);
      }
    }
  }
  ok(malos.length === 0, "links internos sin rotos", malos.join("; ").slice(0, 200));
  ok(vistos.size >= 5, "crawl cubre páginas", `${vistos.size} vistas`);
}
console.log("Filtro de bots:");
{
  // Sin UA o con UA de librería: 403. Googlebot: pasa.
  // UA vacío o de librería: 403. Googlebot: pasa. (node manda UA propio por
  // defecto, así que el caso vacío se fuerza explícito.)
  const sinUA = await fetch(`${RAIZ}/`, {
    headers: { "User-Agent": "" },
    redirect: "manual",
  });
  ok(sinUA.status === 403, "sin UA bloqueado", `fue ${sinUA.status}`);
  const bot = await fetch(`${RAIZ}/`, {
    headers: { "User-Agent": "python-requests/2.31" },
    redirect: "manual",
  });
  ok(bot.status === 403, "scraper bloqueado", `fue ${bot.status}`);
  const google = await fetch(`${RAIZ}/`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    },
    redirect: "manual",
  });
  ok(google.status === 200, "googlebot pasa", `fue ${google.status}`);
}
console.log("Caché y assets:");
{
  // Bypass con no-cache regenera (MISS) en vez de servir rancio.
  await get("/portafolio/proyectos/");
  const r = await fetch(`${RAIZ}/proyectos/`, {
    headers: { ...UA, "Cache-Control": "no-cache" },
  });
  await r.text();
  ok(r.headers.get("x-cache") === "MISS", "no-cache regenera");
  // Assets estáticos servidos por el worker.
  const pdf = await fetch(`${RAIZ}/cv/CV-Felipe-Higuera.pdf`, { headers: UA });
  await pdf.arrayBuffer();
  ok(
    pdf.status === 200 && (pdf.headers.get("content-type") ?? "").includes("pdf"),
    "PDF del CV servido",
    `fue ${pdf.status}`,
  );
  const og = await fetch(`${RAIZ}/og.png`, { headers: UA });
  await og.arrayBuffer();
  ok(og.status === 200, "og:image servida", `fue ${og.status}`);
  const falta = await fetch(`${RAIZ}/media/no-existe.webp`, { headers: UA });
  await falta.text();
  ok(falta.status === 404, "media inexistente da 404", `fue ${falta.status}`);
}

console.log(`\n${checks - fallos.length}/${checks} checks OK`);
if (fallos.length > 0) {
  console.error("\nFALLOS:");
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("SMOKE OK");
