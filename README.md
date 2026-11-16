# Picas y Fijas — versión distribuida sobre Kubernetes

Juego **Picas y Fijas** implementado como API REST (JSON) con front básico, listo para
desplegarse en Kubernetes. No usa base de datos: todo el estado vive en memoria.

- **Backend:** Node.js puro (sin dependencias externas), HTTP con `http` nativo.
- **Frontend:** HTML + CSS + JavaScript sin frameworks, servido por el mismo pod.
- **Kubernetes:** ConfigMap + Deployment (1 réplica) + Service NodePort.

---

## 1. Cómo se juega

Cada jugador escribe un número secreto de 4 dígitos diferentes. Por turnos intenta
adivinar el número del rival y recibe:

- **Fijas:** cifra correcta en la posición correcta.
- **Picas:** cifra correcta en otra posición.

Ejemplo: secreto `4271`, intento `1234` → **1 fija** (el `2`) y **2 picas** (el `4` y el `1`).
Gana quien acierte las 4 fijas primero.

---

## 2. Endpoints

| Método | Ruta | Qué hace |
|--------|------|----------|
| `POST` | `/login` | Registra el nombre del jugador |
| `POST` | `/juego` | Crea un juego con el número secreto del jugador |
| `PUT` | `/juego/{ID}` | Se une a un juego enviando nombre y número |
| `POST` | `/juego/{ID}/jugar` | Envía un intento (solo si es su turno) |
| `GET` | `/juego/{ID}` | Muestra el estado de un juego |
| `GET` | `/juego` | Lista los juegos (`?estado=creado\|en_juego\|terminado`) |
| `DELETE` | `/juego/{ID}?jugador=Nombre` | Elimina un juego (solo el creador o el rival) |
| `GET` | `/health` | Estado del servicio (lo usan las sondas de Kubernetes) |

Identificación del jugador: en cada petición se envía `jugador` con el nombre registrado
en `/login`. También se acepta la clave `nombre` por comodidad.

### Ejemplos

```bash
# 1. Registro de jugadores
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" -d '{"nombre":"Ana"}'

curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" -d '{"nombre":"Luis"}'

# 2. Ana crea un juego con el número secreto 1234
curl -X POST http://localhost:3000/juego \
  -H "Content-Type: application/json" -d '{"jugador":"Ana","numero":"1234"}'
# -> 201 { "juego": { "id": "J001", "estado": "creado", ... } }

# 3. Luis se une con su número secreto 5678
curl -X PUT http://localhost:3000/juego/J001 \
  -H "Content-Type: application/json" -d '{"jugador":"Luis","numero":"5678"}'
# -> 200 { "juego": { "estado": "en_juego", "turno": "Luis", ... } }

# 4. Jugar (solo el jugador del turno)
curl -X POST http://localhost:3000/juego/J001/jugar \
  -H "Content-Type: application/json" -d '{"jugador":"Luis","numero":"0987"}'
# -> { "resultado": { "fijas": 0, "picas": 0 }, "turno": "Ana", ... }

# 5. Consultar y listar
curl http://localhost:3000/juego/J001
curl http://localhost:3000/juego

# 6. Eliminar un juego (creador o rival)
curl -X DELETE "http://localhost:3000/juego/J001?jugador=Ana"
```

### Reglas de validación (responden `400`)

- Debe ser exactamente **4 dígitos**.
- **Sin cifras repetidas** (`1123` no sirve).
- **Solo números**: letras, espacios o símbolos se rechazan (`12a4` no sirve).
- Se recomienda enviarlo como **texto** para conservar ceros iniciales (`"0427"`).

### Códigos de respuesta

| Código | Cuándo |
|--------|--------|
| `201` | Jugador registrado / juego creado |
| `200` | Consulta correcta, unión o intento válido |
| `400` | Nombre o número inválido |
| `401` | El jugador no hizo `/login` |
| `403` | El jugador no participa en ese juego |
| `404` | El juego no existe |
| `409` | No es su turno, juego lleno o juego terminado |

### Estados del juego

