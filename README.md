# Sistema de inventario

## Perfiles de usuario

El perfil `inventario` puede usar las funciones del inventario. El perfil
`administrador` tiene ese mismo acceso y además puede crear cuentas de inventario desde
**Administrar usuarios**. Desde esa misma pantalla puede establecer una contraseña nueva
para una cuenta activa de inventario; las contraseñas anteriores nunca se muestran y
las nuevas se guardan como hashes.

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

El frontend estático vive en `public/` y se despliega en Vercel. El API y SQLite
corren en Render. El plan Free no tiene disco persistente: los datos SQLite pueden
perderse cuando el servicio se reinicia o suspende. No lo uses para datos que deban
conservarse; para eso, configura almacenamiento persistente de pago.
Vercel reenvía `/api/*` al servicio `inventario-backend-cielo` para que las cookies
de sesión sigan siendo del mismo dominio.

1. Sube este proyecto a un repositorio de GitHub.
2. En Vercel, importa ese repositorio como proyecto estático y conserva la carpeta
   de salida `public` y el `vercel.json` del proyecto.
3. En Render, crea un **Blueprint** desde el mismo repositorio y acepta la
   configuración gratuita de `render.yaml`.
4. Asigna el dominio final de Vercel y configura `FRONTEND_URL` en Render con ese
   origen exacto, por ejemplo `https://inventario-cielo.vercel.app` (sin `/` al final).
   Vuelve a desplegar el servicio de Render después de guardarlo.
5. En la Shell del servicio de Render, crea la primera cuenta de administración:

   ```sh
   node crear-usuario.js admin "Nombre de administración" administrador
   ```

   Escribe y confirma una contraseña de al menos 12 caracteres cuando se solicite.

El hostname de Render configurado en `vercel.json` es
`inventario-backend-cielo.onrender.com`; si Render asigna otro hostname, actualiza
el destino de la regla `/api/:path*` y vuelve a desplegar Vercel. Las sesiones duran
8 horas y se invalidan cuando el proceso de Render se reinicia.
