// ============================================================
//  CONFIGURATION
// ============================================================

const CONFIG = {
  canvasWidth:  900,
  canvasHeight: 700,
  tileSize:     60,
  hopDuration:  140,          // ms for one hop animation
  camLerp:      0.14,         // camera smoothing factor per frame
  playerHitbox: 0.52,         // fraction of tileSize used for collision
  carHitbox:    0.80,         // fraction of car height used for collision
};

// How many tile columns fit across the canvas
const COLS = Math.floor(CONFIG.canvasWidth / CONFIG.tileSize); // 15

// ============================================================
//  CANVAS SETUP
// ============================================================

const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

// ============================================================
//  COLOURS
// ============================================================

const CLR = {
  // Grass — two base tones + edge/detail colours
  grassA:       '#3a7d2c',   // primary grass
  grassB:       '#347228',   // alternate row
  grassEdge:    '#24521a',   // front-face depth edge of grass tile
  grassShade:   '#2a5e1e',   // shaded side panel
  grassTuft:    '#286020',   // dark detail tuft
  grassPatch:   '#4a8a38',   // light detail patch

  // Road
  roadTop:      '#5a5a6e',   // road surface (top face)
  roadFront:    '#3a3a4e',   // front-face kerb depth
  roadSide:     '#44445a',   // side panel
  roadStripe:   '#e8e040',   // dashed centre line
  roadKerb:     '#888898',   // kerb highlight along top edge

  // River
  waterTop:     '#287fa3',
  waterDeep:    '#1d607f',
  waterWave:    'rgba(185,235,240,0.32)',
  lilyTop:      '#63b83c',
  lilySide:     '#327522',
  lilyHighlight:'rgba(220,255,170,0.55)',

  // Sky / background
  sky:          '#1a1a2e',

  // Car body colours
  cars: ['#d93030', '#3570d4', '#d48030', '#7830d4', '#30b890', '#d43070', '#30a030', '#c8c030'],

  // Depth shading constants (applied via darken/lighten helpers)
  shadowAlpha:  'rgba(0,0,0,0.28)',   // cast shadow on ground
  shadowAlpha2: 'rgba(0,0,0,0.18)',   // lighter ambient shadow

  // Player chicken
  pBody:   '#f5e642',
  pBodySide: '#c9ba28',   // darker side face
  pBodyBot:  '#a89d20',   // bottom/shadow face
  pComb:   '#e84040',
  pCombSide: '#a82020',
  pBeak:   '#e89c40',
  pEye:    '#1a1a1a',
  pWing:   '#d4c835',
  pWingSide: '#a89a20',
  pFoot:   '#d4823a',

  // Scenery — trees
  treeTop:    '#2a7a18',   // foliage top face
  treeSide:   '#1a5510',   // foliage side/shadow face
  treeTrunk:  '#7a4a18',   // trunk top
  treeTrunkS: '#4a2c0a',   // trunk side face

  // Scenery — bushes
  bushTop:    '#308020',
  bushSide:   '#1e5512',

  // Scenery — rocks
  rockTop:    '#8a8a8a',
  rockSide:   '#555555',
  rockHigh:   '#aaaaaa',   // top-left highlight

  // Scenery — flowers (two colour variants)
  flowerA:    '#e84090',   // pink
  flowerB:    '#e8c040',   // yellow
  flowerStem: '#40a020',

  // Scenery — road signs
  signPost:   '#a07830',
  signPostS:  '#6a4e18',
  signBoard:  '#e8e040',
  signBoardS: '#a8a010',
  signText:   '#1a1a1a',
};

// ============================================================
//  WORLD / LANE GENERATION
//
//  World rows are integers.  Row 0 = player start row.
//  Negative row numbers are further forward (north).
//  Lanes are generated lazily and cached.
// ============================================================

const laneCache = new Map();

// Seed stays stable during one run, then changes when the game restarts.
let SEED = Math.floor(Math.random() * 999983) + 1;

