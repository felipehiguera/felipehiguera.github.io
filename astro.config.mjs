// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Sitio de usuario GitHub Pages: https://snozzono.github.io
  // Base "/" (por defecto, no configurar `base`).
  site: "https://snozzono.github.io",
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap()]
});