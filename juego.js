'use strict';

const ESTADOS = {
  CREADO: 'creado',
  EN_JUEGO: 'en_juego',
  TERMINADO: 'terminado',
};

class ErrorJuego extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.name = 'ErrorJuego';
    this.status = status;
  }
}

function normalizarNombre(valor) {
  if (typeof valor !== 'string') {
    throw new ErrorJuego(400, 'El nombre del jugador es obligatorio y debe ser texto');
  }

  const nombre = valor.trim().replace(/\s+/g, ' ');

  if (!/^[\p{L}\p{N} ._-]{2,20}$/u.test(nombre)) {
    throw new ErrorJuego(
      400,
      'Nombre invalido: usa entre 2 y 20 caracteres (letras, numeros, espacios, . _ -)',
    );
  }

  return nombre;
}

function validarNumero(valor) {
  let numero = valor;

  if (typeof numero === 'number' && Number.isInteger(numero)) {
    numero = String(numero);
  }

  if (typeof numero !== 'string') {
    throw new ErrorJuego(400, 'El numero debe enviarse como texto de 4 digitos, por ejemplo "4271"');
  }

  numero = numero.trim();

  if (!/^[0-9]+$/.test(numero)) {
    throw new ErrorJuego(400, 'El numero solo puede tener digitos (0-9), sin letras ni simbolos');
  }

  if (numero.length !== 4) {
    throw new ErrorJuego(400, 'El numero debe tener exactamente 4 digitos');
  }

  if (new Set(numero).size !== 4) {
    throw new ErrorJuego(400, 'El numero no puede tener digitos repetidos');
  }

  return numero;
}

function calcularPicasFijas(secreto, intento) {
  let fijas = 0;
  const restantesSecreto = [];
  const restantesIntento = [];

  for (let i = 0; i < secreto.length; i += 1) {
    if (secreto[i] === intento[i]) {
      fijas += 1;
    } else {
      restantesSecreto.push(secreto[i]);
      restantesIntento.push(intento[i]);
    }
  }

  let picas = 0;

  for (const cifra of restantesIntento) {
    const posicion = restantesSecreto.indexOf(cifra);
    if (posicion !== -1) {
      picas += 1;
      restantesSecreto.splice(posicion, 1);
    }
  }

  return { fijas, picas };
}

class AlmacenJuego {
  constructor() {
    this.jugadores = new Map();
    this.juegos = new Map();
    this.consecutivo = 0;
  }

  registrarJugador(nombreCrudo) {
    const nombre = normalizarNombre(nombreCrudo);
    const clave = nombre.toLowerCase();

    if (this.jugadores.has(clave)) {
      return { jugador: this.jugadores.get(clave), nuevo: false };
    }

    const jugador = { nombre, registradoEn: new Date().toISOString() };
    this.jugadores.set(clave, jugador);

    return { jugador, nuevo: true };
  }

  jugadorRegistrado(nombreCrudo) {
    const nombre = normalizarNombre(nombreCrudo);
    const jugador = this.jugadores.get(nombre.toLowerCase());

    if (!jugador) {
      throw new ErrorJuego(401, `El jugador "${nombre}" no ha iniciado sesion (usa POST /login)`);
    }

    return jugador;
  }

  crearJuego({ jugador, numero }) {
    const creador = this.jugadorRegistrado(jugador);
    const numeroSecreto = validarNumero(numero);

    this.consecutivo += 1;
    const id = `J${String(this.consecutivo).padStart(3, '0')}`;

    const juego = {
      id,
      estado: ESTADOS.CREADO,
      creador: creador.nombre,
      numeroCreador: numeroSecreto,
      rival: null,
      numeroRival: null,
      turno: null,
      ganador: null,
      creadoEn: new Date().toISOString(),
      iniciadoEn: null,
      terminadoEn: null,
      intentos: [],
    };

    this.juegos.set(id, juego);

    return this.vistaPublica(juego);
  }

