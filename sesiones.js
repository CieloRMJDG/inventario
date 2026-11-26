import { randomBytes } from 'node:crypto';
import { db } from './db.js';

const sesiones = new Map();
export const DURACION_SESION = 8 * 60 * 60; // segundos

const buscarUsuarioActivo = db.prepare(`
  SELECT id, nombre, perfil
  FROM usuarios
  WHERE id = ? AND activo = 1
`);

export function crearSesion(usuarioId) {
  const ahora = Date.now();

  for (const [token, sesion] of sesiones) {
    if (sesion.vence <= ahora) sesiones.delete(token);
  }

  const token = randomBytes(32).toString('hex');
  sesiones.set(token, {
    usuarioId,
    vence: ahora + DURACION_SESION * 1000
  });

  return token;
}

export function obtenerUsuarioDeSesion(cookies = '') {
  const token = cookies.match(/(?:^|;\s*)sesion=([a-f0-9]{64})(?:;|$)/)?.[1];
  const sesion = sesiones.get(token);

  if (!sesion || sesion.vence <= Date.now()) return null;

  return buscarUsuarioActivo.get(sesion.usuarioId) ?? null;
}

export function cerrarSesion(cookies = '') {
  const token = cookies.match(/(?:^|;\s*)sesion=([a-f0-9]{64})(?:;|$)/)?.[1];

  if (token) {
    sesiones.delete(token);
  }
}