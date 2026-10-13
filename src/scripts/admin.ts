import EasyMDE from "easymde";

/**
 * Lógica del panel de administración.
 *
 * Arquitectura dinámica: D1 es la única fuente de verdad y R2 guarda los
 * binarios. Guardar es instantáneo, sin rebuilds. El panel nunca pide rutas:
 * el slug sale del título y las URLs de archivos las devuelve la subida.
 *
 * No habla nunca con GitHub: todo pasa por el Worker `/portafolio/admin/api`,
 * que es el único que toca D1/R2. La autenticación la hace Cloudflare Access
 * antes de servir esta página.
 */

interface Archivo {
  slug: string;
  title: string;
  summary: string;
  date: string;
  featured: boolean;
  draft: boolean;
  category: string;
  confidential: boolean;
  cover: string | null;
  updated_at: string;
}

interface Proyecto extends Archivo {
  software: string[];
  normativa: string[];
  model: string | null;
  planos: Array<{ title: string; url: string }>;
  body: string;
}

interface PlanoOk {
  title: string;
  url: string;
}

interface PlanoNuevo {
  title: string;
  file: File;
}

interface Respuesta {
  ok: boolean;
  error?: string;
  proyectos?: Archivo[];
  proyecto?: Proyecto;
  secciones?: Record<string, boolean> | null;
  slug?: string;
  url?: string;
  key?: string;
}

