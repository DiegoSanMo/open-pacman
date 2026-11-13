# SPEC 02 — Power pellets y fantasmas asustados

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-11-12
> **Objetivo:** Añadir cuatro power pellets que activan un modo asustado temporal en el que los fantasmas huyen, bajan de velocidad, se pueden comer con puntuación en combo y vuelven a la pen como ojos para reaparecer.

## Por qué existe esta spec

La SPEC 01 dejó fuera de alcance los power pellets y el modo asustado. El modelo de juego ya tiene lo necesario para soportarlos: un `game.grid` copiado de `MAZE`, una máquina de estados por fantasma (`waiting` / `leaving` / `normal`) y un movimiento en celdas fraccionarias que solo cambia de dirección en celdas alineadas. El trabajo real está en añadir dos estados nuevos (`eaten` y `entering`), un temporizador global y las reglas de colisión, no en rehacer el movimiento.

## Alcance

**Incluido:**

- Cuatro power pellets en las esquinas clásicas `(1,3)`, `(26,3)`, `(1,23)` y `(26,23)`, representados con el tile `4`.
- Comer un power pellet suma 50 puntos, activa 480 frames de modo asustado y reinicia el combo.
- Los power pellets cuentan para `dotsRemaining` y para la victoria.
- Modo asustado global: los cuatro fantasmas cambian de color, huyen de Pac-Man y pasan de 10 a 20 frames por celda.
- Comer un fantasma asustado suma 200, 400, 800 y 1600 puntos en ese orden.
- Un fantasma comido deja de matar y vuelve a la pen en estado `eaten`, entra en la pen en estado `entering` y sale de nuevo con `leaving`.
- Parpadeo azul/blanco en los últimos 120 frames del modo asustado.
- Reinicio completo del modo asustado al perder una vida.

**Fuera de alcance (para futuras specs):**

- Invertir la dirección de los fantasmas al comer un power pellet.
- Power pellets parpadeantes o con animación propia.
- Indicador del modo asustado en el HUD, sonido o efectos.
- Fantasma comido que reaparece sin volver a la pen.
- Búsqueda de caminos con BFS o A* para los ojos del fantasma.
- Fases alternadas de dispersión y persecución.
- Ajustes de dificultad, niveles o velocidad distinta por fantasma.
- Persistencia de ninguna clase.

## Modelo de datos

En `src/js/maze.js`, `MAZE_STR` usa `'o'` en las cuatro esquinas y `parseTile()` lo convierte en tile `4`:

```js
function parseTile( ch ) {
  if ( ch === '#' ) return 1;
  if ( ch === '.' ) return 2;
  if ( ch === '-' ) return 3;
  if ( ch === 'o' ) return 4;
  return 0;
}
```

En `src/js/game.js`, constantes nuevas:

```js
const FRIGHT_FRAMES = 480;        // ~8 s a 60 fps
const FRIGHT_FLASH_FRAMES = 120;  // últimos ~2 s parpadeando
const FRIGHT_FLASH_PERIOD = 10;   // frames por cambio de color
const FRIGHTENED_SPEED = 0.05;    // 1/20 celda/frame
const EATEN_SPEED = 0.2;          // 1/5 celda/frame
const POWER_PELLET_SCORE = 50;
const GHOST_SCORES = [ 200, 400, 800, 1600 ];
```

El estado de la partida añade dos campos y cada fantasma amplía su máquina de estados:

```js
{
  // ...campos actuales de createGame()
  frightTimer: 0,   // frames restantes de modo asustado
  ghostCombo: 0,    // fantasmas comidos en el modo actual (0 a 3)
  ghosts: [
    {
      // ...campos actuales
      state: 'waiting', // 'waiting' | 'leaving' | 'normal' | 'eaten' | 'entering'
      speed: GHOST_SPEED,
    },
  ],
}
```

Convenciones:

- El tile `4` es transitable: ni `isWall()` ni `canMove()` lo tratan como muro.
- `frightTimer` es la única fuente de verdad del modo asustado. No hay campo `frightened` por fantasma.
- Un fantasma es comestible si `game.frightTimer > 0` y su estado no es `eaten` ni `entering`.
- La velocidad se recalcula solo en celdas alineadas: `eaten`/`entering` → `EATEN_SPEED`, asustado → `FRIGHTENED_SPEED`, resto → `GHOST_SPEED`.
- `state: 'eaten'` significa que los ojos vuelven a la celda sobre la puerta: `(13,11)` si `x < 13.5`, si no `(14,11)`.
- `state: 'entering'` significa que desciende por la puerta hasta la fila 14 con `allowDoor` activo.
- Al llegar a la fila 14, el fantasma revive como `leaving` con `releaseTimer` a 0.
- `ghostCombo` se indexa con `Math.min( ghostCombo, 3 )` para no salirse de `GHOST_SCORES`.

## Plan de implementación

Cada paso deja el juego ejecutable.

