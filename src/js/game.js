// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame

// Power pellets y modo asustado.
const FRIGHT_FRAMES = 480;        // ~8 s a 60 fps
const FRIGHT_FLASH_FRAMES = 120;  // ultimos ~2 s parpadeando
const FRIGHT_FLASH_PERIOD = 10;   // frames por cambio de color
const FRIGHTENED_SPEED = 0.05;    // 1/20 celda/frame
const EATEN_SPEED = 0.2;          // 1/5 celda/frame
const POWER_PELLET_SCORE = 50;
const GHOST_SCORES = [ 200, 400, 800, 1600 ];

// Orden de desempate cuando dos direcciones acercan igual al objetivo.
const DIR_ORDER = [ 'up', 'left', 'down', 'right' ];
// Espera escalonada de los fantasmas dentro de la pen, en frames.
const RELEASE_DELAY = 30;
// Celdas objetivo para salir de la pen (justo encima de la puerta).
const PEN_EXIT_LEFT = { x: 13, y: 11 };
const PEN_EXIT_RIGHT = { x: 14, y: 11 };

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === 4 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    frightTimer: 0,   // frames restantes de modo asustado
    ghostCombo: 0,    // fantasmas comidos en el modo actual (0 a 3)
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g, i ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      state: 'waiting',          // 'waiting' | 'leaving' | 'normal'
      releaseTimer: i * RELEASE_DELAY,
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado por pared (1) y por la puerta (3) salvo al salir de la pen
function isWall( grid, x, y, actor, allowDoor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && ( actor === 'pacman' || !allowDoor ) ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor, allowDoor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor, allowDoor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot o power pellet.
    const tile = grid[ p.y ][ p.x ];
    if ( tile === 2 || tile === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      if ( tile === 2 ) {
        game.score += 10;
      } else {
        game.score += POWER_PELLET_SCORE;
        game.frightTimer = FRIGHT_FRAMES;
        game.ghostCombo = 0;
      }
      game.dotsRemaining--;
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

function manhattan( ax, ay, bx, by ) {
  return Math.abs( ax - bx ) + Math.abs( ay - by );
}

// Elige la direccion transitable que mas acerca a target.
// Con flee=true elige la que mas aleja (huida asustada).
// Desempate fijo segun DIR_ORDER (arriba > izquierda > abajo > derecha).
function chooseDirection( grid, x, y, dir, target, allowDoor, flee ) {
  const options = DIR_ORDER.filter(
    ( d ) => d !== OPPOSITE[ dir ] && canMove( grid, x, y, d, 'ghost', allowDoor )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ OPPOSITE[ dir ] ];

  let best = choices[ 0 ];
  let bestDist = flee ? -Infinity : Infinity;
  for ( const d of choices ) {
    const delta = DIRS[ d ];
    const dist = manhattan( x + delta.x, y + delta.y, target.x, target.y );
    if ( flee ? dist > bestDist : dist < bestDist ) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

// Celda objetivo de cada personalidad.
function ghostTarget( game, g ) {
  const p = game.pacman;
  const px = Math.round( p.x );
  const py = Math.round( p.y );
  const pd = DIRS[ p.dir ] || { x: 0, y: 0 };

  if ( g.kind === 'ambusher' ) {
    // Rosa: 4 celdas por delante de Pac-Man.
    return { x: px + pd.x * 4, y: py + pd.y * 4 };
  }

  if ( g.kind === 'flanker' ) {
    // Cian: espejo de Pac-Man respecto al fantasma rojo.
    const aheadX = px + pd.x * 2;
    const aheadY = py + pd.y * 2;
    const red = game.ghosts.find( ( other ) => other.kind === 'hunter' ) || g;
    return {
      x: 2 * aheadX - Math.round( red.x ),
      y: 2 * aheadY - Math.round( red.y ),
    };
  }

  if ( g.kind === 'shy' ) {
    // Naranja: persigue de lejos y huye a la esquina si esta cerca.
    const gx = Math.round( g.x );
    const gy = Math.round( g.y );
    if ( manhattan( gx, gy, px, py ) > 8 ) return { x: px, y: py };
    return { x: 1, y: 29 };
  }

  // Hunter y kinds desconocidos: persecucion directa.
  return { x: px, y: py };
}

function decideGhost( game, g ) {
  const grid = game.grid;
  const leaving = g.state === 'leaving';
  const flee = game.frightTimer > 0 && !leaving;
  const target = leaving
    ? ( g.x < 13.5 ? PEN_EXIT_LEFT : PEN_EXIT_RIGHT )
    : flee
      ? { x: Math.round( game.pacman.x ), y: Math.round( game.pacman.y ) }
      : ghostTarget( game, g );

  g.dir = chooseDirection( grid, g.x, g.y, g.dir, target, leaving, flee );
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  // Espera dentro de la pen antes de empezar a salir.
  if ( g.state === 'waiting' ) {
    g.releaseTimer--;
    if ( g.releaseTimer <= 0 ) g.state = 'leaving';
    return;
  }

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    // La velocidad solo cambia en celdas alineadas para no perder la alineacion.
    if ( g.state === 'eaten' || g.state === 'entering' ) g.speed = EATEN_SPEED;
    else if ( game.frightTimer > 0 ) g.speed = FRIGHTENED_SPEED;
    else g.speed = GHOST_SPEED;
    // Ya esta por encima de la puerta: pasa a aplicar su personalidad.
    if ( g.state === 'leaving' && g.y <= PEN_EXIT_LEFT.y ) g.state = 'normal';
    decideGhost( game, g );
    const allowDoor = g.state === 'leaving';
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost', allowDoor ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
    g.state = 'waiting';
    g.releaseTimer = i * RELEASE_DELAY;
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  // Se descuenta antes de mover: al llegar a 0 el fantasma ya no es comestible.
  if ( game.frightTimer > 0 ) game.frightTimer--;
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
