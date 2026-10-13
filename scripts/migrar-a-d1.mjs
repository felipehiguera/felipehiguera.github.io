/**
 * Genera `migration.sql` con los 6 proyectos actuales + secciones, para
 * cargarlos a D1 una sola vez:
 *
 *   node scripts/migrar-a-d1.mjs
 *   wrangler d1 execute portfolio --file=migration.sql --remote
 *
 * Después de esto los .mdx mueren: D1 es la única fuente de verdad.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const DIR = "src/content/proyectos";
const q = (v) => `'${String(v ?? "").replace(/'/g, "''")}'`;
const qi = (v) => (v === true || v === 1 ? 1 : 0);
const qj = (v) => q(JSON.stringify(Array.isArray(v) ? v : []));

const lineas = [
  "-- Migración inicial desde .mdx. Generado, no editar a mano.",
  "DELETE FROM proyectos;",
  "DELETE FROM secciones;",
];

for (const archivo of readdirSync(DIR).filter((f) => f.endsWith(".mdx"))) {
  const crudo = readFileSync(join(DIR, archivo), "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(crudo);
  if (!m) {
    console.error(`Sin frontmatter: ${archivo}`);
    continue;
  }
  const fm = parse(m[1]);
  const cuerpo = m[2].trim();
  const slug = archivo.replace(/\.mdx$/, "");
  const planos = Array.isArray(fm.planos)
    ? fm.planos.map((p) => ({
        title: String(p?.title ?? ""),
        // Los PDFs viejos vivían en /public/planos; si algún día se migran
        // a R2, se actualiza la URL desde el panel.
        url: String(p?.pdf ?? ""),
      }))
    : [];
  lineas.push(
    `INSERT INTO proyectos (slug, title, summary, date, featured, draft, category, software, normativa, confidential, cover, model, planos, body) VALUES (${[
      q(slug),
      q(fm.title),
      q(fm.summary),
      q(String(fm.date ?? "").slice(0, 10)),
      qi(fm.featured),
      qi(fm.draft),
      q(fm.category ?? "dibujo-tecnico"),
      qj(fm.software),
      qj(fm.normativa),
      qi(fm.confidential),
      fm.cover ? q(fm.cover) : "NULL",
      fm.model ? q(fm.model) : "NULL",
      q(JSON.stringify(planos)),
      q(cuerpo),
    ].join(", ")});`,
  );
}

const secciones = JSON.parse(readFileSync("src/config/secciones.json", "utf8"));
for (const [name, visible] of Object.entries(secciones)) {
  lineas.push(
    `INSERT INTO secciones (name, visible) VALUES (${q(name)}, ${visible ? 1 : 0});`,
  );
}

writeFileSync("migration.sql", lineas.join("\n") + "\n");
console.log(`migration.sql listo: ${lineas.length - 3} sentencias.`);
