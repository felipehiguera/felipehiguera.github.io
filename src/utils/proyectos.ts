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

export function fechaCorta(fecha: Date): string {
  return fecha.toLocaleDateString("es-CL", {
    year: "numeric",
    month: "short",
  });
}
