// Restaura los artículos visibles en las capturas del inventario web.
// No elimina ni modifica artículos existentes: solo inserta códigos ausentes.
//
//   node restaurar-articulos.js              -> simula (no escribe)
//   node restaurar-articulos.js --confirmar  -> inserta en la base configurada
//
// La base se elige igual que el servidor: DATABASE_URL (PostgreSQL) o
// DATABASE_PATH / datos/inventario.sqlite (SQLite).

import { db } from './db.js';
import { guardarArticulo } from './articulos.js';

// Códigos y nombres recuperados por OCR de las capturas.
// Los valores con stock 0 no fueron legibles en la captura: verifícalos.
const articulos = [
  { codigo: 'PPCO-AZR', nombre: 'AZUCAR', categoria: 'Administración', tipo: 'Refrigerios', talla: '', inicial: 5, actual: 5 },
  { codigo: 'BAL-STK-BLA', nombre: 'BALON STAKE BLANCO', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 2, actual: 2 },
  { codigo: 'MKCO-BANDERINOI', nombre: 'BANDERINES TRIANGULARES STAKE KICK', categoria: 'Marketing', tipo: 'BRANDING', talla: '', inicial: 4, actual: 4 },
  { codigo: 'ITCO', nombre: 'BASES DE MAC PR014', categoria: 'Marketing', tipo: 'BRANDING', talla: '', inicial: 3, actual: 6 },
  { codigo: 'MKCO-BONOCASINO-02', nombre: 'BONO CASINO 51000', categoria: 'Marketing', tipo: 'ACTIVACION MARKETING', talla: '', inicial: 50, actual: 100 },
  { codigo: 'MKCO-BONOCASINO-03', nombre: 'BONO CASINO 500', categoria: 'Marketing', tipo: 'ACTIVACION MARKETING', talla: '', inicial: 100, actual: 100 },
  { codigo: 'MKCO-BONOCASINO-04', nombre: 'BONO CASINO 52000', categoria: 'Marketing', tipo: 'ACTIVACION MARKETING', talla: '', inicial: 100, actual: 100 },
  { codigo: 'MKCO-BONOCASINO-05', nombre: 'BONO CASINO 52500', categoria: 'Marketing', tipo: 'ACTIVACION MARKETING', talla: '', inicial: 100, actual: 100 },
  { codigo: 'MKCO-BONOCASINO-06', nombre: 'BONO CASINO', categoria: 'Marketing', tipo: 'ACTIVACION MARKETING', talla: '', inicial: 200, actual: 200 },
  { codigo: 'MKCO-BONOCASINO-07', nombre: 'BONO CASINO 54000', categoria: 'Marketing', tipo: 'ACTIVACION MARKETING', talla: '', inicial: 200, actual: 200 },
  { codigo: 'MKCO-BONOCASINO-01', nombre: 'BONO CASINO 5500', categoria: 'Marketing', tipo: 'ACTIVACION MARKETING', talla: '', inicial: 50, actual: 100 },
  { codigo: 'CSCO-BUZOPRAG-01', nombre: 'BUZO NEGRO PRAGMATIC', categoria: 'Casino', tipo: 'MERCH CASINO', talla: '', inicial: 0, actual: 0 },
  { codigo: 'PPCO-BDJ-001', nombre: 'Bandeja blanca', categoria: 'Administración', tipo: 'Refrigerios', talla: '', inicial: 0, actual: 0 },

  { codigo: 'MKCO-CBC-001', nombre: 'CHAQUETA STAKE BEISBOLERA DE CUERO', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 0, actual: 0 },
  { codigo: 'MKCO-CBC-002', nombre: 'CHAQUETA STAKE BEISBOLERA DE CUERO', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 2, actual: 2 },
  { codigo: 'MKCO-CBT-001', nombre: 'CHAQUETA STAKE BEISBOLERA DE TELA', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 2, actual: 2 },
  { codigo: 'PPCO-NCT-001', nombre: 'CHOCOLATE NUCITA', categoria: 'Administración', tipo: 'Refrigerios', talla: '', inicial: 2, actual: 2 },
  { codigo: 'MKCO-COJIN-01', nombre: 'COJIN SILICONA BRANDEADO STAKE', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 2, actual: 2 },

  { codigo: 'PPCO-CFE-001', nombre: 'CAFE', categoria: 'Administración', tipo: 'Refrigerios', talla: '', inicial: 0, actual: 0 },
  { codigo: 'MKCO-AZUL-MDCI', nombre: 'CAJA AZUL PARA ENVIOS', categoria: 'Marketing', tipo: 'Merch mkt', talla: 'MEDIANA', inicial: 36, actual: 36 },
  { codigo: 'MKCO-CAJA-WEST02', nombre: 'CAJA GORRA WESTCOL SF5', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 73, actual: 73 },
  { codigo: 'CSCO-CAJA-01', nombre: 'CAJA PLATEADA IMPLEMENTOS CRUPIER', categoria: 'Casino', tipo: 'ACTIVACION CASINO', talla: '', inicial: 0, actual: 0 },
  { codigo: 'MKCO-ROJA-PQ01', nombre: 'CAJA ROJA ESCARAPELAS', categoria: 'Marketing', tipo: 'Merch mkt', talla: 'PEQUEÑA', inicial: 30, actual: 80 },
  { codigo: 'MKCO-ROJA-GR01', nombre: 'CAJA ROJA ESCARAPELAS VACIAS', categoria: 'Marketing', tipo: 'Merch mkt', talla: 'GRANDE', inicial: 0, actual: 0 },
  { codigo: 'MKCO-ROJA-PQ02', nombre: 'CAJA ROJA ESCARAPELAS VACIAS', categoria: 'Marketing', tipo: 'Merch mkt', talla: 'PEQUEÑA', inicial: 8, actual: 8 },
  { codigo: 'ITCO-CAJASMAC', nombre: 'CAJAS DE MAC (mac dentro, dañadas)', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 4, actual: 4 },
  { codigo: 'MKCO-CAM-IKER01', nombre: 'CAMISETA IKER FIRMADA EN CAJA', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 10, actual: 10 },
  { codigo: 'MKCO-CAM-IKER02', nombre: 'CAMISETA IKER SIN FIRMA EN CAJA', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 11, actual: 11 },
  { codigo: 'CSCO-CAMPRAG-01', nombre: 'CAMISETA NEGRA PRAGMATIC', categoria: 'Casino', tipo: 'MERCH CASINO', talla: '', inicial: 3, actual: 3 },
  { codigo: 'MKCO-CAM-TINO01', nombre: 'CAMISETA TINO FIRMADA EN CAJA', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 0, actual: 0 },
  { codigo: 'CSCO-CANGPRAG-01', nombre: 'CANGURO IMANTADO PRAGMATIC', categoria: 'Casino', tipo: 'MERCH CASINO', talla: '', inicial: 4, actual: 4 },
  { codigo: 'MKCO-CAPA-01', nombre: 'CAPA GRIS PARA LLUVIA MARCADA CON LOGO STAKE', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 23, actual: 103 },

  { codigo: 'PPCO-CAS-001', nombre: 'CUBIERTOS NEGROS', categoria: 'Administración', tipo: 'Refrigerios', talla: '', inicial: 8, actual: 8 },
  { codigo: 'MKCO-CUBOSMIC-01', nombre: 'CUBOS PARA MICROFOS BRANDEADOS', categoria: 'Marketing', tipo: 'ACTIVACION MARKETING', talla: '', inicial: 2, actual: 2 },
  { codigo: 'PPCO-CLO-001', nombre: 'Chalecos reflectivos', categoria: 'Administración', tipo: 'SGSST', talla: '', inicial: 3, actual: 4 },
  { codigo: 'CSCO-DADOS-01', nombre: 'DADOS ROJOS CRUPIER', categoria: 'Casino', tipo: 'ACTIVACION CASINO', talla: '', inicial: 5, actual: 5 },
  { codigo: 'CSCO-CHIPS-01', nombre: 'FICHAS AZULES APUESTA', categoria: 'Casino', tipo: 'ACTIVACION CASINO', talla: '', inicial: 50, actual: 50 },
  { codigo: 'CSCO-CHIPS-03', nombre: 'FICHAS ROJAS APUESTA', categoria: 'Casino', tipo: 'ACTIVACION CASINO', talla: '', inicial: 50, actual: 50 },
  { codigo: 'CSCO-CHIPS-02', nombre: 'FICHAS VERDES APUESTA', categoria: 'Casino', tipo: 'ACTIVACION CASINO', talla: '', inicial: 51, actual: 51 },
  { codigo: 'MKCO-GORRA-WEST01', nombre: 'GORRA WESTCOL SF5 2026', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 11, actual: 11 },
  { codigo: 'HOO-FOR-001', nombre: 'Hoodie Stake x Forta Azul', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 3, actual: 3 },
  { codigo: 'PPCO-BLB-001', nombre: 'LECHE EN POLVO', categoria: 'Administración', tipo: 'Refrigerios', talla: '', inicial: 6, actual: 7 },
  { codigo: 'MKCO-PCH-001', nombre: 'PANTALON DECAHLON', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 0, actual: 0 },
  { codigo: 'ITCO-002', nombre: 'PE-COVER (bases negras)', categoria: 'Administración', tipo: 'Refrigerios', talla: '', inicial: 7, actual: 7 },
  { codigo: 'MKCO-TOTE-01', nombre: 'TOTE BAGS NEGRAS LOGO BLANCO', categoria: 'Marketing', tipo: 'Merch mkt', talla: '', inicial: 97, actual: 97 }
];

