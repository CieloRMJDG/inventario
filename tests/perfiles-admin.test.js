import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directorioTemporal = mkdtempSync(join(tmpdir(), 'inventario-perfiles-'));
process.env.DATABASE_PATH = join(directorioTemporal, 'inventario.sqlite');

const { db } = await import('../db.js');
const { promoverUsuarioAAdministrador } = await import('../autenticacion.js');

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
