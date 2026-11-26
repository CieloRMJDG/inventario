const app = document.querySelector('#app');
const apiBase = window.location.hostname.endsWith('.github.io')
  ? 'https://bodegastakeinventario.vercel.app'
  : '';

function enlace(ruta) {
  return `#${ruta}`;
}

const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, caracter => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[caracter]);

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(`${apiBase}${ruta}`, {
    credentials: 'include',
    ...opciones,
    headers: {
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      ...opciones.headers
    }
  });
  const contenido = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(contenido.error || 'No se pudo completar la operación.');
  }

  return contenido;
}

function enviarFormulario(ruta, datos, metodo = 'POST') {
  return api(ruta, {
    method: metodo,
    body: JSON.stringify(datos)
  });
}

function pagina(titulo, contenido) {
  document.title = `${titulo} | Inventario`;
  app.innerHTML = contenido;
}

function mostrarError(error) {
  let aviso = app.querySelector('[role="alert"]');

  if (!aviso) {
    aviso = document.createElement('p');
    aviso.setAttribute('role', 'alert');
    app.prepend(aviso);
  }

  aviso.textContent = error.message;
}

function formularioApi(ruta, redireccion, contenido, clase = '', metodo = 'POST') {
  return `<form class="${clase}" data-api="${ruta}" data-metodo="${metodo}" data-redirect="${enlace(redireccion)}">${contenido}</form>`;
}

function botonVolver() {
  return `<p><a href="${enlace('/inventario')}">Volver a Artículos</a></p>`;
}

function renderizarIngreso() {
  pagina('Ingreso', `
    <div class="tarjeta-ingreso">
      <h1>Inventario</h1>
      <p class="subtitulo">Ingresa con tu cuenta autorizada.</p>
      ${formularioApi('/api/session', '/inventario', `
        <label>Usuario
          <input name="usuario" autocomplete="username" required>
        </label>
        <label>Contraseña
          <input name="contrasena" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit">Iniciar sesión</button>
      `, 'formulario-ingreso')}
    </div>
  `);
  document.body.className = 'pagina-ingreso';
}

function renderizarArticulos(usuario, articulos) {
  const filas = articulos.map(articulo => `
    <tr class="fila-articulo" data-busqueda="${escapar([
      articulo.codigo,
      articulo.nombre,
      articulo.descripcion || '',
      articulo.categoria,
      articulo.tipo,
      articulo.talla || '',
      articulo.stock_inicial,
      articulo.stock_actual
    ].join(' '))}">
      <td>${escapar(articulo.codigo)}</td>
      <td>${escapar(articulo.nombre)}</td>
      <td class="columna-descripcion">${escapar(articulo.descripcion || '—')}</td>
      <td>${escapar(articulo.categoria)}</td>
      <td>${escapar(articulo.tipo)}</td>
      <td>${escapar(articulo.talla || '—')}</td>
      <td>${articulo.stock_inicial}</td>
      <td>${articulo.stock_actual}</td>
      <td>
        <a href="${enlace(`/inventario/editar?codigo=${encodeURIComponent(articulo.codigo)}`)}">Editar</a>
        · <a href="${enlace(`/inventario/movimiento?codigo=${encodeURIComponent(articulo.codigo)}`)}">Mover stock</a>
      </td>
    </tr>
  `).join('');

  pagina('Artículos', `
    <div class="encabezado">
      <div>
        <h1>Artículos</h1>
        <p class="subtitulo">Sesión de ${escapar(usuario.nombre)}</p>
      </div>
      ${formularioApi('/api/session', '/', '<button class="boton-secundario" type="submit">Cerrar sesión</button>', '', 'DELETE')}
    </div>
    <nav class="acciones" aria-label="Acciones del inventario">
      <a class="boton" href="${enlace('/inventario/nuevo')}">+ Nuevo artículo</a>
      <a class="boton boton-secundario" href="${enlace('/inventario/historial')}">Historial</a>
      ${usuario.perfil === 'administrador'
        ? `<a class="boton boton-secundario" href="${enlace('/usuarios')}">Administrar usuarios</a>`
        : ''}
    </nav>
    <div class="busqueda-articulos" role="search">
      <label for="buscar-articulos">Buscar artículos
        <input id="buscar-articulos" type="search" placeholder="Nombre, código, descripción, categoría o tipo" autocomplete="off">
      </label>
      <p id="resultado-busqueda" class="resultado-busqueda" aria-live="polite"></p>
    </div>
    <div class="tabla">
      <table aria-label="Artículos del inventario">
        <thead><tr>
          <th scope="col">Código</th><th scope="col">Artículo</th>
          <th scope="col">Descripción</th><th scope="col">Categoría</th>
          <th scope="col">Tipo</th><th scope="col">Talla</th>
          <th scope="col">Stock inicial</th><th scope="col">Stock actual</th>
          <th scope="col">Acción</th>
        </tr></thead>
        <tbody id="lista-articulos">
          ${filas || '<tr><td colspan="9">Aún no hay artículos registrados.</td></tr>'}
          <tr id="sin-resultados" hidden><td colspan="9">No hay artículos que coincidan con la búsqueda.</td></tr>
        </tbody>
      </table>
    </div>
  `);
  document.body.className = '';

  const campoBusqueda = document.querySelector('#buscar-articulos');
  const filasArticulos = [...document.querySelectorAll('.fila-articulo')];
  const avisoBusqueda = document.querySelector('#resultado-busqueda');
  const filaSinResultados = document.querySelector('#sin-resultados');
  const normalizarTexto = texto => texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

  campoBusqueda.addEventListener('input', () => {
    const terminos = normalizarTexto(campoBusqueda.value)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    let visibles = 0;

    filasArticulos.forEach(fila => {
      const coincide = terminos.every(termino =>
        normalizarTexto(fila.dataset.busqueda).includes(termino)
      );
      fila.hidden = !coincide;
      if (coincide) visibles += 1;
    });

    filaSinResultados.hidden = visibles > 0 || filasArticulos.length === 0;
    avisoBusqueda.textContent = filasArticulos.length === 0
      ? ''
      : terminos.length > 0 && visibles === 0
        ? 'No se encontraron artículos.'
        : `Mostrando ${visibles} de ${filasArticulos.length} artículos.`;
  });
  campoBusqueda.dispatchEvent(new Event('input'));
}

