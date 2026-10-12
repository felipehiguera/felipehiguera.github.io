// Edge Function de Supabase: única puerta de escritura al repositorio.
//
// Por qué existe: GitHub Pages es estático y no hay dónde validar una
// contraseña. Si el token de GitHub viajara al navegador, quedaría escrito en
// el JS de una página pública y cualquiera podría editar el sitio. Acá el
// token es un secreto de Supabase y nunca sale de este servidor.
//
// Flujo: el admin se autentica en Supabase -> manda su JWT -> esta función
// valida el JWT, comprueba que el email esté en la lista blanca, y recién
// después habla con la API de GitHub.
//
// Variables requeridas (configurarlas con `supabase secrets set`):
//   ADMIN_EMAILS   lista de correos autorizados, separados por coma
//   GITHUB_TOKEN   fine-grained PAT con Contents: read & write sobre el repo
//   GITHUB_REPO    "owner/repo"
// Las de Supabase (SUPABASE_URL, SUPABASE_ANON_KEY) las inyecta la plataforma.

import { createClient } from "jsr:@supabase/supabase-js@2";

const REPO = Deno.env.get("GITHUB_REPO") ?? "felipehiguera/felipehiguera.github.io";
const TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const BRANCH = "main";
const RAIZ_PROYECTOS = "src/content/proyectos/";
const ARCHIVO_SECCIONES = "src/config/secciones.json";
const API = "https://api.github.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const b64 = (texto: string) => {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/**
 * Deja pasar solo rutas dentro de las carpetas que el admin puede tocar.
 * Sin esto, un `path` manipulado permitiría escribir fuera del repo.
 */
function rutaPermitida(path: string): boolean {
  if (path === ARCHIVO_SECCIONES) return true;
  return path.startsWith(RAIZ_PROYECTOS) && path.endsWith(".mdx") &&
    !path.includes("..") && !path.includes("\\");
}

async function github(method: string, path: string, cuerpo?: unknown) {
  const respuesta = await fetch(`${API}/repos/${REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "admin-portafolio",
      ...(cuerpo ? { "Content-Type": "application/json" } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : null;

  if (!respuesta.ok) {
    const detalle = datos?.message ?? respuesta.statusText;
    return { ok: false, status: respuesta.status, detalle };
  }
  return { ok: true, status: respuesta.status, datos };
}

/** El commit queda a nombre de quien editó, para que el historial diga quién. */
function identidad(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const nombre = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return {
    name: typeof nombre === "string" && nombre ? nombre : (user.email ?? "admin"),
    email: user.email ?? "admin@localhost",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  if (!TOKEN) return json({ error: "Falta GITHUB_TOKEN en los secretos" }, 500);

  // 1. Validar identidad del admin.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sin credenciales" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: usuario, error: errorAuth } = await supabase.auth.getUser();
  if (errorAuth || !usuario?.user) {
    return json({ error: "Sesión inválida o vencida" }, 401);
  }

  // 2. Lista blanca. Falla cerrado: tener cuenta no alcanza, hay que estar acá.
  const permitidos = (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!permitidos.includes((usuario.user.email ?? "").toLowerCase())) {
    return json({ error: "Esta cuenta no tiene acceso al panel" }, 403);
  }

  // 3. Operación pedida.
  let peticion: { accion?: string; path?: string; contenido?: string; mensaje?: string };
  try {
    peticion = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido" }, 400);
  }

  const { accion, path, contenido, mensaje } = peticion;
  const quien = identidad(usuario.user);

  if (accion === "listar") {
    const r = await github("GET", `/contents/${RAIZ_PROYECTOS}`);
    if (!r.ok) return json({ error: r.detalle }, r.status);

    const archivos = (r.datos as Array<{ name: string; path: string; sha: string }>)
      .filter((a) => a.name.endsWith(".mdx"))
      .map((a) => ({ nombre: a.name, path: a.path, sha: a.sha }));

    const s = await github("GET", `/contents/${ARCHIVO_SECCIONES}`);
    return json({
      proyectos: archivos,
      secciones: s.ok
        ? JSON.parse(atob(String((s.datos as { content: string }).content)))
        : null,
    });
  }

  if (accion === "leer") {
    if (!path || !rutaPermitida(path)) return json({ error: "Ruta no permitida" }, 400);
    const r = await github("GET", `/contents/${path}`);
    if (!r.ok) return json({ error: r.detalle }, r.status);
    const d = r.datos as { content: string; sha: string };
    return json({
      sha: d.sha,
      contenido: atob(String(d.content)).replace(/\r\n/g, "\n"),
    });
  }

  if (accion === "escribir") {
    if (!path || !rutaPermitida(path)) return json({ error: "Ruta no permitida" }, 400);
    if (typeof contenido !== "string") return json({ error: "Falta contenido" }, 400);

    const actual = await github("GET", `/contents/${path}`);
    const sha = actual.ok ? (actual.datos as { sha: string }).sha : undefined;

    const r = await github("PUT", `/contents/${path}`, {
      message: mensaje ?? "admin: actualizar contenido",
      content: b64(contenido),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
      committer: quien,
      author: quien,
    });

    if (!r.ok) return json({ error: r.detalle }, r.status);
    return json({ ok: true, sha: (r.datos as { content: { sha: string } }).content.sha });
  }

  if (accion === "borrar") {
    if (!path || !rutaPermitida(path)) return json({ error: "Ruta no permitida" }, 400);
    if (path === ARCHIVO_SECCIONES) return json({ error: "No se puede borrar" }, 400);

    const actual = await github("GET", `/contents/${path}`);
    if (!actual.ok) return json({ error: actual.detalle }, actual.status);

    const r = await github("DELETE", `/contents/${path}`, {
      message: mensaje ?? "admin: eliminar proyecto",
      sha: (actual.datos as { sha: string }).sha,
      branch: BRANCH,
      committer: quien,
    });

    if (!r.ok) return json({ error: r.detalle }, r.status);
    return json({ ok: true });
  }

  return json({ error: "Acción desconocida" }, 400);
});