1. **`src/js/maze.js` y `src/js/render.js`:** cambiar las cuatro esquinas de `'.'` a `'o'`, mapear `'o'` a `4` en `parseTile()` y actualizar el comentario de cabecera. Añadir `drawPellets( ctx, grid )` con un círculo de radio 5.5 en el centro de cada tile `4`, con `DOT_COLOR`, y llamarlo después de `drawDots()`. Verificación manual: se ven cuatro pellets grandes en las esquinas y el juego sigue funcionando al pasar por encima de ellos.
2. **`src/js/game.js`:** añadir las constantes, contar los tiles `2` y `4` en `createGame()` y ampliar el consumo de celdas de `movePacman()` para que el tile `4` sume `POWER_PELLET_SCORE`, ponga `frightTimer = FRIGHT_FRAMES` y reinicie `ghostCombo`. Verificación manual: comer un pellet suma 50, desaparece y la partida se gana solo tras comer todos los dots y los cuatro pellets.
3. **`src/js/game.js`:** descontar `frightTimer` al principio de `update()`. En `moveGhost()`, fijar `g.speed` en cada celda alineada según el estado y el temporizador, y elegir dirección de huida cuando `frightTimer > 0`. Para la huida, ampliar `chooseDirection()` con un parámetro booleano `flee` (por defecto `false`) que invierte la comparación de distancia: se elige la dirección que maximiza la distancia Manhattan a Pac-Man. Verificación manual: al comer un pellet los fantasmas se alejan de Pac-Man, tardan 20 frames por celda y a los ~8 s recuperan su comportamiento.
4. **`src/js/render.js`:** calcular el color del fantasma en `draw()`: azul `#2121ff` cuando `frightTimer > 0`, blanco durante el parpadeo (`frightTimer <= FRIGHT_FLASH_FRAMES` y `Math.floor( frightTimer / FRIGHT_FLASH_PERIOD ) % 2 === 0`), color de `GHOST_COLORS` en el resto. Los estados `eaten` y `entering` no se pintan de azul. Verificación manual: los cuatro se vuelven azules, parpadean en los últimos dos segundos y recuperan su color.
5. **`src/js/game.js` y `src/js/render.js`:** implementar los estados `eaten` y `entering`. En `update()`, cuando un fantasma comestible colisiona con Pac-Man: sumar `GHOST_SCORES[ ghostCombo ]`, incrementar `ghostCombo` y pasar el fantasma a `eaten`. Excluir `eaten` y `entering` de la comprobación de vida. En `decideGhost()`, el objetivo de `eaten` es la celda sobre la puerta y el de `entering` es `(13,14)` o `(14,14)`. En `moveGhost()`, pasar de `eaten` a `entering` al alinearse en la fila 11, y de `entering` a `leaving` al alinearse en la fila 14. En `resetPositions()`, restaurar `frightTimer = 0`, `ghostCombo = 0`, `speed` y los estados. En `drawGhost()`, pintar solo los ojos cuando el estado sea `eaten` o `entering`. Verificación manual: comerse los cuatro fantasmas de un pellet da 200, 400, 800 y 1600; los ojos vuelven a la pen, entran, salen y vuelven a ser peligrosos.

## Criterios de aceptación

- [ ] `node --check src/js/*.js` termina sin errores.
- [ ] `python3 -m http.server 8000 --directory src` sirve el juego y la consola no muestra errores.
- [ ] Se dibujan exactamente cuatro power pellets grandes en `(1,3)`, `(26,3)`, `(1,23)` y `(26,23)`, distinguibles de los dots normales.
- [ ] Comer un power pellet suma 50 puntos y lo elimina de `game.grid`.
- [ ] Comer un power pellet activa el modo asustado durante 480 frames.
- [ ] Los cuatro fantasmas se pintan de azul mientras dura el modo asustado, incluidos los que esperan o salen de la pen.
- [ ] Los fantasmas asustados tardan 20 frames por celda en lugar de 10.
- [ ] Con Pac-Man quieto en un pasillo recto, cada fantasma asustado aumenta o mantiene su distancia Manhattan a Pac-Man en cada celda alineada, salvo en callejones sin salida.
- [ ] Los últimos 120 frames del modo alternan azul y blanco cada 10 frames.
- [ ] Comer fantasmas asustados en un mismo modo suma 200, 400, 800 y 1600 en ese orden.
- [ ] Un fantasma comido no resta vidas y no se puede volver a comer mientras vuelve a la pen.
- [ ] Un fantasma comido vuelve a la pen como ojos, entra, sale y recupera su personalidad.
- [ ] Comer un segundo power pellet reinicia el temporizador a 480 frames y el combo a 200.
- [ ] Perder una vida reinicia `frightTimer` y `ghostCombo`, devuelve a los fantasmas a la pen y ninguno queda azul.
- [ ] La partida se gana al comer todos los dots normales y los cuatro power pellets.
- [ ] Un choque con un fantasma no comestible sigue restando una vida.
- [ ] Las cuatro personalidades de la SPEC 01, la salida escalonada, la puerta de la pen, el túnel de la fila 14 y el reinicio tras perder una vida siguen funcionando.
- [ ] `MAZE` sigue sin mutarse entre partidas.

