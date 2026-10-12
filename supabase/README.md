# Panel de administración

Rutas de escritura para editar los proyectos sin tocar código ni usar GitHub.

## Cómo funciona

```
Admin → /admin (login Supabase)
          ↓ JWT
       Edge Function  ← valida el token + lista blanca de correos
          ↓
       API de GitHub   (PAT guardado como secreto del servidor)
          ↓
       commit a main → deploy automático → sitio actualizado
```

El repositorio sigue siendo la fuente de verdad: el contenido son archivos
`.mdx` y cada cambio es un commit. **No hay base de datos**; Supabase se usa
solo para el login y como proxy.

Por qué el token no está en el repositorio: el repo es público. Cualquier
credencial que llegue al navegador queda expuesta, y con ella se podría editar
el sitio. Por eso el PAT vive únicamente en los secretos de la Edge Function.

## Setup (una vez)

### 1. Crear el proyecto

<https://supabase.com/dashboard> → **New project**. El plan Free alcanza
(50k usuarios/mes en Auth, 500k invocaciones/mes en funciones).

### 2. Activar el login por correo

**Authentication → Sign In / Providers → Email** → activar. Si vas a usar
"Continuar con Google", activar también el proveedor de Google con el client ID
y secret de Google Cloud.

### 3. Copiar las claves al sitio

**Project Settings → API** → copiar *Project URL* y *anon public key* en un
archivo `.env` en la raíz del repo (basado en `.env.example`):

```
PUBLIC_SUPABASE_URL=https://tuproyecto.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Estas dos **son públicas por diseño**. La seguridad no depende de ellas.

### 4. Crear el token de GitHub

En <https://github.com/settings/personal-access-tokens/new> (fine-grained):

- **Resource owner**: `felipehiguera`
- **Repository access**: *Only select repositories* → `felipehiguera.github.io`
- **Permissions → Repository permissions → Contents**: *Read and write*

Es el único permiso que necesita. El token empieza por `github_pat_`.

### 5. Publicar la función

```bash
npm install -g supabase
supabase login
supabase link --project-ref <el-ref-de-tu-proyecto>

# Lista blanca: quién puede entrar al panel
supabase secrets set ADMIN_EMAILS=tu@correo.cl,tercero@correo.cl
# PAT de GitHub, solo en el servidor
supabase secrets set GITHUB_TOKEN=github_pat_...
supabase secrets set GITHUB_REPO=felipehiguera/felipehiguera.github.io

supabase functions deploy admin
```

### 6. Crear la cuenta

**Authentication → Users → Add user** → email, contraseña, y marcar *Auto
Confirm User*. Hay que hacerlos uno por uno: crear la cuenta no da acceso por
sí solo, el correo tiene que estar en `ADMIN_EMAILS`.

### 7. Configurar las URLs de redirección

**Authentication → URL Configuration**:

- **Site URL**: `https://felipehiguera.github.io`
- **Redirect URLs**: agregar `https://felipehiguera.github.io/admin`

Sin esto, el login con Google vuelve a una página equivocada.

## Agregar o quitar un administrador

```bash
supabase secrets set ADMIN_EMAILS=uno@correo.cl,dos@correo.cl
```

Es el único punto manual del sistema. No hay interfaz para gestionarlo, a
propósito: que el acceso se cambie desde la consola de Supabase y no desde la
página pública.

## Qué puede hacer el panel

- Crear, editar y borrar proyectos.
- Marcar un proyecto como **borrador** (despublicado de verdad: la ruta pasa a
  dar 404) o como **destacado** (aparece en el carrusel del home).
- Activar y desactivar las secciones `proyectos`, `soporte-it` y `cv`.

Cada cambio es un commit a `main`, que dispara el deploy. El sitio se actualiza
solo en aproximadamente un minuto.

## Limitación conocida

El toggle de secciones saca el link del menú y el módulo del home, y marca la
página con `noindex`. **La ruta directa sigue respondiendo**: si alguien
escribe `/soporte-it` a mano, la ve. Hacerla desaparecer de verdad exige
convertir esas páginas a rutas dinámicas, lo que no hace un toggle.