import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const calcularHash = promisify(scrypt);
const hashDePrueba = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
const [salPrueba, hashPrueba] = hashDePrueba.split(':');
const perfilesPermitidos = new Set(['inventario', 'administrador']);

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

export async function crearUsuario(usuario, nombre, contrasena, perfil = 'inventario') {
  const identificador = typeof usuario === 'string' ? usuario.trim() : '';
  const nombreVisible = typeof nombre === 'string' ? nombre.trim() : '';

  if (!identificador || identificador.length > 40 || !nombreVisible || nombreVisible.length > 80) {
    throw new ErrorUsuario('Escribe un usuario y un nombre válidos.');
  }

  validarContrasena(contrasena);

  if (!perfilesPermitidos.has(perfil)) {
    throw new ErrorUsuario('Selecciona un perfil válido.');
  }

  const resultado = await db.run(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash, perfil)
    VALUES (?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `, [identificador, nombreVisible, hashDeContrasena(contrasena), perfil]);

  if (resultado.changes === 0) {
    throw new ErrorUsuario('Ese usuario ya existe.');
  }
}

export async function promoverUsuarioAAdministrador(usuario) {
  const identificador = typeof usuario === 'string' ? usuario.trim() : '';

  if (!identificador || identificador.length > 40) {
    throw new ErrorUsuario('Selecciona una cuenta válida.');
  }

  const resultado = await db.run(`
    UPDATE usuarios
    SET perfil = 'administrador'
    WHERE lower(usuario) = lower(?) AND perfil = 'inventario' AND activo = 1
  `, [identificador]);

  if (resultado.changes > 0) return true;

  const cuenta = await db.get(`
    SELECT perfil FROM usuarios WHERE lower(usuario) = lower(?) AND activo = 1
  `, [identificador]);

  if (!cuenta) {
    throw new ErrorUsuario('No se encontró una cuenta activa con ese usuario.');
  }

  if (cuenta.perfil === 'administrador') return false;

  throw new ErrorUsuario('No se pudo actualizar el perfil de la cuenta.');
}

export async function aprovisionarAdministrador(usuario, nombre, contrasena) {
  const identificador = typeof usuario === 'string' ? usuario.trim() : '';

  if (!identificador || identificador.length > 40) {
    throw new ErrorUsuario('Escribe un usuario válido para la administración.');
  }

  const cuenta = await db.get(`
    SELECT perfil, activo
    FROM usuarios
    WHERE lower(usuario) = lower(?)
  `, [identificador]);

  if (cuenta) {
    if (!cuenta.activo) {
      throw new ErrorUsuario('La cuenta existe, pero está inactiva.');
    }

    return await promoverUsuarioAAdministrador(identificador)
      ? 'promoted'
      : 'already_admin';
  }

  await crearUsuario(identificador, nombre, contrasena, 'administrador');
  return 'created';
}

export async function restablecerContrasena(usuario, contrasena) {
  const identificador = typeof usuario === 'string' ? usuario.trim() : '';

  if (!identificador) {
    throw new ErrorUsuario('Selecciona una cuenta de inventario.');
  }

  validarContrasena(contrasena);

  const resultado = await db.run(`
    UPDATE usuarios
    SET contrasena_hash = ?
    WHERE lower(usuario) = lower(?) AND perfil = 'inventario' AND activo = 1
  `, [hashDeContrasena(contrasena), identificador]);

  if (resultado.changes === 0) {
    throw new ErrorUsuario('No se encontró una cuenta de inventario activa.');
  }
}

export async function verificarCredenciales(usuario, contrasena) {
  if (typeof usuario !== 'string' || typeof contrasena !== 'string') {
    return null;
  }

  const cuenta = await db.get(`
    SELECT id, usuario, nombre, contrasena_hash, perfil
    FROM usuarios
    WHERE lower(usuario) = lower(?) AND activo = 1
  `, [usuario.trim()]);
  const partesHash = (cuenta?.contrasena_hash ?? '').split(':');
  const sal = /^[0-9a-f]{32}$/.test(partesHash[0] ?? '') ? partesHash[0] : salPrueba;
  const hashGuardado = /^[0-9a-f]{128}$/.test(partesHash[1] ?? '') ? partesHash[1] : hashPrueba;

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