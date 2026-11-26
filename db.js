import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const rutaPredeterminada = fileURLToPath(
  new URL('./datos/inventario.sqlite', import.meta.url)
);
const ruta = resolve(process.env.DATABASE_PATH || rutaPredeterminada);
mkdirSync(dirname(ruta), { recursive: true });
export const db = new DatabaseSync(ruta);

db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );
`);

const insertarCategoria = db.prepare(`
  INSERT INTO categorias (nombre)
  SELECT ? WHERE NOT EXISTS (
    SELECT 1 FROM categorias WHERE nombre = ?
  )
`);

for (const nombre of ['Marketing', 'Casino', 'IT', 'Administración']) {
  insertarCategoria.run(nombre, nombre);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS tipos (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE CHECK (length(trim(nombre)) > 0)
  );
`);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS articulos (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    categoria_id INTEGER NOT NULL REFERENCES categorias(id),
    tipo_id INTEGER NOT NULL REFERENCES tipos(id),
    talla TEXT,
    stock_inicial INTEGER NOT NULL CHECK (stock_inicial >= 0),
    stock_actual INTEGER NOT NULL CHECK (stock_actual >= 0)
  ) STRICT;
`);

db.exec(`
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
`);

const columnasUsuario = db.prepare('PRAGMA table_info(usuarios)').all();
if (!columnasUsuario.some(columna => columna.name === 'perfil')) {
  db.exec(`
    ALTER TABLE usuarios
    ADD COLUMN perfil TEXT NOT NULL DEFAULT 'inventario'
      CHECK (perfil IN ('inventario', 'administrador'))
  `);
}