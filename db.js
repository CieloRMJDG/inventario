import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Pool } = pg;
pg.types.setTypeParser(20, valor => {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero)) {
    throw new RangeError('El valor de PostgreSQL excede el rango entero seguro de JavaScript.');
  }
  return numero;
});

const categoriasIniciales = ['Marketing', 'Casino', 'IT', 'Administración'];
const usaPostgres = Boolean(process.env.DATABASE_URL);
let sqlite;
let pool;
let colaSqlite = Promise.resolve();

// SQLite trabaja con una sola conexión: encolamos cada operación para que dos
// solicitudes no abran transacciones al mismo tiempo ni se mezclen entre sí.
function encolarOperacion(operacion) {
  const resultado = colaSqlite.then(operacion);
  colaSqlite = resultado.then(() => undefined, () => undefined);
  return resultado;
}

function crearAdaptadorPostgres(cliente = pool) {
  const convertirParametros = sql => {
    let indice = 0;
    return sql.replace(/\?/g, () => `$${++indice}`);
  };

  return {
    async all(sql, parametros = []) {
      return (await cliente.query(convertirParametros(sql), parametros)).rows;
    },
    async get(sql, parametros = []) {
      return (await cliente.query(convertirParametros(sql), parametros)).rows[0];
    },
    async run(sql, parametros = []) {
      const resultado = await cliente.query(convertirParametros(sql), parametros);
      return { changes: resultado.rowCount ?? 0 };
    }
  };
}

function crearAdaptadorSqlite() {
  return {
    async all(sql, parametros = []) {
      return sqlite.prepare(sql).all(...parametros);
    },
    async get(sql, parametros = []) {
      return sqlite.prepare(sql).get(...parametros);
    },
    async run(sql, parametros = []) {
      return sqlite.prepare(sql).run(...parametros);
    }
  };
}

