import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directorioTemporal = mkdtempSync(join(tmpdir(), 'inventario-perfiles-'));
process.env.DATABASE_PATH = join(directorioTemporal, 'inventario.sqlite');

const { db } = await import('../db.js');
const {
  aprovisionarAdministrador,
  promoverUsuarioAAdministrador,
  verificarCredenciales
} = await import('../autenticacion.js');

after(() => {
  db.close();
  rmSync(directorioTemporal, { recursive: true, force: true });
});

test('promueve una cuenta activa de inventario sin cambiar otras cuentas', () => {
  db.prepare(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash, perfil)
    VALUES (?, ?, ?, ?)
  `).run('cielo', 'Cielo', 'hash', 'inventario');
  db.prepare(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash, perfil, activo)
    VALUES (?, ?, ?, ?, 0)
  `).run('inactivo', 'Inactivo', 'hash', 'inventario');

  assert.equal(promoverUsuarioAAdministrador(' cielo '), true);
  assert.equal(
    db.prepare('SELECT perfil FROM usuarios WHERE usuario = ?').get('cielo').perfil,
    'administrador'
  );
  assert.equal(promoverUsuarioAAdministrador('cielo'), false);
  assert.equal(
    db.prepare('SELECT perfil FROM usuarios WHERE usuario = ?').get('inactivo').perfil,
    'inventario'
  );
  assert.throws(
    () => promoverUsuarioAAdministrador('inactivo'),
    /No se encontró una cuenta activa/
  );
  assert.throws(
    () => promoverUsuarioAAdministrador('no-existe'),
    /No se encontró una cuenta activa/
  );
});

test('el aprovisionamiento promueve una cuenta activa y conserva su contraseña', () => {
  const hashAnterior = 'hash-existente';
  db.prepare(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash, perfil)
    VALUES (?, ?, ?, ?)
  `).run('charly', 'Charly', hashAnterior, 'inventario');

  assert.equal(aprovisionarAdministrador('charly', 'Charly', ''), 'promoted');
  const cuenta = db.prepare(`
    SELECT perfil, contrasena_hash FROM usuarios WHERE usuario = ?
  `).get('charly');
  assert.equal(cuenta.perfil, 'administrador');
  assert.equal(cuenta.contrasena_hash, hashAnterior);
  assert.equal(aprovisionarAdministrador('charly', 'Charly', ''), 'already_admin');
});

test('el aprovisionamiento crea un administrador cuando la cuenta no existe', async () => {
  const contrasena = 'una-clave-segura-123';
  assert.equal(
    aprovisionarAdministrador('nuevo-admin', 'Administrador nuevo', contrasena),
    'created'
  );
  assert.deepEqual(
    await verificarCredenciales('nuevo-admin', contrasena),
    {
      id: db.prepare('SELECT id FROM usuarios WHERE usuario = ?')
        .get('nuevo-admin').id,
      usuario: 'nuevo-admin',
      nombre: 'Administrador nuevo',
      perfil: 'administrador'
    }
  );
});
