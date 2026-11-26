import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import {
  verificarCredenciales,
  crearUsuario,
  aprovisionarAdministrador,
  promoverUsuarioAAdministrador,
  restablecerContrasena,
  ErrorUsuario
} from './autenticacion.js';
import {
  crearSesion,
  obtenerUsuarioDeSesion,
  cerrarSesion,
  DURACION_SESION
} from './sesiones.js';
import { guardarArticulo, editarArticulo, ErrorArticulo } from './articulos.js';
import { registrarMovimiento, ErrorMovimiento } from './movimientos.js';
import { generarReportePdf, ErrorReporte } from './reportes.js';
import { restaurarArticulos } from './restaurar-articulos.js';

const host = '0.0.0.0';
const puerto = Number(process.env.PORT || 3000);
const origenVercel = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';
const origenesFrontend = new Set((
  process.env.FRONTEND_URL || origenVercel
).split(',').map(origen => new URL(origen.trim()).origin));
const atributosCookie = process.env.NODE_ENV === 'production'
  ? '; SameSite=None; Secure'
  : '; SameSite=Lax';

class ErrorSolicitud extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

function responderJson(respuesta, estado, contenido) {
  respuesta.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
  respuesta.end(JSON.stringify(contenido));
}

function responderPdf(respuesta, pdf, nombreArchivo) {
  respuesta.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    'Content-Length': pdf.length
  });
  respuesta.end(pdf);
}

function exigirOrigen(solicitud) {
  if (!origenesFrontend.has(solicitud.headers.origin)) {
    throw new ErrorSolicitud('Abre la aplicación desde un origen autorizado.', 403);
  }
}

async function exigirUsuario(solicitud, respuesta) {
  const usuario = await obtenerUsuarioDeSesion(solicitud.headers.cookie);

  if (!usuario) {
    responderJson(respuesta, 401, { error: 'Inicia sesión para continuar.' });
    return null;
  }

  return usuario;
}

function exigirAdministrador(usuario, respuesta) {
  if (usuario.perfil !== 'administrador') {
    responderJson(respuesta, 403, { error: 'Se requiere el perfil de administración.' });
    return false;
  }

  return true;
}

async function leerJson(solicitud) {
  const partes = [];
  let bytes = 0;

  for await (const parte of solicitud) {
    bytes += parte.length;

    if (bytes > 4096) {
      throw new ErrorSolicitud('El formulario supera el tamaño permitido.', 413);
    }

    partes.push(parte);
  }

  try {
    const datos = JSON.parse(Buffer.concat(partes).toString('utf8'));
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      throw new Error();
    }
    return datos;
  } catch {
    throw new ErrorSolicitud('El contenido de la solicitud no es válido.');
  }
}

function comoFormulario(datos) {
  return new URLSearchParams(
    Object.entries(datos).map(([clave, valor]) => [clave, String(valor ?? '')])
  );
}

async function listarArticulos() {
  return db.all(`
    SELECT a.codigo, a.nombre, a.descripcion, c.nombre AS categoria, t.nombre AS tipo,
           a.talla, a.stock_inicial, a.stock_actual
    FROM articulos AS a
    JOIN categorias AS c ON c.id = a.categoria_id
    JOIN tipos AS t ON t.id = a.tipo_id
    ORDER BY a.nombre, a.codigo
  `);
}

async function listarHistorial() {
  const movimientos = await db.all(`
    SELECT m.fecha, m.tipo_movimiento, m.stock_anterior,
           m.stock_posterior, m.motivo, a.codigo,
           a.nombre AS articulo, c.nombre AS categoria, u.nombre AS usuario
    FROM movimientos AS m
    JOIN articulos AS a ON a.id = m.articulo_id
    JOIN categorias AS c ON c.id = a.categoria_id
    JOIN usuarios AS u ON u.id = m.usuario_id
    ORDER BY m.id DESC
  `);

  return movimientos.map(movimiento => ({
    ...movimiento,
    fecha: movimiento.fecha instanceof Date
      ? movimiento.fecha.toISOString().slice(0, 19).replace('T', ' ')
      : movimiento.fecha
  }));
}