// Seeded hash → deterministic float in [0, 1) for a given row + salt.
// Using 0x100000000 as divisor guarantees strict < 1, so array index
// lookups never go out of bounds.
function rng(row, salt) {
  let h = ((row * 1664525 + salt * 22695477 + SEED) | 0) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

function getLane(worldRow) {
  if (!laneCache.has(worldRow)) {
    laneCache.set(worldRow, buildLane(worldRow));
  }
  return laneCache.get(worldRow);
}

function buildLane(worldRow) {
  // Starting rows behind/at the player are always safe, plain grass
  if (worldRow >= -1) {
    return { type: 'grass', variant: 'meadow', shade: 0, scenery: [] };
  }

  // Use a block pattern cycling every 7 rows: 3 grass + 4 road.
  // Earlier rows (closer to start) lean grass-heavy for a gentler intro.
  const depth   = Math.abs(worldRow) - 2;   // 0-based forward depth
  const r0      = rng(worldRow, 0);

  // Gradually increase road density with depth (caps at 60% road)
  const roadChance = Math.min(0.60, 0.30 + depth * 0.008);
  const riverGroup  = Math.floor(depth / 3);
  const riverChance = depth > 5 ? Math.min(0.22, 0.14 + (depth - 5) * 0.002) : 0;
  const isRiverBand = depth > 5 && rng(riverGroup, 90) < riverChance;
  const isRiver     = isRiverBand && depth % 3 !== 2;
  const isRoad      = !isRiver && depth > 2 && r0 < riverChance + roadChance;

  if (isRiver) {
    return buildRiverLane(worldRow, depth);
  } else if (!isRoad) {
    return buildGrassLane(worldRow, depth);
  } else {
    return buildRoadLane(worldRow, depth);
  }
}

// ---- Grass lane variants ----
// variant: 'meadow' | 'dense' | 'sparse' | 'path'
//   meadow — lush green, moderate scenery
//   dense  — dark green, many trees/bushes, narrower paths
//   sparse — pale green, few objects, wider open feel
//   path   — worn dirt-ish tint, no blocking objects, decorative only

const GRASS_VARIANTS = ['meadow', 'meadow', 'dense', 'sparse', 'path'];

function buildGrassLane(worldRow, depth) {
  const rv      = rng(worldRow, 5);
  const variant = depth < 4
    ? 'meadow'                                          // easy intro rows
    : GRASS_VARIANTS[Math.floor(rv * GRASS_VARIANTS.length) % GRASS_VARIANTS.length];
  const shade   = worldRow % 2 === 0 ? 0 : 1;

  const scenery = buildScenery(worldRow, variant, depth);
  return { type: 'grass', variant, shade, scenery };
}

function buildRiverLane(worldRow, depth) {
  const lilyPads = [];
  const centerCol = PLAYER_START_COL;
  const direction = rng(worldRow, 61) < 0.5 ? -1 : 1;
  const baseSpeed = 0.35 + rng(worldRow, 62) * 0.45;
  const rowSpeed = rng(worldRow, 63) > 0.68 ? baseSpeed * 1.8 : baseSpeed;

  for (let col = 0; col < COLS; col++) {
    const isCenterCorridor = Math.abs(col - centerCol) <= 1;
    const padChance = isCenterCorridor ? 1 : 0.30;
    if (rng(worldRow * 67 + col, 60) < padChance) {
      lilyPads.push({
        x: col * TS + 8,
        w: 44,
        type: 'lilypad',
        direction,
        speed: rowSpeed,
      });
    }
  }

  return { type: 'river', lilyPads, depth };
}

// ---- Scenery generation ----
// Blocking types: 'tree', 'bush', 'rock'
// Decorative types: 'flower', 'sign'
//
// Path-guarantee: after placing all objects we verify there is at least
// one run of MIN_PATH consecutive unblocked columns.  If not, we clear
// the most recently placed blocker until the path opens up.

const MIN_PATH = 3;   // minimum consecutive passable columns required

function buildScenery(worldRow, variant, depth) {
  if (variant === 'path') {
    // Path rows: decorative objects only, no blockers
    return buildDecorativeScenery(worldRow, depth);
  }

  // Density scaling: more objects appear deeper in the world, capped by variant
  const densityBase = variant === 'dense'  ? 0.55
                    : variant === 'sparse' ? 0.22
                    :                        0.38; // meadow
  const introProgress = Math.min(depth / 8, 1);
  const density = Math.min(
    0.12 + (densityBase - 0.12) * introProgress + depth * 0.004,
    densityBase * 1.35
  );

  const blocked  = new Array(COLS).fill(false);
  const scenery  = [];

  // Candidate blocker types weighted by variant
  const blockerPool = variant === 'dense'
    ? ['tree','tree','tree','bush','bush','rock']
    : variant === 'sparse'
    ? ['rock','bush','tree']
    : ['tree','bush','bush','rock','rock'];        // meadow

  for (let col = 0; col < COLS; col++) {
    const r1 = rng(worldRow * 97 + col, 20);
    if (r1 >= density) continue;

    const typeIdx = Math.floor(rng(worldRow * 97 + col, 21) * blockerPool.length) % blockerPool.length;
    const objType = blockerPool[typeIdx];

    scenery.push({ col, type: objType, blocked: true });
    blocked[col] = true;
  }

  // Path guarantee — ensure MIN_PATH consecutive open columns exist
  guaranteePath(blocked, scenery, worldRow);

  // Sprinkle decorative objects into remaining empty tiles (20% chance each)
  for (let col = 0; col < COLS; col++) {
    if (blocked[col]) continue;
    const r2 = rng(worldRow * 53 + col, 30);
    if (r2 < 0.20) {
      const decType = rng(worldRow * 53 + col, 31) > 0.5 ? 'flower' : 'sign';
      // Signs are rare — only on meadow/sparse, and only 1 per lane
      if (decType === 'sign') {
        const alreadyHasSign = scenery.some(s => s.type === 'sign');
        if (alreadyHasSign || variant === 'dense') continue;
      }
      scenery.push({ col, type: decType, blocked: false });
    }
  }

  return scenery;
}

function buildDecorativeScenery(worldRow, depth) {
  const scenery = [];
  for (let col = 0; col < COLS; col++) {
    const r = rng(worldRow * 61 + col, 40);
    if (r < 0.30) {
      scenery.push({ col, type: 'flower', blocked: false });
    }
  }
  return scenery;
}

// Remove blocker objects until there is a run of >= MIN_PATH open columns.
function guaranteePath(blocked, scenery, worldRow) {
  // Keep the player's initial forward corridor open so the first generated
  // grass lanes cannot stop progress before the player can route around obstacles.
  const entryCol = PLAYER_START_COL;
  if (blocked[entryCol]) {
    for (let i = scenery.length - 1; i >= 0; i--) {
      if (scenery[i].blocked && scenery[i].col === entryCol) {
        blocked[entryCol] = false;
        scenery.splice(i, 1);
        break;
      }
    }
  }

  // Find the longest run of open columns
  const longestRun = () => {
    let best = 0, cur = 0;
    for (let c = 0; c < COLS; c++) {
      cur = blocked[c] ? 0 : cur + 1;
      if (cur > best) best = cur;
    }
    return best;
  };

  // While path is too narrow, remove the last-placed blocker
  while (longestRun() < MIN_PATH && scenery.length > 0) {
    // Find and remove the last blocker in scenery[]
    for (let i = scenery.length - 1; i >= 0; i--) {
      if (scenery[i].blocked) {
        blocked[scenery[i].col] = false;
        scenery.splice(i, 1);
        break;
      }
    }
  }
}

// ---- Road lane difficulty scaling ----
// depth → speed and density increase gradually, capped so it stays fair.
// Road groups (consecutive road lanes) may share a traffic "theme".

function buildRoadLane(worldRow, depth) {
  const r1    = rng(worldRow, 1);
  const r2    = rng(worldRow, 2);
  const r3    = rng(worldRow, 3);

  // Direction: random, but adjacent lanes tend to alternate (use row parity)
  const dir   = r1 > 0.5 ? 1 : -1;

  // Speed scales with depth: starts at 1.0, soft-caps at 4.5 around depth 80
  const speedBase = 1.0 + Math.min(depth * 0.040, 3.5);
  const speed     = speedBase + r2 * 1.0;   // ±1 px/frame variance

  // Car count: 2 at start, up to 5 deep in the world
  const maxCars   = Math.min(2 + Math.floor(depth / 15), 5);
  const numCars   = 2 + Math.floor(r3 * (maxCars - 1));

  // Occasional fast-lane burst (rare after depth 20)
  const isFast    = depth > 20 && rng(worldRow, 9) > 0.80;
  const finalSpeed = isFast ? speed * 1.5 : speed;

  return {
    type:  'road',
    dir,
    speed: finalSpeed,
    cars:  makeCars(worldRow, dir, finalSpeed, numCars),
  };
}

// Vehicle style catalogue — proportions differ per style.
// 'sedan' : low and wide,  'suv' : tall and wide,  'truck' : very long and tall
const CAR_STYLES = ['sedan', 'suv', 'truck'];

function makeCars(worldRow, dir, speed, count) {
  const cars = [];
  const gap  = CONFIG.canvasWidth / count;
  for (let i = 0; i < count; i++) {
    const r     = rng(worldRow, i + 10);
    const style = CAR_STYLES[Math.floor(rng(worldRow, i + 70) * CAR_STYLES.length) % CAR_STYLES.length];

    // Width and height vary by style
    let w, h;
    if (style === 'sedan') { w = 80  + Math.floor(r * 30); h = 34; }
    else if (style === 'suv')  { w = 90  + Math.floor(r * 30); h = 40; }
    else                       { w = 120 + Math.floor(r * 40); h = 42; } // truck

    cars.push({
      x:     i * gap + r * gap * 0.55,
      w,
      h,
      style,
      color: CLR.cars[Math.floor(rng(worldRow, i + 50) * CLR.cars.length) % CLR.cars.length],
      dir,
      speed,
    });
  }
  return cars;
}

// ============================================================
//  CAMERA
//
//  camera.worldPx is the world-space Y in pixels that maps to
//  the top edge of the canvas.  World Y for a row = row * tileSize.
// ============================================================

const camera = { worldPx: 0 };

function rowToScreenY(worldRow) {
  return worldRow * CONFIG.tileSize - camera.worldPx;
}

// Camera target: keep player a fixed distance from top of screen
const PLAYER_SCREEN_ROW = 9; // which screen row the player sits on
function cameraTarget() {
  return (player.row - PLAYER_SCREEN_ROW) * CONFIG.tileSize;
}

// ============================================================
//  PLAYER
// ============================================================

const PLAYER_START_ROW = 0;
const PLAYER_START_COL = Math.floor(COLS / 2);

const player = {
  row: PLAYER_START_ROW,
  col: PLAYER_START_COL,

  // Animated pixel position (canvas space)
  px: 0,
  py: 0,

  // Hop state
  hopping:   false,
  hopT:      0,   // progress 0→1
  hopT0:     0,   // performance.now() at hop start
  fromX:     0,
  fromY:     0,
  toX:       0,
  toY:       0,
  targetPad: null,

  // Facing direction: 'up' | 'down' | 'left' | 'right'
  facing: 'up',

  size: 50,
};

const landingRipples = [];
const LILY_PAD_Y_OFFSET = 16;
const RIPPLE_DURATION = 420;
const MAX_LILY_PAD_ADJUSTMENT = CONFIG.tileSize * 0.45;
const MAX_FAST_LILY_PAD_ADJUSTMENT = CONFIG.tileSize * 0.65;

function snapPlayerPixels() {
  player.px = player.col * CONFIG.tileSize + CONFIG.tileSize / 2;
  player.py = rowToScreenY(player.row)     + CONFIG.tileSize / 2;
}

// ============================================================
//  SCORE
// ============================================================

const score = {
  val:     0,
  best:    0,
  bestRow: PLAYER_START_ROW,   // most-forward (lowest) row ever reached
};

function refreshScore() {
  if (player.row < score.bestRow) {
    score.bestRow = player.row;
    score.val     = PLAYER_START_ROW - score.bestRow;
    if (score.val > score.best) score.best = score.val;
  }
}

// ============================================================
//  GAME STATE
// ============================================================

let state = 'playing'; // 'playing' | 'dying' | 'dead'
const deathAnimation = {
  type: null,
  start: 0,
  duration: 650,
};

function beginDeath(type) {
  if (state !== 'playing') return;
  state = 'dying';
  deathAnimation.type = type;
  deathAnimation.duration = type === 'car' ? 260 : 650;
  deathAnimation.start = performance.now();

  if (type === 'water') {
    landingRipples.push({ row: player.row, x: player.px, start: deathAnimation.start });
  }
}

function resetGame() {
  player.row     = PLAYER_START_ROW;
  player.col     = PLAYER_START_COL;
  player.hopping = false;
  player.facing  = 'up';
  player.targetPad = null;

  score.val     = 0;
  score.bestRow = PLAYER_START_ROW;

  laneCache.clear();
  clearTileCache();
  landingRipples.length = 0;
  SEED = Math.floor(Math.random() * 999983) + 1;
  deathAnimation.type = null;
  deathAnimation.start = 0;

  camera.worldPx = cameraTarget();
  snapPlayerPixels();

  state = 'playing';
}

// Returns true if a given world tile is occupied by a blocking scenery object.
// Road tiles are never blocked by scenery (cars handle their own collision).
// Called before committing player movement so the hop never starts into a wall.
function isTileBlocked(worldRow, col) {
  const lane = getLane(worldRow);
  if (lane.type !== 'grass') return false;
  return lane.scenery.some(s => s.blocked && s.col === col);
}

// ============================================================
//  INPUT
// ============================================================

document.addEventListener('keydown', handleKey);

function handleKey(e) {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }

  if (state !== 'playing') {
    if (e.key === 'Enter' || e.key === ' ') resetGame();
    return;
  }

  if (player.hopping) return; // one move at a time

  let dr = 0, dc = 0;
  switch (e.key) {
    case 'ArrowUp':    case 'w': case 'W': dr = -1; player.facing = 'up';    break;
    case 'ArrowDown':  case 's': case 'S': dr =  1; player.facing = 'down';  break;
    case 'ArrowLeft':  case 'a': case 'A': dc = -1; player.facing = 'left';  break;
    case 'ArrowRight': case 'd': case 'D': dc =  1; player.facing = 'right'; break;
    default: return;
  }

  const newRow = player.row + dr;
  const newCol = player.col + dc;

  // Clamp to canvas columns
  if (newCol < 0 || newCol >= COLS) return;

  // Block movement into a tile occupied by scenery (tree, bush, rock)
  if (isTileBlocked(newRow, newCol)) return;

  // Record hop start
  const destinationLane = getLane(newRow);
  let targetX = dc === 0
    ? player.px
    : newCol * CONFIG.tileSize + CONFIG.tileSize / 2;
  if (destinationLane.type === 'river') {
    const target = getLilyPadTarget(destinationLane, targetX);
    targetX = target ? target.x : targetX;
    player.targetPad = target ? target.pad : null;
  } else {
    player.targetPad = null;
  }

  player.fromX   = player.px;
  player.fromY   = player.py;
  player.toX     = targetX;
  player.toY     = rowToScreenY(newRow)     + CONFIG.tileSize / 2;
  player.hopT0   = performance.now();
  player.hopping = true;

  player.row = newRow;
  player.col = newCol;

  refreshScore();
}

