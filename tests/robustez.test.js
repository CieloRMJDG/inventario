import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directorioTemporal = mkdtempSync(join(tmpdir(), 'inventario-robustez-'));
process.env.DATABASE_PATH = join(directorioTemporal, 'inventario.sqlite');

const { db } = await import('../db.js');
const { verificarCredenciales } = await import('../autenticacion.js');
const { guardarArticulo } = await import('../articulos.js');

after(async () => {
  await db.close();
  rmSync(directorioTemporal, { recursive: true, force: true });
});

test('un hash guardado con formato inválido no produce un error del servidor', async () => {
  await db.run(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash)
    VALUES (?, ?, ?)
  `, ['hash-roto', 'Hash roto', 'no-es-un-hash']);

  assert.equal(await verificarCredenciales('hash-roto', 'una-clave-segura-123'), null);
});

test('las transacciones concurrentes de SQLite se serializan sin perder artículos', async () => {
  const datosArticulo = indice => new URLSearchParams({
    codigo: `CONC-${indice}`,
    nombre: `Artículo concurrente ${indice}`,
    categoria: 'IT',
    tipo: '',
    tipo_nuevo: 'Concurrente',
    talla: '',
    stock_inicial: '1'
  });

  await Promise.all(
    Array.from({ length: 8 }, (_, indice) => guardarArticulo(datosArticulo(indice)))
  );

  const filas = await db.all("SELECT codigo FROM articulos WHERE codigo LIKE 'CONC-%'");
  assert.equal(filas.length, 8);
});
