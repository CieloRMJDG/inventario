import { db } from './db.js';

export class ErrorArticulo extends Error {}

export function guardarArticulo(datos) {
  const leer = campo => (datos.get(campo) ?? '').trim();

  const codigo = leer('codigo');
  const nombre = leer('nombre');
  const categoria = leer('categoria');
  const tipoExistente = leer('tipo');
  const tipoNuevo = leer('tipo_nuevo');
  const talla = leer('talla');
  const cantidad = leer('stock_inicial');
  const stockInicial = Number(cantidad);

  if (!codigo || codigo.length > 25 || !nombre || nombre.length > 55) {
    throw new ErrorArticulo('Completa el código y el nombre del artículo.');
  }

  if (talla.length > 15) {
    throw new ErrorArticulo('La talla debe tener hasta 15 caracteres.');
  }

  if (!/^\d+$/.test(cantidad) || !Number.isSafeInteger(stockInicial)) {
    throw new ErrorArticulo('El stock inicial debe ser un número entero de cero o más.');
  }

  if ((!tipoExistente && !tipoNuevo) || (tipoExistente && tipoNuevo) || tipoNuevo.length > 30) {
    throw new ErrorArticulo('Selecciona un tipo existente o escribe uno nuevo de hasta 30 caracteres.');
  }

  const categoriaGuardada = db.prepare(
    'SELECT id FROM categorias WHERE nombre = ?'
  ).get(categoria);

  if (!categoriaGuardada) {
    throw new ErrorArticulo('Selecciona una categoría válida.');
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    const duplicado = db.prepare(
      'SELECT id FROM articulos WHERE codigo = ?'
    ).get(codigo);

    if (duplicado) {
      throw new ErrorArticulo('Ya existe un artículo con ese código.');
    }

    if (tipoNuevo) {
      db.prepare(`
        INSERT INTO tipos (nombre) VALUES (?)
        ON CONFLICT(nombre) DO NOTHING
      `).run(tipoNuevo);
    }

    const tipoGuardado = db.prepare(
      'SELECT id FROM tipos WHERE nombre = ?'
    ).get(tipoNuevo || tipoExistente);

    if (!tipoGuardado) {
      throw new ErrorArticulo('Selecciona un tipo válido.');
    }

    db.prepare(`
      INSERT INTO articulos (
        codigo, nombre, categoria_id, tipo_id, talla, stock_inicial, stock_actual
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      codigo, nombre, categoriaGuardada.id, tipoGuardado.id,
      talla || null, stockInicial, stockInicial
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}