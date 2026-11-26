// Generador de reportes PDF sin dependencias externas.
// El PDF usa Helvetica con WinAnsiEncoding, suficiente para español.

import { db, esPostgres } from './db.js';

const LIMITE_MOVIMIENTOS = 10000;
const MAXIMO_DIAS = 1830; // 5 años
const DESPLAZAMIENTO_BOGOTA_MS = -5 * 60 * 60 * 1000;
const ANCHO_PAGINA = 612;
const ALTO_PAGINA = 792;
const MARGEN = 36;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

export class ErrorReporte extends Error {}

function esFechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  if (anio < 2000 || anio > 2100) return false;

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
}

export function validarRango(desde, hasta) {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    throw new ErrorReporte('Indica las fechas en formato AAAA-MM-DD.');
  }
  if (desde > hasta) {
    throw new ErrorReporte('La fecha inicial no puede ser posterior a la final.');
  }

  const dias = (
    Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)
  ) / 86400000;

  if (dias > MAXIMO_DIAS) {
    throw new ErrorReporte('El rango máximo permitido es de 5 años.');
  }

  return { desde, hasta };
}

function sumarUnDia(fechaISO) {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
}

function limitesConsulta({ desde, hasta }) {
  // Bogotá es UTC-5 todo el año. El límite final es exclusivo.
  const diaSiguiente = sumarUnDia(hasta);
  if (esPostgres) {
    return [`${desde}T05:00:00Z`, `${diaSiguiente}T05:00:00Z`];
  }
  return [`${desde} 05:00:00`, `${diaSiguiente} 05:00:00`];
}

function fechaComoDate(valor) {
  if (valor instanceof Date) return valor;
  if (typeof valor === 'number') return new Date(valor);
  const texto = String(valor ?? '').trim();
  return new Date(texto.includes('T') ? texto : `${texto.replace(' ', 'T')}Z`);
}

function formatearFechaBogota(valor) {
  const original = fechaComoDate(valor);
  if (Number.isNaN(original.getTime())) return '-';

  const fecha = new Date(original.getTime() + DESPLAZAMIENTO_BOGOTA_MS);
  const dos = numero => String(numero).padStart(2, '0');
  return `${dos(fecha.getUTCDate())}/${dos(fecha.getUTCMonth() + 1)}/` +
    `${fecha.getUTCFullYear()} ${dos(fecha.getUTCHours())}:${dos(fecha.getUTCMinutes())}`;
}

function formatearFechaCorta(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-');
  return `${dia}/${mes}/${anio}`;
}

async function consultarMovimientos(rango) {
  const [inicio, fin] = limitesConsulta(rango);
  const movimientos = await db.all(`
    SELECT m.fecha, m.tipo_movimiento, m.stock_anterior, m.stock_posterior,
           m.motivo, a.codigo, a.nombre AS articulo, c.nombre AS categoria,
           u.nombre AS usuario
    FROM movimientos AS m
    JOIN articulos AS a ON a.id = m.articulo_id
    JOIN categorias AS c ON c.id = a.categoria_id
    JOIN usuarios AS u ON u.id = m.usuario_id
    WHERE m.fecha >= ? AND m.fecha < ?
    ORDER BY m.fecha ASC, m.id ASC
    LIMIT ${LIMITE_MOVIMIENTOS + 1}
  `, [inicio, fin]);

  if (movimientos.length > LIMITE_MOVIMIENTOS) {
    throw new ErrorReporte(
      `El rango supera los ${LIMITE_MOVIMIENTOS} movimientos. Acorta las fechas.`
    );
  }

  return movimientos;
}

function calcularResumen(movimientos) {
  const entradas = movimientos.filter(m => m.tipo_movimiento === 'Entrada');
  const salidas = movimientos.filter(m => m.tipo_movimiento === 'Salida');
  const ajustes = movimientos.filter(m => m.tipo_movimiento === 'Ajuste');
  const sumar = (lista, selector) => lista.reduce((total, movimiento) => {
    const valor = Number(selector(movimiento));
    return total + (Number.isFinite(valor) ? valor : 0);
  }, 0);

  return {
    total: movimientos.length,
    entradas: entradas.length,
    salidas: salidas.length,
    ajustes: ajustes.length,
    unidadesEntrada: sumar(entradas, m => m.stock_posterior - m.stock_anterior),
    unidadesSalida: sumar(salidas, m => m.stock_anterior - m.stock_posterior),
    articulos: new Set(movimientos.map(m => m.codigo)).size
  };
}

