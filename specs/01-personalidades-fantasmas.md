# SPEC 01 — Cuatro fantasmas con personalidad propia

> **Estado:** Implementado
> **Depende de:** Ninguna spec previa
> **Fecha:** 2026-11-08
> **Objetivo:** Pasar de dos fantasmas (uno perseguidor y uno aleatorio) a cuatro fantasmas con comportamientos deterministas y distintos, uno de ellos persiguiendo agresivamente a Pac-Man.

## Por qué existe esta spec

Hoy `GHOST_STARTS` en `src/js/maze.js` declara dos fantasmas y `decideGhost()` en `src/js/game.js` solo distingue `hunter` (persecución directa) y `random` (dirección aleatoria). `src/js/render.js` ya tiene cuatro colores preparados, así que el coste visual es mínimo y el trabajo real está en el modelo de juego: personalidades, salida de la pen y reglas de la puerta.

## Alcance

**Incluido:**

- Cuatro fantasmas con cuatro personalidades: `hunter` (rojo), `ambusher` (rosa), `flanker` (cian) y `shy` (naranja).
- Cuatro celdas de inicio dentro de la pen, sin solaparse.
- Estado de salida explícito con liberación escalonada: `waiting`, `leaving`, `normal`.
- Decisión de dirección en cada celda alineada mediante distancia Manhattan y desempate fijo.
- La puerta de la pen deja de ser transitable para un fantasma una vez que está fuera.
- Color asignado por `kind`, no por posición en el array.
- Reinicio completo de posiciones y estados al perder una vida.

**Fuera de alcance (para futuras specs):**

- Power pellets y modo asustado de los fantasmas.
- Fases globales de dispersión y persecución alternadas del arcade.
- Diferencias de velocidad entre fantasmas y ajustes de dificultad.
- Búsqueda de caminos con BFS o A*.
- Modo de depuración visual que muestre la celda objetivo.
- Cambios en el laberinto, puntuación, vidas, sonido o controles.
- Persistencia de ninguna clase.

## Modelo de datos

En `src/js/maze.js`, `GHOST_STARTS` pasa a cuatro entradas. El orden del array define el orden de salida y el color:

```js
const GHOST_STARTS = [
  { x: 13, y: 14, kind: 'hunter' },   // rojo: persecución directa
  { x: 14, y: 14, kind: 'ambusher' }, // rosa: emboscada
  { x: 12, y: 14, kind: 'flanker' },  // cian: flanqueo
  { x: 15, y: 14, kind: 'shy' },      // naranja: tímido
];
```

En `src/js/game.js`, cada fantasma de `createGame()` añade dos campos:

```js
{
  x, y, dir: 'up', speed: GHOST_SPEED,
  kind: g.kind,
  state: 'waiting',      // 'waiting' | 'leaving' | 'normal'
  releaseTimer: i * 30,  // frames que espera antes de salir
}
```

Convenciones:

- `releaseTimer` se mide en frames: 0, 30, 60 y 90 para los cuatro fantasmas.
- `state: 'waiting'` significa quieto en su celda de la pen.
- `state: 'leaving'` significa que ignora su personalidad y se dirige a la salida.
- `state: 'normal'` significa que aplica su personalidad.
- Las celdas objetivo son referencias para la distancia Manhattan y no tienen que ser transitables.

## Plan de implementación

Cada paso deja el juego ejecutable.

1. **`src/js/maze.js`:** sustituir `GHOST_STARTS` por las cuatro entradas del modelo de datos. Verificación manual: arrancar el servidor, ver cuatro fantasmas con cuatro colores moviéndose por la pen con la lógica actual.
2. **`src/js/game.js`:** extraer un helper `chooseDirection(grid, x, y, dir, target, allowDoor)` que filtre las direcciones transitables, excluya la contraria y elija la de menor distancia Manhattan con orden fijo `up > left > down > right`. Reutilizarlo en `decideGhost()` para `hunter`. Verificación manual: el rojo persigue igual que antes y el resto sigue aleatorio.
3. **`src/js/game.js`:** implementar la máquina de estados de la pen. `moveGhost()` descuenta `releaseTimer` y no mueve en `waiting`; al llegar a cero pasa a `leaving`. En `leaving` el objetivo es `(13, 11)` si el fantasma está a la izquierda del centro y `(14, 11)` si está a la derecha. Al alinearse en `y <= 11` pasa a `normal`. `canMove()` recibe `allowDoor` y solo deja atravesar el tile `3` en `leaving`. Verificación manual: los cuatro salen de uno en uno y no vuelven a cruzar la puerta.
4. **`src/js/game.js`:** implementar la celda objetivo de cada personalidad en `decideGhost()`. Verificación manual: describir el movimiento de cada fantasma con Pac-Man quieto y comprobar que coincide con su fórmula.
5. **`src/js/game.js`:** ampliar `resetPositions()` para restaurar `state: 'waiting'`, `releaseTimer: i * 30` y `dir: 'up'` en cada fantasma. Verificación manual: dejarse atrapar y ver que los cuatro repiten la salida escalonada.
6. **`src/js/render.js`:** cambiar `GHOST_COLORS` de array a objeto indexado por `kind` y usarlo en `draw()`. Verificación manual: rojo, rosa, cian y naranja, cada uno con su personalidad.