async function renderizarUsuarios(consulta) {
  const usuarios = await api('/api/usuarios');
  const cuentas = usuarios.filter(cuenta => cuenta.perfil === 'inventario');
  const mensaje = consulta.get('registrado') === '1'
    ? 'Cuenta de inventario creada correctamente.'
    : consulta.get('promovido') === '1'
      ? 'La cuenta ahora tiene perfil de administrador.'
      : consulta.get('restablecida') === '1'
        ? 'La contraseña se restableció correctamente.'
        : '';
  const opciones = cuentas.map(cuenta =>
    `<option value="${escapar(cuenta.usuario)}">${escapar(cuenta.nombre)} (${escapar(cuenta.usuario)})</option>`
  ).join('');
  const filasUsuarios = usuarios.map(cuenta => `
    <tr>
      <td>${escapar(cuenta.nombre)}</td>
      <td>${escapar(cuenta.usuario)}</td>
      <td>${cuenta.perfil === 'administrador' ? 'Administrador' : 'Inventario'}</td>
    </tr>
  `).join('');

  pagina('Administrar usuarios', `
    <header class="introduccion-formulario">
      <p class="etiqueta-seccion">Administración</p>
      <h1>Administrar usuarios</h1>
      <p>Registra personal de inventario y restablece sus contraseñas cuando sea necesario.</p>
    </header>
    ${mensaje ? `<p role="status">${escapar(mensaje)}</p>` : ''}
    <section class="seccion-administracion">
      <h2>Registrar personal</h2>
      <p>Las cuentas creadas aquí tendrán el perfil de inventario.</p>
      ${formularioApi('/api/usuarios', '/usuarios?registrado=1', `
        <label class="campo">Nombre de la persona
          <input name="nombre" maxlength="80" autocomplete="name" required>
        </label>
        <label class="campo">Usuario para iniciar sesión
          <input name="usuario" maxlength="40" autocomplete="username" required>
        </label>
        <label class="campo">Contraseña
          <input name="contrasena" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>
          <span class="campo-ayuda">Debe tener al menos 12 caracteres.</span>
        </label>
        <label class="campo">Confirmar contraseña
          <input name="confirmar_contrasena" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>
        </label>
        <div class="acciones-formulario"><button type="submit">Registrar persona</button></div>
      `, 'formulario-articulo')}
    </section>
    <section class="seccion-administracion">
      <h2>Promover a administrador</h2>
      <p>Esto conserva la contraseña actual y concede permisos de administración.</p>
      ${cuentas.length
        ? formularioApi('/api/usuarios/promover', '/usuarios?promovido=1', `
            <label class="campo">Cuenta de inventario
              <select name="usuario" required>
                <option value="">Selecciona una cuenta</option>${opciones}
              </select>
            </label>
            <div class="acciones-formulario"><button type="submit">Promover cuenta</button></div>
          `, 'formulario-articulo')
        : '<p>No hay cuentas activas de inventario para promover.</p>'}
      <div class="tabla">
        <table aria-label="Perfiles de usuario">
          <thead><tr><th scope="col">Nombre</th><th scope="col">Usuario</th><th scope="col">Perfil</th></tr></thead>
          <tbody>${filasUsuarios || '<tr><td colspan="3">No hay cuentas activas.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="seccion-administracion">
      <h2>Restablecer contraseña</h2>
      <p>Define una contraseña nueva para una cuenta activa de inventario. No se puede consultar la anterior.</p>
      ${cuentas.length
        ? formularioApi('/api/usuarios/restablecer', '/usuarios?restablecida=1', `
            <label class="campo">Persona
              <select name="usuario" required>
                <option value="">Selecciona una cuenta</option>${opciones}
              </select>
            </label>
            <label class="campo">Contraseña nueva
              <input name="contrasena_nueva" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>
              <span class="campo-ayuda">Debe tener entre 12 y 128 caracteres.</span>
            </label>
            <label class="campo">Confirmar contraseña nueva
              <input name="confirmar_contrasena_nueva" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>
            </label>
            <div class="acciones-formulario"><button type="submit">Restablecer contraseña</button></div>
          `, 'formulario-articulo')
        : '<p>No hay cuentas activas de inventario para restablecer.</p>'}
    </section>
    ${botonVolver()}
  `);
  document.body.className = '';
}

