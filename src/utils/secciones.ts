import secciones from "../config/secciones.json";

/**
 * Interruptores de sección del sitio.
 *
 * Poner una en `false` saca el módulo del nav y de la home, y le marca la
 * página con `noindex`. La ruta sigue existiendo: quitar el archivo de la
 * página sería la única forma de que `/<seccion>` dejara de responder, y eso
 * no lo hace un toggle.
 *
 * Este archivo lo edita el panel de administración (`/admin`), que escribe
 * sobre él por la API de GitHub. Formato deliberadamente plano — solo
 * booleanos — para que editarlo sea seguro.
 */
export type Seccion = keyof typeof secciones;

export function seccionActiva(seccion: Seccion): boolean {
  return secciones[seccion];
}

export function seccionesActivas(): Seccion[] {
  return (Object.keys(secciones) as Seccion[]).filter(seccionActiva);
}