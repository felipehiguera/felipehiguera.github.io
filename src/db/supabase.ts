import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para el navegador.
 *
 * Solo lo usa `/admin`. Las claves son públicas por diseño: lo que protege las
 * escrituras es la Edge Function, que valida el JWT, exige que el correo esté
 * en la lista blanca y es la única que tiene el token de GitHub.
 *
 * Si faltan las variables, `url` y `key` quedan sin definir y `createClient`
 * lanza. Por eso se exportan aparte: la página decide qué mostrar antes de
 * tocar este módulo.
 */
export const url = import.meta.env.PUBLIC_SUPABASE_URL;
export const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
export const hayConfig = Boolean(url && anonKey);

let instancia: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!instancia) {
    instancia = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return instancia;
}

/** Endpoint de la Edge Function que concentra todas las escrituras. */
export const endpointAdmin = `${url}/functions/v1/admin`;