# Documentación — Picas y Fijas distribuido

Este documento explica qué es el taller, cómo levantar el programa, cómo está
organizado y qué hace cada archivo.

---

## 1. El taller

Hay que implementar el juego **Picas y Fijas** como un servicio REST con JSON, sin base
de datos, con un front básico y desplegable en Kubernetes.

### Reglas del juego

- Cada jugador escribe un número secreto de **4 dígitos diferentes**.
- Por turnos, cada jugador intenta adivinar el número del rival.
- La respuesta de cada intento tiene:
  - **Fijas:** cifras correctas en la posición correcta.
  - **Picas:** cifras correctas en otra posición.
- Ejemplo: secreto `4271`, intento `1234` → **1 fija** (el `2`) y **2 picas** (el `4` y el `1`).
- Gana quien acierte las **4 fijas** primero.

### Requisitos que pide el taller

| Requisito | Dónde se cumple |
|---|---|
| REST con JSON | `server.js` (rutas) y `juego.js` (datos) |
| Cualquier lenguaje/framework | Node.js puro, sin dependencias |
| Sin base de datos | Estado en memoria dentro de `juego.js` |
| Front básico para probar | `public/index.html`, `public/styles.css`, `public/app.js` |
| Deploy en Kubernetes | `k8s/01-configmap.yaml`, `k8s/02-deployment.yaml`, `k8s/03-service.yaml` |
| Entrega en git | El proyecto está listo para subir (sin `.git` todavía) |

### Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/login` | Registra el nombre del jugador |
| `POST` | `/juego` | Crea un juego con el número secreto del jugador |
| `PUT` | `/juego/{ID}` | Se une a un juego enviando nombre y número |
| `POST` | `/juego/{ID}/jugar` | Envía un intento (solo si es su turno) |
| `GET` | `/juego/{ID}` | Muestra el estado de un juego |
| `GET` | `/juego` | Lista los juegos (admite `?estado=creado\|en_juego\|terminado`) |
| `DELETE` | `/juego/{ID}?jugador=Nombre` | Elimina un juego (solo creador o rival) |
| `GET` | `/health` | Estado del servicio, usado por las sondas de Kubernetes |

### Estados de un juego

```
creado     -> el creador ya puso su número, espera rival
en_juego   -> entraron los dos; el turno inicial se elige al azar
terminado  -> alguien acertó las 4 fijas; se revelan los números y el ganador
```

### Validaciones

- El nombre debe tener entre 2 y 20 caracteres (letras, números, espacios, `. _ -`).
- El número debe ser exactamente de **4 dígitos**, solo números (`0-9`) y **sin repetir**.
- Se acepta como texto (`"0427"`) o como entero de 4 dígitos (`4271`).
- El jugador debe haberse registrado antes en `/login`.

---

## 2. Cómo levantarlo

### Requisitos

- **Node.js 18 o superior** (probado con Node 24).
- No hace falta `npm install`: el proyecto no usa dependencias externas.
- Opcional: Docker y kubectl, solo para la parte de despliegue.

### En local

```bash
cd picas-fijas
npm start
```

Luego abre:

```
http://localhost:3000
```

Para detenerlo: `Ctrl + C`.

Si quieres otro puerto:

```bash
# Linux / macOS
PORT=8080 npm start

# Windows PowerShell
$env:PORT=8080; npm start
```

### Cómo probarlo con dos jugadores

1. Abre `http://localhost:3000` en una pestaña normal.
2. Escribe un nombre, pulsa **Entrar**.
3. Escribe tu número secreto y pulsa **Crear juego**. Anota el ID (`J001`, `J002`, ...).
4. Abre la misma URL en una pestaña de incógnito (para tener otro jugador).
5. Escribe otro nombre, entra, pon otro número secreto y pulsa **Unirse** en el juego.
6. El juego empieza solo, con turno aleatorio. El jugador del turno escribe su intento
   en el tablero y pulsa **Probar**.
7. Alguien acierta las 4 fijas: el juego termina y se muestran los números.
8. En la lista de juegos, quien participa puede borrar el juego con **Eliminar**.

El tablero se actualiza cada 3 segundos, así que no hace falta recargar la página.

### Pruebas de la API

Con el servidor corriendo, en otra terminal:

```bash
npm run prueba
```

Hace 41 verificaciones sobre la API real (login, validaciones, turnos, victoria,
listados y eliminación). Si el servidor está en otra dirección:

