import { db } from './db.js';

export class ErrorMovimiento extends Error {}

function leerCantidad(texto) {
  const cantidad = Number(texto);

  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(cantidad)) {
    throw new ErrorMovimiento('Ingresa una cantidad entera de cero o más.');
  }

  return cantidad;
}

export async function registrarMovimiento(datos, usuarioId) {
  const leer = campo => (datos.get(campo) ?? '').trim();

  const codigo = leer('codigo');
  const tipo = leer('tipo_movimiento');
  const motivo = leer('motivo');

  if (!['Entrada', 'Salida', 'Ajuste'].includes(tipo)) {
    throw new ErrorMovimiento('Selecciona un tipo de movimiento.');
  }

  const cantidad = leerCantidad(leer('cantidad'));
  const stockEsperado = leerCantidad(leer('stock_esperado'));

  if (tipo !== 'Ajuste' && cantidad === 0) {
    throw new ErrorMovimiento('La cantidad debe ser mayor que cero.');
  }

  if (tipo === 'Ajuste' && !motivo) {
    throw new ErrorMovimiento('Escribe el motivo del ajuste.');
  }

  await db.transaction(async transaccion => {
    const articulo = await transaccion.get(
      'SELECT id, stock_actual FROM articulos WHERE codigo = ?',
      [codigo]
    );

    if (!articulo) {
      throw new ErrorMovimiento('No se encontró el artículo.');
    }

    const anterior = articulo.stock_actual;

    if (anterior !== stockEsperado) {
      throw new ErrorMovimiento('El stock cambió. Revisa la cantidad actual antes de volver a guardar.');
    }

    let posterior = cantidad;

    if (tipo === 'Entrada') posterior = anterior + cantidad;
    if (tipo === 'Salida') posterior = anterior - cantidad;

    if (posterior < 0) {
      throw new ErrorMovimiento('La salida supera el stock disponible.');
    }

    if (!Number.isSafeInteger(posterior)) {
      throw new ErrorMovimiento('La cantidad es demasiado grande.');
    }

    if (posterior === anterior) {
      throw new ErrorMovimiento('La cantidad contada coincide con el stock actual.');
    }

    await transaccion.run(
      'UPDATE articulos SET stock_actual = ? WHERE id = ?',
      [posterior, articulo.id]
    );

    await transaccion.run(`
      INSERT INTO movimientos (
        articulo_id, usuario_id, tipo_movimiento,
        stock_anterior, stock_posterior, motivo
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [articulo.id, usuarioId, tipo, anterior, posterior, motivo]);
  });
}