// ============================================================
//  UPDATE
// ============================================================

function update(ts) {
  if (state === 'dying') {
    if (ts - deathAnimation.start >= deathAnimation.duration) state = 'dead';
  }

  const supportLane = !player.hopping && getLane(player.row).type === 'river'
    ? getLane(player.row)
    : null;
  const supportPad = supportLane ? getSupportingLilyPad(supportLane) : null;
  const supportPadX = supportPad ? supportPad.x : 0;

  // --- Hop animation ---
  if (player.hopping) {
    const elapsed = ts - player.hopT0;
    player.hopT   = Math.min(elapsed / CONFIG.hopDuration, 1);

    const t    = player.hopT;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOut
    const arc  = Math.sin(t * Math.PI) * CONFIG.tileSize * 0.38;           // hop arc

    player.px = player.fromX + (player.toX - player.fromX) * ease;
    player.py = player.fromY + (player.toY - player.fromY) * ease - arc;

    if (player.hopT >= 1) {
      player.hopping = false;
      player.px = player.toX;
      player.py = player.toY;

      const lane = getLane(player.row);
      if (lane.type === 'river') {
        const landingPad = player.targetPad && lane.lilyPads.includes(player.targetPad)
          ? player.targetPad
          : null;
        const landingDistance = landingPad
          ? Math.abs(landingPad.x + landingPad.w / 2 - player.px)
          : Infinity;
        if (landingPad && landingDistance <= getLilyPadAdjustmentLimit(landingPad) && !isPlayerOnSpecificLilyPad(landingPad)) {
          player.px = landingPad.x + landingPad.w / 2;
          player.col = Math.max(
            0,
            Math.min(COLS - 1, Math.round(player.px / CONFIG.tileSize - 0.5))
          );
        }
        if (landingPad && isPlayerOnSpecificLilyPad(landingPad)) {
          landingRipples.push({ row: player.row, x: player.px, start: ts });
        }
      }
      player.targetPad = null;
    }
  } else {
    // Snap to exact position when idle
    if (!supportPad) {
      player.px = player.col * CONFIG.tileSize + CONFIG.tileSize / 2;
    }
    player.py = rowToScreenY(player.row)     + CONFIG.tileSize / 2;
  }

  // --- Smooth camera ---
  camera.worldPx += (cameraTarget() - camera.worldPx) * CONFIG.camLerp;

  for (let i = landingRipples.length - 1; i >= 0; i--) {
    if (ts - landingRipples[i].start >= RIPPLE_DURATION) landingRipples.splice(i, 1);
  }

  // --- Move cars (only in visible range) ---
  const topRow    = Math.floor(camera.worldPx / CONFIG.tileSize) - 1;
  const bottomRow = topRow + Math.ceil(CONFIG.canvasHeight / CONFIG.tileSize) + 3;

  for (let wr = topRow; wr <= bottomRow; wr++) {
    const lane = getLane(wr);
    if (lane.type === 'road') {
      for (const car of lane.cars) {
        car.x += car.speed * car.dir;
        // Wrap off-screen
        if (car.dir > 0 && car.x >  CONFIG.canvasWidth + car.w)  car.x = -car.w - 10;
        if (car.dir < 0 && car.x < -car.w - 10)                  car.x = CONFIG.canvasWidth + 10;
      }
    } else if (lane.type === 'river') {
      for (const pad of lane.lilyPads) {
        pad.x += pad.speed * pad.direction;
        if (pad.direction > 0 && pad.x > CONFIG.canvasWidth + pad.w) pad.x = -pad.w;
        if (pad.direction < 0 && pad.x < -pad.w) pad.x = CONFIG.canvasWidth;
      }
    }
  }

  if (supportPad && !player.hopping) {
    player.px += supportPad.x - supportPadX;
    player.col = Math.max(
      0,
      Math.min(COLS - 1, Math.round(player.px / CONFIG.tileSize - 0.5))
    );
  }

  // --- Collision (only while playing, skip during hop to feel fair) ---
  if (state === 'playing' && !player.hopping) {
    checkCollision();
  }
}

function checkCollision() {
  const lane = getLane(player.row);
  if (lane.type === 'river') {
    if (!isPlayerOnLilyPad(lane)) beginDeath('water');
    return;
  }
  if (lane.type !== 'road') return;

  const hs   = (CONFIG.tileSize * CONFIG.playerHitbox) / 2;
  const px1  = player.px - hs;
  const px2  = player.px + hs;
  const py1  = player.py - hs;
  const py2  = player.py + hs;

  const laneY = rowToScreenY(player.row);

  for (const car of lane.cars) {
    const cy     = laneY + (CONFIG.tileSize - car.h) / 2;
    const shrink = car.h * (1 - CONFIG.carHitbox) / 2;
    const cx1    = car.x;
    const cx2    = car.x + car.w;
    const cy1    = cy + shrink;
    const cy2    = cy + car.h - shrink;

    if (px2 > cx1 && px1 < cx2 && py2 > cy1 && py1 < cy2) {
      beginDeath('car');
      return;
    }
  }
}

function isPlayerOnLilyPad(lane) {
  const halfHitbox = (CONFIG.tileSize * CONFIG.playerHitbox) / 2;
  const playerLeft = player.px - halfHitbox;
  const playerRight = player.px + halfHitbox;
  return lane.lilyPads.some(pad => playerRight > pad.x && playerLeft < pad.x + pad.w);
}

function getSupportingLilyPad(lane) {
  const halfHitbox = (CONFIG.tileSize * CONFIG.playerHitbox) / 2;
  const playerLeft = player.px - halfHitbox;
  const playerRight = player.px + halfHitbox;
  return lane.lilyPads.find(pad => playerRight > pad.x && playerLeft < pad.x + pad.w) || null;
}

function getClosestLilyPad(lane, x) {
  return lane.lilyPads.reduce((closest, pad) => {
    const distance = Math.abs(pad.x + pad.w / 2 - x);
    if (!closest || distance < closest.distance) return { pad, distance };
    return closest;
  }, null)?.pad || null;
}

function isPlayerOnSpecificLilyPad(pad) {
  const halfHitbox = (CONFIG.tileSize * CONFIG.playerHitbox) / 2;
  return player.px + halfHitbox > pad.x && player.px - halfHitbox < pad.x + pad.w;
}

function getLilyPadTarget(lane, desiredX) {
  const predictedFrames = CONFIG.hopDuration / (1000 / 60);
  let closest = null;

  for (const pad of lane.lilyPads) {
    let predictedX = pad.x + pad.speed * pad.direction * predictedFrames;
    if (predictedX > CONFIG.canvasWidth + pad.w) predictedX = -pad.w;
    if (predictedX < -pad.w) predictedX = CONFIG.canvasWidth;

    const padCenter = predictedX + pad.w / 2;
    const distance = Math.abs(padCenter - desiredX);
    if (!closest || distance < closest.distance) {
      closest = { pad, x: padCenter, distance };
    }
  }

  return closest && closest.distance <= getLilyPadAdjustmentLimit(closest.pad) ? closest : null;
}

function getLilyPadAdjustmentLimit(pad) {
  const hopFrames = CONFIG.hopDuration / (1000 / 60);
  const movementAllowance = pad.speed * hopFrames * 0.5;
  return Math.min(MAX_FAST_LILY_PAD_ADJUSTMENT, MAX_LILY_PAD_ADJUSTMENT + movementAllowance);
}

function getLilyPadLandingX(lane, desiredX) {
  const target = getLilyPadTarget(lane, desiredX);
  return target ? target.x : desiredX;
}

// ============================================================
//  TILE CACHE
//
//  Grass and road tiles are expensive to repaint every frame
//  because of per-tile detail.  We pre-render each unique variant
//  once into a small OffscreenCanvas and blit it each frame.
//
//  Cache keys:
//    'grass_0', 'grass_1'        — two grass shade variants
//    'road'                      — single road tile (markings drawn live
//                                  because the dashes scroll)
//
//  tileDetailSeeds[worldRow] stores the per-row detail seed so
//  grass tiles with the same shade but different details get
//  distinct offscreen tiles keyed by worldRow.  To keep memory
//  bounded we only cache rows we've actually rendered.
// ============================================================

const tileCache    = new Map();   // key → OffscreenCanvas
const TS           = CONFIG.tileSize;
const CANVAS_W     = CONFIG.canvasWidth;
const DEPTH        = 7;           // px — height of the front-face depth strip

