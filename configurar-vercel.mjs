// Configura las variables de entorno en Vercel usando local-secrets.env.
// Nunca imprime los valores. Uso: node configurar-vercel.mjs

import { readFileSync } from 'node:fs';

function leerArchivoEnv(ruta) {
  const contenido = readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '');
  const datos = {};

  for (const linea of contenido.split(/\r?\n/)) {
    const recortada = linea.trim();
    if (!recortada || recortada.startsWith('#') || !recortada.includes('=')) continue;

    const posicion = recortada.indexOf('=');
    const clave = recortada.slice(0, posicion).trim();
    let valor = recortada.slice(posicion + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    datos[clave] = valor;
  }

  return datos;
}

const secreto = leerArchivoEnv(new URL('./local-secrets.env', import.meta.url));

if (!secreto.VERCEL_TOKEN) {
  throw new Error('Falta VERCEL_TOKEN en local-secrets.env.');
}
if (!secreto.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL en local-secrets.env.');
}

const token = secreto.VERCEL_TOKEN;
const base = 'https://api.vercel.com';

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: opciones.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });

  const texto = await respuesta.text();
  let contenido;
  try { contenido = JSON.parse(texto); } catch { contenido = texto; }

  if (!respuesta.ok) {
    const detalle = JSON.stringify(contenido).slice(0, 400);
    const error = new Error(`Vercel ${respuesta.status} en ${ruta}: ${detalle}`);
    error.estado = respuesta.status;
    throw error;
  }

  return contenido;
}

async function conReintentoEquipo(ruta, opciones) {
  try {
    return await api(ruta, opciones);
  } catch (error) {
    if (error.estado !== 403 && error.estado !== 404) throw error;
    const conEquipo = `${ruta}${ruta.includes('?') ? '&' : '?'}teamId=${equipoId}`;
    return api(conEquipo, opciones);
  }
}

const lista = await api('/v9/projects?limit=100');
const proyecto = lista.projects?.find(p => p.name === 'bodegastakeinventario')
  || lista.projects?.find(p => String(p.name || '').includes('inventario'));

if (!proyecto) {
  throw new Error(
    `No encontré el proyecto en Vercel. Proyectos: ${(lista.projects || []).map(p => p.name).join(', ')}`
  );
}

const equipoId = proyecto.accountId || proyecto.teamId;
const rutaProyecto = `/v10/projects/${proyecto.id}`;
console.log(`Proyecto: ${proyecto.name}`);

const actuales = await conReintentoEquipo(`/v9/projects/${proyecto.id}/env`);
const variables = [
  ['DATABASE_URL', secreto.DATABASE_URL],
  ['FRONTEND_URL', 'https://bodegastakeinventario.vercel.app'],
  ['BOOTSTRAP_ADMIN_USERNAME', secreto.BOOTSTRAP_ADMIN_USERNAME],
  ['BOOTSTRAP_ADMIN_NAME', secreto.BOOTSTRAP_ADMIN_NAME],
  ['BOOTSTRAP_ADMIN_PASSWORD', secreto.BOOTSTRAP_ADMIN_PASSWORD]
];

const destinos = ['production', 'preview', 'development'];

for (const [clave, valor] of variables) {
  if (!valor) {
    console.log(`${clave}: omitida (vacía)`);
    continue;
  }

  const existente = (actuales.envs || []).find(envio => envio.key === clave);
  const destino = existente ? `/env/${existente.id}` : '/env';
  const metodo = existente ? 'PATCH' : 'POST';
  const cuerpo = existente
    ? { value: valor, target: destinos }
    : { key: clave, value: valor, target: destinos, type: 'encrypted' };

  await conReintentoEquipo(`${rutaProyecto}${destino}`, {
    method: metodo,
    body: cuerpo
  });

  console.log(`${clave}: ${existente ? 'actualizada' : 'creada'}`);
}

if (process.argv.includes('--limpiar-admin')) {
  const listado = await conReintentoEquipo(`/v9/projects/${proyecto.id}/env`);

  for (const clave of [
    'BOOTSTRAP_ADMIN_USERNAME',
    'BOOTSTRAP_ADMIN_NAME',
    'BOOTSTRAP_ADMIN_PASSWORD'
  ]) {
    const encontradas = (listado.envs || []).filter(envio => envio.key === clave);

    for (const envio of encontradas) {
      await conReintentoEquipo(`${rutaProyecto}/env/${envio.id}`, {
        method: 'DELETE'
      });
      console.log(`${clave}: eliminada`);
    }
  }
}

console.log('Listo. Ahora haz un push a main para forzar el redeploy.');
