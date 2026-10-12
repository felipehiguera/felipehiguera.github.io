import { parse, stringify } from "yaml";

/**
 * Lógica del panel de administración.
 *
 * No habla nunca con la API de GitHub: todas las escrituras pasan por el
 * Worker `/api/admin`, que es el único que tiene el token. La autenticación
 * la hace Cloudflare Access antes de que esta página cargue, así que acá no
 * hay login: si ves esto, ya pasaste.
 */

const DIR_PROYECTOS = "src/content/proyectos/";

interface Archivo {
  nombre: string;
  path: string;
  sha: string;
}

interface Frontmatter {
  title: string;
  summary: string;
  date: string;
  featured: boolean;
  draft: boolean;
  category: string;
  software: string[];
  normativa: string[];
  confidential: boolean;
  cover?: unknown;
  model?: string;
  planos?: unknown[];
  [clave: string]: unknown;
}

interface Respuesta {
  ok: boolean;
  error?: string;
  proyectos?: Archivo[];
  secciones?: Record<string, boolean> | null;
  contenido?: string;
  sha?: string;
}

// ---------------------------------------------------------------- utilidades

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...hijos: Array<Node | string>
): HTMLElementTagNameMap[K] => {
  const nodo = Object.assign(document.createElement(tag), props);
  for (const hijo of hijos) {
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(hijo));
  }
  return nodo;
};

const mostrar = (id: string, visible: boolean) => {
  const nodo = document.getElementById(id);
  if (nodo) nodo.hidden = !visible;
};

const aviso = (mensaje: string, tipo: "ok" | "error" = "ok") => {
  const nodo = $("#aviso");
  nodo.textContent = mensaje;
  nodo.hidden = false;
  // Los errores quedan pegados hasta el próximo intento: el mensaje dice por
  // qué falló la escritura y 6 segundos no alcanzan ni para leerlo.
  nodo.style.color = tipo === "ok" ? "var(--accent-ink)" : "#b3261e";
  nodo.style.border = tipo === "error" ? "1px solid #b3261e" : "1px solid transparent";
  nodo.style.padding = tipo === "error" ? "0.5rem 0.75rem" : "0";
  if (tipo === "ok") window.setTimeout(() => (nodo.hidden = true), 6000);
};

// ------------------------------------------------------- frontmatter (MDX)

const PLANTILLA = `## Contexto y problema

TODO: qué había que resolver y para quién.

## Proceso

TODO: modelo 3D, vistas, cortes, acotado, validación.

## Normativa aplicada

TODO: qué normas y por qué.

## Software y herramientas

TODO.

## Entregable

TODO: visor 3D y/o planos embebidos.

## Resultado

TODO: una frase concreta.
`;

function separar(contenido: string): { fm: Frontmatter; cuerpo: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(contenido);
  if (!m) return { fm: {} as Frontmatter, cuerpo: contenido };
  return {
    fm: parse(m[1]) as Frontmatter,
    cuerpo: contenido.slice(m[0].length),
  };
}

function unir(fm: Frontmatter, cuerpo: string): string {
  // Se conserva el frontmatter completo (incluidos `cover` y `planos`, que la
  // UI no edita) y solo se pisan los campos del formulario.
  return `---\n${stringify(fm).trimEnd()}\n---\n\n${cuerpo.trimStart()}`;
}

const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : "");

// ------------------------------------------------------------ API (Worker)

// Mismo origen: el navegador llama a /api/admin y Cloudflare lo deriva al
// Worker. Sin CORS, sin claves públicas, sin login en el cliente.

async function llamar(
  accion: string,
  extra: Record<string, unknown> = {},
): Promise<Respuesta> {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, ...extra }),
  });

  let datos: Respuesta;
  try {
    datos = (await r.json()) as Respuesta;
  } catch {
    throw new Error(`El servidor respondió ${r.status}. ¿Está desplegado el Worker?`);
  }
  if (!r.ok && !datos.error) throw new Error(`Error ${r.status}`);
  return datos;
}

// ------------------------------------------------------------------ render

let estadoProyectos: Archivo[] = [];
let estadoSecciones: Record<string, boolean> = {};

function pintarLista() {
  const ul = $("#lista");
  ul.replaceChildren();

  if (estadoProyectos.length === 0) {
    ul.append(
      el("li", {
        class: "tech muted",
        textContent: "No hay proyectos todavía.",
      }),
    );
    return;
  }

  for (const archivo of estadoProyectos) {
    const slug = archivo.nombre.replace(/\.mdx$/, "");
    const item = el("li", { class: "fila" });
    item.append(
      el(
        "div",
        { class: "fila-info" },
        el("span", { class: "fila-nombre", textContent: slug }),
        el("span", {
          class: "tech muted small",
          textContent: archivo.path,
        }),
      ),
      el(
        "div",
        { class: "fila-acciones" },
        el("button", {
          class: "btn",
          type: "button",
          textContent: "Editar",
          onclick: () => abrirEditor(archivo),
        }),
        el("button", {
          class: "btn peligro",
          type: "button",
          textContent: "Borrar",
          onclick: () => confirmarBorrado(archivo),
        }),
      ),
    );
    ul.append(item);
  }
}

