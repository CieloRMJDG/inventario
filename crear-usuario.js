import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { db } from './db.js';
import { crearUsuario } from './autenticacion.js';

const [usuario, nombre, perfil = 'inventario'] = process.argv.slice(2);

try {
  if (!usuario || !nombre?.trim() || !['inventario', 'administrador'].includes(perfil)) {
    throw new Error('Uso: node crear-usuario.js usuario "Nombre visible" [inventario|administrador]');
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

  let contrasena;
  let confirmacion;

  try {
    process.stdout.write('Contraseña (mínimo 12 caracteres): ');
    contrasena = await terminal.question('');
    process.stdout.write('\nConfirma la contraseña: ');
    confirmacion = await terminal.question('');
    process.stdout.write('\n');
  } finally {
    terminal.close();
  }

  if (contrasena !== confirmacion) {
    throw new Error('Escribe la misma contraseña dos veces.');
  }

  crearUsuario(usuario, nombre, contrasena, perfil);

  console.log(`Cuenta ${perfil} creada: ${usuario}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}