### Fórmulas de las personalidades

- `hunter`: objetivo = celda redondeada de Pac-Man.
- `ambusher`: objetivo = celda de Pac-Man más 4 celdas en su dirección actual.
- `flanker`: `adelante` = celda de Pac-Man más 2 celdas en su dirección actual; objetivo = `2 × adelante − posición redondeada del fantasma hunter`.
- `shy`: si la distancia Manhattan a Pac-Man es mayor que 8, persigue su celda; si es menor o igual a 8, huye hacia la esquina `(1, 29)`.
- `leaving`: objetivo de puerta descrito en el paso 3.
- Un `kind` desconocido se trata como `hunter`.

## Criterios de aceptación

- [x] `node --check src/js/*.js` termina sin errores.
- [x] `python3 -m http.server 8000 --directory src` sirve el juego y la consola no muestra errores.
- [x] Se dibujan exactamente cuatro fantasmas, uno rojo, uno rosa, uno cian y uno naranja.
- [x] Los fantasmas salen de la pen de uno en uno, en orden rojo, rosa, cian y naranja.
- [x] Ningún fantasma vuelve a cruzar la puerta hacia el interior de la pen tras salir.
- [x] Con Pac-Man quieto en un pasillo recto, el rojo reduce su distancia Manhattan a Pac-Man en cada celda.
- [x] El rosa se dirige a una celda situada 4 celdas por delante de la dirección de Pac-Man.
- [x] El cian cambia de objetivo al cambiar la posición del rojo, conforme a la fórmula `2 × adelante − rojo`.
- [x] El naranja persigue cuando está a más de 8 celdas y se aleja cuando está a 8 o menos.
- [x] Al perder una vida, los cuatro fantasmas vuelven a su celda inicial y repiten la salida escalonada.
- [x] Los cuatro fantasmas se desplazan a la misma velocidad: 10 frames por celda.
- [x] Comer dots, el túnel de la fila 14, la puntuación y las condiciones de victoria y derrota siguen funcionando.
- [x] `MAZE` sigue sin mutarse entre partidas.

## Decisiones tomadas y descartadas

- **Sí:** cuarteto clásico del arcade. Da cuatro comportamientos reconocibles y distintos con fórmulas conocidas.
- **No:** variantes simples tipo patrullero o dormilón. Se solapaban entre sí y no aportaban una identidad clara.
- **Sí:** distancia Manhattan codiciosa en cada celda alineada. Reutiliza el enfoque actual y no toca el sistema de movimiento.
- **No:** BFS o camino más corto real. Añade coste por frame y una función nueva para una mejora que no se ha pedido.
- **Sí:** estado explícito `leaving` hacia la puerta. Garantiza que los cuatro salgan, cosa que un comportamiento aleatorio no asegura.
- **Sí:** liberación escalonada de 0, 30, 60 y 90 frames. Evita que los cuatro salgan apilados y da margen tras perder una vida.
- **Sí:** la puerta solo se atraviesa de dentro hacia fuera. Evita bucles de salida y que la pen sirva de refugio.
- **Sí:** desempate fijo `up > left > down > right`. Hace el comportamiento reproducible y depurable.
- **No:** desempate aleatorio. Impide verificar las fórmulas de forma determinista.
- **Sí:** cuatro fantasmas a `GHOST_SPEED = 0.1`. Mantiene la alineación exacta de 10 frames por celda.
- **No:** velocidades distintas o ajuste de dificultad. Se decidirá con datos reales de partida en otra spec.
- **Sí:** fórmulas arcade para cian y naranja. Los diferencia de verdad respecto al rosa.
- **Sí:** color ligado a `kind`. El rojo siempre identifica al perseguidor aunque se reordene el array.
- **No:** modo de depuración visual. La verificación se hace observando el juego.
- **Sí:** los fantasmas pueden solaparse entre sí. No hay colisión entre fantasmas, igual que en el arcade.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El codicioso por celda puede hacer que un fantasma oscile en un cruce. | Se prohíbe el giro de 180 y, en callejones sin salida, se permite como única opción. |
| El objetivo del cian puede caer fuera del laberinto y dejarlo pegado a una pared. | Es solo una referencia de distancia; si el movimiento resulta antinatural, se ajusta en otra spec. |
| Cuatro fantasmas a la misma velocidad pueden hacer el juego demasiado difícil. | Fuera de alcance; se ajusta con datos reales en una spec posterior. |
| La liberación escalonada es por frames y no por tiempo real. | Coherente con el resto del juego, que tampoco usa delta-time. |

## Lo que **no** entra en esta spec

- Power pellets y modo asustado.
- Fases de dispersión y persecución alternadas.
- Búsqueda de caminos avanzada.
- Ajustes de dificultad o velocidad.
- Modo de depuración visual.
- Cambios en laberinto, puntuación, vidas, sonido o controles.

Cada uno de esos puntos, si llega, va en su propia spec.