async function renderizarNuevoArticulo() {
  const { categorias, tipos } = await api('/api/opciones-articulos');
  const opciones = filas => filas
    .map(fila => `<option>${escapar(fila.nombre)}</option>`)
    .join('');

  pagina('Nuevo artículo', `
    <header class="introduccion-formulario">
      <p class="etiqueta-seccion">Inventario</p>
      <h1>Nuevo artículo</h1>
      <p>Completa los datos para agregar una pieza al inventario.</p>
    </header>
    ${formularioApi('/api/articulos', '/inventario', `
      <label class="campo">Código<input name="codigo" maxlength="25" required></label>
      <label class="campo">Nombre<input name="nombre" maxlength="55" required></label>
      <label class="campo">Descripción <span class="campo-ayuda">Opcional, hasta 240 caracteres</span>
        <textarea name="descripcion" maxlength="240" rows="3"></textarea>
      </label>
      <label class="campo">Categoría
        <select name="categoria" required>
          <option value="">Selecciona una categoría</option>${opciones(categorias)}
        </select>
      </label>
      <label class="campo">Tipo existente
        <select name="tipo"><option value="">Selecciona un tipo</option>${opciones(tipos)}</select>
      </label>
      <details class="nuevo-tipo">
        <summary class="boton boton-secundario">Crear un tipo nuevo</summary>
        <label class="campo">Nombre del tipo
          <input id="tipo-nuevo" name="tipo_nuevo" maxlength="30">
          <span class="campo-ayuda">Hasta 30 caracteres.</span>
        </label>
      </details>
      <label class="campo">Talla <span class="campo-ayuda">Opcional</span>
        <input name="talla" maxlength="15">
      </label>
      <label class="campo">Stock inicial
        <input name="stock_inicial" type="number" min="0" step="1" value="0" required>
      </label>
      <div class="acciones-formulario">
        <button type="submit">Guardar artículo</button><a href="${enlace('/inventario')}">Volver a Artículos</a>
      </div>
    `, 'formulario-articulo')}
  `);
  document.body.className = '';

  const tipoExistente = document.querySelector('[name="tipo"]');
  const tipoNuevo = document.querySelector('[name="tipo_nuevo"]');
  tipoExistente.addEventListener('change', () => {
    if (tipoExistente.value) tipoNuevo.value = '';
  });
  tipoNuevo.addEventListener('input', () => {
    if (tipoNuevo.value.trim()) tipoExistente.value = '';
  });
}