// Build and cache a grass tile for a specific world row.
// Two rows with the same shade but different world rows get
// independent detail patterns seeded by their row index.
function getGrassTile(worldRow, shade, variant) {
  const key = `grass_${worldRow}`;
  if (tileCache.has(key)) return tileCache.get(key);

  const oc  = new OffscreenCanvas(CANVAS_W, TS + DEPTH);
  const oc2 = oc.getContext('2d');

  // Variant-aware base colour
  let base;
  if (variant === 'dense')  base = shade === 0 ? '#2a6818' : '#246015';
  else if (variant === 'sparse') base = shade === 0 ? '#4a8a30' : '#428025';
  else if (variant === 'path')   base = shade === 0 ? '#5a7838' : '#506e30';
  else                           base = shade === 0 ? CLR.grassA : CLR.grassB; // meadow

  // ---- Top face ----
  oc2.fillStyle = base;
  oc2.fillRect(0, 0, CANVAS_W, TS);

  // Subtle horizontal banding (slightly lighter strip across top half)
  const grad = oc2.createLinearGradient(0, 0, 0, TS);
  grad.addColorStop(0,   hexAlpha(lighten(base, 8), 0.35));
  grad.addColorStop(0.5, 'transparent');
  grad.addColorStop(1,   hexAlpha(darken(base, 10), 0.25));
  oc2.fillStyle = grad;
  oc2.fillRect(0, 0, CANVAS_W, TS);

  // Per-tile detail: tufts + light patches seeded by world row
  const tileCount = Math.floor(CANVAS_W / TS);
  for (let col = 0; col < tileCount; col++) {
    const r1 = rng(worldRow * 31 + col, 3);
    const r2 = rng(worldRow * 31 + col, 7);
    const r3 = rng(worldRow * 31 + col, 11);
    const cx = col * TS + r1 * TS * 0.8 + TS * 0.1;
    const cy = r2 * TS * 0.7 + TS * 0.1;

    // Occasional light patch (60% chance)
    if (r3 > 0.4) {
      oc2.fillStyle = hexAlpha(lighten(base, 14), 0.40);
      oc2.beginPath();
      oc2.ellipse(cx, cy, 7 + r1 * 6, 4 + r2 * 3, r3 * Math.PI, 0, Math.PI * 2);
      oc2.fill();
    }

    // Tuft: two or three small dark strokes (40% chance)
    if (r1 > 0.6) {
      oc2.strokeStyle = hexAlpha(CLR.grassTuft, 0.65);
      oc2.lineWidth   = 1.5;
      oc2.lineCap     = 'round';
      const tx = col * TS + r2 * TS * 0.75 + TS * 0.12;
      const ty = r3 * TS * 0.65 + TS * 0.15;
      for (let t = -1; t <= 1; t++) {
        oc2.beginPath();
        oc2.moveTo(tx + t * 3, ty + 4);
        oc2.lineTo(tx + t * 5, ty - 4);
        oc2.stroke();
      }
    }
  }

  // ---- Front-face depth strip (simulates tile thickness) ----
  oc2.fillStyle = CLR.grassEdge;
  oc2.fillRect(0, TS, CANVAS_W, DEPTH);

  // Very slight top-lit highlight on the edge
  const edgeGrad = oc2.createLinearGradient(0, TS, 0, TS + DEPTH);
  edgeGrad.addColorStop(0, 'rgba(255,255,255,0.10)');
  edgeGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
  oc2.fillStyle = edgeGrad;
  oc2.fillRect(0, TS, CANVAS_W, DEPTH);

  tileCache.set(key, oc);
  return oc;
}

// Build and cache the road top-face (no markings — drawn live each frame
// so the dashes appear at the correct position regardless of camera).
function getRoadTile() {
  const key = 'road_base';
  if (tileCache.has(key)) return tileCache.get(key);

  const oc  = new OffscreenCanvas(CANVAS_W, TS + DEPTH);
  const oc2 = oc.getContext('2d');

  // Road surface
  oc2.fillStyle = CLR.roadTop;
  oc2.fillRect(0, 0, CANVAS_W, TS);

  // Top-light gradient
  const grad = oc2.createLinearGradient(0, 0, 0, TS);
  grad.addColorStop(0,   'rgba(255,255,255,0.06)');
  grad.addColorStop(0.4, 'transparent');
  grad.addColorStop(1,   'rgba(0,0,0,0.14)');
  oc2.fillStyle = grad;
  oc2.fillRect(0, 0, CANVAS_W, TS);

  // Kerb highlight line at very top of road tile
  oc2.fillStyle = CLR.roadKerb;
  oc2.fillRect(0, 0, CANVAS_W, 3);

  // Front-face kerb depth strip
  oc2.fillStyle = CLR.roadFront;
  oc2.fillRect(0, TS, CANVAS_W, DEPTH);

  const kerbGrad = oc2.createLinearGradient(0, TS, 0, TS + DEPTH);
  kerbGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
  kerbGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
  oc2.fillStyle = kerbGrad;
  oc2.fillRect(0, TS, CANVAS_W, DEPTH);

  tileCache.set(key, oc);
  return oc;
}

// Invalidate grass tile cache on game reset so new detail seeds apply
function clearTileCache() {
  // Keep the road tile (it doesn't depend on the seed), clear grass only
  for (const key of tileCache.keys()) {
    if (key.startsWith('grass_')) tileCache.delete(key);
  }
}

// ============================================================
//  RENDERING
// ============================================================

function render() {
  ctx.clearRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

  renderLanes();
  renderScenery();
  renderCars();
  renderPlayer();
  renderHUD();

  if (state === 'dying' || state === 'dead') renderGameOver();
}

// --- Lanes ---

function renderLanes() {
  const topRow    = Math.floor(camera.worldPx / CONFIG.tileSize) - 1;
  const bottomRow = topRow + Math.ceil(CONFIG.canvasHeight / CONFIG.tileSize) + 3;

  for (let wr = topRow; wr <= bottomRow; wr++) {
    const lane = getLane(wr);
    const sy   = rowToScreenY(wr);

    if (lane.type === 'grass') {
      renderGrassLane(wr, lane, sy);
    } else if (lane.type === 'road') {
      renderRoadLane(lane, sy);
    } else {
      renderRiverLane(lane, sy, wr);
    }
  }
}

// Blit the cached grass tile then overdraw the live depth strip at the bottom
function renderGrassLane(worldRow, lane, sy) {
  const tile = getGrassTile(worldRow, lane.shade, lane.variant || 'meadow');
  ctx.drawImage(tile, 0, sy);
}

// Road: blit cached base, then draw live lane markings (dashes must scroll)
function renderRoadLane(lane, sy) {
  const roadTile = getRoadTile();
  ctx.drawImage(roadTile, 0, sy);

  // --- Dashed centre stripe (drawn live so it stays world-aligned) ---
  ctx.strokeStyle = CLR.roadStripe;
  ctx.lineWidth   = 2.5;
  ctx.setLineDash([18, 14]);
  // Offset the dash pattern by the camera so dashes don't jump on scroll
  ctx.lineDashOffset = -(camera.worldPx % 32);
  ctx.beginPath();
  ctx.moveTo(0,            sy + TS / 2);
  ctx.lineTo(CANVAS_W,     sy + TS / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // --- Subtle direction arrows ---
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let ax = 30; ax < CANVAS_W; ax += 110) {
    drawRoadArrow(ax, sy + TS / 2, lane.dir);
  }
}

function renderRiverLane(lane, sy, worldRow) {
  const waterGradient = ctx.createLinearGradient(0, sy, 0, sy + TS);
  waterGradient.addColorStop(0, CLR.waterTop);
  waterGradient.addColorStop(1, CLR.waterDeep);
  ctx.fillStyle = waterGradient;
  ctx.fillRect(0, sy, CANVAS_W, TS + DEPTH);

  ctx.strokeStyle = CLR.waterWave;
  ctx.lineWidth = 2;
  for (let x = -20; x < CANVAS_W + 20; x += 76) {
    const waveX = x + ((lane.depth * 11) % 38);
    ctx.beginPath();
    ctx.moveTo(waveX, sy + 17);
    ctx.quadraticCurveTo(waveX + 12, sy + 11, waveX + 24, sy + 17);
    ctx.stroke();
  }

  for (const pad of lane.lilyPads) {
    drawLilyPad(pad.x + pad.w / 2, sy + TS / 2 + LILY_PAD_Y_OFFSET);
  }

  for (const ripple of landingRipples) {
    if (ripple.row !== worldRow) continue;
    const rippleY = sy + TS / 2 + LILY_PAD_Y_OFFSET;
    drawLandingRipple(ripple.x, rippleY, ripple.start);
  }
}

function drawLandingRipple(cx, cy, start) {
  const age = Math.max(0, performance.now() - start);
  const progress = Math.min(age / RIPPLE_DURATION, 1);
  const radiusX = 8 + progress * 25;
  const radiusY = 4 + progress * 9;
  ctx.save();
  ctx.globalAlpha = (1 - progress) * 0.75;
  ctx.strokeStyle = '#c5f4f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 3, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLilyPad(cx, cy) {
  ctx.fillStyle = CLR.lilySide;
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 3, 17, 11, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = CLR.lilyTop;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 17, 11, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = CLR.waterTop;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + 11, cy - 7);
  ctx.lineTo(cx + 8, cy + 3);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = CLR.lilyHighlight;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 3, 7, Math.PI * 1.1, Math.PI * 1.8);
  ctx.stroke();
}

