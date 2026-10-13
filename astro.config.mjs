// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // SSR en el Worker del portfolio. D1 es la fuente de verdad: las páginas
  // leen en cada request, así que guardar desde /admin es instantáneo.
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  // www.fhiguera.fyi/portafolio vía Worker con ruta /portafolio/*.
  // El landing va en la raíz de www (Pages).
  site: "https://www.fhiguera.fyi",
  base: "/portafolio",
  vite: {
    plugins: [tailwindcss()]
  },
});
