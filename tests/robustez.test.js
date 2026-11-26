import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directorioTemporal = mkdtempSync(join(tmpdir(), 'inventario-robustez-'));
process.env.DATABASE_PATH = join(directorioTemporal, 'inventario.sqlite');

const { db } = await import('../db.js');
const { verificarCredenciales } = await import('../autenticacion.js');
const { guardarArticulo, editarArticulo } = await import('../articulos.js');

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

test('guarda la descripción y permite editar el artículo sin cambiar el stock', async () => {
  await guardarArticulo(new URLSearchParams({
    codigo: 'EDIT-1',
    nombre: 'Artículo original',
    descripcion: 'Descripción inicial',
    categoria: 'IT',
    tipo: '',
    tipo_nuevo: 'Edición',
    talla: '',
    stock_inicial: '4'
  }));

  const antes = await db.get('SELECT * FROM articulos WHERE codigo = ?', ['EDIT-1']);
  assert.equal(antes.descripcion, 'Descripción inicial');

  await editarArticulo(new URLSearchParams({
    codigo_original: 'EDIT-1',
    codigo: 'EDIT-2',
    nombre: 'Artículo editado',
    descripcion: 'Descripción nueva',
    categoria: 'IT',
    tipo: 'Edición',
    tipo_nuevo: '',
    talla: 'M'
  }));

  const despues = await db.get('SELECT * FROM articulos WHERE codigo = ?', ['EDIT-2']);
  assert.equal(despues.nombre, 'Artículo editado');
  assert.equal(despues.descripcion, 'Descripción nueva');
  assert.equal(despues.talla, 'M');
  assert.equal(despues.stock_inicial, 4);
  assert.equal(despues.stock_actual, 4);
});

test('rechaza editar un artículo usando el código de otro', async () => {
  await guardarArticulo(new URLSearchParams({
    codigo: 'EDIT-A',
    nombre: 'Uno',
    descripcion: '',
    categoria: 'IT',
    tipo: 'Edición',
    tipo_nuevo: '',
    talla: '',
    stock_inicial: '1'
  }));
  await guardarArticulo(new URLSearchParams({
    codigo: 'EDIT-B',
    nombre: 'Dos',
    descripcion: '',
    categoria: 'IT',
    tipo: 'Edición',
    tipo_nuevo: '',
    talla: '',
    stock_inicial: '1'
  }));

  await assert.rejects(
    editarArticulo(new URLSearchParams({
      codigo_original: 'EDIT-B',
      codigo: 'EDIT-A',
      nombre: 'Dos renombrado',
      descripcion: '',
      categoria: 'IT',
      tipo: 'Edición',
      tipo_nuevo: '',
      talla: ''
    })),
    /Ya existe un artículo con ese código/
  );
});
