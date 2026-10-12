import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Worker de administración: única puerta de escritura al repositorio.
 *
 * Por qué existe: GitHub Pages es estático y no hay dónde validar una
 * contraseña. Si el token de GitHub viajara al navegador, quedaría escrito en
 * el JS de una página pública y cualquiera podría editar el sitio. Acá el token
 * es un secreto del Worker y nunca sale.
 *
 * La autenticación no la hace este Worker: Cloudflare Access ya aseguró que
 * quien llega pasó el login y está en la lista de correos. Este Worker solo
 * verifica esa afirmación (falla cerrado) y recién después habla con GitHub.
 */

export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  /** Dominio del equipo, p. ej. "mi-equipo". Sin https:// */
  ACCESS_TEAM: string;
  /** Audience tag de la aplicación de Access. */
  ACCESS_AUD: string;
  BRANCH?: string;
}

// Carpetas donde el admin puede escribir. Todo lo demás se rechaza.
const RUTAS = {
  proyectos: "src/content/proyectos/",
  assets: "src/assets/proyectos/",
  planos: "public/planos/",
  modelos: "public/models/",
  secciones: "src/config/secciones.json",
};

const EXTENSIONES_IMAGEN = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
const EXTENSIONES_PDF = /\.pdf$/i;
const MAX_DECODED = 8 * 1024 * 1024; // 8 MB tras decodificar

interface GithubRes<T> {
  ok: boolean;
  status: number;
  datos: T | null;
  detalle: string;
}

