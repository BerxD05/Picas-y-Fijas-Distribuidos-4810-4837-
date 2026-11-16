'use strict';

const estado = {
  yo: localStorage.getItem('picas:jugador') || null,
  juegoId: localStorage.getItem('picas:juegoId') || null,
  juegos: [],
};

const $ = (id) => document.getElementById(id);

const ui = {
  sesion: $('sesion'),
  nombre: $('nombre'),
  btnLogin: $('btnLogin'),
  numeroSecreto: $('numeroSecreto'),
  btnCrear: $('btnCrear'),
  idCreado: $('idCreado'),
  listaJuegos: $('listaJuegos'),
  btnRefrescar: $('btnRefrescar'),
  tablero: $('tablero'),
  zonaJugada: $('zonaJugada'),
  intento: $('intento'),
  btnJugar: $('btnJugar'),
  aviso: $('aviso'),
};

function el(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

let temporizadorAviso = null;

function avisar(mensaje, tipo = 'ok') {
  ui.aviso.textContent = mensaje;
  ui.aviso.className = `aviso ${tipo}`;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => ui.aviso.classList.add('oculto'), 3500);
}

async function api(ruta, { method = 'GET', body } = {}) {
  const respuesta = await fetch(ruta, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let datos = {};

  try {
    datos = await respuesta.json();
  } catch {
    datos = {};
  }

  if (!respuesta.ok) {
    const fallo = new Error(datos.error || `Error ${respuesta.status}`);
    fallo.status = respuesta.status;
    throw fallo;
  }

  return datos;
}

function limpiarNumero(valor) {
  return String(valor || '').replace(/\D/g, '').slice(0, 4);
}

function nombreEstado(estadoJuego) {
  if (estadoJuego === 'creado') return 'Por iniciar';
  if (estadoJuego === 'en_juego') return 'En juego';
  if (estadoJuego === 'terminado') return 'Terminado';
  return estadoJuego;
}

function pintarSesion() {
  if (estado.yo) {
    ui.sesion.textContent = `Jugador: ${estado.yo}`;
    ui.sesion.classList.add('activa');
    ui.nombre.value = estado.yo;
  } else {
    ui.sesion.textContent = 'Sin sesión';
    ui.sesion.classList.remove('activa');
  }
}

async function entrar() {
  const nombre = ui.nombre.value.trim();

  if (!nombre) {
    avisar('Escribe tu nombre', 'error');
    return;
  }

  try {
    const datos = await api('/login', { method: 'POST', body: { nombre } });
    estado.yo = datos.jugador.nombre;
    localStorage.setItem('picas:jugador', estado.yo);
    pintarSesion();
    avisar(datos.mensaje || 'Sesión iniciada');
    await listarJuegos();
    if (estado.juegoId) await verJuego(estado.juegoId, true);
  } catch (err) {
    avisar(err.message, 'error');
  }
}

function exigirSesion() {
  if (!estado.yo) {
    avisar('Primero ingresa tu nombre', 'error');
    return false;
  }
  return true;
}

async function restaurarSesion() {
  if (!estado.yo) return;

  try {
    const datos = await api('/login', { method: 'POST', body: { nombre: estado.yo } });
    estado.yo = datos.jugador.nombre;
    localStorage.setItem('picas:jugador', estado.yo);
    pintarSesion();
  } catch {
    estado.yo = null;
    localStorage.removeItem('picas:jugador');
    pintarSesion();
  }
}

function exigirNumero() {
  const numero = limpiarNumero(ui.numeroSecreto.value);
  ui.numeroSecreto.value = numero;

  if (numero.length !== 4) {
    avisar('Tu número secreto debe tener 4 dígitos', 'error');
    return null;
  }

  if (new Set(numero).size !== 4) {
    avisar('Tu número secreto no puede tener dígitos repetidos', 'error');
    return null;
  }

  return numero;
}

async function listarJuegos() {
  try {
    const datos = await api('/juego');
    estado.juegos = datos.juegos || [];
    pintarLista();
  } catch (err) {
    console.error('No se pudo listar:', err.message);
  }
}

function pintarLista() {
  ui.listaJuegos.innerHTML = '';

  if (estado.juegos.length === 0) {
    ui.listaJuegos.append(el('p', 'vacio', 'Aún no hay juegos. ¡Crea el primero!'));
    return;
  }

  for (const juego of estado.juegos) {
    const item = el('div', `juego-item ${juego.estado}`);
    const info = el('div');

    const titulo = el('strong', null, `Juego ${juego.id}`);
    const detalle = el(
      'small',
      null,
      `${nombreEstado(juego.estado)} · Creador: ${juego.creador}` +
        (juego.rival ? ` · Rival: ${juego.rival}` : '') +
        (juego.ganador ? ` · Ganó: ${juego.ganador}` : '') +
        ` · Intentos: ${juego.intentos}`,
    );
    info.append(titulo, el('br'), detalle);

    const acciones = el('div', 'fila');
    acciones.append(el('span', `etiqueta ${juego.estado}`, nombreEstado(juego.estado)));

    if (juego.estado === 'creado' && estado.yo && juego.creador !== estado.yo) {
      const botonUnirse = el('button', 'primario mini', 'Unirse');
      botonUnirse.addEventListener('click', () => unirse(juego.id));
      acciones.append(botonUnirse);
    }

    if (juego.estado !== 'terminado') {
      const botonVer = el('button', 'secundario mini', 'Ver');
      botonVer.addEventListener('click', () => verJuego(juego.id));
      acciones.append(botonVer);
    }

    const participa = juego.creador === estado.yo || juego.rival === estado.yo;

    if (participa) {
      const botonEliminar = el('button', 'peligro mini', 'Eliminar');
      botonEliminar.addEventListener('click', () => eliminarJuego(juego.id));
      acciones.append(botonEliminar);
    }

    item.append(info, acciones);
    ui.listaJuegos.append(item);
  }
}

async function crearJuego() {
  if (!exigirSesion()) return;

  const numero = exigirNumero();
  if (!numero) return;

  try {
    const datos = await api('/juego', {
      method: 'POST',
      body: { jugador: estado.yo, numero },
    });

    estado.juegoId = datos.juego.id;
    localStorage.setItem('picas:juegoId', estado.juegoId);
    ui.idCreado.textContent =
      `Juego ${datos.juego.id} creado. Comparte este ID para que otro jugador se una.`;

    avisar(datos.mensaje);
    mostrarJuego(datos.juego);
    await listarJuegos();
  } catch (err) {
    avisar(err.message, 'error');
  }
}

async function unirse(id) {
  if (!exigirSesion()) return;

  const numero = exigirNumero();
  if (!numero) return;

  try {
    const datos = await api(`/juego/${id}`, {
      method: 'PUT',
      body: { jugador: estado.yo, numero },
    });

    estado.juegoId = datos.juego.id;
    localStorage.setItem('picas:juegoId', estado.juegoId);

    avisar(datos.mensaje);
    mostrarJuego(datos.juego);
    await listarJuegos();
  } catch (err) {
    avisar(err.message, 'error');
  }
}

async function verJuego(id, silencioso = false) {
  try {
    const datos = await api(`/juego/${id}`);
    estado.juegoId = datos.juego.id;
    localStorage.setItem('picas:juegoId', datos.juego.id);
    mostrarJuego(datos.juego);
  } catch (err) {
    if (silencioso) {
      if (err.status === 404) {
        estado.juegoId = null;
        localStorage.removeItem('picas:juegoId');
        ui.tablero.innerHTML = '';
        ui.tablero.append(el('p', 'vacio', 'Ese juego ya no existe. Crea uno nuevo.'));
        ui.zonaJugada.classList.add('oculto');
      }
      return;
    }

    avisar(err.message, 'error');
  }
}

async function eliminarJuego(id) {
  if (!confirm(`¿Eliminar el juego ${id}?`)) return;

  try {
    const datos = await api(
      `/juego/${id}?jugador=${encodeURIComponent(estado.yo)}`,
      { method: 'DELETE' },
    );

    if (estado.juegoId === id) {
      estado.juegoId = null;
      localStorage.removeItem('picas:juegoId');
      ui.tablero.innerHTML = '';
      ui.tablero.append(el('p', 'vacio', 'Elige o crea un juego para empezar.'));
      ui.zonaJugada.classList.add('oculto');
    }

    avisar(datos.mensaje);
    await listarJuegos();
  } catch (err) {
    avisar(err.message, 'error');
  }
}

async function jugar() {
  if (!estado.juegoId) {
    avisar('Primero abre un juego', 'error');
    return;
  }

  const numero = limpiarNumero(ui.intento.value);
  ui.intento.value = numero;

  if (numero.length !== 4 || new Set(numero).size !== 4) {
    avisar('El intento debe tener 4 dígitos diferentes', 'error');
    return;
  }

  try {
    const datos = await api(`/juego/${estado.juegoId}/jugar`, {
      method: 'POST',
      body: { jugador: estado.yo, numero },
    });

    ui.intento.value = '';
    avisar(datos.mensaje);
    mostrarJuego(datos);
    await listarJuegos();
  } catch (err) {
    avisar(err.message, 'error');
  }
}

function mostrarJuego(juego) {
  ui.tablero.innerHTML = '';

  const filaEstado = el('div', 'estado-juego');
  filaEstado.append(
    el('span', `etiqueta ${juego.estado}`, nombreEstado(juego.estado)),
    el('span', 'vacio', `ID ${juego.id}`),
  );
  ui.tablero.append(filaEstado);

  const jugadores = el('div', 'jugadores');

  for (const [rol, nombre] of [
    ['Creador', juego.creador],
    ['Rival', juego.rival],
  ]) {
    const caja = el('div', 'jugador');
    if (juego.estado === 'en_juego' && juego.turno === nombre) caja.classList.add('turno');

    const quien = el('span', null, rol);
    const nombreNodo = el('strong', null, nombre ? nombre : 'Esperando...');
    if (nombre && nombre === estado.yo) nombreNodo.textContent = `${nombre} (tú)`;
    caja.append(quien, nombreNodo);
    jugadores.append(caja);
  }

  ui.tablero.append(jugadores);

  if (juego.estado === 'creado') {
    ui.tablero.append(
      el(
        'p',
        'turno-texto',
        `Esperando rival. Comparte el ID ${juego.id} para que alguien se una.`,
      ),
    );
  }

  if (juego.estado === 'en_juego') {
    const esMiTurno = juego.turno === estado.yo;
    ui.tablero.append(
      el(
        'p',
        `turno-texto ${esMiTurno ? 'mio' : ''}`,
        esMiTurno ? '¡Es tu turno!' : `Turno de ${juego.turno}...`,
      ),
    );
  }

  if (juego.estado === 'terminado') {
    ui.tablero.append(el('div', 'ganador-banner', `🏆 Ganó ${juego.ganador}`));

    const numeros = el('p', 'numeros', 'Números secretos: ');
    const entradas = Object.entries(juego.numeros || {});

    entradas.forEach(([nombre, numero], indice) => {
      numeros.append(`${nombre}: `, el('code', null, numero));
      if (indice < entradas.length - 1) numeros.append(' · ');
    });

    ui.tablero.append(numeros);
  }

  const historial = el('div', 'historial');
  const intentos = [...(juego.intentos || [])].reverse();

  if (intentos.length === 0) {
    ui.tablero.append(el('p', 'vacio', 'Todavía no hay intentos.'));
  } else {
    for (const intento of intentos) {
      const fila = el('div', 'intento');
      if (intento.jugador === estado.yo) fila.classList.add('mio');
      if (intento.fijas === 4) fila.classList.add('ganador');

      const izquierda = el('div');
      izquierda.append(
        el('span', 'num', intento.numero),
        el('small', null, `  ${intento.jugador}`),
      );

      const derecha = el(
        'span',
        null,
        intento.fijas === 4
          ? '¡4 fijas! 🎯'
          : `${intento.fijas} fija(s) · ${intento.picas} pica(s)`,
      );

      fila.append(izquierda, derecha);
      historial.append(fila);
    }

    ui.tablero.append(historial);
  }

  const puedeJugar = juego.estado === 'en_juego';
  ui.zonaJugada.classList.toggle('oculto', !puedeJugar);

  if (puedeJugar) {
    const esMiTurno = juego.turno === estado.yo;
    ui.intento.disabled = !esMiTurno;
    ui.btnJugar.disabled = !esMiTurno;
    ui.intento.placeholder = esMiTurno ? 'Adivina el número' : `Turno de ${juego.turno}`;
  }
}

ui.btnLogin.addEventListener('click', entrar);
ui.nombre.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') entrar();
});

ui.btnCrear.addEventListener('click', crearJuego);
ui.numeroSecreto.addEventListener('input', () => {
  ui.numeroSecreto.value = limpiarNumero(ui.numeroSecreto.value);
});

ui.btnRefrescar.addEventListener('click', async () => {
  await listarJuegos();
  if (estado.juegoId) await verJuego(estado.juegoId);
});

ui.btnJugar.addEventListener('click', jugar);
ui.intento.addEventListener('input', () => {
  ui.intento.value = limpiarNumero(ui.intento.value);
});
ui.intento.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') jugar();
});

pintarSesion();

async function iniciar() {
  await restaurarSesion();
  await listarJuegos();
  if (estado.juegoId) await verJuego(estado.juegoId, true);
}

iniciar();

setInterval(async () => {
  await listarJuegos();
  if (estado.juegoId) await verJuego(estado.juegoId, true);
}, 3000);
