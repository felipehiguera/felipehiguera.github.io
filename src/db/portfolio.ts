import type { D1Database } from "@cloudflare/workers-types";
import { marked } from "marked";

/**
 * Capa de datos del portfolio. D1 es la única fuente de verdad.
 *
 * En producción el binding llega por el runtime de Cloudflare; en dev,
 * `platformProxy` levanta un D1 local (vacío hasta sembrar).
 */

export interface Proyecto {
  slug: string;
  title: string;
  summary: string;
  date: string;
  featured: boolean;
  draft: boolean;
  category: string;
  software: string[];
  normativa: string[];
  confidential: boolean;
  cover: string | null;
  model: string | null;
  planos: Array<{ title: string; url: string }>;
  body: string;
  updated_at: string;
}

interface Fila {
  slug: string;
  title: string;
  summary: string;
  date: string;
  featured: number;
  draft: number;
  category: string;
  software: string;
  normativa: string;
  confidential: number;
  cover: string | null;
  model: string | null;
  planos: string;
  body?: string;
  updated_at: string;
}

const CATEGORIAS = ["dibujo-tecnico", "cad-cam", "soporte-it"] as const;

function filaAProyecto(f: Fila, conCuerpo: boolean): Proyecto {
  return {
    slug: f.slug,
    title: f.title,
    summary: f.summary ?? "",
    date: f.date,
    featured: f.featured === 1,
    draft: f.draft === 1,
    category: f.category,
    software: JSON.parse(f.software || "[]") as string[],
    normativa: JSON.parse(f.normativa || "[]") as string[],
    confidential: f.confidential === 1,
    cover: f.cover,
    model: f.model,
    planos: JSON.parse(f.planos || "[]") as Array<{ title: string; url: string }>,
    body: conCuerpo ? (f.body ?? "") : "",
    updated_at: f.updated_at,
  };
}

export async function listarProyectos(
  db: D1Database,
  opts: { categoria?: string; destacados?: boolean; incluirBorradores?: boolean } = {},
): Promise<Proyecto[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts.categoria) {
    conds.push("category = ?");
    params.push(opts.categoria);
  }
  if (opts.destacados) conds.push("featured = 1");
  if (!opts.incluirBorradores) conds.push("draft = 0");

  const { results } = await db
    .prepare(
      `SELECT slug, title, summary, date, featured, draft, category, software,
              normativa, confidential, cover, model, planos, updated_at
       FROM proyectos
       ${conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : ""}
       ORDER BY date DESC`,
    )
    .bind(...params)
    .all<Fila>();
  return results.map((f) => filaAProyecto(f, false));
}

export async function leerProyecto(
  db: D1Database,
  slug: string,
): Promise<Proyecto | null> {
  const f = await db
    .prepare("SELECT * FROM proyectos WHERE slug = ? AND draft = 0")
    .bind(slug)
    .first<Fila>();
  return f ? filaAProyecto(f, true) : null;
}

export async function leerSecciones(db: D1Database): Promise<Record<string, boolean>> {
  const { results } = await db
    .prepare("SELECT name, visible FROM secciones")
    .all<{ name: string; visible: number }>();
  const out: Record<string, boolean> = {};
  for (const s of results) out[s.name] = s.visible === 1;
  return out;
}

export function etiquetaCategoria(categoria: string): string {
  switch (categoria) {
    case "dibujo-tecnico":
      return "Dibujo técnico";
    case "cad-cam":
      return "CAD/CAM";
    case "soporte-it":
      return "Soporte IT";
    default:
      return categoria;
  }
}

export function esCategoriaValida(categoria: string): boolean {
  return (CATEGORIAS as readonly string[]).includes(categoria);
}

/** "2021-07-01" -> "jul 2021". UTC fijo: el frontmatter viejo parseaba medianoche
 * UTC y formatear en hora local corría el día (junio en vez de julio). */
export function fechaCorta(fechaIso: string): string {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  if (Number.isNaN(d.valueOf())) return fechaIso;
  return d.toLocaleDateString("es-CL", {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Saca el runtime de Cloudflare (binding D1) desde los locals de Astro.
 * Falla con mensaje claro si no hay runtime (p. ej. `astro dev` sin
 * platformProxy o un adapter que no lo provee).
 */
export function getDB(locals: unknown): D1Database {
  const runtime = (locals as { runtime?: { env?: Record<string, unknown> } })
    .runtime;
  const db = runtime?.env?.DB;
  if (!db || typeof db !== "object" || !("prepare" in db)) {
    throw new Error(
      "Sin binding D1: en dev, `astro dev` necesita platformProxy con D1 local.",
    );
  }
  return db as D1Database;
}

/** Markdown del cuerpo -> HTML. El contenido lo escribe un admin (confiable). */
export function cuerpoAHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
