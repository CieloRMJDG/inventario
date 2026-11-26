import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';

export const DURACION_SESION = 8 * 60 * 60; // segundos

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function crearSesion(usuarioId) {
  const token = randomBytes(32).toString('hex');
  const vence = Date.now() + DURACION_SESION * 1000;

  await db.run('DELETE FROM sesiones WHERE vence <= ?', [Date.now()]);
  await db.run(
    'INSERT INTO sesiones (token_hash, usuario_id, vence) VALUES (?, ?, ?)',
    [hashToken(token), usuarioId, vence]
  );

  return token;
}

export async function obtenerUsuarioDeSesion(cookies = '') {
  const token = cookies.match(/(?:^|;\s*)sesion=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;

  return await db.get(`
    SELECT u.id, u.nombre, u.perfil
    FROM sesiones AS s
    JOIN usuarios AS u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.vence > ? AND u.activo = 1
  `, [hashToken(token), Date.now()]) ?? null;
}

export async function cerrarSesion(cookies = '') {
  const token = cookies.match(/(?:^|;\s*)sesion=([a-f0-9]{64})(?:;|$)/)?.[1];

  if (token) {
    await db.run('DELETE FROM sesiones WHERE token_hash = ?', [hashToken(token)]);
  }
}