function inicializarSqlite() {
  const rutaPredeterminada = fileURLToPath(
    new URL('./datos/inventario.sqlite', import.meta.url)
  );
  const ruta = resolve(process.env.DATABASE_PATH || rutaPredeterminada);
  mkdirSync(dirname(ruta), { recursive: true });
  sqlite = new DatabaseSync(ruta);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS tipos (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE CHECK (length(trim(nombre)) > 0)
    );

    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS articulos (
      id INTEGER PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
      nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
      descripcion TEXT NOT NULL DEFAULT '',
      categoria_id INTEGER NOT NULL REFERENCES categorias(id),
      tipo_id INTEGER NOT NULL REFERENCES tipos(id),
      talla TEXT,
      stock_inicial INTEGER NOT NULL CHECK (stock_inicial >= 0),
      stock_actual INTEGER NOT NULL CHECK (stock_actual >= 0)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY,
      usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
      nombre TEXT NOT NULL,
      contrasena_hash TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
      perfil TEXT NOT NULL DEFAULT 'inventario'
        CHECK (perfil IN ('inventario', 'administrador'))
    ) STRICT;

    CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY,
      articulo_id INTEGER NOT NULL REFERENCES articulos(id),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tipo_movimiento TEXT NOT NULL
        CHECK (tipo_movimiento IN ('Entrada', 'Salida', 'Ajuste')),
      stock_anterior INTEGER NOT NULL CHECK (stock_anterior >= 0),
      stock_posterior INTEGER NOT NULL CHECK (stock_posterior >= 0),
      motivo TEXT NOT NULL DEFAULT '',
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (
        (tipo_movimiento = 'Entrada' AND stock_posterior > stock_anterior)
        OR (tipo_movimiento = 'Salida' AND stock_posterior < stock_anterior)
        OR (tipo_movimiento = 'Ajuste' AND stock_posterior <> stock_anterior
            AND length(trim(motivo)) > 0)
      )
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sesiones (
      token_hash TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      vence INTEGER NOT NULL
    ) STRICT;
  `);

  const columnasUsuario = sqlite.prepare('PRAGMA table_info(usuarios)').all();
  if (!columnasUsuario.some(columna => columna.name === 'perfil')) {
    sqlite.exec(`
      ALTER TABLE usuarios
      ADD COLUMN perfil TEXT NOT NULL DEFAULT 'inventario'
        CHECK (perfil IN ('inventario', 'administrador'))
    `);
  }

  const columnasArticulo = sqlite.prepare('PRAGMA table_info(articulos)').all();
  if (!columnasArticulo.some(columna => columna.name === 'descripcion')) {
    sqlite.exec("ALTER TABLE articulos ADD COLUMN descripcion TEXT NOT NULL DEFAULT ''");
  }

  const insertarCategoria = sqlite.prepare(`
    INSERT INTO categorias (nombre)
    SELECT ? WHERE NOT EXISTS (
      SELECT 1 FROM categorias WHERE nombre = ?
    )
  `);
  for (const nombre of categoriasIniciales) {
    insertarCategoria.run(nombre, nombre);
  }
}

async function inicializarPostgres() {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categorias (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS tipos (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE CHECK (length(trim(nombre)) > 0)
    );

    CREATE TABLE IF NOT EXISTS articulos (
      id SERIAL PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
      nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
      descripcion TEXT NOT NULL DEFAULT '',
      categoria_id INTEGER NOT NULL REFERENCES categorias(id),
      tipo_id INTEGER NOT NULL REFERENCES tipos(id),
      talla TEXT,
      stock_inicial BIGINT NOT NULL CHECK (stock_inicial >= 0),
      stock_actual BIGINT NOT NULL CHECK (stock_actual >= 0)
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario TEXT NOT NULL,
      nombre TEXT NOT NULL,
      contrasena_hash TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
      perfil TEXT NOT NULL DEFAULT 'inventario'
        CHECK (perfil IN ('inventario', 'administrador'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS usuarios_usuario_sin_distincion_mayusculas
      ON usuarios (lower(usuario));

    CREATE TABLE IF NOT EXISTS movimientos (
      id SERIAL PRIMARY KEY,
      articulo_id INTEGER NOT NULL REFERENCES articulos(id),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tipo_movimiento TEXT NOT NULL
        CHECK (tipo_movimiento IN ('Entrada', 'Salida', 'Ajuste')),
      stock_anterior BIGINT NOT NULL CHECK (stock_anterior >= 0),
      stock_posterior BIGINT NOT NULL CHECK (stock_posterior >= 0),
      motivo TEXT NOT NULL DEFAULT '',
      fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (
        (tipo_movimiento = 'Entrada' AND stock_posterior > stock_anterior)
        OR (tipo_movimiento = 'Salida' AND stock_posterior < stock_anterior)
        OR (tipo_movimiento = 'Ajuste' AND stock_posterior <> stock_anterior
            AND length(trim(motivo)) > 0)
      )
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      token_hash TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      vence BIGINT NOT NULL
    );
  `);

  const columnaDescripcion = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articulos' AND column_name = 'descripcion'
  `);
  if (columnaDescripcion.rowCount === 0) {
    await pool.query("ALTER TABLE articulos ADD COLUMN descripcion TEXT NOT NULL DEFAULT ''");
  }

  for (const nombre of categoriasIniciales) {
    await pool.query(
      'INSERT INTO categorias (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING',
      [nombre]
    );
  }
}

if (usaPostgres) {
  await inicializarPostgres();
} else {
  inicializarSqlite();
}

const adaptador = usaPostgres
  ? crearAdaptadorPostgres()
  : crearAdaptadorSqlite();

const adaptadorPublico = usaPostgres
  ? adaptador
  : {
      all: (sql, parametros = []) => encolarOperacion(() => adaptador.all(sql, parametros)),
      get: (sql, parametros = []) => encolarOperacion(() => adaptador.get(sql, parametros)),
      run: (sql, parametros = []) => encolarOperacion(() => adaptador.run(sql, parametros))
    };

export const esPostgres = usaPostgres;

export const db = {
  ...adaptadorPublico,
  async transaction(operacion) {
    if (!usaPostgres) {
      return encolarOperacion(async () => {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const resultado = await operacion(adaptador);
          sqlite.exec('COMMIT');
          return resultado;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      });
    }

    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await operacion(crearAdaptadorPostgres(cliente));
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  },
  async close() {
    if (pool) {
      await pool.end();
    } else {
      sqlite.close();
    }
  }
};