function pintarSecciones() {
  const contenedor = $("#secciones");
  contenedor.replaceChildren();

  for (const [seccion, valor] of Object.entries(estadoSecciones)) {
    const fila = el("label", { class: "fila toggle" });
    const input = el("input", { type: "checkbox" }) as HTMLInputElement;
    input.checked = valor;

    input.addEventListener("change", async () => {
      const secciones = { ...estadoSecciones, [seccion]: input.checked };
      try {
        const r = await llamar("escribir", {
          path: "src/config/secciones.json",
          contenido: JSON.stringify(secciones, null, 2) + "\n",
          mensaje: `admin: ${input.checked ? "activar" : "desactivar"} ${seccion}`,
        });
        if (!r.ok) throw new Error(r.error);
        estadoSecciones = secciones;
        aviso(
          `Sección "${seccion}" ${
            input.checked ? "activada" : "desactivada"
          }. El sitio se actualiza en ~1 min.`,
        );
      } catch (e) {
        input.checked = !input.checked;
        aviso(e instanceof Error ? e.message : "No se pudo guardar", "error");
      }
    });

    fila.append(input, el("span", { textContent: `Mostrar "${seccion}"` }));
    contenedor.append(fila);
  }
}

async function refrescar() {
  const r = await llamar("listar");
  if (!r.ok) throw new Error(r.error ?? "No se pudo leer el repositorio");
  estadoProyectos = r.proyectos ?? [];
  estadoSecciones = r.secciones ?? {};
  pintarLista();
  pintarSecciones();
}

// ------------------------------------------------------------------ editor

function slugDe(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

type Campos = HTMLFormControlsCollection & { _fm?: Frontmatter };

async function abrirEditor(archivo: Archivo | null) {
  const form = $("#editor") as HTMLFormElement;
  form.reset();
  mostrar("editor", true);

  const campos = form.elements as Campos;
  let cuerpo = PLANTILLA;
  let path = archivo?.path ?? "";

  if (archivo) {
    const r = await llamar("leer", { path: archivo.path });
    if (!r.ok) {
      aviso(r.error ?? "No se pudo leer", "error");
      mostrar("editor", false);
      return;
    }
    const separado = separar(r.contenido ?? "");
    cuerpo = separado.cuerpo;
    const fm = separado.fm;
    campos.title.value = String(fm.title ?? "");
    campos.summary.value = String(fm.summary ?? "");
    campos.date.value = String(fm.date ?? "").slice(0, 10);
    campos.category.value = String(fm.category ?? "dibujo-tecnico");
    campos.software.value = lista(fm.software);
    campos.normativa.value = lista(fm.normativa);
    campos.featured.checked = Boolean(fm.featured);
    campos.draft.checked = Boolean(fm.draft);
    campos.confidential.checked = Boolean(fm.confidential);
    campos._fm = fm;
    $("#editor-titulo").textContent = "Editar proyecto";
  } else {
    campos.date.value = new Date().toISOString().slice(0, 10);
    campos.category.value = "dibujo-tecnico";
    campos.draft.checked = true;
    campos._fm = {
      title: "",
      summary: "",
      date: "",
      featured: false,
      draft: true,
      category: "dibujo-tecnico",
      software: [],
      normativa: [],
      confidential: false,
    };
    $("#editor-titulo").textContent = "Nuevo proyecto";
  }

  campos.body.value = cuerpo.trimStart();

  const sugerencia = slugDe(campos.title.value || "nuevo-proyecto");
  $("#ruta").textContent = archivo ? path : `${DIR_PROYECTOS}${sugerencia}.mdx`;
  mostrar("nuevo", !archivo);
}

async function guardar(evento: Event) {
  evento.preventDefault();
  const form = evento.currentTarget as HTMLFormElement;
  const campos = form.elements as Campos;
  const boton = $("#guardar") as HTMLButtonElement;

  const titulo = campos.title.value.trim();
  if (!titulo) {
    aviso("El título es obligatorio", "error");
    return;
  }

  const previo = campos._fm ?? ({} as Frontmatter);
  const fm: Frontmatter = {
    ...previo,
    title: titulo,
    summary: campos.summary.value.trim(),
    date: new Date(`${campos.date.value}T00:00:00Z`).toISOString(),
    category: campos.category.value,
    featured: campos.featured.checked,
    draft: campos.draft.checked,
    confidential: campos.confidential.checked,
    software: campos.software.value.split(",").map((s) => s.trim()).filter(Boolean),
    normativa: campos.normativa.value.split(",").map((s) => s.trim()).filter(Boolean),
  };

  const nombreArchivo = $("#ruta").textContent ?? "";
  boton.disabled = true;
  try {
    const r = await llamar("escribir", {
      path: nombreArchivo,
      contenido: unir(fm, campos.body.value),
      mensaje: `admin: guardar "${titulo}"`,
    });
    if (!r.ok) throw new Error(r.error);
    aviso("Guardado. El sitio se actualiza en ~1 min.");
    mostrar("editor", false);
    await refrescar();
  } catch (e) {
    aviso(e instanceof Error ? e.message : "No se pudo guardar", "error");
  } finally {
    boton.disabled = false;
  }
}

async function confirmarBorrado(archivo: Archivo) {
  const ok = window.confirm(
    `¿Borrar ${archivo.nombre}? Se elimina el archivo del repo.`,
  );
  if (!ok) return;
  try {
    const r = await llamar("borrar", {
      path: archivo.path,
      mensaje: `admin: borrar ${archivo.nombre}`,
    });
    if (!r.ok) throw new Error(r.error);
    aviso("Proyecto borrado.");
    await refrescar();
  } catch (e) {
    aviso(e instanceof Error ? e.message : "No se pudo borrar", "error");
  }
}

// ----------------------------------------------------------------- arranque

document.addEventListener("DOMContentLoaded", () => {
  // Sin login en el cliente: Cloudflare Access ya autenticó antes de servir
  // esta página. Si el Worker responde 401, falta configurar Access.
  $("#nuevo-proyecto").addEventListener("click", () => abrirEditor(null));
  $("#cancelar").addEventListener("click", () => mostrar("editor", false));
  $("#editor").addEventListener("submit", guardar);

  refrescar().catch((e) => {
    aviso(
      e instanceof Error ? e.message : "No se pudo cargar el panel",
      "error",
    );
  });
});