  unirse(id, { jugador, numero }) {
    const juego = this.buscar(id);
    const retador = this.jugadorRegistrado(jugador);
    const numeroSecreto = validarNumero(numero);

    if (juego.estado !== ESTADOS.CREADO) {
      throw new ErrorJuego(409, 'El juego ya tiene dos jugadores o ya termino');
    }

    if (juego.creador.toLowerCase() === retador.nombre.toLowerCase()) {
      throw new ErrorJuego(409, 'No puedes unirte a tu propio juego');
    }

    juego.rival = retador.nombre;
    juego.numeroRival = numeroSecreto;
    juego.estado = ESTADOS.EN_JUEGO;
    juego.iniciadoEn = new Date().toISOString();
    juego.turno = Math.random() < 0.5 ? juego.creador : juego.rival;

    return this.vistaPublica(juego);
  }

  jugar(id, { jugador, numero }) {
    const juego = this.buscar(id);
    const atacante = this.jugadorRegistrado(jugador);

    if (juego.estado === ESTADOS.CREADO) {
      throw new ErrorJuego(409, 'El juego aun no tiene rival, espera a que alguien se una');
    }

    if (juego.estado === ESTADOS.TERMINADO) {
      throw new ErrorJuego(409, `El juego ya termino. Gano ${juego.ganador}`);
    }

    const esCreador = juego.creador.toLowerCase() === atacante.nombre.toLowerCase();
    const esRival = juego.rival.toLowerCase() === atacante.nombre.toLowerCase();

    if (!esCreador && !esRival) {
      throw new ErrorJuego(403, 'No participas en este juego');
    }

    if (juego.turno.toLowerCase() !== atacante.nombre.toLowerCase()) {
      throw new ErrorJuego(409, `No es tu turno, le toca a ${juego.turno}`);
    }

    const intento = validarNumero(numero);
    const secreto = esCreador ? juego.numeroRival : juego.numeroCreador;
    const { fijas, picas } = calcularPicasFijas(secreto, intento);

    juego.intentos.push({
      jugador: atacante.nombre,
      numero: intento,
      fijas,
      picas,
      fecha: new Date().toISOString(),
    });

    if (fijas === 4) {
      juego.estado = ESTADOS.TERMINADO;
      juego.ganador = atacante.nombre;
      juego.terminadoEn = new Date().toISOString();
      juego.turno = null;
    } else {
      juego.turno = esCreador ? juego.rival : juego.creador;
    }

    return {
      ...this.vistaPublica(juego),
      resultado: { intento, fijas, picas },
    };
  }

  consultar(id) {
    return this.vistaPublica(this.buscar(id));
  }

  listar(estado) {
    if (estado && !Object.values(ESTADOS).includes(estado)) {
      throw new ErrorJuego(400, 'Estado invalido. Usa creado, en_juego o terminado');
    }

    return [...this.juegos.values()]
      .filter((juego) => !estado || juego.estado === estado)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((juego) => ({
        id: juego.id,
        estado: juego.estado,
        creador: juego.creador,
        rival: juego.rival,
        turno: juego.turno,
        ganador: juego.ganador,
        intentos: juego.intentos.length,
        creadoEn: juego.creadoEn,
      }));
  }

  eliminar(id, jugador) {
    const juego = this.buscar(id);
    const quien = this.jugadorRegistrado(jugador);
    const participantes = [juego.creador, juego.rival]
      .filter(Boolean)
      .map((nombre) => nombre.toLowerCase());

    if (!participantes.includes(quien.nombre.toLowerCase())) {
      throw new ErrorJuego(403, 'Solo los jugadores del juego pueden eliminarlo');
    }

    this.juegos.delete(juego.id);

    return juego.id;
  }

  buscar(id) {
    const juego = this.juegos.get(String(id).toUpperCase());

    if (!juego) {
      throw new ErrorJuego(404, `No existe el juego ${id}`);
    }

    return juego;
  }

  vistaPublica(juego) {
    const vista = {
      id: juego.id,
      estado: juego.estado,
      creador: juego.creador,
      rival: juego.rival,
      turno: juego.turno,
      ganador: juego.ganador,
      creadoEn: juego.creadoEn,
      iniciadoEn: juego.iniciadoEn,
      terminadoEn: juego.terminadoEn,
      intentos: juego.intentos,
    };

    if (juego.estado === ESTADOS.TERMINADO) {
      vista.numeros = {
        [juego.creador]: juego.numeroCreador,
        [juego.rival]: juego.numeroRival,
      };
    }

    return vista;
  }
}

module.exports = { AlmacenJuego, ErrorJuego, ESTADOS };