## Decisiones tomadas y descartadas

- **Sí:** tile `4` con `'o'` en `MAZE_STR`. Reutiliza el modelo de grid existente, el conteo de dots y la copia por partida, sin estado paralelo.
- **No:** lista de coordenadas de power pellets fuera de `MAZE`. Obliga a mantener dos fuentes de verdad y se desincroniza al comer.
- **Sí:** las cuatro esquinas clásicas del nivel 1. Son reconocibles y no requieren tocar la geometría del laberinto.
- **Sí:** 480 frames de duración, reiniciados en cada pellet. Coherente con el resto del juego, que no usa delta-time.
- **No:** duración por tiempo real con `deltaTime`. Rompería la alineación exacta de `movePacman` y `moveGhost`.
- **Sí:** huida determinista maximizando la distancia Manhattan, con el desempate fijo `up > left > down > right` y sin giro de 180. Reutiliza `chooseDirection()` y se verifica a ojo.
- **No:** aleatoriedad con PRNG. Exigiría semilla y hace la verificación menos directa.
- **No:** invertir la dirección de los fantasmas al comer el pellet. Complica la regla de huida y no se ha pedido.
- **Sí:** velocidad asustada `0.05` (1/20) y velocidad de ojos `0.2` (1/5). Son recíprocos exactos y conservan la alineación.
- **Sí:** cambiar la velocidad solo en celdas alineadas. Evita que un cambio a mitad de celda deje al fantasma sin volver a alinearse nunca.
- **Sí:** ojos que vuelven a la pen con los estados `eaten` y `entering`. Es el comportamiento clásico y se resuelve con la misma búsqueda codiciosa.
- **No:** BFS o A* para el retorno de los ojos. La distancia Manhattan ya lleva al fantasma a la puerta sin coste apreciable.
- **Sí:** el fantasma revive como `leaving` con `releaseTimer` a 0. Sale de la pen de inmediato en vez de esperar otro turno de liberación.
- **Sí:** si un fantasma es comido dentro de la pen (`y > 11`), pasa directamente a `entering` con objetivo la fila 14. Evita un objetivo inalcanzable al otro lado de la puerta.
- **Sí:** los fantasmas en `waiting` y `leaving` también se asustan y se pueden comer, pero mantienen su ruta de salida. El modo asustado es global y el color lo refleja.
- **Sí:** combo global por modo asustado, reiniciado al comer un pellet nuevo y al perder una vida. Es la regla arcade y es fácil de comprobar.
- **Sí:** parpadeo calculado desde `frightTimer` en `render.js`. No añade estado ni depende del frame de animación.
- **Sí:** los power pellets cuentan para la victoria. Mantiene una única condición de fin de partida.
- **No:** pellets parpadeantes, sonido o indicador en el HUD. Es pulido visual y va en otra spec si se pide.
- **No:** colisión entre fantasmas. Se mantiene la regla de la SPEC 01: pueden solaparse.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambiar la velocidad a mitad de celda deja al actor con un desplazamiento que nunca alinea. | La velocidad solo se reasigna en celdas alineadas; hasta la siguiente celda conserva la anterior. |
| Un fantasma comido dentro de la pen no puede alcanzar el objetivo exterior. | Si `y > 11` al ser comido, pasa directamente a `entering` con objetivo en la fila 14. |
| La huida determinista puede encerrar a un fantasma en una esquina o hacerlo oscilar. | El desempate fijo y la prohibición del giro de 180 ya lo evitan; en callejones sin salida se permite invertir la marcha. |
| El temporizador y la colisión ocurren en el mismo frame. | `frightTimer` se descuenta al principio de `update()`; si llega a 0, el fantasma ya no es comestible en ese frame. |
| El parpadeo depende del frame de animación y no del temporizador. | Se calcula solo con `frightTimer`, así que es reproducible. |
| Los ojos usan la misma búsqueda codiciosa que los fantasmas vivos y pueden dar vueltas antes de llegar. | El objetivo está sobre la puerta y el camino es corto; si se observa un bucle, se ajusta en otra spec. |

## Lo que **no** entra en esta spec

- Invertir la dirección de los fantasmas al comer un power pellet.
- Animación o parpadeo propio de los power pellets.
- Sonido, HUD o aviso textual del modo asustado.
- Reaparición instantánea del fantasma comido.
- Búsqueda de caminos avanzada para los ojos.
- Fases de dispersión y persecución.
- Niveles, dificultad o velocidades por fantasma.
- Persistencia.

Cada uno de esos puntos, si llega, va en su propia spec.