```
creado  -> el creador ya puso su número, espera rival
en_juego -> entraron los dos; el turno inicial es aleatorio
terminado -> alguien acertó las 4 fijas; se revelan los números y el ganador
```

---

## 3. Ejecutar en local (sin Kubernetes)

```bash
npm start            # http://localhost:3000
npm run prueba       # prueba la API completa (41 verificaciones)
```

Abre `http://localhost:3000` en dos pestañas (una normal y una incógnito) para jugar
los dos roles: en la primera crea el juego, en la segunda ingresa otro nombre y pulsa
**Unirse**. En la lista de juegos, quien participa en un juego puede borrarlo con
**Eliminar**.

---

## 4. Desplegar en Kubernetes

### 4.1 Construir y publicar la imagen

```bash
docker build -t berxd05/picas-fijas:1.0 .
docker login
docker push berxd05/picas-fijas:1.0
```

El manifiesto `k8s/02-deployment.yaml` ya usa `image: berxd05/picas-fijas:1.0`.
Si publicas con otra cuenta, cambia esa línea por la tuya.

> Alternativa sin Docker Hub:
> - **minikube:** `minikube image load picas-fijas:1.0` y en el Deployment usa
>   `image: picas-fijas:1.0` con `imagePullPolicy: Never`.
> - **Killercoda** (si el nodo tiene Docker): construye la imagen en el nodo y usa
>   `imagePullPolicy: Never`.

### 4.2 Aplicar los manifiestos

```bash
kubectl apply -f k8s/
kubectl get pods
kubectl get svc picas-fijas
```

Cuando el pod diga `Running` y `READY 1/1`, abre el juego en:

```
http://IP_DEL_NODO:30080
```

En Killercoda la IP pública aparece en la parte superior de la terminal; también puedes
usar `kubectl get nodes -o wide` para ver la IP interna.

Si el puerto 30080 no es accesible desde tu navegador, usa un port-forward:

```bash
kubectl port-forward svc/picas-fijas 8080:80
# luego abre http://localhost:8080
```

### 4.3 Verificar desde el cluster

```bash
kubectl logs deployment/picas-fijas
kubectl exec deployment/picas-fijas -- wget -qO- http://localhost:3000/health
BASE_URL=http://IP_DEL_NODO:30080 npm run prueba
```

### 4.4 ¿Por qué una sola réplica?

El estado (jugadores y juegos) está en memoria y el taller prohíbe base de datos.
Si se levantaran varias réplicas, el Service repartiría las peticiones entre pods y cada
pod tendría juegos distintos. Por eso `replicas: 1`. Para escalar de verdad haría falta
una BD o una capa de estado compartido (Redis), fuera del alcance del taller.

---

## 5. Estructura del proyecto

```
picas-fijas/
├── server.js              # servidor HTTP: rutas, JSON y archivos del front
├── juego.js               # reglas: validación, picas/fijas, almacén en memoria
├── public/
│   ├── index.html         # front básico (4 pasos)
│   ├── styles.css
│   └── app.js             # llamadas fetch a la API + refresco automático
├── pruebas/
│   └── smoke.mjs          # prueba de humo de toda la API
├── k8s/
│   ├── 01-configmap.yaml  # variables de entorno (PORT)
│   ├── 02-deployment.yaml # pod con sondas y límites de recursos
│   └── 03-service.yaml    # Service NodePort 30080 -> 3000
├── Dockerfile
├── .dockerignore          # lo que no entra a la imagen
├── .gitignore             # lo que no sube a git
└── package.json
```

---

## 6. Decisiones de diseño

- **Sin dependencias:** `npm install` no es necesario, la imagen pesa poco y no hay
  fallos de red al construir.
- **Un solo pod = un solo estado:** coherente con "no es necesaria BD".
- **Números secretos ocultos:** `GET /juego/{ID}` no los muestra hasta que el juego
  termina, para que nadie haga trampa consultando la API.
- **Sondas `readiness`/`liveness`** sobre `/health`: Kubernetes no envía tráfico a un pod
  que aún no arrancó y lo reinicia si se cuelga.
- **El front refresca cada 3 s:** así se ven los turnos y el rival sin recargar la página.