const confirmar = process.argv.includes('--confirmar');
let insertados = 0;
let omitidos = 0;

try {
  for (const articulo of articulos) {
    const existente = await db.get(
      'SELECT id FROM articulos WHERE codigo = ?',
      [articulo.codigo]
    );

    if (existente) {
      omitidos += 1;
      console.log(`OMITIDO (ya existe): ${articulo.codigo}`);
      continue;
    }

    if (!confirmar) {
      console.log(
        `INSERTAR: ${articulo.codigo} | ${articulo.nombre} | ` +
        `${articulo.categoria} | ${articulo.tipo} | ${articulo.inicial} -> ${articulo.actual}`
      );
      continue;
    }

    await guardarArticulo(new URLSearchParams({
      codigo: articulo.codigo,
      nombre: articulo.nombre,
      categoria: articulo.categoria,
      tipo: '',
      tipo_nuevo: articulo.tipo,
      talla: articulo.talla,
      stock_inicial: String(articulo.inicial)
    }));

    if (articulo.actual !== articulo.inicial) {
      await db.run(
        'UPDATE articulos SET stock_actual = ? WHERE codigo = ?',
        [articulo.actual, articulo.codigo]
      );
    }

    insertados += 1;
    console.log(`INSERTADO: ${articulo.codigo}`);
  }

  console.log(
    `\n${confirmar ? 'Restauración completada' : 'Simulación'}: ` +
    `${insertados} insertados, ${omitidos} omitidos.`
  );
} finally {
  await db.close();
}
