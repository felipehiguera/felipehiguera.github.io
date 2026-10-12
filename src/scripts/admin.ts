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

// Mismo origen y misma app de Access: el navegador llama a la API bajo
// /portafolio/admin/api, ya con la sesión del admin. Sin CORS, sin claves
// públicas, sin login en el cliente.

async function llamar(
  accion: string,
  extra: Record<string, unknown> = {},
): Promise<Respuesta> {
  const r = await fetch("/portafolio/admin/api", {
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
/** Frontmatter por path, para las insignias de la lista. */
let metaProyectos: Record<string, Frontmatter> = {};

const ETIQUETAS: Record<string, string> = {
  "dibujo-tecnico": "Dibujo técnico",
  "cad-cam": "CAD/CAM",
  "soporte-it": "Soporte IT",
};

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
    const info = el(
      "div",
      { class: "fila-info" },
      el("span", { class: "fila-nombre", textContent: slug }),
    );

    // Insignias de estado: categoría, borrador y destacado de un vistazo.
    const fm = metaProyectos[archivo.path];
    const esBorrador = Boolean(fm?.draft);
    if (fm) {
      const chips = el("div", { class: "chips" });
      const categoria = String(fm.category ?? "");
      if (categoria) {
        chips.append(
          el("span", {
            class: "chip",
            textContent: ETIQUETAS[categoria] ?? categoria,
          }),
        );
      }
      if (fm.draft) {
        chips.append(el("span", { class: "chip alerta", textContent: "Borrador" }));
      }
      if (fm.featured) {
        chips.append(el("span", { class: "chip ok", textContent: "Destacado" }));
      }
      info.append(chips);
    }

    info.append(
      el("span", { class: "tech muted small", textContent: archivo.path }),
    );

    const acciones = el("div", { class: "fila-acciones" });
    // "Ver" solo si está publicado: un borrador no tiene ruta.
    if (fm && !esBorrador) {
      const base =
        document.querySelector("#panel")?.getAttribute("data-base") ?? "/";
      const ver = el("a", {
        class: "btn",
        textContent: "Ver",
      }) as unknown as HTMLAnchorElement;
      ver.href = `${base}proyectos/${slug}`;
      ver.target = "_blank";
      ver.rel = "noopener";
      acciones.append(ver);
    }
    acciones.append(
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
    );
    item.append(info, acciones);
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

  // Frontmatter para las insignias. Si alguno falla, la fila igual aparece,
  // solo sin insignias.
  const metas = await Promise.allSettled(
    estadoProyectos.map(async (a) => {
      const lr = await llamar("leer", { path: a.path });
      const fm = lr.ok ? separar(lr.contenido ?? "").fm : ({} as Frontmatter);
      return [a.path, fm] as const;
    }),
  );
  metaProyectos = {};
  for (const m of metas) {
    if (m.status === "fulfilled") metaProyectos[m.value[0]] = m.value[1];
  }

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

type Campos = HTMLFormControlsCollection & {
  _fm?: Frontmatter;
  _path?: string;
};

async function abrirEditor(archivo: Archivo | null) {
  const form = $("#editor") as HTMLFormElement;
  form.reset();
  mostrar("editor", true);
  $("#portada-estado").textContent = "";

  const campos = form.elements as Campos;
  mostrar("exito", false);
  mostrar("errores", false);
  let cuerpo = PLANTILLA;

  // El slug solo se edita al crear. Al editar, el archivo ya existe y el
  // nombre no se toca (renombrar sería borrar + crear, se pierde historial).
  const slugInput = campos.slug as unknown as HTMLInputElement;
  slugInput.oninput = null;
  campos.title.oninput = null;

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
    (campos.estado as unknown as { value: string }).value = fm.draft
      ? "borrador"
      : "publicado";
    campos.confidential.checked = Boolean(fm.confidential);
    campos.cover.value = String(fm.cover ?? "");
    campos.model.value = String(fm.model ?? "");
    campos._fm = fm;
    slugInput.value = archivo.nombre.replace(/\.mdx$/, "");
    slugInput.disabled = true;
    campos._path = archivo.path;
    $("#ruta").textContent = archivo.path;
    $("#editor-titulo").textContent = "Editar proyecto";
  } else {
    campos.date.value = new Date().toISOString().slice(0, 10);
    campos.category.value = "dibujo-tecnico";
    (campos.estado as unknown as { value: string }).value = "borrador";
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
    campos._path = undefined;
    slugInput.value = "";
    slugInput.disabled = false;
    $("#editor-titulo").textContent = "Nuevo proyecto";

    // El slug sigue al título hasta que se toca a mano.
    let tocado = false;
    const actualizarRuta = () => {
      const s =
        slugInput.value.trim() ||
        slugDe(campos.title.value || "nuevo-proyecto");
      $("#ruta").textContent = `${DIR_PROYECTOS}${s}.mdx`;
    };
    slugInput.oninput = () => {
      tocado = true;
      actualizarRuta();
    };
    campos.title.oninput = () => {
      if (!tocado) {
        slugInput.value = slugDe(campos.title.value);
        actualizarRuta();
      }
    };
    actualizarRuta();
  }

  campos.body.value = cuerpo.trimStart();
  mostrar("nuevo", !archivo);
}

async function guardar(evento: Event) {
  evento.preventDefault();
  const form = evento.currentTarget as HTMLFormElement;
  const campos = form.elements as Campos;
  const boton = $("#guardar") as HTMLButtonElement;

  // Validación con errores junto a cada campo + resumen arriba. Sin esto, un
  // cliente no sabe por qué no guarda.
  const problemas: Array<{ campo: string; texto: string }> = [];
  const marcar = (nombre: string, mal: boolean) => {
    const input = campos[nombre] as unknown as HTMLInputElement;
    input.setAttribute("aria-invalid", mal ? "true" : "false");
    document
      .querySelector(`[data-err-for="${nombre}"]`)
      ?.toggleAttribute("hidden", !mal);
  };
  const titulo = campos.title.value.trim();
  marcar("title", !titulo);
  if (!titulo) problemas.push({ campo: "title", texto: "Título" });
  const resumen = campos.summary.value.trim();
  marcar("summary", !resumen);
  if (!resumen) problemas.push({ campo: "summary", texto: "Resumen" });
  const fecha = campos.date.value;
  marcar("date", !fecha);
  if (!fecha) problemas.push({ campo: "date", texto: "Fecha" });

  const caja = $("#errores");
  const listaErrores = $("#errores-lista");
  listaErrores.replaceChildren();
  if (problemas.length > 0) {
    for (const p of problemas) {
      listaErrores.append(el("li", { textContent: `Falta: ${p.texto}.` }));
    }
    caja.hidden = false;
    (campos[problemas[0].campo] as unknown as HTMLInputElement).focus();
    return;
  }
  caja.hidden = true;

  const esBorrador =
    (campos.estado as unknown as { value: string }).value === "borrador";
  const previo = campos._fm ?? ({} as Frontmatter);
  const fm: Frontmatter = {
    ...previo,
    title: titulo,
    summary: resumen,
    date: new Date(`${fecha}T00:00:00Z`).toISOString(),
    category: campos.category.value,
    featured: campos.featured.checked,
    draft: esBorrador,
    confidential: campos.confidential.checked,
    software: campos.software.value.split(",").map((s) => s.trim()).filter(Boolean),
    normativa: campos.normativa.value.split(",").map((s) => s.trim()).filter(Boolean),
  };

  // Portada y modelo: campo vacío = clave afuera. Un string vacío rompería
  // la validación (`image()` espera una imagen real, no "").
  const cover = campos.cover.value.trim();
  if (cover) fm.cover = cover;
  else delete fm.cover;
  const model = campos.model.value.trim();
  if (model) fm.model = model;
  else delete fm.model;

  // Al crear, el path sale del slug; al editar, el archivo ya existe.
  const slug = (campos.slug as unknown as HTMLInputElement).value.trim() ||
    slugDe(titulo);
  const nombreArchivo = campos._path ?? `${DIR_PROYECTOS}${slug}.mdx`;
  boton.disabled = true;
  mostrar("guardando", true);
  try {
    const r = await llamar("escribir", {
      path: nombreArchivo,
      contenido: unir(fm, campos.body.value),
      mensaje: `admin: guardar "${titulo}"`,
    });
    if (!r.ok) throw new Error(r.error);

    // El editor queda abierto con lo guardado: si era nuevo, ahora es una
    // edición (el archivo ya existe). La lista se refresca por detrás.
    campos._fm = fm;
    campos._path = nombreArchivo;
    (campos.slug as unknown as HTMLInputElement).value = slug;
    (campos.slug as unknown as HTMLInputElement).disabled = true;
    $("#ruta").textContent = nombreArchivo;
    $("#editor-titulo").textContent = "Editar proyecto";
    mostrar("nuevo", false);

    // Caja de éxito con link a la página (solo si está publicado).
    const ver = $("#exito-ver") as HTMLAnchorElement;
    if (!esBorrador) {
      const base =
        document.querySelector("#panel")?.getAttribute("data-base") ?? "/";
      ver.href = `${base}proyectos/${slug}`;
      ver.hidden = false;
    } else {
      ver.hidden = true;
    }
    mostrar("exito", true);
    document
      .querySelector("#exito")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    await refrescar();
  } catch (e) {
    aviso(e instanceof Error ? e.message : "No se pudo guardar", "error");
  } finally {
    boton.disabled = false;
    mostrar("guardando", false);
  }
}

// ---------------------------------------------------------- subir portada

/**
 * Achica la imagen a 1600 px como máximo y la convierte a WebP en el
 * navegador, antes de subir. Así el repo no engorda con fotos de 12 MP y el
 * Worker recibe algo liviano (igual valida tipo y 8 MB del su lado).
 */
function redimensionar(archivo: File, max: number, calidad: number): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/webp", calidad);
      if (!data.startsWith("data:image/webp")) {
        rej(new Error("El navegador no pudo convertir a WebP"));
        return;
      }
      res(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("Archivo no legible como imagen"));
    };
    img.src = url;
  });
}

