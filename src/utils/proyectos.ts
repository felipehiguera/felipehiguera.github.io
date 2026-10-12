export const CATEGORIAS = {
  "dibujo-tecnico": "Dibujo técnico",
  "cad-cam": "CAD/CAM",
  "soporte-it": "Soporte IT",
} as const;

export type Categoria = keyof typeof CATEGORIAS;

export function etiquetaCategoria(categoria: Categoria): string {
  return CATEGORIAS[categoria];
}

/** Slug de ruta a partir del `id` de la colección (tolera extensión o no). */
export function slugDe(id: string): string {
  return id.replace(/\.[^.]+$/, "");
}

/**
 * "jul 2021".
 *
 * `timeZone: "UTC"` es obligatorio: el frontmatter YAML parsea `2021-07-01` como
 * medianoche UTC, y formatear en la zona local de quien buildea lo corre un día
 * hacia atrás (en Chile, julio se muestra como junio). Fijar UTC hace que el
 * texto coincida siempre con el `date:` del frontmatter y con el atributo
 * `datetime`, sin importar dónde se compile.
 */
export function fechaCorta(fecha: Date): string {
  return fecha.toLocaleDateString("es-CL", {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
