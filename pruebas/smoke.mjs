const BASE = process.env.BASE_URL || 'http://localhost:3000';

let revisados = 0;
let fallos = 0;

function comprobar(condicion, descripcion, detalle) {
  revisados += 1;

  if (condicion) {
    console.log(`  ✔ ${descripcion}`);
  } else {
    fallos += 1;
    console.log(`  ✘ ${descripcion}`);
    if (detalle !== undefined) console.log('    ->', JSON.stringify(detalle));
  }
}

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

  let datos = null;

  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  return { status: respuesta.status, datos };
}

function titulo(texto) {
  console.log(`\n${texto}`);
}

async function principal() {
  console.log(`Pruebas contra ${BASE}`);

  titulo('0. Health check');
  const salud = await pedir('GET', '/health');
  comprobar(salud.status === 200 && salud.datos.estado === 'ok', 'GET /health responde ok');

  titulo('1. Login de jugadores');
  const ana = await pedir('POST', '/login', { nombre: 'Ana' });
  const luis = await pedir('POST', '/login', { nombre: 'Luis' });
  comprobar(ana.status === 201, 'POST /login registra a Ana', ana.datos);
  comprobar(luis.status === 201, 'POST /login registra a Luis', luis.datos);
  comprobar(
    (await pedir('POST', '/login', { nombre: 'Ana' })).status === 200,
    'Repetir login del mismo nombre no falla',
  );
  const sinNombre = await pedir('POST', '/login', {});
  comprobar(sinNombre.status === 400, 'Login sin nombre devuelve 400', sinNombre.datos);

  titulo('2. Validacion del numero secreto');

  for (const [numero, caso] of [
    ['12a4', 'con letras'],
    ['1123', 'con digitos repetidos'],
    ['123', 'con 3 digitos'],
    ['12345', 'con 5 digitos'],
    ['', 'vacio'],
    ['4 271', 'con espacio'],
    [123, 'enviado como entero de 3 digitos'],
  ]) {
    const respuesta = await pedir('POST', '/juego', { jugador: 'Ana', numero });
    comprobar(
      respuesta.status === 400,
      `Rechaza numero ${JSON.stringify(numero)} (${caso})`,
      respuesta.datos,
    );
  }

  const enteroValido = await pedir('POST', '/juego', { jugador: 'Ana', numero: 4271 });
  comprobar(enteroValido.status === 201, 'Acepta 4271 como entero (equivale a "4271")', enteroValido.datos);

  const ceroInicial = await pedir('POST', '/juego', { jugador: 'Ana', numero: '0427' });
  comprobar(ceroInicial.status === 201, 'Acepta numeros con cero inicial como "0427"', ceroInicial.datos);

  const sinSesion = await pedir('POST', '/juego', { jugador: 'Pedro', numero: '1234' });
  comprobar(sinSesion.status === 401, 'Jugador no registrado devuelve 401', sinSesion.datos);

  titulo('3. Crear juego');
  const creado = await pedir('POST', '/juego', { jugador: 'Ana', numero: '1234' });
  comprobar(creado.status === 201, 'Ana crea un juego', creado.datos);
  const id = creado.datos.juego.id;
  comprobar(
    creado.datos.juego.estado === 'creado',
    'El juego queda en estado "creado"',
    creado.datos.juego.estado,
  );
  comprobar(creado.datos.juego.numeros === undefined, 'No revela numeros secretos mientras se juega');

  titulo('4. Unirse al juego');
  const unido = await pedir('PUT', `/juego/${id}`, { jugador: 'Luis', numero: '5678' });
  comprobar(unido.status === 200, 'Luis se une al juego', unido.datos);
  comprobar(
    unido.datos.juego.estado === 'en_juego',
    'Al entrar el segundo jugador el juego inicia',
    unido.datos.juego.estado,
  );
  comprobar(
    ['Ana', 'Luis'].includes(unido.datos.juego.turno),
    'El primer turno se asigna aleatoriamente',
    unido.datos.juego.turno,
  );
  comprobar(
    (await pedir('PUT', `/juego/${id}`, { jugador: 'Luis', numero: '5678' })).status === 409,
    'Un tercer jugador no puede unirse (409)',
  );

  titulo('5. Turnos y respuestas');
  const empieza = unido.datos.juego.turno;
  const segundo = empieza === 'Ana' ? 'Luis' : 'Ana';
  const secretoDe = { Ana: '1234', Luis: '5678' };

  const fueraDeTurno = await pedir('POST', `/juego/${id}/jugar`, { jugador: segundo, numero: '0987' });
  comprobar(fueraDeTurno.status === 409, 'Jugar fuera de turno devuelve 409', fueraDeTurno.datos);

  const primerIntento = await pedir('POST', `/juego/${id}/jugar`, { jugador: empieza, numero: '0987' });
  comprobar(primerIntento.status === 200, `${empieza} juega su primer intento`, primerIntento.datos);
  comprobar(!primerIntento.datos.resultado || primerIntento.datos.resultado.fijas < 4, 'El intento 0987 no gana');
  comprobar(
    primerIntento.datos.turno === segundo,
    `Después del intento el turno pasa a ${segundo}`,
    primerIntento.datos.turno,
  );

  const victoria = await pedir('POST', `/juego/${id}/jugar`, {
    jugador: segundo,
    numero: secretoDe[empieza],
  });
  comprobar(victoria.status === 200, `${segundo} adivina el numero de ${empieza}`, victoria.datos);
  comprobar(victoria.datos.resultado.fijas === 4, 'La respuesta trae 4 fijas');
  comprobar(victoria.datos.estado === 'terminado', 'El juego termina');
  comprobar(victoria.datos.ganador === segundo, `Gana ${segundo}`, victoria.datos.ganador);
  comprobar(
    victoria.datos.numeros &&
      victoria.datos.numeros.Ana === '1234' &&
      victoria.datos.numeros.Luis === '5678',
    'Al terminar se revelan los numeros',
    victoria.datos.numeros,
  );
  comprobar(
    (await pedir('POST', `/juego/${id}/jugar`, { jugador: segundo, numero: '4321' })).status === 409,
    'No se puede seguir jugando un juego terminado (409)',
  );

  titulo('6. Consultar y listar');
  const consulta = await pedir('GET', `/juego/${id}`);
  comprobar(
    consulta.status === 200 && consulta.datos.juego.intentos.length === 2,
    'GET /juego/{ID} trae el historial',
    consulta.datos.juego?.intentos?.length,
  );
  comprobar((await pedir('GET', '/juego/J999')).status === 404, 'Juego inexistente devuelve 404');

  const lista = await pedir('GET', '/juego');
  comprobar(lista.status === 200 && Array.isArray(lista.datos.juegos), 'GET /juego lista los juegos');
  comprobar(
    lista.datos.juegos.some((juego) => juego.id === id && juego.ganador === segundo),
    'La lista muestra el ganador',
  );

  titulo('7. Juego esperando rival');
  const solo = await pedir('POST', '/juego', { jugador: 'Ana', numero: '9081' });
  const intentoEnEspera = await pedir('POST', `/juego/${solo.datos.juego.id}/jugar`, {
    jugador: 'Ana',
    numero: '5678',
  });
  comprobar(intentoEnEspera.status === 409, 'No se puede jugar si no hay rival (409)', intentoEnEspera.datos);

  titulo('8. Eliminar juego');
  const borrable = await pedir('POST', '/juego', { jugador: 'Ana', numero: '1357' });
  const idBorrable = borrable.datos.juego.id;

  comprobar(
    (await pedir('DELETE', `/juego/${idBorrable}`)).status === 400,
    'Eliminar sin indicar jugador devuelve 400',
  );
  comprobar(
    (await pedir('DELETE', `/juego/${idBorrable}?jugador=Luis`)).status === 403,
    'Un jugador ajeno no puede eliminar el juego (403)',
  );
  comprobar(
    (await pedir('DELETE', `/juego/${idBorrable}?jugador=Ana`)).status === 200,
    'El creador puede eliminar su juego',
  );
  comprobar(
    (await pedir('GET', `/juego/${idBorrable}`)).status === 404,
    'El juego eliminado ya no existe (404)',
  );

  console.log(`\n${revisados - fallos}/${revisados} pruebas correctas`);

  if (fallos > 0) {
    console.log(`Hay ${fallos} fallo(s).`);
    process.exit(1);
  }

  console.log('Todo bien ✅');
}

principal().catch((err) => {
  console.error('\nNo se pudo completar la prueba:', err.message);
  process.exit(1);
});
