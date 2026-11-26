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
const {
  cerrarSesion,
  crearSesion,
  obtenerUsuarioDeSesion
} = await import('../sesiones.js');
const { guardarArticulo } = await import('../articulos.js');
const { registrarMovimiento } = await import('../movimientos.js');

after(async () => {
  await db.close();
  rmSync(directorioTemporal, { recursive: true, force: true });
});

test('promueve una cuenta activa de inventario sin cambiar otras cuentas', async () => {
  await db.run(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash, perfil)
    VALUES (?, ?, ?, ?)
  `, ['cielo', 'Cielo', 'hash', 'inventario']);
  await db.run(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash, perfil, activo)
    VALUES (?, ?, ?, ?, 0)
  `, ['inactivo', 'Inactivo', 'hash', 'inventario']);

  assert.equal(await promoverUsuarioAAdministrador(' cielo '), true);
  assert.equal(
    (await db.get('SELECT perfil FROM usuarios WHERE usuario = ?', ['cielo'])).perfil,
    'administrador'
  );
  assert.equal(await promoverUsuarioAAdministrador('cielo'), false);
  assert.equal(
    (await db.get('SELECT perfil FROM usuarios WHERE usuario = ?', ['inactivo'])).perfil,
    'inventario'
  );
  await assert.rejects(
    promoverUsuarioAAdministrador('inactivo'),
    /No se encontró una cuenta activa/
  );
  await assert.rejects(
    promoverUsuarioAAdministrador('no-existe'),
    /No se encontró una cuenta activa/
  );
});

test('el aprovisionamiento promueve una cuenta activa y conserva su contraseña', async () => {
  const hashAnterior = 'hash-existente';
  await db.run(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash, perfil)
    VALUES (?, ?, ?, ?)
  `, ['charly', 'Charly', hashAnterior, 'inventario']);

  assert.equal(await aprovisionarAdministrador('charly', 'Charly', ''), 'promoted');
  const cuenta = await db.get(`
    SELECT perfil, contrasena_hash FROM usuarios WHERE usuario = ?
  `, ['charly']);
  assert.equal(cuenta.perfil, 'administrador');
  assert.equal(cuenta.contrasena_hash, hashAnterior);
  assert.equal(await aprovisionarAdministrador('charly', 'Charly', ''), 'already_admin');
});

test('el aprovisionamiento crea un administrador cuando la cuenta no existe', async () => {
  const contrasena = 'una-clave-segura-123';
  assert.equal(
    await aprovisionarAdministrador('nuevo-admin', 'Administrador nuevo', contrasena),
    'created'
  );
  assert.deepEqual(
    await verificarCredenciales('nuevo-admin', contrasena),
    {
      id: (await db.get('SELECT id FROM usuarios WHERE usuario = ?', ['nuevo-admin'])).id,
      usuario: 'nuevo-admin',
      nombre: 'Administrador nuevo',
      perfil: 'administrador'
    }
  );
});

test('las sesiones se persisten en la base de datos y pueden cerrarse', async () => {
  await db.run(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash, perfil)
    VALUES (?, ?, ?, ?)
  `, ['sesion-test', 'Sesión', 'hash', 'inventario']);
  const usuario = await db.get('SELECT id FROM usuarios WHERE usuario = ?', ['sesion-test']);
  const token = await crearSesion(usuario.id);
  const cookies = `sesion=${token}`;

  assert.equal((await obtenerUsuarioDeSesion(cookies)).nombre, 'Sesión');
  const sesion = await db.get(
    'SELECT token_hash FROM sesiones WHERE usuario_id = ?',
    [usuario.id]
  );
  assert.notEqual(sesion.token_hash, token);
  await cerrarSesion(cookies);
  assert.equal(await obtenerUsuarioDeSesion(cookies), null);
});

test('guarda artículos y movimientos dentro de transacciones', async () => {
  const usuario = await db.get(
    'SELECT id FROM usuarios WHERE usuario = ?',
    ['nuevo-admin']
  );
  await guardarArticulo(new URLSearchParams({
    codigo: 'ART-001',
    nombre: 'Camisa de prueba',
    categoria: 'IT',
    tipo: '',
    tipo_nuevo: 'Camisa',
    talla: 'M',
    stock_inicial: '2'
  }));

  await registrarMovimiento(new URLSearchParams({
    codigo: 'ART-001',
    tipo_movimiento: 'Entrada',
    cantidad: '3',
    stock_esperado: '2',
    motivo: ''
  }), usuario.id);

  const articulo = await db.get(
    'SELECT stock_inicial, stock_actual FROM articulos WHERE codigo = ?',
    ['ART-001']
  );
  const movimiento = await db.get(
    'SELECT stock_anterior, stock_posterior FROM movimientos WHERE articulo_id = (SELECT id FROM articulos WHERE codigo = ?)',
    ['ART-001']
  );
  assert.equal(articulo.stock_inicial, 2);
  assert.equal(articulo.stock_actual, 5);
  assert.equal(movimiento.stock_anterior, 2);
  assert.equal(movimiento.stock_posterior, 5);
});
