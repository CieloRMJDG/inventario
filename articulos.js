import { db } from './db.js';

export class ErrorArticulo extends Error {}

function validarCampos(datos, { requerirStock = false } = {}) {
  const leer = campo => String(datos.get(campo) ?? '').trim();

  const codigo = leer('codigo');
  const nombre = leer('nombre');
  const descripcion = leer('descripcion');
  const categoria = leer('categoria');
  const tipoExistente = leer('tipo');
  const tipoNuevo = leer('tipo_nuevo');
  const talla = leer('talla');

  if (!codigo || codigo.length > 25 || !nombre || nombre.length > 55) {
    throw new ErrorArticulo('Completa el código y el nombre del artículo.');
  }

  if (descripcion.length > 240) {
    throw new ErrorArticulo('La descripción debe tener hasta 240 caracteres.');
  }

  if (talla.length > 15) {
    throw new ErrorArticulo('La talla debe tener hasta 15 caracteres.');
  }

  if ((!tipoExistente && !tipoNuevo) || (tipoExistente && tipoNuevo) || tipoNuevo.length > 30) {
    throw new ErrorArticulo('Selecciona un tipo existente o escribe uno nuevo de hasta 30 caracteres.');
  }

  const campos = {
    codigo, nombre, descripcion, categoria, tipoExistente, tipoNuevo, talla
  };

  if (!requerirStock) return campos;

  const cantidad = leer('stock_inicial');
  const stockInicial = Number(cantidad);
  if (!/^\d+$/.test(cantidad) || !Number.isSafeInteger(stockInicial)) {
    throw new ErrorArticulo('El stock inicial debe ser un número entero de cero o más.');
  }

  return { ...campos, stockInicial };
}

async function resolverCategoriaYTipo(transaccion, campos) {
  const categoriaGuardada = await transaccion.get(
    'SELECT id FROM categorias WHERE nombre = ?',
    [campos.categoria]
  );

  if (!categoriaGuardada) {
    throw new ErrorArticulo('Selecciona una categoría válida.');
  }

  if (campos.tipoNuevo) {
    await transaccion.run(`
      INSERT INTO tipos (nombre) VALUES (?)
      ON CONFLICT(nombre) DO NOTHING
    `, [campos.tipoNuevo]);
  }

  const tipoGuardado = await transaccion.get(
    'SELECT id FROM tipos WHERE nombre = ?',
    [campos.tipoNuevo || campos.tipoExistente]
  );

  if (!tipoGuardado) {
    throw new ErrorArticulo('Selecciona un tipo válido.');
  }

  return { categoriaId: categoriaGuardada.id, tipoId: tipoGuardado.id };
}

export async function guardarArticulo(datos) {
  const campos = validarCampos(datos, { requerirStock: true });

  await db.transaction(async transaccion => {
    const duplicado = await transaccion.get(
      'SELECT id FROM articulos WHERE codigo = ?',
      [campos.codigo]
    );

    if (duplicado) {
      throw new ErrorArticulo('Ya existe un artículo con ese código.');
    }

    const { categoriaId, tipoId } = await resolverCategoriaYTipo(transaccion, campos);

    await transaccion.run(`
      INSERT INTO articulos (
        codigo, nombre, descripcion, categoria_id, tipo_id, talla, stock_inicial, stock_actual
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      campos.codigo, campos.nombre, campos.descripcion, categoriaId, tipoId,
      campos.talla || null, campos.stockInicial, campos.stockInicial
    ]);
  });
}

export async function editarArticulo(datos) {
  const codigoOriginal = String(datos.get('codigo_original') ?? '').trim();
  if (!codigoOriginal) {
    throw new ErrorArticulo('No se indicó el artículo que se va a editar.');
  }

  const campos = validarCampos(datos);

  await db.transaction(async transaccion => {
    const actual = await transaccion.get(
      'SELECT id FROM articulos WHERE codigo = ?',
      [codigoOriginal]
    );

    if (!actual) {
      throw new ErrorArticulo('No se encontró el artículo indicado.');
    }

    const duplicado = await transaccion.get(
      'SELECT id FROM articulos WHERE codigo = ? AND id <> ?',
      [campos.codigo, actual.id]
    );

    if (duplicado) {
      throw new ErrorArticulo('Ya existe un artículo con ese código.');
    }

    const { categoriaId, tipoId } = await resolverCategoriaYTipo(transaccion, campos);

    // El stock no se edita aquí: se controla con movimientos para conservar el historial.
    await transaccion.run(`
      UPDATE articulos
      SET codigo = ?, nombre = ?, descripcion = ?, categoria_id = ?, tipo_id = ?, talla = ?
      WHERE id = ?
    `, [
      campos.codigo, campos.nombre, campos.descripcion, categoriaId, tipoId,
      campos.talla || null, actual.id
    ]);
  });
}
