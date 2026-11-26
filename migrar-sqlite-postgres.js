import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

if (!process.argv.includes('--confirmar')) {
  throw new Error('Confirma la transferencia con --confirmar.');
}

const rutaPredeterminada = fileURLToPath(
  new URL('./datos/inventario.sqlite', import.meta.url)
);
const rutaOrigen = resolve(process.env.DATABASE_PATH || rutaPredeterminada);

if (!existsSync(rutaOrigen)) {
  throw new Error('No se encontró la base SQLite local para migrar.');
}

const salidaOculta = new Writable({
  write(_texto, _codificacion, continuar) {
    continuar();
  }
});
const terminal = createInterface({
  input: process.stdin,
  output: salidaOculta,
  terminal: true
});

let cadenaConexion;
try {
  process.stdout.write('Cadena de conexión PostgreSQL (entrada oculta): ');
  cadenaConexion = await terminal.question('');
  process.stdout.write('\n');
} finally {
  terminal.close();
}

if (!cadenaConexion.trim()) {
  throw new Error('La cadena de conexión PostgreSQL es obligatoria.');
}
process.env.DATABASE_URL = cadenaConexion.trim();

const { db } = await import('./db.js');
const sqlite = new DatabaseSync(rutaOrigen, { readOnly: true });

function fechaUtc(fecha) {
  const texto = String(fecha);
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(texto)
    ? texto
    : `${texto.replace(' ', 'T')}Z`;
}

try {
  const tablasConDatos = await db.get(`
    SELECT
      (SELECT COUNT(*) FROM tipos) +
      (SELECT COUNT(*) FROM articulos) +
      (SELECT COUNT(*) FROM movimientos) AS total
  `);

  if (tablasConDatos.total > 0) {
    throw new Error(
      'La base PostgreSQL ya contiene tipos, artículos o movimientos; no se modificó.'
    );
  }

  const categorias = sqlite.prepare('SELECT id, nombre FROM categorias').all();
  const tipos = sqlite.prepare('SELECT id, nombre FROM tipos').all();
  const usuarios = sqlite.prepare(`
    SELECT id, usuario, nombre, contrasena_hash, activo, perfil
    FROM usuarios
  `).all();
  const articulos = sqlite.prepare(`
    SELECT id, codigo, nombre, categoria_id, tipo_id, talla,
           stock_inicial, stock_actual
    FROM articulos
  `).all();
  const movimientos = sqlite.prepare(`
    SELECT id, articulo_id, usuario_id, tipo_movimiento,
           stock_anterior, stock_posterior, motivo, fecha
    FROM movimientos
  `).all();

  await db.transaction(async transaccion => {
    const idsCategoria = new Map();
    for (const categoria of categorias) {
      await transaccion.run(
        'INSERT INTO categorias (nombre) VALUES (?) ON CONFLICT DO NOTHING',
        [categoria.nombre]
      );
      const destino = await transaccion.get(
        'SELECT id FROM categorias WHERE nombre = ?',
        [categoria.nombre]
      );
      idsCategoria.set(categoria.id, destino.id);
    }

    const idsTipo = new Map();
    for (const tipo of tipos) {
      await transaccion.run(
        'INSERT INTO tipos (id, nombre) VALUES (?, ?) ON CONFLICT DO NOTHING',
        [tipo.id, tipo.nombre]
      );
      const destino = await transaccion.get(
        'SELECT id FROM tipos WHERE nombre = ?',
        [tipo.nombre]
      );
      idsTipo.set(tipo.id, destino.id);
    }

    const idsUsuario = new Map();
    for (const usuario of usuarios) {
      await transaccion.run(`
        INSERT INTO usuarios (usuario, nombre, contrasena_hash, activo, perfil)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `, [
        usuario.usuario,
        usuario.nombre,
        usuario.contrasena_hash,
        usuario.activo,
        usuario.perfil || 'inventario'
      ]);
      const destino = await transaccion.get(
        'SELECT id FROM usuarios WHERE lower(usuario) = lower(?)',
        [usuario.usuario]
      );
      idsUsuario.set(usuario.id, destino.id);
    }

    for (const articulo of articulos) {
      await transaccion.run(`
        INSERT INTO articulos (
          id, codigo, nombre, categoria_id, tipo_id, talla,
          stock_inicial, stock_actual
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        articulo.id,
        articulo.codigo,
        articulo.nombre,
        idsCategoria.get(articulo.categoria_id),
        idsTipo.get(articulo.tipo_id),
        articulo.talla,
        articulo.stock_inicial,
        articulo.stock_actual
      ]);
    }

    for (const movimiento of movimientos) {
      await transaccion.run(`
        INSERT INTO movimientos (
          id, articulo_id, usuario_id, tipo_movimiento,
          stock_anterior, stock_posterior, motivo, fecha
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        movimiento.id,
        movimiento.articulo_id,
        idsUsuario.get(movimiento.usuario_id),
        movimiento.tipo_movimiento,
        movimiento.stock_anterior,
        movimiento.stock_posterior,
        movimiento.motivo,
        fechaUtc(movimiento.fecha)
      ]);
    }

    for (const tabla of ['categorias', 'tipos', 'usuarios', 'articulos', 'movimientos']) {
      await transaccion.run(`
        SELECT setval(
          pg_get_serial_sequence('${tabla}', 'id'),
          COALESCE(MAX(id), 1),
          COUNT(*) > 0
        )
        FROM ${tabla}
      `);
    }
  });

  console.log(
    `Migración completada: ${categorias.length} categorías, ${tipos.length} tipos, ` +
    `${usuarios.length} usuarios, ${articulos.length} artículos y ` +
    `${movimientos.length} movimientos.`
  );
} finally {
  sqlite.close();
  await db.close();
  cadenaConexion = '';
}
