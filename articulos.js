import { db } from './db.js';

export class ErrorArticulo extends Error {}

export async function guardarArticulo(datos) {
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

  await db.transaction(async transaccion => {
    const categoriaGuardada = await transaccion.get(
      'SELECT id FROM categorias WHERE nombre = ?',
      [categoria]
    );

    if (!categoriaGuardada) {
      throw new ErrorArticulo('Selecciona una categoría válida.');
    }

    const duplicado = await transaccion.get(
      'SELECT id FROM articulos WHERE codigo = ?',
      [codigo]
    );

    if (duplicado) {
      throw new ErrorArticulo('Ya existe un artículo con ese código.');
    }

    if (tipoNuevo) {
      await transaccion.run(`
        INSERT INTO tipos (nombre) VALUES (?)
        ON CONFLICT(nombre) DO NOTHING
      `, [tipoNuevo]);
    }

    const tipoGuardado = await transaccion.get(
      'SELECT id FROM tipos WHERE nombre = ?',
      [tipoNuevo || tipoExistente]
    );

    if (!tipoGuardado) {
      throw new ErrorArticulo('Selecciona un tipo válido.');
    }

    await transaccion.run(`
      INSERT INTO articulos (
        codigo, nombre, categoria_id, tipo_id, talla, stock_inicial, stock_actual
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      codigo, nombre, categoriaGuardada.id, tipoGuardado.id,
      talla || null, stockInicial, stockInicial
    ]);
  });
}