```bash
BASE_URL=http://IP:30080 npm run prueba
```

### Importante sobre el estado

Todo se guarda en memoria. **Si reinicias el servidor o el pod, se pierden los jugadores
y los juegos.** Eso es intencional: el taller no permite base de datos.

---

## 3. Estructura del proyecto

```
picas-fijas/
├── server.js              # servidor HTTP y rutas de la API
├── juego.js               # reglas del juego y estado en memoria
├── public/
│   ├── index.html         # estructura de la página
│   ├── styles.css         # estilos
│   └── app.js             # lógica del front (fetch a la API)
├── k8s/
│   ├── 01-configmap.yaml  # configuración (puerto)
│   ├── 02-deployment.yaml # pod con la aplicación
│   └── 03-service.yaml    # expone el juego fuera del cluster
├── pruebas/
│   └── smoke.mjs          # prueba automática de la API
├── Dockerfile             # imagen del contenedor
├── .dockerignore          # archivos que no entran a la imagen
├── .gitignore             # archivos que no se suben a git
├── package.json           # nombre y comandos del proyecto
├── README.md              # guía rápida
└── DOCUMENTACION.md       # este documento
```

Flujo general:

```
Navegador (public/)  --HTTP/JSON-->  server.js  -->  juego.js
                                          |
                                          +-->  archivos de public/
```

---

## 4. Qué hace cada archivo

### `server.js`

Es el servidor. Se encarga de:

- Crear el servidor HTTP y escuchar en el puerto (`PORT`, por defecto `3000`).
- Leer el cuerpo JSON de las peticiones (`leerCuerpo`).
- Responder siempre en JSON (`responder`) y con el código HTTP adecuado (`error`).
- Atender las rutas:
  - `POST /login`
  - `POST /juego` y `GET /juego`
  - `GET /juego/{ID}`, `PUT /juego/{ID}` y `DELETE /juego/{ID}`
  - `POST /juego/{ID}/jugar`
  - `GET /health`
- Servir el front estático desde la carpeta `public` (`servirEstatico`).
- Convertir los errores del juego (`ErrorJuego`) en respuestas HTTP con su código
  (400, 401, 403, 404, 409).

No contiene reglas del juego: esas están en `juego.js`.

### `juego.js`

Es el "cerebro" y el almacén de datos. Contiene:

- `ESTADOS`: los tres estados posibles del juego.
- `ErrorJuego`: error con código HTTP, para que `server.js` sepa qué responder.
- `normalizarNombre`: valida y limpia el nombre del jugador.
- `validarNumero`: exige 4 dígitos, solo números y sin repetir.
- `calcularPicasFijas`: cuenta fijas y picas entre el secreto y el intento.
- `AlmacenJuego`: guarda jugadores y juegos en memoria y tiene los métodos:
  - `registrarJugador`: alta en `/login` (si ya existe, lo reutiliza).
  - `crearJuego`: crea el juego en estado `creado` con el número del creador.
  - `unirse`: agrega al rival, inicia el juego y elige el primer turno al azar.
  - `jugar`: valida turno y participación, calcula fijas/picas, cambia el turno o
    termina el juego si son 4 fijas.
  - `consultar` / `listar`: vistas públicas de uno o todos los juegos.
  - `eliminar`: borra un juego; solo lo pueden hacer sus dos jugadores.
  - `buscar`: busca por ID o lanza `404`.
  - `vistaPublica`: arma la respuesta y **oculta los números secretos** hasta que el
    juego termina.

### `public/index.html`

La página del juego. Tiene cuatro secciones numeradas:

1. Ingresar el nombre.
2. Escribir el número secreto y crear el juego.
3. Lista de juegos (unirse, ver, eliminar).
4. Tablero con jugadores, turno, historial y campo para intentar.

También incluye un desplegable **¿Cómo se juega?** con las reglas.

### `public/styles.css`

Todo el diseño visual: colores, tarjetas, botones, etiquetas de estado, tablero y
adaptación a pantallas pequeñas. No tiene lógica.

### `public/app.js`

El front en JavaScript puro. Se encarga de:

- Guardar en `localStorage` el nombre del jugador y el último juego abierto.
- Re-registrar el nombre al cargar la página, para que siga válido si el servidor se
  reinició.
