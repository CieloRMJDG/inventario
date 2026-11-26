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

## Artículos: descripción y edición

Cada artículo puede tener una descripción opcional de hasta 240 caracteres. Se muestra
en la tabla del inventario, en la pantalla de movimientos y se puede crear o modificar
desde los formularios **Nuevo artículo** y **Editar artículo**.

En la tabla, el enlace **Editar** abre el formulario con código, nombre, descripción,
categoría, tipo y talla. Los códigos se pueden corregir siempre que no repitan el de
otro artículo. El stock **no** se cambia desde ese formulario: se ajusta con
**Mover stock** para conservar el historial de movimientos.

La columna `descripcion` se agrega automáticamente a una base existente al arrancar la
API, sin borrar ni sobrescribir artículos.

## Reportes PDF

Desde **Reportes PDF** en la barra de acciones se elige una fecha **Desde** y una
fecha **Hasta**. La API genera un PDF con:

- Resumen del periodo: movimientos, artículos involucrados, entradas, salidas y ajustes.
- Detalle de cada movimiento: fecha, artículo, categoría, tipo, stock anterior,
  stock posterior, usuario que registró y motivo.
- Una cabecera con el rango y el nombre de quien genera el reporte.

Las fechas son inclusivas y se interpretan en hora de Bogotá (UTC-5). El endpoint es
`GET /api/reportes?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` y requiere sesión iniciada.
El rango máximo es de 5 años y el PDF está limitado a 10.000 movimientos para evitar
archivos enormes; si se supera, acorta el periodo. El reporte no modifica ni borra datos.

## Despliegue 100% en Vercel (plan gratuito)

El frontend estático vive en `public/` y la API son funciones serverless en `api/`.
Vercel no conserva archivos entre invocaciones, así que los datos **deben** vivir en una
base PostgreSQL externa gratuita (Neon o Supabase tienen plan *free* sin tarjeta).

1. Sube este proyecto a GitHub.
2. Crea una base gratuita en https://neon.tech (o https://supabase.com) y copia su
   *connection string* (`postgres://...`). No la compartas ni la guardes en el repo.
3. En Vercel, importa el repositorio y conserva `outputDirectory: public` y
   `vercel.json`.
4. En **Vercel > Settings > Environment Variables** agrega:
   - `DATABASE_URL` = la cadena `postgres://...` de tu base gratuita.
   - `FRONTEND_URL` = `https://bodegastakeinventario.vercel.app`. Si también usas
     GitHub Pages, agrega ambos orígenes separados por coma.
5. Haz **Deploy** (o un `git push` a `main`). En el primer arranque el API crea el
   esquema y las categorías. Si no existe ninguno de los artículos recuperados en
   `restaurar-articulos.js`, los inserta. Nunca borra ni sobrescribe registros.
6. Crea la cuenta de administración con las variables temporales
   `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_NAME` y `BOOTSTRAP_ADMIN_PASSWORD`
   descritas más abajo.

Las sesiones duran 8 horas y se guardan en la base, así que sobreviven a los reinicios.
Abre la app desde el dominio de Vercel: GitHub Pages es otro dominio y algunos
navegadores bloquean la cookie de sesión.

La base nueva no importa automáticamente datos de SQLite local ni de Render. No subas
`datos/inventario.sqlite` a GitHub.

## Despliegue adicional en GitHub Pages

El workflow `.github/workflows/pages.yml` publica `public/` en
`https://cielormjdg.github.io/inventario/` al subir cambios a `main`. En GitHub,
el workflow intenta habilitar Pages automáticamente; si la configuración del
repositorio lo impide, abre **Settings > Pages** y selecciona **GitHub Actions**
como origen de publicación. Incluye `https://cielormjdg.github.io` en `FRONTEND_URL`
de Vercel como se describe arriba. La aplicación usa navegación con fragmentos
(`#/inventario`) para que GitHub Pages no necesite configurar rutas del servidor.

GitHub Pages y Vercel son dominios distintos. El inicio de sesión usa una cookie
`SameSite=None; Secure`, pero navegadores que bloqueen cookies de terceros pueden
impedir que la sesión funcione desde Pages; en ese caso, usa Vercel.

### Aprovisionar un administrador en Vercel

No subas `datos/inventario.sqlite` a GitHub: contiene cuentas y datos privados, y la
base local no es la base de producción. Puedes usar temporalmente estas variables
privadas en **Vercel > Settings > Environment Variables**:

```text
BOOTSTRAP_ADMIN_USERNAME=charly
BOOTSTRAP_ADMIN_NAME=Charly
BOOTSTRAP_ADMIN_PASSWORD=<contraseña nueva de al menos 12 caracteres>
```

Al desplegar, una cuenta activa existente se promueve a administradora y conserva su
contraseña; si no existe, se crea como administradora con la contraseña indicada.
Una cuenta inactiva no se modifica y el error queda en los logs. Después de verificar
el resultado en los logs de Vercel, elimina las tres variables y vuelve a desplegar.
Nunca pongas la contraseña en GitHub ni en el chat.