async function subirPortada() {
  const input = $("#portada-file") as HTMLInputElement;
  const archivo = input.files?.[0];
  if (!archivo) {
    aviso("Elegí una imagen primero", "error");
    return;
  }

  const estado = $("#portada-estado");
  estado.textContent = "Procesando y subiendo…";
  try {
    const dataUrl = await redimensionar(archivo, 1600, 0.82);
    const slug =
      (document.querySelector('[name="slug"]') as HTMLInputElement).value.trim() ||
      "sin-titulo";
    const nombre = archivo.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "portada";
    const path = `src/assets/proyectos/${slug}-${nombre}.webp`;

    const r = await llamar("subir", {
      path,
      base64: dataUrl.split(",")[1] ?? "",
      mensaje: `admin: subir portada de ${slug}`,
    });
    if (!r.ok) throw new Error(r.error);

    // Ruta relativa al .mdx, que es como Astro la resuelve (`image()`).
    (document.querySelector('[name="cover"]') as HTMLInputElement).value =
      `../../assets/proyectos/${slug}-${nombre}.webp`;
    estado.textContent = "Subida y asignada como portada. Guardá el proyecto.";
    aviso("Portada subida. Falta guardar el proyecto.");
  } catch (e) {
    estado.textContent = "";
    aviso(e instanceof Error ? e.message : "No se pudo subir", "error");
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
  $("#subir-portada").addEventListener("click", subirPortada);
  $("#cancelar").addEventListener("click", () => mostrar("editor", false));
  $("#exito-seguir").addEventListener("click", () => mostrar("exito", false));
  $("#exito-cerrar").addEventListener("click", () => {
    mostrar("exito", false);
    mostrar("editor", false);
  });
  $("#editor").addEventListener("submit", guardar);

  refrescar().catch((e) => {
    aviso(
      e instanceof Error ? e.message : "No se pudo cargar el panel",
      "error",
    );
  });
});