export async function manejarSolicitud(solicitud, respuesta) {
  respuesta.setHeader('Cache-Control', 'no-store');

  try {
    const url = new URL(solicitud.url, 'http://localhost');
    const ruta = url.pathname;

    if (ruta.startsWith('/api/')) {
      const origen = solicitud.headers.origin;

      if (origenesFrontend.has(origen)) {
        respuesta.setHeader('Access-Control-Allow-Origin', origen);
        respuesta.setHeader('Access-Control-Allow-Credentials', 'true');
        respuesta.setHeader('Vary', 'Origin');
      }

      if (solicitud.method === 'OPTIONS') {
        if (!origenesFrontend.has(origen)) {
          return responderJson(respuesta, 403, { error: 'Origen no autorizado.' });
        }

        respuesta.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        respuesta.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        respuesta.writeHead(204);
        return respuesta.end();
      }
    }

    if (solicitud.method === 'GET' && ruta === '/api/health') {
      return responderJson(respuesta, 200, { status: 'ok' });
    }

    if (ruta === '/api/session' && solicitud.method === 'POST') {
      exigirOrigen(solicitud);
      const datos = await leerJson(solicitud);
      const cuenta = await verificarCredenciales(datos.usuario, datos.contrasena);

      if (!cuenta) {
        return responderJson(respuesta, 401, {
          error: 'Usuario o contraseña incorrectos.'
        });
      }

      const token = await crearSesion(cuenta.id);
      respuesta.setHeader(
        'Set-Cookie',
        `sesion=${token}; HttpOnly; Path=/; Max-Age=${DURACION_SESION}${atributosCookie}`
      );
      return responderJson(respuesta, 200, { usuario: cuenta });
    }

    if (ruta === '/api/session' && solicitud.method === 'DELETE') {
      exigirOrigen(solicitud);
      await cerrarSesion(solicitud.headers.cookie);
      respuesta.setHeader(
        'Set-Cookie',
        `sesion=; HttpOnly; Path=/; Max-Age=0${atributosCookie}`
      );
      return responderJson(respuesta, 200, { status: 'ok' });
    }

    if (!ruta.startsWith('/api/')) {
      return responderJson(respuesta, 404, { error: 'Ruta no encontrada.' });
    }

    if (ruta === '/api/session' && solicitud.method === 'GET') {
      const usuario = await exigirUsuario(solicitud, respuesta);
      return usuario && responderJson(respuesta, 200, { usuario });
    }

    const usuario = await exigirUsuario(solicitud, respuesta);
    if (!usuario) return;

    if (solicitud.method === 'GET' && ruta === '/api/articulos') {
      return responderJson(respuesta, 200, await listarArticulos());
    }

    if (solicitud.method === 'GET' && ruta === '/api/opciones-articulos') {
      const [categorias, tipos] = await Promise.all([
        db.all('SELECT nombre FROM categorias ORDER BY id'),
        db.all('SELECT nombre FROM tipos ORDER BY nombre')
      ]);
      return responderJson(respuesta, 200, { categorias, tipos });
    }

    if (solicitud.method === 'GET' && ruta === '/api/historial') {
      return responderJson(respuesta, 200, await listarHistorial());
    }

    if (solicitud.method === 'GET' && ruta === '/api/reportes') {
      const pdf = await generarReportePdf({
        desde: url.searchParams.get('desde'),
        hasta: url.searchParams.get('hasta'),
        nombreUsuario: usuario.nombre
      });
      const nombreArchivo =
        `reporte-inventario-${url.searchParams.get('desde')}-a-${url.searchParams.get('hasta')}.pdf`;
      return responderPdf(respuesta, pdf, nombreArchivo);
    }

    if (solicitud.method === 'GET' && ruta === '/api/usuarios') {
      if (!exigirAdministrador(usuario, respuesta)) return;
      const cuentas = await db.all(`
        SELECT usuario, nombre, perfil
        FROM usuarios
        WHERE activo = 1
        ORDER BY nombre, usuario
      `);
      return responderJson(respuesta, 200, cuentas);
    }

    if (solicitud.method === 'POST' || solicitud.method === 'PUT') {
      exigirOrigen(solicitud);
    }

    if (solicitud.method === 'POST' && ruta === '/api/articulos') {
      const datos = await leerJson(solicitud);
      await guardarArticulo(comoFormulario(datos));
      return responderJson(respuesta, 201, { status: 'created' });
    }

    if (solicitud.method === 'PUT' && ruta === '/api/articulos') {
      const datos = await leerJson(solicitud);
      await editarArticulo(comoFormulario(datos));
      return responderJson(respuesta, 200, { status: 'updated' });
    }

    if (solicitud.method === 'POST' && ruta === '/api/movimientos') {
      const datos = await leerJson(solicitud);
      await registrarMovimiento(comoFormulario(datos), usuario.id);
      return responderJson(respuesta, 201, { status: 'created' });
    }

    if (solicitud.method === 'POST' && ruta === '/api/usuarios') {
      if (!exigirAdministrador(usuario, respuesta)) return;
      const datos = await leerJson(solicitud);

      if (datos.contrasena !== datos.confirmar_contrasena) {
        throw new ErrorSolicitud('Las contraseñas no coinciden.');
      }

      await crearUsuario(datos.usuario, datos.nombre, datos.contrasena, 'inventario');
      return responderJson(respuesta, 201, { status: 'created' });
    }

    if (solicitud.method === 'POST' && ruta === '/api/usuarios/promover') {
      if (!exigirAdministrador(usuario, respuesta)) return;
      const datos = await leerJson(solicitud);
      const promovido = await promoverUsuarioAAdministrador(datos.usuario);
      return responderJson(respuesta, 200, {
        status: promovido ? 'promoted' : 'already_admin'
      });
    }

    if (solicitud.method === 'POST' && ruta === '/api/usuarios/restablecer') {
      if (!exigirAdministrador(usuario, respuesta)) return;
      const datos = await leerJson(solicitud);

      if (datos.contrasena_nueva !== datos.confirmar_contrasena_nueva) {
        throw new ErrorSolicitud('Las contraseñas no coinciden.');
      }

      await restablecerContrasena(datos.usuario, datos.contrasena_nueva);
      return responderJson(respuesta, 200, { status: 'ok' });
    }

    return responderJson(respuesta, 404, { error: 'Ruta no encontrada.' });
  } catch (error) {
    if (
      error instanceof ErrorUsuario ||
      error instanceof ErrorArticulo ||
      error instanceof ErrorMovimiento ||
      error instanceof ErrorReporte ||
      error instanceof ErrorSolicitud
    ) {
      return responderJson(
        respuesta,
        error instanceof ErrorSolicitud ? error.estado : 400,
        { error: error.message }
      );
    }

    console.error(error);
    return responderJson(respuesta, 500, {
      error: 'No se pudo completar la operación.'
    });
  }
}

