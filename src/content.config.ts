import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Desviación justificada respecto de AGENTS.md: `cover` y `thumb` son
// opcionales hasta que llegue el material real. La plantilla muestra un
// aviso `TODO:` cuando faltan, en vez de inventar imágenes.
// Nota: Astro 7 exige `src/content.config.ts` con loader (colecciones
// legacy eliminadas), por eso no se usa `src/content/config.ts`.
const proyectos = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/proyectos" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      date: z.coerce.date(),
      featured: z.boolean().default(false),
      /**
       * Borrador: el proyecto no aparece en ningún listado y su ruta no se
       * genera, así queda despublicado de verdad. Lo alterna el panel `/admin`.
       */
      draft: z.boolean().default(false),
      category: z.enum(["dibujo-tecnico", "cad-cam", "soporte-it"]),
      cover: image().optional(),
      software: z.array(z.string()).default([]),
      normativa: z.array(z.string()).default([]),
      model: z.string().optional(),
      planos: z
        .array(
          z.object({
            title: z.string(),
            thumb: image().optional(),
            pdf: z.string(),
          }),
        )
        .default([]),
      confidential: z.boolean().default(false),
    }),
});

export const collections = { proyectos };
