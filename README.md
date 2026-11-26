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
y SQLite corren en Render. El plan Free no tiene disco persistente: los datos SQLite
pueden perderse cuando el servicio se reinicia o suspende. No lo uses para datos que
deban conservarse; para eso, configura almacenamiento persistente de pago.
Vercel reenvía `/api/*` al servicio `inventario-backend-cielo`; en GitHub Pages el
navegador llama directamente a ese API.

1. Sube este proyecto a un repositorio de GitHub.
2. En Vercel, importa ese repositorio como proyecto estático y conserva la carpeta
   de salida `public` y el `vercel.json` del proyecto.
3. En Render, crea un **Blueprint** desde el mismo repositorio y acepta la
   configuración gratuita de `render.yaml`.
4. En Render, configura `FRONTEND_URL` con el origen exacto de Vercel
   (sin `/` al final). Si usarás también GitHub Pages, agrega ambos orígenes separados
   por coma, por ejemplo `https://bodegastakeinventario.vercel.app,https://cielormjdg.github.io`.
   Vuelve a desplegar el servicio de Render después de guardarlo.
5. En la Shell del servicio de Render, crea la primera cuenta de administración:

   ```sh
   node crear-usuario.js admin "Nombre de administración" administrador
   ```

   Escribe y confirma una contraseña de al menos 12 caracteres cuando se solicite.

El hostname de Render configurado en `vercel.json` es
`inventario-backend-cielo.onrender.com`; si Render asigna otro hostname, actualiza
el destino de la regla `/api/:path*` y la constante `apiBase` en `public/app.js`.
Las sesiones duran 8 horas y se invalidan cuando el proceso de Render se reinicia.

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
