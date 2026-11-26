import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const calcularHash = promisify(scrypt);
const hashDePrueba = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
const perfilesPermitidos = new Set(['inventario', 'administrador']);

const buscarUsuario = db.prepare(`
  SELECT id, usuario, nombre, contrasena_hash, perfil
  FROM usuarios
  WHERE usuario = ? AND activo = 1
`);

export class ErrorUsuario extends Error {}

function validarContrasena(contrasena) {
  if (typeof contrasena !== 'string' || contrasena.length < 12 || contrasena.length > 128) {
    throw new ErrorUsuario('La contraseña debe tener entre 12 y 128 caracteres.');
  }
}

function hashDeContrasena(contrasena) {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(contrasena, sal, 64, {
    N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024
  }).toString('hex');

  return `${sal}:${hash}`;
}

export function crearUsuario(usuario, nombre, contrasena, perfil = 'inventario') {
  const identificador = typeof usuario === 'string' ? usuario.trim() : '';
  const nombreVisible = typeof nombre === 'string' ? nombre.trim() : '';

  if (!identificador || identificador.length > 40 || !nombreVisible || nombreVisible.length > 80) {
    throw new ErrorUsuario('Escribe un usuario y un nombre válidos.');
  }

  validarContrasena(contrasena);

  if (!perfilesPermitidos.has(perfil)) {
    throw new ErrorUsuario('Selecciona un perfil válido.');
  }

  const resultado = db.prepare(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash, perfil)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(usuario) DO NOTHING
  `).run(identificador, nombreVisible, hashDeContrasena(contrasena), perfil);

  if (resultado.changes === 0) {
    throw new ErrorUsuario('Ese usuario ya existe.');
  }
}

export function promoverUsuarioAAdministrador(usuario) {
  const identificador = typeof usuario === 'string' ? usuario.trim() : '';

  if (!identificador || identificador.length > 40) {
    throw new ErrorUsuario('Selecciona una cuenta válida.');
  }

  const resultado = db.prepare(`
    UPDATE usuarios
    SET perfil = 'administrador'
    WHERE usuario = ? AND perfil = 'inventario' AND activo = 1
  `).run(identificador);

  if (resultado.changes > 0) return true;

  const cuenta = db.prepare(`
    SELECT perfil FROM usuarios WHERE usuario = ? AND activo = 1
  `).get(identificador);

  if (!cuenta) {
    throw new ErrorUsuario('No se encontró una cuenta activa con ese usuario.');
  }

  if (cuenta.perfil === 'administrador') return false;

  throw new ErrorUsuario('No se pudo actualizar el perfil de la cuenta.');
}

export function aprovisionarAdministrador(usuario, nombre, contrasena) {
  const identificador = typeof usuario === 'string' ? usuario.trim() : '';

  if (!identificador || identificador.length > 40) {
    throw new ErrorUsuario('Escribe un usuario válido para la administración.');
  }

  const cuenta = db.prepare(`
    SELECT perfil, activo
    FROM usuarios
    WHERE usuario = ?
  `).get(identificador);

  if (cuenta) {
    if (!cuenta.activo) {
      throw new ErrorUsuario('La cuenta existe, pero está inactiva.');
    }

    return promoverUsuarioAAdministrador(identificador)
      ? 'promoted'
      : 'already_admin';
  }

  crearUsuario(identificador, nombre, contrasena, 'administrador');
  return 'created';
}

export function restablecerContrasena(usuario, contrasena) {
  const identificador = typeof usuario === 'string' ? usuario.trim() : '';

  if (!identificador) {
    throw new ErrorUsuario('Selecciona una cuenta de inventario.');
  }

  validarContrasena(contrasena);

  const resultado = db.prepare(`
    UPDATE usuarios
    SET contrasena_hash = ?
    WHERE usuario = ? AND perfil = 'inventario' AND activo = 1
  `).run(hashDeContrasena(contrasena), identificador);

  if (resultado.changes === 0) {
    throw new ErrorUsuario('No se encontró una cuenta de inventario activa.');
  }
}

export async function verificarCredenciales(usuario, contrasena) {
  if (typeof usuario !== 'string' || typeof contrasena !== 'string') {
    return null;
  }

  const cuenta = buscarUsuario.get(usuario.trim());
  const [sal, hashGuardado] = (cuenta?.contrasena_hash ?? hashDePrueba).split(':');

  const hashIngresado = await calcularHash(contrasena, sal, 64, {
    N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024
  });

  if (!timingSafeEqual(hashIngresado, Buffer.from(hashGuardado, 'hex')) || !cuenta) {
    return null;
  }

  return {
    id: cuenta.id,
    usuario: cuenta.usuario,
    nombre: cuenta.nombre,
    perfil: cuenta.perfil
  };
}