function aTextoPdf(valor) {
  const equivalencias = {
    '‘': "'", '’': "'", '“': '"', '”': '"',
    '–': '-', '—': '-', '…': '...', '→': '->',
    '\u00a0': ' '
  };

  let resultado = '';
  for (const caracter of String(valor ?? '')) {
    if (equivalencias[caracter] !== undefined) {
      resultado += equivalencias[caracter];
    } else {
      const codigo = caracter.codePointAt(0);
      if (codigo >= 32 && codigo <= 255) resultado += caracter;
      else if (codigo === 10 || codigo === 13) resultado += ' ';
      else resultado += '?';
    }
  }

  return resultado
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function dividirTexto(valor, maximo, limite = 3) {
  const palabras = String(valor ?? '').trim().split(/\s+/).filter(Boolean);
  const lineas = [];
  let linea = '';

  for (const palabraOriginal of palabras) {
    let palabra = palabraOriginal;

    while (palabra.length > maximo) {
      if (linea) {
        lineas.push(linea);
        linea = '';
      }
      lineas.push(palabra.slice(0, maximo));
      palabra = palabra.slice(maximo);
    }

    if (!linea) {
      linea = palabra;
    } else if (`${linea} ${palabra}`.length <= maximo) {
      linea += ` ${palabra}`;
    } else {
      lineas.push(linea);
      linea = palabra;
    }
  }

  if (linea) lineas.push(linea);
  if (!lineas.length) lineas.push('');

  if (lineas.length > limite) {
    const recortadas = lineas.slice(0, limite);
    const ultima = recortadas[limite - 1];
    recortadas[limite - 1] = ultima.length >= maximo
      ? `${ultima.slice(0, maximo - 3)}...`
      : `${ultima}...`.slice(0, maximo);
    return recortadas;
  }

  return lineas;
}

const numero = valor => String(Math.round(valor * 100) / 100);

class Pdf {
  constructor(meta) {
    this.meta = meta;
    this.paginas = [];
    this.comandos = [];
    this.numero = 1;
    this.y = 0;
    this.nuevaPagina(false);
  }

  nuevaPagina(conTabla = true) {
    if (this.comandos.length) {
      this.paginas.push(this.comandos.join('\n'));
    }
    this.comandos = [];
    this.numero = this.paginas.length + 1;
    this.dibujarCabecera();

    this.y = 698;
    if (conTabla) {
      this.dibujarEncabezadoTabla();
    }
  }

  texto(x, y, valor, opciones = {}) {
    const tamaño = opciones.tamaño || 9;
    const fuente = opciones.fuente || 'F1';
    const color = opciones.color || '0 0 0 rg';
    this.comandos.push(
      'BT',
      color,
      `/${fuente} ${numero(tamaño)} Tf`,
      `1 0 0 1 ${numero(x)} ${numero(y)} Tm`,
      `(${aTextoPdf(valor)}) Tj`,
      'ET'
    );
  }

  rectangulo(x, y, ancho, alto, color) {
    this.comandos.push(
      color,
      `${numero(x)} ${numero(y)} ${numero(ancho)} ${numero(alto)} re f`
    );
  }

  linea(x1, y1, x2, y2) {
    this.comandos.push(
      '0.82 0.82 0.82 RG',
      `${numero(x1)} ${numero(y1)} m`,
      `${numero(x2)} ${numero(y2)} l`,
      'S'
    );
  }

  dibujarCabecera() {
    this.rectangulo(MARGEN, 716, ANCHO_UTIL, 60, '0.98 0.94 0.91 rg');
    this.texto(MARGEN + 10, 758, 'Reporte de movimientos de inventario', {
      fuente: 'F2', tamaño: 15, color: '0.18 0.16 0.16 rg'
    });
    this.texto(MARGEN + 10, 741,
      `Periodo: ${formatearFechaCorta(this.meta.desde)} a ${formatearFechaCorta(this.meta.hasta)}`,
      { tamaño: 9, color: '0.35 0.32 0.31 rg' }
    );
    this.texto(MARGEN + 10, 726,
      `Generado por ${this.meta.generadoPor || 'Inventario'} - ${this.meta.generadoEn}`,
      { tamaño: 8, color: '0.45 0.42 0.41 rg' }
    );

    this.linea(MARGEN, 28, ANCHO_PAGINA - MARGEN, 28);
    this.texto(ANCHO_PAGINA - MARGEN - 70, 14, `Pagina ${this.numero}`, {
      tamaño: 8, color: '0.45 0.45 0.45 rg'
    });
  }

  dibujarEncabezadoTabla() {
    this.rectangulo(MARGEN, this.y + 3, ANCHO_UTIL, 15, '0.96 0.94 0.92 rg');
    for (const columna of columnas) {
      this.texto(columna.x + 3, this.y, columna.titulo, {
        fuente: 'F2', tamaño: 8
      });
    }
    this.y -= 18;
  }

  agregarResumen(resumen) {
    this.texto(MARGEN, this.y, 'Resumen del periodo', {
      fuente: 'F2', tamaño: 11
    });
    this.y -= 18;

    const lineas = [
      `Movimientos: ${resumen.total}`,
      `Articulos involucrados: ${resumen.articulos}`,
      `Entradas: ${resumen.entradas} (${resumen.unidadesEntrada} unidades)`,
      `Salidas: ${resumen.salidas} (${resumen.unidadesSalida} unidades)`,
      `Ajustes: ${resumen.ajustes}`
    ];

    for (const linea of lineas) {
      this.texto(MARGEN, this.y, linea, { tamaño: 9 });
      this.y -= 13;
    }

    this.y -= 10;
    this.dibujarEncabezadoTabla();
  }

  agregarMovimiento(movimiento, indice) {
    const valores = [
      formatearFechaBogota(movimiento.fecha),
      `${movimiento.codigo} - ${movimiento.articulo}`,
      movimiento.categoria,
      movimiento.tipo_movimiento,
      movimiento.stock_anterior,
      movimiento.stock_posterior,
      movimiento.usuario,
      movimiento.motivo || '-'
    ];

    const celdas = columnas.map((columna, indiceColumna) =>
      dividirTexto(valores[indiceColumna], columna.caracteres, 3)
    );
    const lineas = Math.max(...celdas.map(parte => parte.length));
    const altura = Math.max(17, lineas * 10 + 6);

    if (this.y - altura < 48) {
      this.nuevaPagina();
    }

    if (indice % 2 === 1) {
      this.rectangulo(MARGEN, this.y - altura + 10, ANCHO_UTIL, altura,
        '0.995 0.985 0.978 rg');
    }

    celdas.forEach((parte, indiceColumna) => {
      parte.forEach((linea, numeroLinea) => {
        this.texto(
          columnas[indiceColumna].x + 3,
          this.y - numeroLinea * 10,
          linea,
          { tamaño: 8 }
        );
      });
    });

    this.linea(MARGEN, this.y - altura + 8, ANCHO_PAGINA - MARGEN, this.y - altura + 8);
    this.y -= altura;
  }

  finalizar() {
    this.paginas.push(this.comandos.join('\n'));

    const objetos = [];
    const kids = this.paginas.map((_, indice) => `${5 + indice * 2} 0 R`).join(' ');

    objetos.push({
      id: 1,
      contenido: `<< /Type /Catalog /Pages 2 0 R >>`
    });
    objetos.push({
      id: 2,
      contenido: `<< /Type /Pages /Kids [${kids}] /Count ${this.paginas.length} >>`
    });
    objetos.push({
      id: 3,
      contenido: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`
    });
    objetos.push({
      id: 4,
      contenido: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`
    });

    this.paginas.forEach((contenido, indice) => {
      const idPagina = 5 + indice * 2;
      const idContenido = idPagina + 1;
      objetos.push({
        id: idPagina,
        contenido:
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO_PAGINA} ${ALTO_PAGINA}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idContenido} 0 R >>`
      });
      const bytes = Buffer.from(`${contenido}\n`, 'latin1');
      objetos.push({
        id: idContenido,
        contenido: Buffer.concat([
          Buffer.from(`<< /Length ${bytes.length} >>\nstream\n`, 'latin1'),
          bytes,
          Buffer.from('endstream', 'latin1')
        ])
      });
    });

    let pdf = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
    const desplazamientos = {};

    for (const objeto of objetos) {
      desplazamientos[objeto.id] = pdf.length;
      const contenido = typeof objeto.contenido === 'string'
        ? Buffer.from(objeto.contenido, 'latin1')
        : objeto.contenido;
      pdf = Buffer.concat([
        pdf,
        Buffer.from(`${objeto.id} 0 obj\n`, 'latin1'),
        contenido,
        Buffer.from('\nendobj\n', 'latin1')
      ]);
    }

    const inicioXref = pdf.length;
    let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= objetos.length; id += 1) {
      xref += `${String(desplazamientos[id]).padStart(10, '0')} 00000 n \n`;
    }

    pdf = Buffer.concat([
      pdf,
      Buffer.from(xref, 'latin1'),
      Buffer.from(
        `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\n` +
        `startxref\n${inicioXref}\n%%EOF\n`,
        'latin1'
      )
    ]);

    return pdf;
  }
}

const columnas = [
  { titulo: 'Fecha', x: MARGEN, ancho: 72, caracteres: 16 },
  { titulo: 'Articulo', x: MARGEN + 72, ancho: 140, caracteres: 30 },
  { titulo: 'Categoria', x: MARGEN + 212, ancho: 62, caracteres: 13 },
  { titulo: 'Tipo', x: MARGEN + 274, ancho: 45, caracteres: 9 },
  { titulo: 'Ant.', x: MARGEN + 319, ancho: 32, caracteres: 6 },
  { titulo: 'Post.', x: MARGEN + 351, ancho: 32, caracteres: 6 },
  { titulo: 'Registro', x: MARGEN + 383, ancho: 58, caracteres: 12 },
  { titulo: 'Motivo', x: MARGEN + 441, ancho: 99, caracteres: 21 }
];

export async function generarReportePdf({ desde, hasta, nombreUsuario }) {
  const rango = validarRango(desde, hasta);
  const movimientos = await consultarMovimientos(rango);
  const resumen = calcularResumen(movimientos);
  const pdf = new Pdf({
    desde: rango.desde,
    hasta: rango.hasta,
    generadoPor: nombreUsuario || 'Inventario',
    generadoEn: formatearFechaBogota(new Date())
  });

  pdf.agregarResumen(resumen);
  movimientos.forEach((movimiento, indice) => pdf.agregarMovimiento(movimiento, indice));

  return pdf.finalizar();
}
