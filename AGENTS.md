# AGENTS.md — Portafolio Felipe Higuera (Dibujo Técnico Industrial / CAD / Soporte IT)

## Objetivo
Construir un portafolio web estático, rápido y sobrio para un perfil de **Dibujo Técnico Industrial, Modelado CAD/CAM y Soporte IT**. Quien lo revise (reclutadores, jefes de ingeniería) debe ver **planos, modelos y proceso**, no efectos visuales. Cada habilidad del CV debe quedar atada a un proyecto concreto.

## Perfil (fuente de contenido)
- **Nombre:** Felipe Ignacio Higuera Cabello. Maipú, Santiago, Chile.
- **Formación:** Diseñador Industrial, Universidad de Chile (titulado dic 2025). Curso IA Generativa e Ingeniería de Prompts (U. de Chile - VTI, 2026). Diplomado Diseño y Programación Web, AIEP (2023). Certificaciones: Design Thinking (Sence), Facilitación de Equipos (FCFM).
- **Experiencia:**
  - Técnico de Soporte de Equipos Informáticos, YoLiquido (jul–ago 2024): incidencias N1/N2 de hardware y software, RDP, unidades de red, inventario tecnológico con apoyo de IA.
  - Ayudante de Cátedra en Dibujo e Ingeniería de Detalle, FCFM UChile (abr 2019 – jul 2021): vistas, cortes y secciones bajo normativa industrial; extracción de vistas normalizadas desde modelos 3D en Solid Edge y AutoCAD; QA de escalas, acotado y simbología para prototipado IoT.
  - Diseñador de Productos (Manufactura Digital), Chol1 (abr–jul 2020): archivos de corte y planimetría para CNC en Fusion 360, mobiliario RTA; validación de geometría 3D.
  - Asistente de Procesos y Diseño Digital, CapacitaPlus (dic 2014 – feb 2015): documentación en Office, sitio web corporativo en Dreamweaver.
- **Skills:** AutoCAD, Fusion 360 / Inventor, Solid Edge, Rhinoceros 3D · planimetría normada (ISO/ANSI), vistas explotadas, metrología, tolerancias · soporte N1/N2, redes, RDP, ingeniería de prompts · inglés B1/B2 (lectura técnica).
- **Idioma del sitio:** español (Chile). Dejar la estructura lista para i18n a inglés más adelante, sin implementarlo ahora.

> No incluir RUT en el sitio. **El teléfono sí va, por decisión explícita del usuario** (la regla original lo prohibía): aparece solo en el footer, nunca en el cuerpo de las páginas.
> Contacto público: +56 9 3111 0973 · felipehiguera@outlook.cl · LinkedIn: https://www.linkedin.com/in/felipe-h-321316284/

## Stack (decidido)
- **Astro** (última versión estable), salida 100% estática.
- **Contenido en Markdown/MDX** con Content Collections y esquema Zod.
- **React solo si hace falta** como island (`client:visible`); por defecto, componentes `.astro`.
- **CSS:** CSS plano con variables o Tailwind; elegir una y mantenerla. Sin librerías de UI pesadas.
- **Visor 3D:** web component `<model-viewer>` de Google, cargado con carga diferida, modelos en `.glb`.
- **Deploy:** Cloudflare Pages con GitHub Actions (Wrangler). Un solo `dist/`:
  landing en `/`, portfolio en `/portafolio/` (ver `scripts/assemble-dist.mjs`).
- **Imágenes:** `astro:assets` / componente `<Image>` → WebP/AVIF, tamaños responsivos.

### Configuración del deploy
- `site: https://www.fhiguera.fyi` y `base: /portafolio` en `astro.config.mjs`.
- Usar siempre el helper `baseUrl()` (`src/utils/base.ts`); nada de rutas absolutas hardcodeadas.
- Workflow en `.github/workflows/deploy.yml`: build + `wrangler pages deploy dist`.
  Necesita los secrets `CLOUDFLARE_API_TOKEN` (permiso Pages:Edit) y
  `CLOUDFLARE_ACCOUNT_ID`.
- Páginas estáticas reales (una por caso), así que no se necesita hack de SPA ni `404.html` para routing.

## Estructura de páginas
1. **Home (`/`)**: hero con quién es y qué hace (1 párrafo), carrusel de 3 proyectos destacados y acceso al CV. El contacto vive solo en el footer, no en el cuerpo de las páginas.
2. **Proyectos (`/proyectos`)**: grilla de casos de estudio.
3. **Caso de estudio (`/proyectos/[slug]`)**: plantilla fija (abajo).
4. **Soporte IT (`/soporte-it`)**: sección corta con 2–3 casos antes/después.
5. **Sobre mí / CV (`/cv`)**: resumen, experiencia, formación, botón de descarga del PDF.
6. **Contacto**: visible en el footer y en el home; solo `mailto:` y LinkedIn, sin formularios ni backend.

