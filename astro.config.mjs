// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // TODO: reemplazar con la URL real del sitio de usuario,
  // ej. "https://<usuario>.github.io". Requerido por @astrojs/sitemap.
  // Sitio de usuario => base "/" (por defecto, no configurar `base`).
  site: "https://example.com",
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap()]
});