- Llamar a la API (`api`) con `fetch` y mostrar errores en un aviso flotante.
- Crear juegos, unirse, jugar y eliminar (`confirm` antes de borrar).
- Dibujar la lista de juegos y el tablero (turno, intentos, ganador y números revelados).
- Refrescar la lista y el tablero cada 3 segundos.
- Validar en el navegador que los números tengan 4 dígitos antes de enviarlos.

### `k8s/01-configmap.yaml`

Un **ConfigMap** con `PORT=3000`. El Deployment lo inyecta como variable de entorno.
Así la configuración no está escrita dentro de la imagen.

### `k8s/02-deployment.yaml`

El **Deployment** que crea el pod:

- `replicas: 1`: una sola instancia, porque el estado está en memoria (con varias
  réplicas cada pod tendría juegos distintos).
- Imagen `TU_USUARIO/picas-fijas:1.0` (hay que cambiarla al publicar la propia).
- Puerto `3000`.
- Variables desde el ConfigMap.
- `readinessProbe` y `livenessProbe` contra `/health`: Kubernetes espera a que la app
  esté lista y la reinicia si deja de responder.
- Límites de CPU y memoria.

### `k8s/03-service.yaml`

El **Service** de tipo `NodePort`. Recibe tráfico en el puerto `30080` del nodo, lo pasa
al puerto `80` del Service y de ahí al `3000` del pod. Es lo que permite abrir
`http://IP_DEL_NODO:30080`.

### `Dockerfile`

Construye la imagen:

- Parte de `node:20-alpine` (liviana).
- Copia `package.json`, `juego.js`, `server.js` y `public/`.
- Corre con el usuario `node` (no root).
- Expone el puerto `3000` y arranca con `node server.js`.

### `.dockerignore`

Evita copiar a la imagen cosas que no se usan: `node_modules`, `.git`, PDFs, pruebas,
manifiestos, README, etc.

### `.gitignore`

Evita subir a git lo que no aporta al proyecto: `node_modules/`, logs, `.env`, archivos
del sistema operativo (`.DS_Store`, `Thumbs.db`) y carpetas del editor (`.vscode/`,
`.idea/`). El resto de archivos sí debe subirse: código, front, manifiestos, Dockerfile,
README y documentación.

### `package.json`

Metadatos del proyecto y dos comandos:

- `npm start` → `node server.js`
- `npm run prueba` → `node pruebas/smoke.mjs`

### `pruebas/smoke.mjs`

Script que prueba la API completa contra un servidor real. Sirve para comprobar que todo
sigue funcionando después de un cambio. No forma parte del juego y se puede borrar sin
afectar nada.

### `README.md`

Guía rápida: endpoints con ejemplos `curl`, códigos de respuesta, cómo ejecutar y cómo
desplegar en Kubernetes.

---

## 5. Cómo se juega una partida (por dentro)

1. **Ana** hace `POST /login` con su nombre.
2. **Ana** hace `POST /juego` con `{jugador: "Ana", numero: "1234"}`. El servidor valida
   el número y crea el juego `J001` en estado `creado`.
3. **Luis** hace `POST /login` y luego `PUT /juego/J001` con
   `{jugador: "Luis", numero: "5678"}`. El juego pasa a `en_juego` y se elige al azar
   quién empieza.
4. El jugador del turno hace `POST /juego/J001/jugar` con su intento. El servidor:
   - comprueba que sea su turno,
   - calcula fijas y picas contra el secreto del rival,
   - guarda el intento en el historial,
   - cambia el turno (o termina el juego si son 4 fijas).
5. Cualquiera puede consultar con `GET /juego/J001` o `GET /juego`.
6. Al terminar, la respuesta incluye al ganador y los dos números secretos.

Las peticiones se identifican por el nombre (`jugador`), que debe estar registrado en
`/login`. No hay tokens ni sesiones: el taller no los pide.

---

## 6. Lo que falta (para cuando lo pidas)

El programa y los manifiestos están listos, pero aún no se ha hecho el proceso de
entrega:

- [ ] Crear el repositorio git y subirlo (GitHub/GitLab público).
- [ ] Construir la imagen Docker.
- [ ] Publicarla en Docker Hub (o cargarla en el cluster).
- [ ] Editar la imagen en `k8s/02-deployment.yaml`.
- [ ] Desplegar con `kubectl apply` y verificar el acceso.

Cuando quieras avanzar con esto, pídelo y se hace paso a paso.
