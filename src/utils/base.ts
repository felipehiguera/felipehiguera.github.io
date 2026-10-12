/**
 * Base del sitio con slash final garantizado.
 *
 * `import.meta.env.BASE_URL` refleja `base` de astro.config, pero no se puede
 * asumir que termine en "/". Todos los links se arman como `${base}ruta`, así
 * que un base sin slash rompería cada URL (`/portafoliofavicon.svg`).
 */
export function baseUrl(): string {
  const base = import.meta.env.BASE_URL;
  return base.endsWith("/") ? base : `${base}/`;
}
