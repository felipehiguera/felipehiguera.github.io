import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Worker de administración: única puerta de escritura al portfolio.
 *
 * Arquitectura dinámica: D1 es la única fuente de verdad (los .mdx
 * murieron) y R2 guarda los binarios. Nada pasa por Git ni dispara
 * rebuilds: guardar es instantáneo.
 *
 * La autenticación no la hace este Worker: Cloudflare Access ya aseguró que
 * quien llega pasó el login y está en la lista de correos. Este Worker solo
 * verifica esa afirmación (falla cerrado) y recién después toca D1/R2.
 */

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  /** Dominio del equipo, p. ej. "mhiguera". Sin https:// */
  ACCESS_TEAM: string;
  /** Audience tags de las apps de Access, separados por coma (admin y api). */
  ACCESS_AUD: string;
}

const CATEGORIAS = ["dibujo-tecnico", "cad-cam", "soporte-it"] as const;

const TIPOS_MEDIA = {
  portada: { ext: [".webp", ".png", ".jpg", ".jpeg", ".avif", ".gif", ".svg"], dir: "portadas" },
  plano: { ext: [".pdf"], dir: "planos" },
  modelo: { ext: [".glb", ".gltf"], dir: "modelos" },
} as const;

const TIPOS_CONTENIDO: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};

type TipoMedia = keyof typeof TIPOS_MEDIA;

const MAX_DECODED = 12 * 1024 * 1024;

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Quita el prefijo `data:...;base64,` si viene, y espacios. */
const limpiarB64 = (b64: string) =>
  b64.replace(/\s/g, "").split(",").pop() ?? "";

