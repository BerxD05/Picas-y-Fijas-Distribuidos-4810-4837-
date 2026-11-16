'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { AlmacenJuego, ErrorJuego, ESTADOS } = require('./juego');

const PUERTO = Number.parseInt(process.env.PORT || '3000', 10);
const DIR_PUBLICO = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const almacen = new AlmacenJuego();

function responder(res, status, datos) {
  const cuerpo = JSON.stringify(datos, null, 2);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
    'Cache-Control': 'no-store',
  });
  res.end(cuerpo);
}

function error(res, status, mensaje) {
  responder(res, status, { error: mensaje });
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';

    req.on('data', (trozo) => {
      datos += trozo;
    });

    req.on('end', () => {
      if (!datos.trim()) {
        resolve({});
        return;
      }

      try {
        const json = JSON.parse(datos);
        resolve(json && typeof json === 'object' && !Array.isArray(json) ? json : {});
      } catch {
        reject(new ErrorJuego(400, 'JSON invalido'));
      }
    });

    req.on('error', () => reject(new ErrorJuego(400, 'No se pudo leer la peticion')));
  });
}

function servirEstatico(res, rutaUrl) {
  const ruta = rutaUrl === '/' ? '/index.html' : rutaUrl;
  const destino = path.join(DIR_PUBLICO, path.normalize(ruta));

  if (!destino.startsWith(DIR_PUBLICO)) {
    error(res, 403, 'Ruta no permitida');
    return;
  }

  fs.readFile(destino, (err, contenido) => {
    if (err) {
      error(res, 404, `No encontrado: ${rutaUrl}`);
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(destino)] || 'application/octet-stream',
      'Content-Length': contenido.length,
      'Cache-Control': 'no-cache',
    });
    res.end(contenido);
  });
}

async function manejarApi(req, res, rutaUrl) {
  const metodo = req.method;
  const parametros = new URL(req.url, 'http://localhost').searchParams;

  if (rutaUrl === '/health' && metodo === 'GET') {
    responder(res, 200, { estado: 'ok', jugadores: almacen.jugadores.size, juegos: almacen.juegos.size });
    return;
  }

  if (rutaUrl === '/login') {
    if (metodo !== 'POST') {
      error(res, 405, 'Usa POST /login');
      return;
    }

    const { nombre } = await leerCuerpo(req);
    const { jugador, nuevo } = almacen.registrarJugador(nombre);

    responder(res, nuevo ? 201 : 200, {
      mensaje: nuevo ? 'Jugador registrado' : 'El jugador ya estaba registrado',
      jugador,
    });
    return;
  }

  if (rutaUrl === '/juego') {
    if (metodo === 'POST') {
      const { jugador, nombre, numero } = await leerCuerpo(req);
      const vista = almacen.crearJuego({ jugador: jugador ?? nombre, numero });

      responder(res, 201, {
        mensaje: `Juego ${vista.id} creado. Comparte el ID para que se unan`,
        juego: vista,
      });
      return;
    }

    if (metodo === 'GET') {
      responder(res, 200, { juegos: almacen.listar(parametros.get('estado') || undefined) });
      return;
    }

    error(res, 405, 'Usa POST /juego para crear o GET /juego para listar');
    return;
  }

  const partes = rutaUrl.split('/').filter(Boolean);

  if (partes[0] === 'juego' && partes[1]) {
    const id = decodeURIComponent(partes[1]);

    if (partes.length === 2 && metodo === 'GET') {
      responder(res, 200, { juego: almacen.consultar(id) });
      return;
    }

    if (partes.length === 2 && metodo === 'PUT') {
      const { jugador, nombre, numero } = await leerCuerpo(req);
      const vista = almacen.unirse(id, { jugador: jugador ?? nombre, numero });

      responder(res, 200, {
        mensaje: `Te uniste al juego ${vista.id}. Empieza ${vista.turno}`,
        juego: vista,
      });
      return;
    }

    if (partes.length === 2 && metodo === 'DELETE') {
      almacen.eliminar(id, parametros.get('jugador'));
      responder(res, 200, { mensaje: `Juego ${id} eliminado` });
      return;
    }

    if (partes.length === 3 && partes[2] === 'jugar' && metodo === 'POST') {
      const { jugador, nombre, numero } = await leerCuerpo(req);
      const resultado = almacen.jugar(id, { jugador: jugador ?? nombre, numero });

      responder(res, 200, {
        mensaje:
          resultado.estado === ESTADOS.TERMINADO
            ? `${resultado.ganador} acerto el numero y gano el juego`
            : `${resultado.resultado.fijas} fijas y ${resultado.resultado.picas} picas. Turno de ${resultado.turno}`,
        ...resultado,
      });
      return;
    }

    error(res, 405, 'Metodo no permitido sobre el juego');
    return;
  }

  error(res, 404, `Ruta no encontrada: ${metodo} ${rutaUrl}`);
}

const servidor = http.createServer(async (req, res) => {
  const rutaUrl = new URL(req.url, 'http://localhost').pathname;

  try {
    const esApi =
      rutaUrl === '/login' ||
      rutaUrl === '/juego' ||
      rutaUrl.startsWith('/juego/') ||
      rutaUrl === '/health';

    if (esApi) {
      await manejarApi(req, res, rutaUrl);
    } else {
      servirEstatico(res, rutaUrl);
    }
  } catch (err) {
    if (err instanceof ErrorJuego) {
      error(res, err.status, err.message);
    } else {
      console.error('Error inesperado:', err);
      error(res, 500, 'Error interno del servidor');
    }
  }
});

servidor.listen(PUERTO, '0.0.0.0', () => {
  console.log(`Picas y Fijas escuchando en el puerto ${PUERTO}`);
});