async function renderizarEditarArticulo(codigo) {
  const [articulos, { categorias, tipos }] = await Promise.all([
    api('/api/articulos'),
    api('/api/opciones-articulos')
  ]);
  const articulo = articulos.find(item => item.codigo === codigo);

  if (!articulo) {
    pagina('Artículo no encontrado', '<h1>No se encontró el artículo.</h1>' + botonVolver());
    return;
  }

  const opciones = (filas, seleccionada) => filas
    .map(fila => `<option${fila.nombre === seleccionada ? ' selected' : ''}>${escapar(fila.nombre)}</option>`)
    .join('');

  pagina('Editar artículo', `
    <header class="introduccion-formulario">
      <p class="etiqueta-seccion">Inventario</p>
      <h1>Editar artículo</h1>
      <p>Stock actual: <strong>${articulo.stock_actual}</strong>. Para cambiarlo usa “Mover stock”.</p>
    </header>
    ${formularioApi('/api/articulos', '/inventario', `
      <input type="hidden" name="codigo_original" value="${escapar(articulo.codigo)}">
      <label class="campo">Código<input name="codigo" maxlength="25" value="${escapar(articulo.codigo)}" required></label>
      <label class="campo">Nombre<input name="nombre" maxlength="55" value="${escapar(articulo.nombre)}" required></label>
      <label class="campo">Descripción <span class="campo-ayuda">Opcional, hasta 240 caracteres</span>
        <textarea name="descripcion" maxlength="240" rows="3">${escapar(articulo.descripcion || '')}</textarea>
      </label>
      <label class="campo">Categoría
        <select name="categoria" required>
          <option value="">Selecciona una categoría</option>${opciones(categorias, articulo.categoria)}
        </select>
      </label>
      <label class="campo">Tipo existente
        <select name="tipo"><option value="">Selecciona un tipo</option>${opciones(tipos, articulo.tipo)}</select>
      </label>
      <details class="nuevo-tipo">
        <summary class="boton boton-secundario">Crear un tipo nuevo</summary>
        <label class="campo">Nombre del tipo
          <input id="tipo-nuevo" name="tipo_nuevo" maxlength="30">
          <span class="campo-ayuda">Hasta 30 caracteres.</span>
        </label>
      </details>
      <label class="campo">Talla <span class="campo-ayuda">Opcional</span>
        <input name="talla" maxlength="15" value="${escapar(articulo.talla || '')}">
      </label>
      <div class="acciones-formulario">
        <button type="submit">Guardar cambios</button><a href="${enlace('/inventario')}">Volver a Artículos</a>
      </div>
    `, 'formulario-articulo', 'PUT')}
  `);
  document.body.className = '';

  const tipoExistente = document.querySelector('[name="tipo"]');
  const tipoNuevo = document.querySelector('[name="tipo_nuevo"]');
  tipoExistente.addEventListener('change', () => {
    if (tipoExistente.value) tipoNuevo.value = '';
  });
  tipoNuevo.addEventListener('input', () => {
    if (tipoNuevo.value.trim()) tipoExistente.value = '';
  });
}

async function renderizarMovimiento(codigo) {
  const articulos = await api('/api/articulos');
  const articulo = articulos.find(item => item.codigo === codigo);

  if (!articulo) {
    pagina('Artículo no encontrado', '<h1>No se encontró el artículo.</h1>' + botonVolver());
    return;
  }

  pagina('Mover stock', `
    <h1>Mover stock</h1>
    <p>${escapar(articulo.nombre)} · ${escapar(articulo.codigo)}</p>
    ${articulo.descripcion ? `<p>${escapar(articulo.descripcion)}</p>` : ''}
    <p>Stock actual: <strong>${articulo.stock_actual}</strong></p>
    ${formularioApi('/api/movimientos', '/inventario', `
      <input type="hidden" name="codigo" value="${escapar(articulo.codigo)}">
      <input type="hidden" name="stock_esperado" value="${articulo.stock_actual}">
      <p><label>Movimiento
        <select name="tipo_movimiento" required>
          <option value="">Selecciona un movimiento</option>
          <option>Entrada</option><option>Salida</option><option>Ajuste</option>
        </select>
      </label></p>
      <p><label>Cantidad <input name="cantidad" type="number" min="0" step="1" required></label></p>
      <p>Para un ajuste, ingresa el total que contaste físicamente y escribe el motivo.</p>
      <p><label>Motivo <input name="motivo"></label></p>
      <button type="submit">Guardar movimiento</button> <a href="${enlace('/inventario')}">Volver a Artículos</a>
    `)}
  `);
  document.body.className = '';
}

