# Sistema de inventario

## Perfiles de usuario

El perfil `inventario` puede usar las funciones del inventario. El perfil
`administrador` tiene ese mismo acceso y además puede crear cuentas de inventario desde
**Administrar usuarios**. Desde esa misma pantalla puede establecer una contraseña nueva
para una cuenta activa de inventario; las contraseñas anteriores nunca se muestran y
las nuevas se guardan como hashes. También puede promover una cuenta de inventario
activa a administradora sin cambiar su contraseña.

Para crear la primera cuenta de administración, ejecuta:

```sh
node crear-usuario.js admin "Nombre de administración" administrador
```

El programa solicitará la contraseña de forma interactiva (mínimo 12 caracteres).
Las cuentas creadas sin indicar un perfil usan `inventario`:

```sh
node crear-usuario.js usuario "Nombre de la persona"
```

## Despliegue en Vercel y Render

El frontend estático vive en `public/` y se despliega en Vercel o GitHub Pages. El API
corre en Render y usa PostgreSQL cuando se configura `DATABASE_URL`; sin esa variable,
usa SQLite local, que no es persistente en Render Free. Crea una base PostgreSQL
gestionada y guarda su cadena de conexión únicamente en **Render > Environment** como
`DATABASE_URL`. Al arrancar, el API crea el esquema y las categorías iniciales.
Vercel reenvía `/api/*` al servicio `inventario-backend-cielo`; en GitHub Pages el
navegador llama directamente a ese API.

1. Sube este proyecto a un repositorio de GitHub.
2. En Vercel, importa ese repositorio como proyecto estático y conserva la carpeta
   de salida `public` y el `vercel.json` del proyecto.
3. En un proveedor PostgreSQL gestionado, crea una base y copia su cadena de conexión.
   No la compartas por el chat ni la guardes en el repositorio.
4. En Render, crea un **Blueprint** desde el mismo repositorio y acepta la
   configuración gratuita de `render.yaml`.
5. En Render, configura `DATABASE_URL` con la cadena de conexión PostgreSQL y
   `FRONTEND_URL` con el origen exacto de Vercel
   (sin `/` al final). Si usarás también GitHub Pages, agrega ambos orígenes separados
   por coma, por ejemplo `https://bodegastakeinventario.vercel.app,https://cielormjdg.github.io`.
   Vuelve a desplegar el servicio de Render después de guardarlo.
6. Crea la primera cuenta de administración con la Shell de Render:

   ```sh
   node crear-usuario.js admin "Nombre de administración" administrador
   ```

   Escribe y confirma una contraseña de al menos 12 caracteres cuando se solicite.

El hostname de Render configurado en `vercel.json` es
`inventario-backend-cielo.onrender.com`; si Render asigna otro hostname, actualiza
el destino de la regla `/api/:path*` y la constante `apiBase` en `public/app.js`.
Las sesiones duran 8 horas y se guardan en la base de datos, así que sobreviven a los
reinicios del servicio.

La base PostgreSQL nueva no importa automáticamente los datos de SQLite local ni de
una instancia anterior de Render. Antes de cambiar `DATABASE_URL`, exporta cualquier
información que quieras conservar y migra los datos explícitamente. No subas
`datos/inventario.sqlite` a GitHub.

## Despliegue adicional en GitHub Pages

El workflow `.github/workflows/pages.yml` publica `public/` en
`https://cielormjdg.github.io/inventario/` al subir cambios a `main`. En GitHub,
el workflow intenta habilitar Pages automáticamente; si la configuración del
repositorio lo impide, abre **Settings > Pages** y selecciona **GitHub Actions**
como origen de publicación. Incluye `https://cielormjdg.github.io` en `FRONTEND_URL`
de Render como se describe arriba. La aplicación usa navegación con fragmentos
(`#/inventario`) para que GitHub Pages no necesite configurar rutas del servidor.

GitHub Pages y Render son dominios distintos. El inicio de sesión usa una cookie
`SameSite=None; Secure`, pero navegadores que bloqueen cookies de terceros pueden
impedir que la sesión funcione desde Pages; en ese caso, usa Vercel o configura
ambos servicios bajo un dominio propio.

### Aprovisionar un administrador en Render sin Shell

No subas `datos/inventario.sqlite` a GitHub: contiene cuentas y datos privados, y la
base local no es la base de producción. Si no tienes acceso a la Shell de Render,
puedes usar temporalmente estas variables privadas en **Environment**:

```text
BOOTSTRAP_ADMIN_USERNAME=charly
BOOTSTRAP_ADMIN_NAME=Charly
BOOTSTRAP_ADMIN_PASSWORD=<contraseña nueva de al menos 12 caracteres>
```

Al desplegar, una cuenta activa existente se promueve a administradora y conserva su
contraseña; si no existe, se crea como administradora con la contraseña indicada.
Una cuenta inactiva no se modifica y el error queda en los logs. Después de verificar
el resultado en los logs de Render, elimina las tres variables y vuelve a desplegar.
Nunca pongas la contraseña en GitHub ni en el chat.