export async function prepararEntorno() {
  const datosAdministradorInicial = [
    process.env.BOOTSTRAP_ADMIN_USERNAME,
    process.env.BOOTSTRAP_ADMIN_NAME,
    process.env.BOOTSTRAP_ADMIN_PASSWORD
  ];

  if (datosAdministradorInicial.some(valor => valor !== undefined)) {
    if (datosAdministradorInicial.some(
      valor => typeof valor !== 'string' || !valor.trim()
    )) {
      console.error(
        'El aprovisionamiento requiere BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_NAME y BOOTSTRAP_ADMIN_PASSWORD.'
      );
    } else {
      try {
        const resultado = await aprovisionarAdministrador(...datosAdministradorInicial);
        console.log(
          `Aprovisionamiento de ${datosAdministradorInicial[0]}: ${resultado}.`
        );
      } catch (error) {
        if (!(error instanceof ErrorUsuario)) throw error;
        console.error(`No se pudo aprovisionar el administrador: ${error.message}`);
      }
    }
  }

  // Si no existe ninguno de los artículos recuperados, los repone. Nunca borra
  // ni sobrescribe registros. Vuelve a ejecutarse en cada arranque/frío.
  try {
    const restauracion = await restaurarArticulos({
      soloSiFaltan: true,
      confirmar: true
    });
    if (!restauracion.omitida) {
      console.log(
        `Restauración inicial: ${restauracion.insertados} artículos insertados.`
      );
    }
  } catch (error) {
    console.error(`No se pudo restaurar el inventario inicial: ${error.message}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepararEntorno();

  const servidor = createServer(manejarSolicitud);
  servidor.listen(puerto, host, () => {
    console.log(`API de inventario escuchando en el puerto ${puerto}.`);
  });
}