async function renderizarHistorial() {
  const movimientos = await api('/api/historial');
  const formatoFecha = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota'
  });
  const filas = movimientos.map(movimiento => {
    const fecha = new Date(movimiento.fecha.replace(' ', 'T') + 'Z');

    return `<tr>
      <td>${escapar(formatoFecha.format(fecha))}</td>
      <td>${escapar(movimiento.codigo)} · ${escapar(movimiento.articulo)}</td>
      <td>${escapar(movimiento.categoria)}</td>
      <td>${escapar(movimiento.tipo_movimiento)}</td>
      <td>${movimiento.stock_anterior} → ${movimiento.stock_posterior}</td>
      <td>${escapar(movimiento.usuario)}</td>
      <td>${escapar(movimiento.motivo || '—')}</td>
    </tr>`;
  }).join('');

  pagina('Historial', `
    <h1>Historial</h1>${botonVolver()}
    <div class="tabla">
      <table aria-label="Historial de movimientos">
        <thead><tr>
          <th scope="col">Fecha</th><th scope="col">Artículo</th>
          <th scope="col">Categoría</th><th scope="col">Movimiento</th>
          <th scope="col">Stock antes → después</th><th scope="col">Registró</th>
          <th scope="col">Motivo</th>
        </tr></thead>
        <tbody>${filas || '<tr><td colspan="7">Aún no hay movimientos registrados.</td></tr>'}</tbody>
      </table>
    </div>
  `);
  document.body.className = '';
}

async function iniciar() {
  const fragmento = window.location.hash.slice(1) || (
    window.location.hostname.endsWith('.github.io')
      ? '/'
      : `${window.location.pathname}${window.location.search}`
  );
  const indiceConsulta = fragmento.indexOf('?');
  const ruta = indiceConsulta < 0 ? fragmento : fragmento.slice(0, indiceConsulta);
  const consulta = new URLSearchParams(
    indiceConsulta < 0 ? '' : fragmento.slice(indiceConsulta + 1)
  );
  let usuario;

  try {
    ({ usuario } = await api('/api/session'));
  } catch (error) {
    if (error.message !== 'Inicia sesión para continuar.') throw error;
    if (ruta !== '/') {
      window.location.replace(enlace('/'));
      return;
    }
    renderizarIngreso();
    return;
  }

  if (ruta === '/') {
    window.location.replace(enlace('/inventario'));
  } else if (ruta === '/inventario') {
    renderizarArticulos(usuario, await api('/api/articulos'));
  } else if (ruta === '/inventario/nuevo') {
    await renderizarNuevoArticulo();
  } else if (ruta === '/inventario/editar') {
    await renderizarEditarArticulo(consulta.get('codigo'));
  } else if (ruta === '/inventario/movimiento') {
    await renderizarMovimiento(consulta.get('codigo'));
  } else if (ruta === '/inventario/historial') {
    await renderizarHistorial();
  } else if (ruta === '/usuarios') {
    if (usuario.perfil !== 'administrador') {
      pagina('Acceso denegado', '<h1>Se requiere el perfil de administración.</h1>' + botonVolver());
      return;
    }
    await renderizarUsuarios(consulta);
  } else {
    pagina('Página no encontrada', '<h1>Página no encontrada.</h1>' + botonVolver());
  }
}

app.addEventListener('submit', async evento => {
  const formulario = evento.target.closest('form[data-api]');
  if (!formulario) return;
  evento.preventDefault();

  try {
    const datos = Object.fromEntries(new FormData(formulario).entries());
    await enviarFormulario(
      formulario.dataset.api,
      datos,
      formulario.dataset.metodo || 'POST'
    );
    window.location.assign(formulario.dataset.redirect);
  } catch (error) {
    mostrarError(error);
  }
});

function manejarRuta() {
  iniciar().catch(error => {
    console.error(error);
    pagina('Error', `<h1>No se pudo cargar el inventario</h1><p role="alert">${escapar(error.message)}</p>`);
  });
}

window.addEventListener('hashchange', manejarRuta);
manejarRuta();