function b64ABytes(b64: string): Uint8Array {
  const bin = atob(limpiarB64(b64));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function sanearNombre(nombre: string, extPermitidas: readonly string[]): string | null {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  const punto = limpio.lastIndexOf(".");
  if (punto <= 0) return null;
  const ext = limpio.slice(punto);
  if (!extPermitidas.includes(ext)) return null;
  return limpio.slice(0, punto).replace(/\./g, "-") + ext;
}

interface FilaProyecto {
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
  body: string;
  updated_at: string;
}

/** D1 guarda booleanos como 0/1 y listas como JSON: se traduce al salir. */
function filaAProyecto(f: FilaProyecto) {
  return {
    slug: f.slug,
    title: f.title,
    summary: f.summary,
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
    body: f.body,
    updated_at: f.updated_at,
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Mismo origen y misma app de Access: sin CORS ni claves públicas.
    if (req.method !== "POST") {
      return responder({ error: "Método no permitido" }, 405);
    }

    // --- 1. Verificar que Cloudflare Access ya autenticó a la persona ------
    const jwt = req.headers.get("CF-Access-Jwt-Assertion");
    if (!jwt) {
      return responder({ error: "Sin sesión de Cloudflare Access" }, 401);
    }

    try {
      const JWKS = createRemoteJWKSet(
        new URL(`https://${env.ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`),
      );

      // Dos apps (admin y api) => dos AUDs válidos.
      const audiencias = env.ACCESS_AUD.split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      const { payload } = await jwtVerify(jwt, JWKS, {
        issuer: `https://${env.ACCESS_TEAM}.cloudflareaccess.com`,
        audience: audiencias.length === 1 ? audiencias[0] : audiencias,
      });

      if (typeof payload.email !== "string") {
        return responder({ error: "Sesión sin correo" }, 403);
      }
    } catch {
      return responder({ error: "Sesión inválida o vencida" }, 401);
    }

    // --- 2. Operación ------------------------------------------------------
    let peticion: Record<string, unknown>;
    try {
      peticion = (await req.json()) as Record<string, unknown>;
    } catch {
      return responder({ error: "Cuerpo inválido" }, 400);
    }

    const accion = peticion.accion as string | undefined;

    try {
      // ---------------- proyectos ----------------
      if (accion === "proyectos.listar") {
        const { results } = await env.DB.prepare(
          "SELECT slug, title, summary, date, featured, draft, category, confidential, cover, updated_at FROM proyectos ORDER BY date DESC",
        ).all<FilaProyecto>();
        return responder({
          ok: true,
          proyectos: results.map((f) => ({
            slug: f.slug,
            title: f.title,
            summary: f.summary,
            date: f.date,
            featured: f.featured === 1,
            draft: f.draft === 1,
            category: f.category,
            confidential: f.confidential === 1,
            cover: f.cover,
            updated_at: f.updated_at,
          })),
        });
      }

      if (accion === "proyectos.leer") {
        const slug = peticion.slug as string | undefined;
        if (!slug) return responder({ error: "Falta slug" }, 400);
        const f = await env.DB.prepare(
          "SELECT * FROM proyectos WHERE slug = ?",
        )
          .bind(slug)
          .first<FilaProyecto>();
        if (!f) return responder({ error: "No existe ese proyecto" }, 404);
        return responder({ ok: true, proyecto: filaAProyecto(f) });
      }

      if (accion === "proyectos.guardar") {
        const p = peticion.proyecto as Record<string, unknown> | undefined;
        if (!p || typeof p.title !== "string" || !p.title.trim()) {
          return responder({ error: "El título es obligatorio" }, 400);
        }
        const categoria = typeof p.category === "string" ? p.category : "dibujo-tecnico";
        if (!CATEGORIAS.includes(categoria as (typeof CATEGORIAS)[number])) {
          return responder({ error: "Categoría inválida" }, 400);
        }

        // Slug del cliente o generado del título; colisión => sufijo -2, -3…
        let slug =
          typeof p.slug === "string" && p.slug.trim()
            ? slugificar(p.slug)
            : slugificar(p.title);
        if (!slug) slug = "proyecto";
        const base = slug;
        let n = 2;
        for (;;) {
          const choque = await env.DB.prepare(
            "SELECT slug FROM proyectos WHERE slug = ?",
          )
            .bind(slug)
            .first<{ slug: string }>();
          // Si el choque es el mismo que se está editando, vale.
          if (!choque || choque.slug === p.slugOriginal) break;
          slug = `${base}-${n++}`;
        }

        const lista = (v: unknown) =>
          Array.isArray(v) ? JSON.stringify(v.map(String)) : "[]";
        const planos = Array.isArray(p.planos)
          ? JSON.stringify(
              p.planos
                .filter(
                  (x): x is { title: string; url: string } =>
                    !!x && typeof x === "object" && "url" in x,
                )
                .map((x) => ({ title: String(x.title ?? ""), url: String(x.url) })),
            )
          : "[]";

        await env.DB.prepare(
          `INSERT INTO proyectos
             (slug, title, summary, date, featured, draft, category, software,
              normativa, confidential, cover, model, planos, body, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
           ON CONFLICT(slug) DO UPDATE SET
             title=excluded.title, summary=excluded.summary, date=excluded.date,
             featured=excluded.featured, draft=excluded.draft,
             category=excluded.category, software=excluded.software,
             normativa=excluded.normativa, confidential=excluded.confidential,
             cover=excluded.cover, model=excluded.model, planos=excluded.planos,
             body=excluded.body,
             updated_at=strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
        )
          .bind(
            slug,
            p.title.trim(),
            typeof p.summary === "string" ? p.summary.trim() : "",
            typeof p.date === "string" && p.date ? p.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
            p.featured === true ? 1 : 0,
            p.draft === true ? 1 : 0,
            categoria,
            lista(p.software),
            lista(p.normativa),
            p.confidential === true ? 1 : 0,
            typeof p.cover === "string" && p.cover ? p.cover : null,
            typeof p.model === "string" && p.model ? p.model : null,
            planos,
            typeof p.body === "string" ? p.body : "",
          )
          .run();
        return responder({ ok: true, slug });
      }

      if (accion === "proyectos.borrar") {
        const slug = peticion.slug as string | undefined;
        if (!slug) return responder({ error: "Falta slug" }, 400);
        await env.DB.prepare("DELETE FROM proyectos WHERE slug = ?").bind(slug).run();
        return responder({ ok: true });
      }

      // ---------------- secciones ----------------
      if (accion === "secciones.leer") {
        const { results } = await env.DB.prepare(
          "SELECT name, visible FROM secciones",
        ).all<{ name: string; visible: number }>();
        const secciones: Record<string, boolean> = {};
        for (const s of results) secciones[s.name] = s.visible === 1;
        return responder({ ok: true, secciones });
      }

      if (accion === "secciones.poner") {
        const name = peticion.name as string | undefined;
        if (!name) return responder({ error: "Falta sección" }, 400);
        await env.DB.prepare(
          "INSERT INTO secciones (name, visible) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET visible=excluded.visible",
        )
          .bind(name, peticion.visible === true ? 1 : 0)
          .run();
        return responder({ ok: true });
      }

      // ---------------- media (R2) ----------------
      if (accion === "media.subir") {
        const tipo = peticion.tipo as string | undefined;
        const cfg = tipo != null ? TIPOS_MEDIA[tipo as TipoMedia] : undefined;
        if (!cfg) return responder({ error: "Tipo no permitido (portada, plano o modelo)" }, 400);
        if (typeof peticion.base64 !== "string" || !peticion.base64) {
          return responder({ error: "Falta el archivo" }, 400);
        }
        const nombre = sanearNombre(String(peticion.nombre ?? ""), cfg.ext);
        if (!nombre) return responder({ error: "Nombre o extensión inválidos" }, 400);

        const bytes = b64ABytes(peticion.base64);
        if (bytes.byteLength > MAX_DECODED) {
          return responder({ error: "El archivo supera los 12 MB" }, 413);
        }

        const slug = slugificar(String(peticion.slug ?? "general")) || "general";
        const key = `${cfg.dir}/${slug}-${nombre}`;
        const ext = nombre.slice(nombre.lastIndexOf("."));
        await env.MEDIA.put(key, bytes, {
          httpMetadata: { contentType: TIPOS_CONTENIDO[ext] ?? "application/octet-stream" },
        });
        return responder({ ok: true, key, url: `/media/${key}` });
      }

      if (accion === "media.borrar") {
        const key = peticion.key as string | undefined;
        if (!key || key.includes("..")) return responder({ error: "Clave inválida" }, 400);
        await env.MEDIA.delete(key);
        return responder({ ok: true });
      }

      return responder({ error: "Acción desconocida" }, 400);
    } catch (e) {
      return responder(
        { error: e instanceof Error ? e.message : "Error interno" },
        500,
      );
    }
  },
};