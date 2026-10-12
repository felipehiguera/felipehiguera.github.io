// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  // Sitio de usuario GitHub Pages: https://felipehiguera.github.io
  // Base "/" (por defecto, no configurar `base`).
  site: "https://felipehiguera.github.io",
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