function drawRoadArrow(x, y, dir) {
  const size = 13;
  ctx.save();
  ctx.translate(x, y);
  if (dir < 0) ctx.scale(-1, 1);
  ctx.beginPath();
  ctx.moveTo(0,     -size / 2);
  ctx.lineTo(size,   0);
  ctx.lineTo(0,      size / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- Scenery ---

// Master scenery renderer: iterates visible grass lanes and draws each object.
// Called after renderLanes() so the ground is already painted, and before
// renderCars() and renderPlayer() so objects sit correctly in the z-order.
function renderScenery() {
  const topRow    = Math.floor(camera.worldPx / CONFIG.tileSize) - 1;
  const bottomRow = topRow + Math.ceil(CONFIG.canvasHeight / CONFIG.tileSize) + 3;

  for (let wr = topRow; wr <= bottomRow; wr++) {
    const lane = getLane(wr);
    if (lane.type !== 'grass' || !lane.scenery || lane.scenery.length === 0) continue;

    const laneY = rowToScreenY(wr);

    for (const obj of lane.scenery) {
      // Pixel centre of the tile this object occupies
      const ox = obj.col * TS + TS / 2;
      const oy = laneY + TS / 2;

      if (obj.blocked) drawBlockedTileMarker(ox, oy);

      switch (obj.type) {
        case 'tree':   drawTree(ox, oy);   break;
        case 'bush':   drawBush(ox, oy);   break;
        case 'rock':   drawRock(ox, oy);   break;
        case 'flower': drawFlower(ox, oy, obj.col + wr); break;
        case 'sign':   drawSign(ox, oy);   break;
      }
    }
  }
}

function drawBlockedTileMarker(cx, cy) {
  const markerW = TS * 0.72;
  const markerH = TS * 0.62;
  ctx.fillStyle = 'rgba(20, 35, 14, 0.28)';
  ctx.beginPath();
  ctx.roundRect(cx - markerW / 2, cy - markerH / 2, markerW, markerH, 8);
  ctx.fill();

  ctx.strokeStyle = 'rgba(225, 246, 150, 0.62)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ----------------------------------------------------------------
//  Shared helper: draw an ellipse cast shadow on the ground before
//  the object itself.  offset_x/y follow the top-left light source
//  (shadow falls toward bottom-right).
// ----------------------------------------------------------------
function drawSceneryShadow(cx, baseY, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  ctx.ellipse(cx + 6, baseY + 4, rx, ry, 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// ----------------------------------------------------------------
//  TREE  — chunky 2.5D pine / round-top tree
//  Structure: square trunk with side face + round foliage block
//  with visible top face, right-side face, and front-face extrusion.
// ----------------------------------------------------------------
function drawTree(cx, baseY) {
  const foliageR = 16;    // radius of the foliage blob
  const trunkW   = 10;
  const trunkH   = 12;
  const trunkX   = cx - trunkW / 2;
  const foliageY = baseY - trunkH - foliageR * 0.9;  // centre of foliage

  // Shadow
  drawSceneryShadow(cx, baseY, foliageR * 0.9, foliageR * 0.32);

  // Trunk — front face
  ctx.fillStyle = CLR.treeTrunk;
  ctx.fillRect(trunkX, baseY - trunkH, trunkW, trunkH);

  // Trunk — right-side face (darker)
  ctx.fillStyle = CLR.treeTrunkS;
  ctx.fillRect(trunkX + trunkW, baseY - trunkH + 3, 4, trunkH - 3);

  // Trunk — bottom extrusion
  ctx.fillStyle = darken(CLR.treeTrunkS, 20);
  ctx.fillRect(trunkX, baseY, trunkW + 4, 4);

  // Foliage — right/bottom face (drawn first, behind top face)
  ctx.fillStyle = CLR.treeSide;
  ctx.beginPath();
  ctx.arc(cx + 3, foliageY + 4, foliageR, 0, Math.PI * 2);
  ctx.fill();

  // Foliage — top face (lit)
  ctx.fillStyle = CLR.treeTop;
  ctx.beginPath();
  ctx.arc(cx, foliageY, foliageR, 0, Math.PI * 2);
  ctx.fill();

  // Top-left highlight on foliage
  const treeGrad = ctx.createRadialGradient(
    cx - foliageR * 0.35, foliageY - foliageR * 0.35, foliageR * 0.05,
    cx, foliageY, foliageR
  );
  treeGrad.addColorStop(0,   'rgba(255,255,255,0.20)');
  treeGrad.addColorStop(0.5, 'transparent');
  treeGrad.addColorStop(1,   'rgba(0,0,0,0.25)');
  ctx.fillStyle = treeGrad;
  ctx.beginPath();
  ctx.arc(cx, foliageY, foliageR, 0, Math.PI * 2);
  ctx.fill();

  // Foliage front-face depth strip (bottom edge of the blob)
  ctx.fillStyle = CLR.treeSide;
  ctx.beginPath();
  ctx.ellipse(cx, foliageY + foliageR - 1, foliageR, 5, 0, 0, Math.PI);
  ctx.fill();
}

// ----------------------------------------------------------------
//  BUSH  — lower, rounder than the tree, no trunk
// ----------------------------------------------------------------
function drawBush(cx, baseY) {
  const rX = 14, rY = 11;
  const bushY = baseY - rY * 0.85;

  // Shadow
  drawSceneryShadow(cx, baseY, rX * 0.85, rY * 0.30);

  // Side/bottom face
  ctx.fillStyle = CLR.bushSide;
  ctx.beginPath();
  ctx.ellipse(cx + 3, bushY + 3, rX, rY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top face
  ctx.fillStyle = CLR.bushTop;
  ctx.beginPath();
  ctx.ellipse(cx, bushY, rX, rY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top-left highlight
  const bGrad = ctx.createRadialGradient(
    cx - rX * 0.35, bushY - rY * 0.35, rX * 0.05,
    cx, bushY, rX
  );
  bGrad.addColorStop(0,   'rgba(255,255,255,0.22)');
  bGrad.addColorStop(0.5, 'transparent');
  bGrad.addColorStop(1,   'rgba(0,0,0,0.22)');
  ctx.fillStyle = bGrad;
  ctx.beginPath();
  ctx.ellipse(cx, bushY, rX, rY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bottom extrusion strip
  ctx.fillStyle = CLR.bushSide;
  ctx.beginPath();
  ctx.ellipse(cx, bushY + rY - 1, rX, 4, 0, 0, Math.PI);
  ctx.fill();
}

// ----------------------------------------------------------------
//  ROCK  — flat chunky boulder, slightly wider than tall
// ----------------------------------------------------------------
function drawRock(cx, baseY) {
  const rW = 18, rH = 11;
  const rockY = baseY - rH;

  // Shadow
  drawSceneryShadow(cx, baseY, rW * 0.75, rH * 0.28);

  // Bottom extrusion face
  ctx.fillStyle = CLR.rockSide;
  ctx.beginPath();
  ctx.roundRect(cx - rW / 2 + 2, baseY - 4, rW, 6, 3);
  ctx.fill();

  // Right side face
  ctx.fillStyle = darken(CLR.rockSide, 15);
  ctx.beginPath();
  ctx.roundRect(cx + rW / 2 - 3, rockY + 2, 6, rH - 2, [0, 3, 3, 0]);
  ctx.fill();

  // Top face
  ctx.fillStyle = CLR.rockTop;
  ctx.beginPath();
  ctx.roundRect(cx - rW / 2, rockY, rW, rH, 5);
  ctx.fill();

  // Top-light gradient
  const rGrad = ctx.createLinearGradient(cx - rW / 2, rockY, cx + rW / 2, baseY);
  rGrad.addColorStop(0,   'rgba(255,255,255,0.22)');
  rGrad.addColorStop(0.4, 'transparent');
  rGrad.addColorStop(1,   'rgba(0,0,0,0.20)');
  ctx.fillStyle = rGrad;
  ctx.beginPath();
  ctx.roundRect(cx - rW / 2, rockY, rW, rH, 5);
  ctx.fill();

  // Small top-left highlight dot
  ctx.fillStyle = CLR.rockHigh;
  ctx.beginPath();
  ctx.ellipse(cx - rW * 0.22, rockY + rH * 0.28, 4, 3, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

// ----------------------------------------------------------------
//  FLOWER  — small decorative ground flower, two colour variants
//  seed param gives deterministic colour per placement.
// ----------------------------------------------------------------
function drawFlower(cx, baseY, seed) {
  const petalColor = (seed % 2 === 0) ? CLR.flowerA : CLR.flowerB;
  const stemH  = 8;
  const petalR = 4;
  const flowerY = baseY - stemH - petalR;

  // Stem
  ctx.strokeStyle = CLR.flowerStem;
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, baseY - 2);
  ctx.lineTo(cx, flowerY + petalR);
  ctx.stroke();

  // Petals (4 small ellipses around centre)
  ctx.fillStyle = petalColor;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const px = cx + Math.cos(angle) * petalR * 1.1;
    const py = flowerY + Math.sin(angle) * petalR * 1.1;
    ctx.beginPath();
    ctx.arc(px, py, petalR * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  // Centre
  ctx.fillStyle = '#fff8a0';
  ctx.beginPath();
  ctx.arc(cx, flowerY, petalR * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

// ----------------------------------------------------------------
//  SIGN  — small roadside warning sign on a post
// ----------------------------------------------------------------
function drawSign(cx, baseY) {
  const postW  = 5;
  const postH  = 20;
  const boardW = 22;
  const boardH = 16;
  const postX  = cx - postW / 2;
  const boardX = cx - boardW / 2;
  const boardY = baseY - postH - boardH;

  // Shadow
  drawSceneryShadow(cx, baseY, 10, 4);

  // Post — front face
  ctx.fillStyle = CLR.signPost;
  ctx.fillRect(postX, baseY - postH, postW, postH);

  // Post — right-side face
  ctx.fillStyle = CLR.signPostS;
  ctx.fillRect(postX + postW, baseY - postH + 2, 3, postH);

  // Board — bottom extrusion face
  ctx.fillStyle = CLR.signBoardS;
  ctx.beginPath();
  ctx.roundRect(boardX + 2, boardY + boardH - 2, boardW, 5, [0, 0, 3, 3]);
  ctx.fill();

  // Board — right-side face
  ctx.fillStyle = CLR.signBoardS;
  ctx.beginPath();
  ctx.roundRect(boardX + boardW - 1, boardY + 2, 4, boardH, [0, 3, 3, 0]);
  ctx.fill();

  // Board — front face
  ctx.fillStyle = CLR.signBoard;
  ctx.beginPath();
  ctx.roundRect(boardX, boardY, boardW, boardH, 3);
  ctx.fill();

  // Board top-light gradient
  const sGrad = ctx.createLinearGradient(boardX, boardY, boardX, boardY + boardH);
  sGrad.addColorStop(0,   'rgba(255,255,255,0.20)');
  sGrad.addColorStop(1,   'rgba(0,0,0,0.15)');
  ctx.fillStyle = sGrad;
  ctx.beginPath();
  ctx.roundRect(boardX, boardY, boardW, boardH, 3);
  ctx.fill();

  // Exclamation mark on board
  ctx.fillStyle = CLR.signText;
  ctx.font      = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', cx, boardY + boardH - 4);
  ctx.textAlign = 'left';  // restore
}

// --- Cars ---

function renderCars() {
  const topRow    = Math.floor(camera.worldPx / CONFIG.tileSize) - 1;
  const bottomRow = topRow + Math.ceil(CONFIG.canvasHeight / CONFIG.tileSize) + 3;

  // Two-pass: shadows first, then bodies — so shadows never overdraw car bodies
  for (let wr = topRow; wr <= bottomRow; wr++) {
    const lane = getLane(wr);
    if (lane.type !== 'road') continue;
    const laneY = rowToScreenY(wr);
    for (const car of lane.cars) renderCarShadow(car, laneY);
  }
  for (let wr = topRow; wr <= bottomRow; wr++) {
    const lane = getLane(wr);
    if (lane.type !== 'road') continue;
    const laneY = rowToScreenY(wr);
    for (const car of lane.cars) renderCar(car, laneY);
  }
}

// Cast shadow: stretched ellipse offset bottom-right (top-left light source)
function renderCarShadow(car, laneY) {
  const cx = car.x + car.w / 2 + 8;          // offset right
  const cy = laneY + TS - 5;                  // sits on road surface
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, car.w * 0.52, 6, 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function renderCar(car, laneY) {
  const x  = car.x;
  const w  = car.w;
  const h  = car.h;
  const c  = car.color;

  // Vertical position: centre car in the lane, pushed up slightly
  // to make room for the 3D bottom face below it
  const SIDE_H = Math.round(h * 0.28);        // height of the bottom extrusion
  const y  = laneY + Math.floor((TS - h - SIDE_H) / 2);

  // ---- Roof geometry (varies by style) ----
  let roofW, roofH, roofInset;
  if (car.style === 'sedan') {
    roofW = w * 0.52; roofH = h * 0.50; roofInset = w * 0.22;
  } else if (car.style === 'suv') {
    roofW = w * 0.68; roofH = h * 0.55; roofInset = w * 0.14;
  } else {                                     // truck: long flat cab
    roofW = w * 0.38; roofH = h * 0.52; roofInset = w * 0.04;
  }
  const roofX = x + roofInset;
  const roofY = y - roofH + 4;

  // ================================================================
  //  DRAW ORDER (back-to-front for 2.5D illusion):
  //  1. Bottom extrusion face (darkest — faces away from light)
  //  2. Main body top face
  //  3. Left side face (mid-dark — side light)
  //  4. Roof extrusion bottom face
  //  5. Roof top face
  //  6. Windows
  //  7. Lights
  //  8. Wheels
  //  9. Top-face highlight rim
  // ================================================================

  // 1. Bottom extrusion face
  ctx.fillStyle = darken(c, 55);
  ctx.beginPath();
  ctx.moveTo(x,         y + h);
  ctx.lineTo(x + w,     y + h);
  ctx.lineTo(x + w,     y + h + SIDE_H);
  ctx.lineTo(x,         y + h + SIDE_H);
  ctx.closePath();
  ctx.fill();

  // 2. Main body — top face
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();

  // Top-light gradient on body
  const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
  bodyGrad.addColorStop(0,   'rgba(255,255,255,0.18)');
  bodyGrad.addColorStop(0.4, 'transparent');
  bodyGrad.addColorStop(1,   'rgba(0,0,0,0.20)');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();

  // 3. Left side face (bottom edge of body, faces viewer)
  ctx.fillStyle = darken(c, 35);
  ctx.beginPath();
  ctx.roundRect(x, y + h - 4, w, 4, [0, 0, 3, 3]);
  ctx.fill();

  // 4. Roof extrusion bottom face
  ctx.fillStyle = darken(c, 45);
  ctx.beginPath();
  ctx.roundRect(roofX, roofY + roofH - 3, roofW, 3, 2);
  ctx.fill();

  // 5. Roof top face
  ctx.fillStyle = darken(c, 22);
  ctx.beginPath();
  ctx.roundRect(roofX, roofY, roofW, roofH, 4);
  ctx.fill();

  // Top-light on roof
  const roofGrad = ctx.createLinearGradient(roofX, roofY, roofX, roofY + roofH);
  roofGrad.addColorStop(0,   'rgba(255,255,255,0.16)');
  roofGrad.addColorStop(0.5, 'transparent');
  roofGrad.addColorStop(1,   'rgba(0,0,0,0.12)');
  ctx.fillStyle = roofGrad;
  ctx.beginPath();
  ctx.roundRect(roofX, roofY, roofW, roofH, 4);
  ctx.fill();

  // 6. Windows
  const winPad = 3;
  ctx.fillStyle = 'rgba(170,210,255,0.80)';
  ctx.beginPath();
  ctx.roundRect(roofX + winPad, roofY + winPad, roofW - winPad * 2, roofH - winPad - 1, 3);
  ctx.fill();
  // Window glare
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.roundRect(roofX + winPad + 1, roofY + winPad + 1, roofW * 0.35, 3, 2);
  ctx.fill();

  // Truck: add a second smaller rear window
  if (car.style === 'truck') {
    const rwinX = roofX + roofW + 6;
    const rwinW = w * 0.22;
    if (rwinX + rwinW < x + w - 4) {
      ctx.fillStyle = 'rgba(140,190,235,0.65)';
      ctx.beginPath();
      ctx.roundRect(rwinX, roofY + winPad, rwinW, roofH - winPad - 1, 3);
      ctx.fill();
    }
  }

  // 7. Headlights & taillights
  const lightY = y + h * 0.38;
  const frontX = car.dir > 0 ? x + w - 7 : x + 7;
  const rearX  = car.dir > 0 ? x + 7     : x + w - 7;

  ctx.fillStyle = '#ffffbb';
  ctx.beginPath(); ctx.arc(frontX, lightY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,180,0.45)';
  ctx.beginPath(); ctx.arc(frontX, lightY, 7, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#ff3333';
  ctx.beginPath(); ctx.arc(rearX, lightY, 3.5, 0, Math.PI * 2); ctx.fill();

  // 8. Wheels — four wheels for SUV/truck, two visible for sedan
  const wheelCount = car.style === 'sedan' ? 2 : 4;
  const wheelR     = car.style === 'sedan' ? 6 : 7;
  const wheelY     = y + h + SIDE_H - 2;
  const wheelPositions = wheelCount === 2
    ? [x + 16, x + w - 16]
    : [x + 14, x + Math.floor(w / 2) - 4, x + Math.floor(w / 2) + 4, x + w - 14];

  for (const wx of wheelPositions) {
    // Tyre
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(wx, wheelY, wheelR, 0, Math.PI * 2); ctx.fill();
    // Rim
    ctx.fillStyle = '#888';
    ctx.beginPath(); ctx.arc(wx, wheelY, wheelR - 2, 0, Math.PI * 2); ctx.fill();
    // Hub dot
    ctx.fillStyle = '#ccc';
    ctx.beginPath(); ctx.arc(wx, wheelY, 2, 0, Math.PI * 2); ctx.fill();
  }

  // 9. Thin highlight rim along top-left edge of body
  ctx.strokeStyle = lighten(c, 40);
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 5,     y + 1);
  ctx.lineTo(x + w - 5, y + 1);
  ctx.stroke();
}

// ============================================================
//  COLOUR UTILITIES
// ============================================================

// Parse '#rrggbb' → {r, g, b}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// Darken a hex colour by a 0-255 amount
function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return '#' + [
    Math.max(0, r - amount),
    Math.max(0, g - amount),
    Math.max(0, b - amount),
  ].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Lighten a hex colour by a 0-255 amount
function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return '#' + [
    Math.min(255, r + amount),
    Math.min(255, g + amount),
    Math.min(255, b + amount),
  ].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Mix two hex colours by factor t (0 = full a, 1 = full b)
function mixColors(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return '#' + ['r','g','b'].map(c =>
    Math.round(a[c] + (b[c] - a[c]) * t).toString(16).padStart(2,'0')
  ).join('');
}

// Hex colour → CSS rgba string with given opacity
function hexAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// --- Player (blocky 2.5D chicken) ---

function renderPlayer() {
  // hopT drives the leg animation (0 at rest, peaks at 0.5)
  const hopT = player.hopping ? player.hopT : 0;

  if (state === 'playing') {
    drawChicken(player.px, player.py, player.facing, hopT);
    return;
  }

  const progress = Math.min(
    (performance.now() - deathAnimation.start) / deathAnimation.duration,
    1
  );
  const deathY = deathAnimation.type === 'water'
    ? player.py + progress * 24
    : player.py;
  const rotation = deathAnimation.type === 'car'
    ? progress * Math.PI / 2
    : 0;

  ctx.save();
  ctx.translate(player.px, deathY);
  ctx.rotate(rotation);
  if (deathAnimation.type === 'water') {
    ctx.globalAlpha = 1 - progress * 0.75;
    ctx.scale(1 - progress * 0.28, 1 - progress * 0.28);
  }
  ctx.translate(-player.px, -deathY);
  drawChicken(player.px, deathY, player.facing, 0);
  ctx.restore();
}

// ----------------------------------------------------------------
//  drawChicken  —  pseudo-3D blocky chicken
//
//  facing: 'up' | 'down' | 'left' | 'right'
//  hopT:   0-1 progress of current hop (0 when idle)
//
//  Each facing direction is drawn as a distinct upright pose —
//  NO canvas rotation is used, so the chicken never lies sideways.
//  Left/right use the side profile.
//  Up uses a rear/back view.
//  Down uses a front/face-on view.
//
//  All views share the same body dimensions, shadow, leg animation,
//  and lighting approach for visual consistency.
// ----------------------------------------------------------------
function drawChicken(cx, cy, facing, hopT) {
  const s = player.size;   // ~50px

  // ---- Shared geometry (same for all 4 directions) ----
  const bW   = s * 0.60;   // body width  (slightly narrower than before for upright look)
  const bH   = s * 0.64;   // body height (taller than wide → upright block)
  const bX   = cx - bW / 2;
  const bY   = cy - bH * 0.72;   // head+body sit above cy; cy is roughly at waist
  const SIDE = s * 0.10;         // 3D bottom extrusion depth
  const headR = s * 0.20;

  // ---- Shadow ----
  const airFraction  = Math.sin(hopT * Math.PI);
  const shadowScaleX = 1.0 - airFraction * 0.35;
  const shadowScaleY = 1.0 - airFraction * 0.50;
  const shadowAlpha  = 0.28 - airFraction * 0.14;
  const shadowOffX   = 6 + airFraction * 8;
  const shadowOffY   = 4 + airFraction * 6;

  ctx.save();
  ctx.globalAlpha = shadowAlpha;
  ctx.fillStyle   = '#000';
  ctx.beginPath();
  ctx.ellipse(
    cx + shadowOffX, cy + s * 0.38 + shadowOffY,
    s * 0.36 * shadowScaleX,
    s * 0.12 * shadowScaleY,
    0, 0, Math.PI * 2
  );
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ---- Leg animation ----
  const legSwing = Math.sin(hopT * Math.PI * 2) * 8;
  const legLift  = Math.max(0, Math.sin(hopT * Math.PI)) * 6;
  const legY0    = bY + bH + SIDE;   // ankle root (below extrusion)

  // ---- Draw legs (behind body — drawn first) ----
  ctx.strokeStyle = CLR.pFoot;
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  if (facing === 'left' || facing === 'right') {
    // Side view: legs swing forward/back
    const dir = facing === 'right' ? 1 : -1;
    const lx  = cx - 8;
    const rx  = cx + 4;
    ctx.beginPath();
    ctx.moveTo(lx,                  legY0);
    ctx.lineTo(lx + legSwing * dir, legY0 + 7 - legLift);
    ctx.lineTo(lx + legSwing * dir - 5 * dir, legY0 + 7 - legLift);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx,                   legY0);
    ctx.lineTo(rx - legSwing * dir,  legY0 + 7 + legLift);
    ctx.lineTo(rx - legSwing * dir + 5 * dir, legY0 + 7 + legLift);
    ctx.stroke();
  } else {
    // Front/back view: legs spread slightly, swing up/down
    const lx = cx - 10;
    const rx = cx + 4;
    ctx.beginPath();
    ctx.moveTo(lx, legY0);
    ctx.lineTo(lx - 2,  legY0 + 7 - legLift);
    ctx.lineTo(lx - 7,  legY0 + 7 - legLift);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx, legY0);
    ctx.lineTo(rx + 2,  legY0 + 7 + legLift);
    ctx.lineTo(rx + 7,  legY0 + 7 + legLift);
    ctx.stroke();
  }

  // ================================================================
  //  BODY — shared across all 4 directions
  // ================================================================

  // Bottom extrusion face
  ctx.fillStyle = CLR.pBodyBot;
  ctx.beginPath();
  ctx.roundRect(bX, bY + bH, bW, SIDE, [0, 0, 3, 3]);
  ctx.fill();

  // Body top face
  ctx.fillStyle = CLR.pBody;
  ctx.beginPath();
  ctx.roundRect(bX, bY, bW, bH, 6);
  ctx.fill();

  // Top-light gradient
  const bGrad = ctx.createLinearGradient(bX, bY, bX, bY + bH);
  bGrad.addColorStop(0,    'rgba(255,255,255,0.20)');
  bGrad.addColorStop(0.45, 'transparent');
  bGrad.addColorStop(1,    'rgba(0,0,0,0.18)');
  ctx.fillStyle = bGrad;
  ctx.beginPath();
  ctx.roundRect(bX, bY, bW, bH, 6);
  ctx.fill();

  // ================================================================
  //  DIRECTION-SPECIFIC details
  // ================================================================

  if (facing === 'right' || facing === 'left') {
    // ---- SIDE VIEW (left mirrors right via transform on just this block) ----
    const flip = facing === 'left';
    const sign = flip ? -1 : 1;
    // Mirror around cx for left-facing
    const sx = (lx) => flip ? cx + (cx - lx) - bW * 0.00 : lx;  // manual flip helper
    // Instead of flipping canvas, we just negate x offsets relative to cx:
    const ox = (offset) => cx + offset * sign;  // canvas x from signed offset

    // Right-side face (the far side from light — darker)
    const sideX = flip ? bX : bX + bW - 4;
    ctx.fillStyle = CLR.pBodySide;
    ctx.beginPath();
    ctx.roundRect(sideX, bY + 4, 4, bH - 8, flip ? [3, 0, 0, 3] : [0, 3, 3, 0]);
    ctx.fill();

    // Wing
    const wingCX = ox(bW * 0.04);
    const wingCY = bY + bH * 0.42;
    ctx.fillStyle = CLR.pWing;
    ctx.beginPath();
    ctx.ellipse(wingCX, wingCY, bW * 0.26, bH * 0.20, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CLR.pWingSide;
    ctx.beginPath();
    ctx.ellipse(wingCX + 2 * sign, wingCY + 4, bW * 0.22, bH * 0.13, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(wingCX - 4 * sign, wingCY - bH * 0.08, bW * 0.10, bH * 0.07, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // Head — offset toward the facing direction
    const headCX = ox(bW * 0.22);
    const headCY = bY - headR * 0.45;

    // Head bottom shadow
    ctx.fillStyle = darken(CLR.pBody, 25);
    ctx.beginPath();
    ctx.ellipse(headCX, headCY + headR + 2, headR * 0.82, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = CLR.pBody;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.fill();
    const hGrad = ctx.createRadialGradient(
      headCX - headR * 0.3 * sign, headCY - headR * 0.3, headR * 0.1,
      headCX, headCY, headR
    );
    hGrad.addColorStop(0,   'rgba(255,255,255,0.22)');
    hGrad.addColorStop(0.6, 'transparent');
    hGrad.addColorStop(1,   'rgba(0,0,0,0.20)');
    ctx.fillStyle = hGrad;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Comb
    ctx.fillStyle = CLR.pComb;
    ctx.beginPath();
    ctx.roundRect(headCX - 4, headCY - headR - 9, 9, 10, 3);
    ctx.fill();
    ctx.fillStyle = CLR.pCombSide;
    const csX = flip ? headCX - 7 : headCX + 3;
    ctx.beginPath();
    ctx.roundRect(csX, headCY - headR - 7, 3, 8, flip ? [2, 0, 0, 2] : [0, 2, 2, 0]);
    ctx.fill();

    // Beak
    const bkX = headCX + (headR - 1) * sign;
    const bkY = headCY + 1;
    ctx.fillStyle = CLR.pBeak;
    ctx.beginPath();
    ctx.moveTo(bkX,           bkY - 4);
    ctx.lineTo(bkX + 10*sign, bkY);
    ctx.lineTo(bkX,           bkY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = darken(CLR.pBeak, 25);
    ctx.beginPath();
    ctx.moveTo(bkX,           bkY);
    ctx.lineTo(bkX + 10*sign, bkY);
    ctx.lineTo(bkX,           bkY + 4);
    ctx.closePath();
    ctx.fill();

    // Eye
    const eyeCX = headCX + headR * 0.42 * sign;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(eyeCX, headCY - 1, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CLR.pEye;
    ctx.beginPath(); ctx.arc(eyeCX + sign * 0.8, headCY - 1, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(eyeCX - sign * 0.5, headCY - 2.5, 1, 0, Math.PI * 2); ctx.fill();

  } else if (facing === 'up') {
    // ---- REAR / BACK VIEW ----
    // Chicken walks away from viewer — we see only its back.
    // No eyes, no beak, no front-facing features.
    // Comb visible from behind. Tail stub at body bottom.
    // Wings on both sides. Head is plain round back with subtle feather shading.

    // Back-side shading strip (right edge, away from light)
    ctx.fillStyle = CLR.pBodySide;
    ctx.beginPath();
    ctx.roundRect(bX + bW - 4, bY + 4, 4, bH - 8, [0, 3, 3, 0]);
    ctx.fill();

    // Tail feather stub — small rounded bump at bottom of body
    ctx.fillStyle = darken(CLR.pBody, 15);
    ctx.beginPath();
    ctx.ellipse(cx, bY + bH - 4, bW * 0.22, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Wings — visible on both sides as side bumps
    for (const side of [-1, 1]) {
      const wingX = cx + side * (bW * 0.42);
      const wingY = bY + bH * 0.45;
      ctx.fillStyle = CLR.pWing;
      ctx.beginPath();
      ctx.ellipse(wingX, wingY, 6, bH * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wing shading on outer edge
      ctx.fillStyle = CLR.pWingSide;
      ctx.beginPath();
      ctx.ellipse(wingX + side * 2, wingY + 3, 4, bH * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head — centred, above body
    const headCX = cx;
    const headCY = bY - headR * 0.45;

    // Head bottom shadow ellipse
    ctx.fillStyle = darken(CLR.pBody, 25);
    ctx.beginPath();
    ctx.ellipse(headCX, headCY + headR + 2, headR * 0.82, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head — back of head is darker, lit only from top-left edge
    ctx.fillStyle = CLR.pBody;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Rear-view shading: darker overall, small top-left highlight only
    const hGrad = ctx.createRadialGradient(
      headCX - headR * 0.4, headCY - headR * 0.4, headR * 0.05,
      headCX, headCY, headR
    );
    hGrad.addColorStop(0,   'rgba(255,255,255,0.14)');
    hGrad.addColorStop(0.4, 'transparent');
    hGrad.addColorStop(1,   'rgba(0,0,0,0.32)');
    ctx.fillStyle = hGrad;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Subtle back-of-head feather lines — two short curved strokes
    ctx.strokeStyle = darken(CLR.pBody, 22);
    ctx.lineWidth   = 1.2;
    ctx.lineCap     = 'round';
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.arc(headCX + i * headR * 0.28, headCY + headR * 0.05, headR * 0.30, Math.PI * 0.6, Math.PI * 1.1);
      ctx.stroke();
    }

    // Comb — centred on top, visible from behind (slightly darker than front)
    ctx.fillStyle = darken(CLR.pComb, 15);
    ctx.beginPath();
    ctx.roundRect(headCX - 4, headCY - headR - 9, 9, 10, 3);
    ctx.fill();

  } else {
    // ---- FRONT VIEW (facing === 'down') ----
    // Chicken walks toward the viewer — full face visible.
    // Beak in centre, both eyes, wattle, wings on both sides.

    // Front-face side shading (right edge away from light)
    ctx.fillStyle = CLR.pBodySide;
    ctx.beginPath();
    ctx.roundRect(bX + bW - 4, bY + 4, 4, bH - 8, [0, 3, 3, 0]);
    ctx.fill();

    // Wings — bumps on both sides
    for (const side of [-1, 1]) {
      const wingX = cx + side * (bW * 0.42);
      const wingY = bY + bH * 0.42;
      ctx.fillStyle = CLR.pWing;
      ctx.beginPath();
      ctx.ellipse(wingX, wingY, 7, bH * 0.23, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CLR.pWingSide;
      ctx.beginPath();
      ctx.ellipse(wingX + side * 2, wingY + 3, 5, bH * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head — centred, above body
    const headCX = cx;
    const headCY = bY - headR * 0.45;

    ctx.fillStyle = darken(CLR.pBody, 18);
    ctx.beginPath();
    ctx.ellipse(headCX, headCY + headR + 2, headR * 0.82, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CLR.pBody;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Head lighting — top-left lit, brighter than rear view
    const hGrad = ctx.createRadialGradient(
      headCX - headR * 0.35, headCY - headR * 0.35, headR * 0.1,
      headCX, headCY, headR
    );
    hGrad.addColorStop(0,   'rgba(255,255,255,0.24)');
    hGrad.addColorStop(0.55, 'transparent');
    hGrad.addColorStop(1,   'rgba(0,0,0,0.18)');
    ctx.fillStyle = hGrad;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Comb — centred on top
    ctx.fillStyle = CLR.pComb;
    ctx.beginPath();
    ctx.roundRect(headCX - 4, headCY - headR - 9, 9, 10, 3);
    ctx.fill();
    // Comb right-side face
    ctx.fillStyle = CLR.pCombSide;
    ctx.beginPath();
    ctx.roundRect(headCX + 3, headCY - headR - 7, 3, 8, [0, 2, 2, 0]);
    ctx.fill();

    // Beak — small downward-pointing triangle in centre
    const bkX = headCX;
    const bkY = headCY + headR * 0.35;
    ctx.fillStyle = CLR.pBeak;
    ctx.beginPath();
    ctx.moveTo(bkX - 5, bkY);
    ctx.lineTo(bkX + 5, bkY);
    ctx.lineTo(bkX,     bkY + 8);
    ctx.closePath();
    ctx.fill();
    // Lower beak shade
    ctx.fillStyle = darken(CLR.pBeak, 25);
    ctx.beginPath();
    ctx.moveTo(bkX - 5, bkY + 2);
    ctx.lineTo(bkX + 5, bkY + 2);
    ctx.lineTo(bkX,     bkY + 8);
    ctx.closePath();
    ctx.fill();

    // Wattle — small red blob under beak
    ctx.fillStyle = CLR.pComb;
    ctx.beginPath();
    ctx.ellipse(headCX, bkY + 10, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Two eyes — symmetrical
    for (const side of [-1, 1]) {
      const eyeCX = headCX + side * headR * 0.50;
      const eyeCY = headCY - headR * 0.05;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(eyeCX, eyeCY, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = CLR.pEye;
      ctx.beginPath(); ctx.arc(eyeCX, eyeCY, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(eyeCX - side * 0.8, eyeCY - 1.2, 1, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// --- HUD (score display) ---

function renderHUD() {
  ctx.fillStyle    = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 160, 64, 8);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font      = 'bold 22px sans-serif';
  ctx.fillText(`Score: ${score.val}`, 22, 36);

  ctx.fillStyle = '#aaaaff';
  ctx.font      = '16px sans-serif';
  ctx.fillText(`Best:  ${score.best}`, 22, 60);
}

// --- Game Over overlay ---

function renderGameOver() {
  // Dim
  ctx.fillStyle = 'rgba(0,0,0,0.60)';
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

  // Panel
  const pw = 420, ph = 200;
  const px = (CONFIG.canvasWidth  - pw) / 2;
  const py = (CONFIG.canvasHeight - ph) / 2;

  ctx.fillStyle = 'rgba(20,20,40,0.92)';
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.fill();

  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.stroke();

  ctx.textAlign = 'center';

  ctx.fillStyle = '#ff4444';
  ctx.font      = 'bold 48px sans-serif';
  ctx.fillText('GAME OVER', CONFIG.canvasWidth / 2, py + 68);

  ctx.fillStyle = '#ffffff';
  ctx.font      = '22px sans-serif';
  ctx.fillText(`Score: ${score.val}   Best: ${score.best}`, CONFIG.canvasWidth / 2, py + 116);

  ctx.fillStyle = '#aaffaa';
  ctx.font      = '18px sans-serif';
  ctx.fillText('Press  Enter  or  Space  to restart', CONFIG.canvasWidth / 2, py + 158);

  ctx.textAlign = 'left'; // reset
}

// ============================================================
//  GAME LOOP
// ============================================================

function gameLoop(timestamp) {
  try {
    update(timestamp);
    render();
  } catch (err) {
    console.error('Game loop error:', err);
  }
  requestAnimationFrame(gameLoop);
}

// ============================================================
//  INIT
// ============================================================

resetGame();
requestAnimationFrame(gameLoop);