## Estructura del repo
```
/
├─ AGENTS.md
├─ astro.config.mjs
├─ package.json
├─ .github/workflows/deploy.yml
├─ public/
│  ├─ cv/CV-Felipe-Higuera.pdf
│  ├─ models/            # .glb
│  └─ planos/            # PDFs de planos completos
└─ src/
   ├─ content/
   │  ├─ config.ts       # esquema Zod de la colección "proyectos"
   │  └─ proyectos/      # un .mdx por caso
   ├─ components/
   │  ├─ ModelViewer.astro
   │  ├─ PlanoEmbed.astro   # miniatura WebP + enlace/descarga del PDF
   │  ├─ ProjectCard.astro
   │  ├─ SpecList.astro     # software, normativa, entregable
   │  └─ Header.astro / Footer.astro
   ├─ layouts/Base.astro
   ├─ pages/
   │  ├─ index.astro
   │  ├─ cv.astro
   │  ├─ soporte-it.astro
   │  └─ proyectos/{index.astro,[slug].astro}
   ├─ assets/            # imágenes fuente (se optimizan en build)
   └─ styles/global.css
```

## Esquema de la colección `proyectos` (frontmatter)
```yaml
title: string
summary: string            # 1-2 líneas
date: date
featured: boolean
category: "dibujo-tecnico" | "cad-cam" | "soporte-it"
cover: image               # astro:assets
software: string[]         # ej. ["Solid Edge", "AutoCAD"]
normativa: string[]        # ej. ["ISO 128", "ANSI Y14.5"]
model: string?             # ruta al .glb en /public/models
planos: { title: string, thumb: image, pdf: string }[]
confidential: boolean      # si true, mostrar aviso y material redactado
```

## Plantilla de cada caso de estudio (cuerpo del MDX)
1. **Contexto y problema**: qué había que resolver y para quién.
2. **Proceso**: modelo 3D → vistas → cortes/secciones → acotado → validación.
3. **Normativa aplicada**: qué normas y por qué.
4. **Software y herramientas.**
5. **Entregable**: visor 3D y/o planos embebidos.
6. **Resultado / aprendizaje**: una frase concreta, sin inflar.

## Casos de estudio iniciales (contenido a completar por el usuario)
Los textos e imágenes reales los aporta el usuario. **No inventar proyectos, métricas, clientes ni planos.** Usar placeholders marcados con `TODO:` donde falte material.
1. Planimetría normada desde modelo 3D (Solid Edge/AutoCAD), material de la cátedra FCFM.
2. Archivos de corte CNC en Fusion 360, mobiliario RTA (Chol1).
3. Vista explotada y despiece de un ensamblaje.
4. Control de calidad de planos: escalas, acotado y simbología (QA).
5. (Opcional) Soporte IT: RDP + unidades de red.
6. (Opcional) Soporte IT: inventario con herramientas digitales/IA.

## Requisitos de calidad
- **Rendimiento:** Lighthouse ≥ 95 en Performance, Accessibility, Best Practices y SEO.
- **Imágenes:** todo en WebP/AVIF con `width/height` y `loading="lazy"` salvo el LCP. Peso por página idealmente < 1 MB sin contar modelos 3D.
- **3D:** cargar `<model-viewer>` solo cuando el visor entra en pantalla; `.glb` comprimidos (Draco/meshopt), idealmente < 5 MB.
- **Accesibilidad:** HTML semántico, contraste AA, `alt` descriptivo en cada plano, navegación por teclado, `prefers-reduced-motion` respetado.
- **Responsive:** mobile-first; los planos y tablas anchas hacen scroll dentro de su contenedor.
- **SEO:** `<title>` y meta description por página, Open Graph, `sitemap` (`@astrojs/sitemap`), `robots.txt`.
- **Tema:** claro/oscuro con `prefers-color-scheme` mediante variables CSS.

## Diseño
Sobrio, técnico y legible. Mucho espacio en blanco, tipografía clara (una sola familia + monoespaciada para datos técnicos), un solo color de acento. Los planos son los protagonistas. Sin hero a pantalla completa.

Sobre movimiento: se permite, con límite. La regla original era "sin carruseles, sin animaciones decorativas" sin justificar; se relajó porque el sitio se veía plano en mobile. Lo que sigue manda:

- El movimiento es **ilustrativo, no descartable**: el hero traza un plano y el carrusel muestra proyectos.
- **Nada de animación infinita que llame la atención** ni de movimiento al hacer scroll.
- Todo lo animado se apaga bajo `prefers-reduced-motion: reduce`. En el carrusel eso incluye el autoplay: si el usuario lo pidió, la rotación automática no corre.
- El contenido autoplayable debe tener pausa por hover, por foco y con la pestaña oculta.

## Convenciones de trabajo para el agente
- Antes de escribir código, proponer un plan corto de archivos a crear y esperar confirmación.
- Trabajar por etapas, con commits pequeños: (1) scaffold + config de Pages + deploy, (2) layout y estilos base, (3) colección `proyectos` + plantilla de caso, (4) componentes `ModelViewer` y `PlanoEmbed`, (5) Home, Proyectos, CV y Soporte IT, (6) SEO, accesibilidad y Lighthouse.
- Verificar con `npm run build` y `npm run preview` después de cada etapa.
- No agregar dependencias sin justificarlas; preferir las nativas de Astro.
- TypeScript estricto. Sin `any`.
- Si falta contenido real, dejar `TODO:` visible y no rellenar con texto inventado.
- No subir al repo archivos con datos sensibles (RUT, teléfono) ni planos marcados como confidenciales.

## Primer paso sugerido
Inicializar el proyecto (`npm create astro@latest`, plantilla mínima, TypeScript estricto), configurar `site`/`base`, crear el workflow de deploy y verificar que una página vacía se publique en GitHub Pages antes de seguir.
