// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  // www.fhiguera.fyi/portafolio vía Worker proxy (ver workers/portafolio).
  // El portfolio vive bajo /portafolio; el landing va en la raíz de www.
  site: "https://www.fhiguera.fyi",
  base: "/portafolio",
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    // `/admin` no tiene nada que un buscador deba indexar.
    sitemap({
      filter: (page) => !page.includes("/admin"),
    }),
    mdx(),
  ]
});