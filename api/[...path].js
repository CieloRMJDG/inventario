// API del inventario como función serverless de Vercel.
// Reutiliza exactamente el mismo manejarSolicitud que el servidor Node local.

async function obtenerModulo() {
  if (!globalThis.__moduloInventario) {
    if (process.env.VERCEL && !process.env.DATABASE_URL) {
      throw new Error(
        'Falta DATABASE_URL. Crea una base PostgreSQL gratuita (Neon o Supabase) ' +
        'y agrega su cadena como variable de entorno en Vercel.'
      );
    }

    const modulo = await import('../server.js');
    await modulo.prepararEntorno();
    globalThis.__moduloInventario = modulo;
  }

  return globalThis.__moduloInventario;
}

function flujoDelCuerpo(solicitud) {
  if (solicitud.body === undefined || solicitud.body === null) {
    if (solicitud[Symbol.asyncIterator]) return solicitud;
    return (async function* () {})();
  }

  const bytes = typeof solicitud.body === 'string'
    ? Buffer.from(solicitud.body)
    : Buffer.from(JSON.stringify(solicitud.body));

  return (async function* () { yield bytes; })();
}

export default async function handler(solicitudVercel, respuestaVercel) {
  try {
    const { manejarSolicitud } = await obtenerModulo();

    const solicitud = {
      method: solicitudVercel.method,
      url: solicitudVercel.url,
      headers: solicitudVercel.headers || {},
      [Symbol.asyncIterator]: () => flujoDelCuerpo(solicitudVercel)[Symbol.asyncIterator]()
    };

    const respuesta = {
      estado: 200,
      cabeceras: {},
      contenido: '',
      setHeader(clave, valor) {
        this.cabeceras[clave] = valor;
      },
      writeHead(estado, cabeceras = {}) {
        this.estado = estado;
        Object.assign(this.cabeceras, cabeceras);
      },
      end(contenido) {
        this.contenido = contenido ?? '';
      }
    };

    await manejarSolicitud(solicitud, respuesta);

    for (const [clave, valor] of Object.entries(respuesta.cabeceras)) {
      respuestaVercel.setHeader(clave, valor);
    }

    return respuestaVercel.status(respuesta.estado).send(respuesta.contenido);
  } catch (error) {
    console.error(error);
    return respuestaVercel.status(500).json({
      error: error?.message || 'No se pudo completar la operación.'
    });
  }
}
