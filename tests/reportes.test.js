import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directorioTemporal = mkdtempSync(join(tmpdir(), 'inventario-reportes-'));
process.env.DATABASE_PATH = join(directorioTemporal, 'inventario.sqlite');

const { db } = await import('../db.js');
const { generarReportePdf, validarRango } = await import('../reportes.js');

after(async () => {
  await db.close();
  rmSync(directorioTemporal, { recursive: true, force: true });
});

test('genera un PDF con los movimientos del rango y excluye los de otras fechas', async () => {
  await db.run(`
    INSERT INTO tipos (nombre)
    SELECT ? WHERE NOT EXISTS (SELECT 1 FROM tipos WHERE nombre = ?)
  `, ['Tipo reporte', 'Tipo reporte']);

  const tipo = await db.get('SELECT id FROM tipos WHERE nombre = ?', ['Tipo reporte']);
  const categoria = await db.get('SELECT id FROM categorias WHERE nombre = ?', ['IT']);

  await db.run(`
    INSERT INTO usuarios (usuario, nombre, contrasena_hash)
    VALUES (?, ?, ?)
  `, ['usuario-reporte', 'Usuario Reporte', 'hash-de-prueba']);

  const usuario = await db.get('SELECT id FROM usuarios WHERE usuario = ?', ['usuario-reporte']);

  await db.run(`
    INSERT INTO articulos (
      codigo, nombre, descripcion, categoria_id, tipo_id, talla, stock_inicial, stock_actual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['REP-1', 'Articulo de reporte', 'Con acento á', categoria.id, tipo.id, 'M', 2, 7]);

  const articulo = await db.get('SELECT id FROM articulos WHERE codigo = ?', ['REP-1']);

  await db.run(`
    INSERT INTO movimientos (
      articulo_id, usuario_id, tipo_movimiento, stock_anterior,
      stock_posterior, motivo, fecha
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [articulo.id, usuario.id, 'Entrada', 2, 7, 'Dentro de rango', '2026-11-26 15:30:00']);

  await db.run(`
    INSERT INTO movimientos (
      articulo_id, usuario_id, tipo_movimiento, stock_anterior,
      stock_posterior, motivo, fecha
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [articulo.id, usuario.id, 'Salida', 7, 6, 'Fuera de rango', '2026-11-25 15:30:00']);

  const pdf = await generarReportePdf({
    desde: '2026-11-26',
    hasta: '2026-11-26',
    nombreUsuario: 'Usuario Reporte'
  });

  const contenido = pdf.toString('latin1');

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 8).toString('latin1'), '%PDF-1.4');
  assert.ok(contenido.includes('Reporte de movimientos'));
  assert.ok(contenido.includes('Dentro de rango'));
  assert.ok(!contenido.includes('Fuera de rango'));
  assert.ok(contenido.includes('/Type /Page'));
  assert.ok(contenido.trimEnd().endsWith('%%EOF'));

  const inicioXref = Number(contenido.match(/startxref\n(\d+)/)?.[1]);
  assert.ok(inicioXref > 0);
  assert.equal(pdf.subarray(inicioXref, inicioXref + 4).toString('latin1'), 'xref');

  const offsets = [...contenido.matchAll(/^(\d{10}) 00000 n $/gm)].map(coincidencia =>
    Number(coincidencia[1])
  );
  assert.ok(offsets.length >= 6);
  offsets.forEach((offset, indice) => {
    assert.ok(
      pdf.subarray(offset).toString('latin1').startsWith(`${indice + 1} 0 obj`),
      `El objeto ${indice + 1} no está en la posición indicada por xref.`
    );
  });
});

test('valida el formato y el orden de las fechas', () => {
  assert.throws(
    () => validarRango('26/11/2026', '2026-11-26'),
    /formato AAAA-MM-DD/
  );
  assert.throws(
    () => validarRango('2026-12-01', '2026-11-30'),
    /posterior/
  );
  assert.throws(
    () => validarRango('2020-01-01', '2026-12-31'),
    /5 años/
  );
  assert.deepEqual(validarRango('2026-11-26', '2026-11-27'), {
    desde: '2026-11-26',
    hasta: '2026-11-27'
  });
});