async function github<T>(
  env: Env,
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
): Promise<GithubRes<T>> {
  const respuesta = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}${ruta}`,
    {
      method: metodo,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "admin-portafolio",
        ...(cuerpo ? { "Content-Type": "application/json" } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    },
  );

  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : null;

  if (!respuesta.ok) {
    return {
      ok: false,
      status: respuesta.status,
      datos: null,
      detalle: datos?.message ?? respuesta.statusText,
    };
  }
  return { ok: true, status: respuesta.status, datos: datos as T, detalle: "" };
}

/** Ruta permitida: solo dentro de las carpetas de arriba y sin escapar. */
function rutaPermitida(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path === RUTAS.secciones) return true;
  if (path.includes("..") || path.includes("\\") || path.startsWith("/")) {
    return false;
  }
  const dentro = [
    RUTAS.proyectos,
    RUTAS.assets,
    RUTAS.planos,
    RUTAS.modelos,
  ].some((prefijo) => path.startsWith(prefijo));
  return dentro;
}

/** Quita el prefijo `data:...;base64,` si viene, y espacios. */
const limpiarB64 = (b64: string) =>
  b64.replace(/\s/g, "").split(",").pop() ?? "";

/** Texto UTF-8 -> base64 (por chunks, sin reventar la pila). */
function textoAB64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  const PASO = 0x8000;
  for (let i = 0; i < bytes.length; i += PASO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + PASO));
  }
  return btoa(bin);
}

/** base64 (contenido de la API de GitHub) -> texto UTF-8. */
function b64ATexto(b64: string): string {
  const bin = atob(limpiarB64(b64));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64ABytes(b64: string): Uint8Array {
  const bin = atob(limpiarB64(b64));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const responder = (cuerpo: unknown, estado = 200) =>
      new Response(JSON.stringify(cuerpo), {
        status: estado,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });

    // Mismo origen que la página: no hace falta CORS ni claves públicas.
    if (req.method !== "POST") {
      return responder({ error: "Método no permitido" }, 405);
    }

    if (!env.GITHUB_TOKEN) {
      return responder({ error: "Falta GITHUB_TOKEN en los secretos" }, 500);
    }

    // --- 1. Verificar que Cloudflare Access ya autenticó a la persona ------
    const jwt = req.headers.get("CF-Access-Jwt-Assertion");
    if (!jwt) {
      return responder({ error: "Sin sesión de Cloudflare Access" }, 401);
    }

    try {
      const JWKS = createRemoteJWKSet(
        new URL(
          `https://${env.ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`,
        ),
      );

      const { payload } = await jwtVerify(jwt, JWKS, {
        issuer: `https://${env.ACCESS_TEAM}.cloudflareaccess.com`,
        audience: env.ACCESS_AUD,
      });

      if (typeof payload.email !== "string") {
        return responder({ error: "Sesión sin correo" }, 403);
      }
    } catch {
      // Firma inválida, expirada o de otra aplicación de Access.
      return responder({ error: "Sesión inválida o vencida" }, 401);
    }

    // --- 2. Operación ------------------------------------------------------
    let peticion: {
      accion?: string;
      path?: string;
      contenido?: string;
      base64?: string;
      mensaje?: string;
    };

    try {
      peticion = await req.json();
    } catch {
      return responder({ error: "Cuerpo inválido" }, 400);
    }

    const { accion, path, contenido, base64, mensaje } = peticion;
    const rama = env.BRANCH ?? "main";

    if (accion === "listar") {
      const r = await github<
        Array<{ name: string; path: string; sha: string }>
      >(env, "GET", `/contents/${RUTAS.proyectos}`);
      if (!r.ok) return responder({ error: r.detalle }, r.status);

      const s = await github<{ content: string }>(
        env,
        "GET",
        `/contents/${RUTAS.secciones}`,
      );
      return responder({
        proyectos: (r.datos ?? [])
          .filter((a) => a.name.endsWith(".mdx"))
          .map((a) => ({ nombre: a.name, path: a.path, sha: a.sha })),
        secciones: s.ok ? JSON.parse(b64ATexto(String(s.datos?.content))) : null,
      });
    }

    if (accion === "leer") {
      if (!rutaPermitida(path))
        return responder({ error: "Ruta no permitida" }, 400);
      const r = await github<{ content: string; sha: string }>(
        env,
        "GET",
        `/contents/${path}`,
      );
      if (!r.ok) return responder({ error: r.detalle }, r.status);
      return responder({
        sha: r.datos?.sha,
        contenido: b64ATexto(String(r.datos?.content)),
      });
    }

    if (accion === "escribir") {
      if (!rutaPermitida(path))
        return responder({ error: "Ruta no permitida" }, 400);
      if (typeof contenido !== "string") {
        return responder({ error: "Falta contenido" }, 400);
      }

      const actual = await github<{ sha: string }>(
        env,
        "GET",
        `/contents/${path}`,
      );
      const sha = actual.ok ? actual.datos?.sha : undefined;

      const r = await github<{ content: { sha: string } }>(
        env,
        "PUT",
        `/contents/${path}`,
        {
          message: mensaje ?? "admin: actualizar contenido",
          content: textoAB64(contenido),
          branch: rama,
          ...(sha ? { sha } : {}),
        },
      );
      if (!r.ok) return responder({ error: r.detalle }, r.status);
      return responder({ ok: true });
    }

    if (accion === "borrar") {
      if (!rutaPermitida(path) || path === RUTAS.secciones) {
        return responder({ error: "Ruta no permitida" }, 400);
      }
      const actual = await github<{ sha: string }>(
        env,
        "GET",
        `/contents/${path}`,
      );
      if (!actual.ok)
        return responder({ error: actual.detalle }, actual.status);

      const r = await github(env, "DELETE", `/contents/${path}`, {
        message: mensaje ?? "admin: eliminar archivo",
        sha: actual.datos?.sha,
        branch: rama,
      });
      if (!r.ok) return responder({ error: r.detalle }, r.status);
      return responder({ ok: true });
    }

    // Binario: imágenes a src/assets (las optimiza Astro) y planos a public.
    if (accion === "subir") {
      if (!rutaPermitida(path) || path === RUTAS.secciones) {
        return responder({ error: "Ruta no permitida" }, 400);
      }
      if (!EXTENSIONES_IMAGEN.test(path) && !EXTENSIONES_PDF.test(path)) {
        return responder({ error: "Tipo de archivo no permitido" }, 400);
      }
      if (typeof base64 !== "string" || base64.length === 0) {
        return responder({ error: "Falta el archivo" }, 400);
      }

      const bytes = b64ABytes(base64);
      if (bytes.byteLength > MAX_DECODED) {
        return responder({ error: "El archivo supera los 8 MB" }, 413);
      }

      const actual = await github<{ sha: string }>(
        env,
        "GET",
        `/contents/${path}`,
      );
      const sha = actual.ok ? actual.datos?.sha : undefined;

      const r = await github<{ content: { sha: string } }>(
        env,
        "PUT",
        `/contents/${path}`,
        {
          message: mensaje ?? "admin: subir archivo",
          content: limpiarB64(base64),
          branch: rama,
          ...(sha ? { sha } : {}),
        },
      );
      if (!r.ok) return responder({ error: r.detalle }, r.status);
      return responder({ ok: true, path, bytes: bytes.byteLength });
    }

    return responder({ error: "Acción desconocida" }, 400);
  },
};