// ---------------------------------------------------------------- utilidades

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...hijos: Array<Node | string>
): HTMLElementTagNameMap[K] => {
  // `class` no es asignable por propiedad en el DOM (es `className`).
  const { class: clases, ...resto } = props;
  const nodo = Object.assign(document.createElement(tag), resto);
  if (clases) nodo.setAttribute("class", clases);
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

// ------------------------------------------------------------ sesión / API

// Mismo origen y misma app de Access: el navegador llama a la API bajo
// /portafolio/admin/api, ya con la sesión del admin. Sin CORS, sin claves
// públicas, sin login en el cliente.

async function llamar(
  accion: string,
  extra: Record<string, unknown> = {},
): Promise<Respuesta> {
  let r: Response;
  try {
    r = await fetch("/portafolio/admin/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, ...extra }),
    });
  } catch {
    throw new Error("Sin conexión con el servidor. ¿Está desplegado el Worker?");
  }

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

const ETIQUETAS: Record<string, string> = {
  "dibujo-tecnico": "Dibujo técnico",
  "cad-cam": "CAD/CAM",
  "soporte-it": "Soporte IT",
};

function pintarLista() {
  if (!document.getElementById("lista")) return;
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

  const base = document.querySelector("#panel")?.getAttribute("data-base") ?? "/";
  for (const archivo of estadoProyectos) {
    const item = el("li", { class: "fila" });
    const principal = el("div", { class: "fila-principal" });
    if (archivo.cover) {
      const thumb = el("img", { class: "mini", alt: "" }) as HTMLImageElement;
      const src = archivo.cover;
      thumb.src = /^https?:\/\//.test(src) ? src : `${base}${src.replace(/^\//, "")}`;
      thumb.loading = "lazy";
      principal.append(thumb);
    }
    const info = el(
      "div",
      { class: "fila-info" },
      el("span", { class: "fila-nombre", textContent: archivo.title || archivo.slug }),
    );

    const chips = el("div", { class: "chips" });
    chips.append(
      el("span", {
        class: "chip",
        textContent: ETIQUETAS[archivo.category] ?? archivo.category,
      }),
    );
    if (archivo.draft) {
      chips.append(el("span", { class: "chip alerta", textContent: "Borrador" }));
    }
    if (archivo.featured) {
      chips.append(el("span", { class: "chip ok", textContent: "Destacado" }));
    }
    info.append(chips);
    info.append(
      el("span", { class: "tech muted small", textContent: archivo.slug }),
    );
    principal.append(info);

    const acciones = el("div", { class: "fila-acciones" });
    if (!archivo.draft) {
      const ver = el("a", { class: "btn", textContent: "Ver" }) as unknown as HTMLAnchorElement;
      ver.href = `${base}proyectos/${archivo.slug}`;
      ver.target = "_blank";
      ver.rel = "noopener";
      acciones.append(ver);
    }
    acciones.append(
      el("button", {
        class: "btn",
        type: "button",
        textContent: "Editar",
        onclick: () => abrirEditor(archivo.slug),
      }),
      el("button", {
        class: "btn peligro",
        type: "button",
        textContent: "Borrar",
        onclick: () => confirmarBorrado(archivo),
      }),
    );
    item.append(principal, acciones);
    ul.append(item);
  }
}

function pintarSecciones() {
  if (!document.getElementById("secciones")) return;
  const contenedor = $("#secciones");
  contenedor.replaceChildren();

  for (const [seccion, valor] of Object.entries(estadoSecciones)) {
    const fila = el("label", { class: "fila toggle" });
    const input = el("input", { type: "checkbox" }) as HTMLInputElement;
    input.checked = valor;

    input.addEventListener("change", async () => {
      try {
        const r = await llamar("secciones.poner", {
          name: seccion,
          visible: input.checked,
        });
        if (!r.ok) throw new Error(r.error);
        estadoSecciones[seccion] = input.checked;
        aviso(`Sección "${seccion}" ${input.checked ? "activada" : "desactivada"}. Ya está visible.`);
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
  const [lp, ls] = await Promise.all([
    llamar("proyectos.listar"),
    llamar("secciones.leer"),
  ]);
  if (!lp.ok) throw new Error(lp.error ?? "No se pudo leer el repositorio");
  estadoProyectos = lp.proyectos ?? [];
  estadoSecciones = ls.ok && ls.secciones ? ls.secciones : {};

  const total = estadoProyectos.length;
  const borradores = estadoProyectos.filter((a) => a.draft).length;
  const destacados = estadoProyectos.filter((a) => a.featured).length;
  const resumen = document.getElementById("resumen");
  if (resumen) {
    resumen.textContent =
      `${total} proyecto${total === 1 ? "" : "s"} · ` +
      `${total - borradores} publicado${total - borradores === 1 ? "" : "s"} · ` +
      `${borradores} borrador${borradores === 1 ? "" : "es"} · ` +
      `${destacados} destacado${destacados === 1 ? "" : "s"}`;
  }

  pintarLista();
  pintarSecciones();

  // Deep link desde "Editar este proyecto": ?editar=<slug> abre el editor
  // directo después de cargar la lista.
  const editar = new URLSearchParams(window.location.search).get("editar");
  if (editar && estadoProyectos.some((a) => a.slug === editar)) {
    void abrirEditor(editar);
  }
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
  _slugOriginal?: string;
};

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

const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : "");

/** Planos ya guardados (con URL) + nuevos por subir (con File). */
let planosExistentes: PlanoOk[] = [];
let planosNuevos: PlanoNuevo[] = [];

/** URL pública de una portada guardada (/media/...) para mostrarla. */
function urlCover(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  const base = document.querySelector("#panel")?.getAttribute("data-base") ?? "/";
  return `${base}${url.replace(/^\//, "")}`;
}

/** Refresca la mini card de vista previa con lo que hay en el formulario. */
function actualizarVistaCard() {
  const form = $("#editor") as HTMLFormElement;
  const campos = form.elements as Campos;
  const titulo = campos.title.value.trim() || "Título del proyecto";
  const resumen = campos.summary.value.trim() || "Resumen de una o dos líneas.";
  const fecha = campos.date.value;
  const categoria = campos.category.value;
  const cover = campos.cover.value.trim();

  const img = $("#vista-card-img") as HTMLImageElement;
  const src = urlCover(cover);
  if (src) {
    img.src = src;
    img.alt = `Portada de ${titulo}`;
    img.hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
  }
  $("#vista-card-meta").textContent =
    `${ETIQUETAS[categoria] ?? categoria}${fecha ? ` · ${fecha.slice(0, 7)}` : ""}`;
  $("#vista-card-titulo").textContent = titulo;
  $("#vista-card-resumen").textContent = resumen;
}

/** Llena el modal de vista previa con lo que hay en el formulario. */
function abrirVistaPrevia() {
  actualizarVistaCard();
  const tomar = (id: string) =>
    document.querySelector(`#${id}`)?.textContent ?? "";
  const imgModal = $("#vista-modal-img") as HTMLImageElement;
  const imgMini = $("#vista-card-img") as HTMLImageElement;
  if (!imgMini.hidden && imgMini.src) {
    imgModal.src = imgMini.src;
    imgModal.alt = imgMini.alt;
    imgModal.hidden = false;
  } else {
    imgModal.removeAttribute("src");
    imgModal.hidden = true;
  }
  $("#vista-modal-meta").textContent = tomar("vista-card-meta");
  $("#vista-modal-titulo").textContent = tomar("vista-card-titulo");
  $("#vista-modal-resumen").textContent = tomar("vista-card-resumen");
  mostrar("vista-modal", true);
  (document.querySelector("#vista-cerrar") as HTMLButtonElement).focus();
}

function cerrarVistaPrevia() {
  mostrar("vista-modal", false);
}

/** Muestra la portada actual en el formulario (o la oculta si no hay). */
function pintarVistaCover(url: string) {
  const img = $("#cover-vista") as HTMLImageElement;
  if (url) {
    img.src = urlCover(url);
    img.hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
  }
  actualizarVistaCard();
}

function pintarPlanos() {
  const ul = $("#planos-lista");
  ul.replaceChildren();

  const filaPlano = (
    titulo: string,
    sub: string,
    quitar: () => void,
  ) => {
    const li = el("li", { class: "fila" });
    li.append(
      el(
        "div",
        { class: "fila-info" },
        el("span", { class: "fila-nombre", textContent: titulo || "(sin título)" }),
        el("span", { class: "tech muted small", textContent: sub }),
      ),
      el(
        "div",
        { class: "fila-acciones" },
        el("button", {
          class: "btn peligro",
          type: "button",
          textContent: "Quitar",
          onclick: quitar,
        }),
      ),
    );
    ul.append(li);
  };

  if (planosExistentes.length === 0 && planosNuevos.length === 0) {
    ul.append(
      el("li", { class: "tech muted small", textContent: "Sin planos todavía." }),
    );
    return;
  }
  planosExistentes.forEach((p, i) =>
    filaPlano(p.title, p.url, () => {
      planosExistentes.splice(i, 1);
      pintarPlanos();
    }),
  );
  planosNuevos.forEach((p, i) =>
    filaPlano(
      p.title,
      `${p.file.name} (se sube al guardar)`,
      () => {
        planosNuevos.splice(i, 1);
        pintarPlanos();
      },
    ),
  );
}

async function abrirEditor(slug: string | null) {
  const form = $("#editor") as HTMLFormElement;
  form.reset();
  mostrar("editor", true);
  mostrar("exito", false);
  mostrar("errores", false);
  $("#portada-estado").textContent = "";
  $("#modelo-estado").textContent = "";
  pintarVistaCover("");
  planosExistentes = [];
  planosNuevos = [];
  pintarPlanos();

  const campos = form.elements as Campos;
  const slugInput = campos.slug as unknown as HTMLInputElement;
  slugInput.oninput = null;
  campos.title.oninput = null;

  if (slug) {
    const r = await llamar("proyectos.leer", { slug });
    if (!r.ok || !r.proyecto) {
      aviso(r.error ?? "No se pudo leer", "error");
      mostrar("editor", false);
      return;
    }
    const p = r.proyecto;
    campos.title.value = p.title;
    campos.summary.value = p.summary;
    campos.date.value = p.date.slice(0, 10);
    campos.category.value = p.category;
    campos.software.value = lista(p.software);
    campos.normativa.value = lista(p.normativa);
    campos.featured.checked = p.featured;
    campos.confidential.checked = p.confidential;
    (campos.estado as unknown as { value: string }).value = p.draft
      ? "borrador"
      : "publicado";
    campos.cover.value = p.cover ?? "";
    pintarVistaCover(p.cover ?? "");
    campos.model.value = p.model ?? "";
    campos.body.value = (p.body || "").trimStart() || PLANTILLA;
    campos._slugOriginal = p.slug;
    slugInput.value = p.slug;
    slugInput.disabled = true;
    planosExistentes = [...p.planos];
    pintarPlanos();
    $("#editor-titulo").textContent = "Editar proyecto";
    $("#ruta").textContent = `/${p.slug}`;
  } else {
    campos.date.value = new Date().toISOString().slice(0, 10);
    campos.category.value = "dibujo-tecnico";
    (campos.estado as unknown as { value: string }).value = "borrador";
    campos._slugOriginal = undefined;
    slugInput.value = "";
    slugInput.disabled = false;
    campos.body.value = PLANTILLA;
    $("#editor-titulo").textContent = "Nuevo proyecto";

    // El slug sigue al título hasta que se toca a mano.
    let tocado = false;
    slugInput.oninput = () => {
      tocado = true;
    };
    campos.title.oninput = () => {
      if (!tocado) slugInput.value = slugDe(campos.title.value);
    };
  }
  document.querySelector("#editor")?.scrollIntoView({ block: "start", behavior: "smooth" });

  // La mini card se actualiza sola con cada tecla.
  form.oninput = () => actualizarVistaCard();
  actualizarVistaCard();

  // EasyMDE reemplaza el textarea: al crear toma su contenido inicial; si ya
  // existe hay que setear por API. Refrescar porque el formulario parte
  // oculto (CodeMirror mide mal en display:none). Si falla, se avisa en vez
  // de dejar el textarea pelado en silencio.
  try {
    if (!editorMDE) {
      editorMDE = crearEditorMDE(areaTexto());
    } else {
      editorMDE.value(areaTexto().value);
    }
    editorMDE.codemirror.refresh();
  } catch (e) {
    aviso(
      `No arrancó el editor visual: ${e instanceof Error ? e.message : e}. Se puede escribir Markdown a mano igual.`,
      "error",
    );
  }
}

/** Sube un archivo a R2 y devuelve su URL pública (/media/...). */
async function subirArchivo(
  tipo: "portada" | "plano" | "modelo",
  slug: string,
  file: File,
): Promise<string> {
  let nombre = file.name;
  if (tipo === "portada") {
    // Portadas: achicar a 1600px y convertir a WebP en el navegador.
    const dataUrl = await new Promise<string>((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/webp", 0.82);
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
    nombre = file.name.replace(/\.[^.]+$/, "") + ".webp";
    const r = await llamar("media.subir", {
      tipo,
      slug,
      nombre,
      base64: dataUrl.split(",")[1] ?? "",
    });
    if (!r.ok || !r.url) throw new Error(r.error ?? "No se pudo subir");
    return r.url;
  }

  const bin = await file.arrayBuffer();
  const bytes = new Uint8Array(bin);
  let bin2 = "";
  const PASO = 0x8000;
  for (let i = 0; i < bytes.length; i += PASO) {
    bin2 += String.fromCharCode(...bytes.subarray(i, i + PASO));
  }
  const r = await llamar("media.subir", {
    tipo,
    slug,
    nombre: file.name,
    base64: btoa(bin2),
  });
  if (!r.ok || !r.url) throw new Error(r.error ?? "No se pudo subir");
  return r.url;
}

async function guardar(evento: Event) {
  evento.preventDefault();
  const form = evento.currentTarget as HTMLFormElement;
  const campos = form.elements as Campos;
  const boton = $("#guardar") as HTMLButtonElement;

  // Validación con errores junto a cada campo + resumen arriba.
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
  const slugFinal =
    (campos.slug as unknown as HTMLInputElement).value.trim() ||
    slugDe(titulo);

  boton.disabled = true;
  mostrar("guardando", true);
  try {
    // Archivos: primero se suben a R2, después se guarda la fila con URLs.
    const portadaFile = (
      document.querySelector("#portada-file") as HTMLInputElement
    ).files?.[0];
    let cover = campos.cover.value.trim();
    if (portadaFile) {
      $("#portada-estado").textContent = "Subiendo portada…";
      cover = await subirArchivo("portada", slugFinal, portadaFile);
      campos.cover.value = cover;
      pintarVistaCover(cover);
      $("#portada-estado").textContent = "Portada subida.";
    }

    const modeloFile = (
      document.querySelector("#modelo-file") as HTMLInputElement
    ).files?.[0];
    let model = campos.model.value.trim();
    if (modeloFile) {
      $("#modelo-estado").textContent = "Subiendo modelo…";
      model = await subirArchivo("modelo", slugFinal, modeloFile);
      campos.model.value = model;
      $("#modelo-estado").textContent = "Modelo subido.";
    }

    const planos: PlanoOk[] = [...planosExistentes];
    for (const n of planosNuevos) {
      const url = await subirArchivo("plano", slugFinal, n.file);
      planos.push({ title: n.title.trim() || n.file.name, url });
    }

    const r = await llamar("proyectos.guardar", {
      proyecto: {
        slug: campos._slugOriginal ? undefined : slugFinal,
        slugOriginal: campos._slugOriginal,
        title: titulo,
        summary: resumen,
        date: fecha,
        category: campos.category.value,
        featured: campos.featured.checked,
        draft: esBorrador,
        confidential: campos.confidential.checked,
        software: campos.software.value.split(",").map((s) => s.trim()).filter(Boolean),
        normativa: campos.normativa.value.split(",").map((s) => s.trim()).filter(Boolean),
        cover: cover || null,
        model: model || null,
        planos,
        body: cuerpoActual(),
      },
    });
    if (!r.ok || !r.slug) throw new Error(r.error ?? "No se pudo guardar");

    // Queda abierto como edición del slug definitivo que devolvió el servidor.
    campos._slugOriginal = r.slug;
    (campos.slug as unknown as HTMLInputElement).value = r.slug;
    (campos.slug as unknown as HTMLInputElement).disabled = true;
    $("#ruta").textContent = `/${r.slug}`;
    $("#editor-titulo").textContent = "Editar proyecto";
    planosExistentes = [...planos];
    planosNuevos = [];
    pintarPlanos();

    const ver = $("#exito-ver") as HTMLAnchorElement;
    if (!esBorrador) {
      const base = document.querySelector("#panel")?.getAttribute("data-base") ?? "/";
      ver.href = `${base}proyectos/${r.slug}`;
      ver.hidden = false;
    } else {
      ver.hidden = true;
    }
    mostrar("exito", true);
    // En embed, la página madre recarga al recibir el aviso.
    if (new URLSearchParams(window.location.search).has("embed")) {
      window.parent.postMessage({ tipo: "proyecto-guardado" }, window.location.origin);
    }
    document.querySelector("#exito")?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    await refrescar();
  } catch (e) {
    aviso(e instanceof Error ? e.message : "No se pudo guardar", "error");
  } finally {
    boton.disabled = false;
    mostrar("guardando", false);
  }
}

async function confirmarBorrado(archivo: Archivo) {
  const ok = window.confirm(
    `¿Borrar ${archivo.title || archivo.slug}? Se elimina de la base. Los archivos en R2 quedan huérfanos (no pesan en el sitio).`,
  );
  if (!ok) return;
  try {
    const r = await llamar("proyectos.borrar", { slug: archivo.slug });
    if (!r.ok) throw new Error(r.error);
    aviso("Proyecto borrado.");
    await refrescar();
  } catch (e) {
    aviso(e instanceof Error ? e.message : "No se pudo borrar", "error");
  }
}

/** Textarea del cuerpo (EasyMDE lo reemplaza visualmente, pero sigue ahí). */
function areaTexto(): HTMLTextAreaElement {
  return document.querySelector('[name="body"]') as HTMLTextAreaElement;
}

/** Instancia única del editor Markdown (se crea al abrir el formulario). */
let editorMDE: EasyMDE | null = null;

function boton(
  nombre: string,
  accion: (editor: EasyMDE) => void,
  icono: string,
  titulo: string,
) {
  return { name: nombre, action: accion, className: icono, title: titulo };
}

/** Barra en español: lo esencial para escribir un caso bien. */
function crearEditorMDE(area: HTMLTextAreaElement): EasyMDE {
  return new EasyMDE({
    element: area,
    spellChecker: false,
    status: false,
    placeholder: "Contá el caso: contexto, proceso, normativa, software, entregable, resultado…",
    maxHeight: "24rem",
    toolbar: [
      boton("negrita", EasyMDE.toggleBold, "fa-solid fa-bold", "Negrita (Ctrl+B)"),
      boton("cursiva", EasyMDE.toggleItalic, "fa-solid fa-italic", "Cursiva (Ctrl+I)"),
      boton("titulo", EasyMDE.toggleHeadingSmaller, "fa-solid fa-heading", "Título"),
      boton("cita", EasyMDE.toggleBlockquote, "fa-solid fa-quote-left", "Cita"),
      boton("lista", EasyMDE.toggleUnorderedList, "fa-solid fa-list-ul", "Lista"),
      boton("numerada", EasyMDE.toggleOrderedList, "fa-solid fa-list-ol", "Lista numerada"),
      boton("enlace", EasyMDE.drawLink, "fa-solid fa-link", "Enlace (Ctrl+K)"),
      boton("imagen", EasyMDE.drawImage, "fa-solid fa-image", "Imagen (pega la URL)"),
      boton("tabla", EasyMDE.drawTable, "fa-solid fa-table", "Tabla"),
      boton("vista", EasyMDE.togglePreview, "fa-solid fa-eye", "Vista previa"),
      boton("lado", EasyMDE.toggleSideBySide, "fa-solid fa-columns", "Lado a lado"),
      boton("pantalla", EasyMDE.toggleFullScreen, "fa-solid fa-expand", "Pantalla completa"),
    ],
  });
}

function cuerpoActual(): string {
  if (editorMDE) return editorMDE.value();
  return areaTexto().value;
}

// ----------------------------------------------------------------- arranque

document.addEventListener("DOMContentLoaded", () => {
  // Sin login en el cliente: Cloudflare Access ya autenticó antes de servir
  // esta página. Si el Worker responde 401, falta configurar Access.
  // En modo embed no hay lista ni botón nuevo: solo el editor.
  document.querySelector("#nuevo-proyecto")?.addEventListener("click", () => abrirEditor(null));
  $("#cancelar").addEventListener("click", () => mostrar("editor", false));
  $("#exito-seguir").addEventListener("click", () => mostrar("exito", false));
  $("#exito-cerrar").addEventListener("click", () => {
    mostrar("exito", false);
    mostrar("editor", false);
  });
  $("#editor").addEventListener("submit", guardar);
  $("#vista-previa").addEventListener("click", abrirVistaPrevia);
  $("#vista-cerrar").addEventListener("click", cerrarVistaPrevia);
  $("#vista-velo").addEventListener("click", cerrarVistaPrevia);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#vista-modal").hidden) cerrarVistaPrevia();
  });
  $("#plano-agregar")?.addEventListener("click", () => {
    const titulo = (
      document.querySelector("#plano-titulo") as HTMLInputElement
    ).value.trim();
    const file = (document.querySelector("#plano-file") as HTMLInputElement)
      .files?.[0];
    if (!file) {
      aviso("Elegí el PDF del plano primero", "error");
      return;
    }
    if (!/\.pdf$/i.test(file.name)) {
      aviso("El plano tiene que ser PDF", "error");
      return;
    }
    planosNuevos.push({ title: titulo, file });
    (document.querySelector("#plano-titulo") as HTMLInputElement).value = "";
    (document.querySelector("#plano-file") as HTMLInputElement).value = "";
    pintarPlanos();
  });

  refrescar().catch((e) => {
    aviso(
      e instanceof Error ? e.message : "No se pudo cargar el panel",
      "error",
    );
  });
});
