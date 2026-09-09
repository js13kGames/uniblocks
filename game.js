import * as LJS from './littlejs.esm.js';
import { Unicorn } from './unicorn.js';
const { vec2, rgb, hsl } = LJS;
const GRID_COLS = 6;
const GRID_ROWS = 12;
const PANEL_WIDTH = 3.5;
const TOP_MARGIN = 1.5;
const BOTTOM_MARGIN = .5;
const WORLD_WIDTH = GRID_COLS + PANEL_WIDTH;
const WORLD_HEIGHT = GRID_ROWS + TOP_MARGIN + BOTTOM_MARGIN;
const CANVAS_W = 1000, CANVAS_H = 1400;
const CAMERA_SCALE = CANVAS_H/WORLD_HEIGHT;
const WORLD_CENTER_Y = (GRID_ROWS + TOP_MARGIN - BOTTOM_MARGIN) / 2;
const TICK_INTERVAL = 2.5;         
const SWAP_TIME = .2;            
const HOVER_TIME = 1;            
const HOVER_HEIGHT = .8;        
const DROP_SPEED = 7;      
const BOMB_CRACK_COUNT = 3;  
const RAINBOW_TICKS = 25;
const RAINBOW_TICKS_FAST = 10;
const BEST_KEY = 'unigameBestV2';
const WON_KEY = 'unigameWonV2';
const LEVEL_KEY = 'unigameLevelV2';
const WHITE = rgb(1,1,1);
const BLOCK_COLORS =
[
    rgb(.95,.15,.15), // red
    rgb(1,.55,.1),    // orange
    rgb(1,.85,.15),   // yellow
    rgb(.2,.8,.3),    // green
    rgb(.2,.55,1),    // blue
    rgb(.65,.3,.9),   // purple
];
// each level: win at `tick` ticks survived, bomb strikes a cell every `bomb` ticks without a match,
// `wall` is the base tick-interval between wall rises (lower = faster), `fall` is the max concurrent falling blocks
const LEVELS =
[
    {tick:40, bomb:7, wall:3, fall:1}, //lv 1
    {tick:50, bomb:7, wall:3, fall:1}, //lv 2
    {tick:60, bomb:7,  wall:2.5, fall:2}, //lv 3
    {tick:60, bomb:6,  wall:2.5, fall:2}, //lv 4
    {tick:70, bomb:6,  wall:2, fall:3}, //lv 5
    {tick:70, bomb:6,  wall:2, fall:3}, //lv 6
    {tick:80, bomb:5,  wall:2.5, fall:3}, //lv 7
    {tick:80, bomb:5,  wall:1.5, fall:3}, //lv 8
    {tick:90, bomb:4,  wall:1, fall:4}, //lv 9
    {tick:100, bomb:3,  wall:.50, fall:5}, //lv 10
];
const PLAY_BTN = {pos: vec2(3,2.2), w:3.2, h:1.2};
// in-game side panel buttons (world-space), sit below the unicorn's road
const PANEL_BTN_PRIMARY = {pos: vec2(GRID_COLS+PANEL_WIDTH/2, 2.6), w:2.8, h:1.0};
const PANEL_BTN_MENU    = {pos: vec2(GRID_COLS+PANEL_WIDTH/2, 1.3), w:2.8, h:1.0};
// splash screen — screen-space coords (pixels)
const SPLASH_BTN = {x:CANVAS_W/2, y:840, w:320, h:100};
const SPLASH_LVL_LEFT  = {x:CANVAS_W/2-190, y:970};
const SPLASH_LVL_RIGHT = {x:CANVAS_W/2+190, y:970};
const SPLASH_LVL_ARROW_HIT = 70; // px radius for arrow tap
const sound_goodMove = new LJS.Sound([.4,.2,250,.04,,.04,,,1,,,,,3]);
const sound_badMove  = new LJS.Sound([,,700,,,.07,,,,3.7,,,,3,,,.1]);
const sound_bomb      = new LJS.Sound([1.5,.1,90,.02,.02,.2,4,.3,,,,,.05]);
const sound_wallRise   = new LJS.Sound([.3,,150,.02,.05,.15,,.2]);
let grid; 
let fallingBlocks;   
let swapAnim;   
let dragStart;   
let draggingFb;   
let cursorPos;     
let selectedPos;   
let lastSpawnColumn;
let tickCount, tickTimer, wallInsertCounter, noMoveTicks;
let rainbowProgress, fastRainbowFlag;
let score, bestScores, levelWon;
let curLevel, menuLevel;
let gameState; // 'menu' | 'playing' | 'paused' | 'won' | 'lost'
let unicorn;
let splashUnicorn; // separate unicorn instance living in screen-space (drawn via drawImage manually)

function getCell(x,y)
{
    if (x<0 || x>=GRID_COLS || y<0 || y>=GRID_ROWS) return null;
    return grid[x+y*GRID_COLS];
}
function setCell(x,y,cell) { grid[x+y*GRID_COLS] = cell; }
function colorAt(x,y)
{
    const c = getCell(x,y);
    return c && !c.cracked && !c.rainbow ? c.color : -1;
}
function lowestEmptyRow(col)
{
    for (let y=0; y<GRID_ROWS; ++y)
        if (!getCell(col,y)) return y;
    return -1;
}
function cellCenter(pos) { return vec2(pos.x+.5, pos.y+.5); }
function lerpVec(a,b,p) { return vec2(LJS.lerp(a.x,b.x,p), LJS.lerp(a.y,b.y,p)); }

function computeColorCount(tick) { return Math.min(6, 4 + Math.floor(tick/25)); }
function computeWallInterval(level, tick)
{
    const base = LEVELS[level].wall;
    return tick>=75 ? Math.max(1, base-2) : tick>=40 ? Math.max(1, base-1) : base;
}

function dangerRatio()
{
    for (let y=GRID_ROWS-1; y>=0; --y)
        for (let x=0; x<GRID_COLS; ++x)
            if (getCell(x,y)) return (y+1)/GRID_ROWS;
    return 0;
}

// converts a world-space point (using the same fixed camera as the engine) to screen pixels,
// so we can line up drawTextScreen labels with world-space rects/buttons
function worldToScreenLocal(p)
{
    return vec2(
        CANVAS_W/2 + (p.x-WORLD_WIDTH/2)*CAMERA_SCALE,
        CANVAS_H/2 - (p.y-WORLD_CENTER_Y)*CAMERA_SCALE
    );
}
function pointInWorldRect(p, center, w, h)
{
    return p.x>=center.x-w/2 && p.x<=center.x+w/2 && p.y>=center.y-h/2 && p.y<=center.y+h/2;
}
function drawButton(center, w, h, color, label, size=36, labelColor=rgb(0,0,0,.85))
{
    LJS.drawRect(center, vec2(w,h), color);
    LJS.drawTextScreen(label, worldToScreenLocal(center), size, labelColor);
}
function drawPanelButtons()
{
    if (gameState === 'playing')
        drawButton(PANEL_BTN_PRIMARY.pos, PANEL_BTN_PRIMARY.w, PANEL_BTN_PRIMARY.h, rgb(1,.7,.2,.9), 'PAUSE', 30);
    else if (gameState === 'paused')
        drawButton(PANEL_BTN_PRIMARY.pos, PANEL_BTN_PRIMARY.w, PANEL_BTN_PRIMARY.h, rgb(.2,.8,.3,.9), 'RESUME', 28);
    else if (gameState === 'won')
    {
        const isLastLevel = curLevel === LEVELS.length-1;
        drawButton(PANEL_BTN_PRIMARY.pos, PANEL_BTN_PRIMARY.w, PANEL_BTN_PRIMARY.h,
            isLastLevel ? rgb(.5,.5,.5,.6) : rgb(.2,.8,.3,.9), 'CONTINUE', 24,
            isLastLevel ? rgb(0,0,0,.4) : rgb(0,0,0,.85));
    }
    else if (gameState === 'lost')
        drawButton(PANEL_BTN_PRIMARY.pos, PANEL_BTN_PRIMARY.w, PANEL_BTN_PRIMARY.h, rgb(1,.4,.4,.9), 'RESTART', 26);

    drawButton(PANEL_BTN_MENU.pos, PANEL_BTN_MENU.w, PANEL_BTN_MENU.h, rgb(.3,.5,.9,.9), 'MENU', 30);
}

function gameInit()
{
    LJS.setCanvasPixelated(true);
    LJS.setCanvasFixedSize(vec2(CANVAS_W, CANVAS_H));
    LJS.setCanvasClearColor(rgb(.08,.08,.14));

    bestScores = JSON.parse(localStorage[BEST_KEY] || '[]');
    while (bestScores.length < LEVELS.length) bestScores.push(0);
    levelWon = JSON.parse(localStorage[WON_KEY] || '[]');
    while (levelWon.length < LEVELS.length) levelWon.push(false);
    menuLevel = Math.min(LEVELS.length-1, Math.max(0, +localStorage[LEVEL_KEY] || 0));
    menuLevel = Math.min(menuLevel, maxUnlockedLevel());
    curLevel = menuLevel;

    LJS.setCameraPos(vec2(WORLD_WIDTH/2, WORLD_CENTER_Y));
    LJS.setCameraScale(CAMERA_SCALE);

    unicorn = new Unicorn(
        vec2(GRID_COLS + PANEL_WIDTH/2, GRID_ROWS/2),
        PANEL_WIDTH - .3,
        { left: GRID_COLS, right: GRID_COLS + PANEL_WIDTH, top: GRID_ROWS, bottom: 0 }
    );
    // Splash unicorn sits near the top of the screen, static, with its victory rainbow always shown
    splashUnicorn = new Unicorn(
        vec2(WORLD_WIDTH/2, 9.2),
        3,
        null,
        true
    );
    gameState = 'splash';
}
function gameReset()
{
    grid = new Array(GRID_COLS*GRID_ROWS).fill(null);
    fallingBlocks = [];
    swapAnim = null;
    dragStart = null;
    draggingFb = null;
    selectedPos = null;
    cursorPos = {x: (GRID_COLS/2)|0, y: (GRID_ROWS/2)|0};
    lastSpawnColumn = -1;
    tickCount = 0;
    tickTimer = 0;
    wallInsertCounter = 0;
    noMoveTicks = 0;
    rainbowProgress = 0;
    fastRainbowFlag = false;
    score = 0;
    gameState = 'playing';
    if (unicorn) unicorn.setWon(false);
}
function startLevel(idx)
{
    curLevel = idx;
    localStorage[LEVEL_KEY] = idx;
    gameReset();
}
// a level is unlocked once every level before it has been won
function maxUnlockedLevel()
{
    let idx = 0;
    while (idx < LEVELS.length-1 && levelWon[idx]) ++idx;
    return idx;
}
function onTick()
{
    if (gameState !== 'playing') return;
    ++tickCount;

    if (++wallInsertCounter >= computeWallInterval(curLevel, tickCount))
    {
        wallInsertCounter = 0;
        insertWallRow();
        if (gameState !== 'playing') return;
    }

    trySpawnFallingBlock();

    if (++noMoveTicks >= LEVELS[curLevel].bomb)
    {
        noMoveTicks = 0;
        triggerBomb();
    }

    if (tickCount >= LEVELS[curLevel].tick)
        gameOver(true);
}
function insertWallRow()
{
    for (let x=0; x<GRID_COLS; ++x)
        if (getCell(x,GRID_ROWS-1)) { gameOver(false); return; }

    for (let y=GRID_ROWS-1; y>0; --y)
        for (let x=0; x<GRID_COLS; ++x)
            setCell(x,y, getCell(x,y-1));

    const colorCount = computeColorCount(tickCount);
    for (let x=0; x<GRID_COLS; ++x)
        setCell(x,0, {color:LJS.randInt(colorCount), cracked:false, rainbow:false});
    for (const fb of fallingBlocks) fb.pos.y += 1;

    sound_wallRise.play();
}
function trySpawnFallingBlock()
{
    if (fallingBlocks.length >= LEVELS[curLevel].fall) return;
    const candidates = [];
    for (let x=0; x<GRID_COLS; ++x)
        if (!getCell(x,GRID_ROWS-1)) candidates.push(x);
    if (!candidates.length) return;

    let col = candidates[LJS.randInt(candidates.length)];
    if (candidates.length>1 && col===lastSpawnColumn)
        col = candidates[LJS.randInt(candidates.length)];
    lastSpawnColumn = col;

    let rainbow = false;
    const threshold = fastRainbowFlag ? RAINBOW_TICKS_FAST : RAINBOW_TICKS;
    if (rainbowProgress >= threshold)
    {
        rainbow = true;
        rainbowProgress = 0;
        fastRainbowFlag = false;
    }
    fallingBlocks.push({
        col, pos: vec2(col+.5, GRID_ROWS+HOVER_HEIGHT),
        state: 'hover', hoverTimer: HOVER_TIME,
        color: rainbow ? 0 : LJS.randInt(computeColorCount(tickCount)),
        rainbow
    });
}
function triggerBomb()
{
    const candidates = [];
    for (let y=0; y<GRID_ROWS; ++y)
    for (let x=0; x<GRID_COLS; ++x)
    {
        const c = getCell(x,y);
        if (c && !c.cracked && !c.rainbow) candidates.push([x,y]);
    }
    if (!candidates.length) return;

    const count = Math.min(BOMB_CRACK_COUNT, candidates.length);
    for (let i=0; i<count; ++i)
    {
        const idx = LJS.randInt(candidates.length);
        const [x,y] = candidates.splice(idx,1)[0];
        getCell(x,y).cracked = true;
    }
    sound_bomb.play();
    unicorn.triggerSad();
}
function setFallingBlockColumn(fb, col)
{
    col = Math.max(0, Math.min(GRID_COLS-1, col));
    if (col === fb.col) return;
    if (fb.state === 'dropping')
    {
        // block the move if the new column is already stacked up to (or above) the block's current height
        const targetRow = lowestEmptyRow(col);
        if (targetRow === -1 || targetRow+.5 >= fb.pos.y) return;
    }
    fb.col = col;
}
function moveFallingBlock(fb, dir) { setFallingBlockColumn(fb, fb.col+dir); }
function updateFallingBlocks(dt)
{
    for (let i=fallingBlocks.length-1; i>=0; --i)
    {
        const fb = fallingBlocks[i];
        fb.pos.x = LJS.lerp(fb.pos.x, fb.col+.5, .35);

        if (fb.state === 'hover')
        {
            fb.hoverTimer -= dt;
            if (fb.hoverTimer <= 0) fb.state = 'dropping';
            continue;
        }

        const targetRow = lowestEmptyRow(fb.col);
        if (targetRow === -1)
        {
            gameOver(false);
            fallingBlocks.splice(i,1);
            continue;
        }
        const targetY = targetRow + .5;
        fb.pos.y -= DROP_SPEED*dt;
        if (fb.pos.y <= targetY)
        {
            setCell(fb.col, targetRow, {color:fb.color, cracked:false, rainbow:fb.rainbow});
            fallingBlocks.splice(i,1);
        }
    }
}
function attemptSwap(a,b)
{
    if (swapAnim) return;
    if (Math.abs(a.x-b.x)+Math.abs(a.y-b.y) !== 1) return;
    const cellA = getCell(a.x,a.y), cellB = getCell(b.x,b.y);
    if (!cellA || !cellB || cellA.cracked || cellB.cracked) return;

    setCell(a.x,a.y,cellB);
    setCell(b.x,b.y,cellA);
    swapAnim = {posA:{x:a.x,y:a.y}, posB:{x:b.x,y:b.y}, t:0, reverse:false};
}
function updateSwapAnim(dt)
{
    if (!swapAnim) return;
    swapAnim.t += dt/SWAP_TIME;
    if (swapAnim.t < 1) return;
    swapAnim.t = 1;

    if (swapAnim.reverse) { swapAnim = null; return; }

    const {posA, posB} = swapAnim;
    const cellA = getCell(posA.x,posA.y), cellB = getCell(posB.x,posB.y);
    let handled = false;
    if (cellA && cellA.rainbow) { resolveRainbow(posA,posB); handled = true; }
    else if (cellB && cellB.rainbow) { resolveRainbow(posB,posA); handled = true; }
    else
    {
        const {removeSet, maxRun} = findMatches();
        if (removeSet.size) { applyRemoval(removeSet, maxRun); handled = true; }
    }
    if (handled) { swapAnim = null; return; }

    const ca = getCell(posA.x,posA.y), cb = getCell(posB.x,posB.y);
    setCell(posA.x,posA.y,cb);
    setCell(posB.x,posB.y,ca);
    swapAnim.reverse = true;
    swapAnim.t = 0;
    sound_badMove.play();
}
function findMatches()
{
    const removeSet = new Set();
    let maxRun = 0;

    for (let y=0; y<GRID_ROWS; ++y)
    {
        let runColor=-1, runStart=0, runLen=0;
        for (let x=0; x<=GRID_COLS; ++x)
        {
            const color = x<GRID_COLS ? colorAt(x,y) : -1;
            if (color!==-1 && color===runColor) ++runLen;
            else
            {
                if (runColor!==-1 && runLen>=3)
                {
                    maxRun = Math.max(maxRun, runLen);
                    for (let k=0; k<runLen; ++k) removeSet.add((runStart+k)+y*GRID_COLS);
                }
                runColor = color; runStart = x; runLen = 1;
            }
        }
    }
    for (let x=0; x<GRID_COLS; ++x)
    {
        let runColor=-1, runStart=0, runLen=0;
        for (let y=0; y<=GRID_ROWS; ++y)
        {
            const color = y<GRID_ROWS ? colorAt(x,y) : -1;
            if (color!==-1 && color===runColor) ++runLen;
            else
            {
                if (runColor!==-1 && runLen>=3)
                {
                    maxRun = Math.max(maxRun, runLen);
                    for (let k=0; k<runLen; ++k) removeSet.add(x+(runStart+k)*GRID_COLS);
                }
                runColor = color; runStart = y; runLen = 1;
            }
        }
    }
    return {removeSet, maxRun};
}
function applyRemoval(removeSet, maxRun)
{
    let removed = 0;
    for (const idx of removeSet)
    {
        const x = idx%GRID_COLS, y = (idx/GRID_COLS)|0;
        const cell = getCell(x,y);
        if (!cell) continue;
        spawnClearParticles(x,y,cell.color);
        setCell(x,y,null);
        ++removed;
    }
    if (!removed) return;

    score += removed*10 + (maxRun>=4 ? 50 : 0);
    noMoveTicks = 0;
    if (maxRun>=4) fastRainbowFlag = true;
    ++rainbowProgress; 
    sound_goodMove.play();
    unicorn.triggerHappy(maxRun>=4);
    applyGravity();
}
function resolveRainbow(rainbowPos, otherPos)
{
    const other = getCell(otherPos.x, otherPos.y);
    setCell(rainbowPos.x, rainbowPos.y, null);
    if (!other || other.rainbow) return;

    const targetColor = other.color;
    let removed = 0;
    for (let y=0; y<GRID_ROWS; ++y)
    for (let x=0; x<GRID_COLS; ++x)
    {
        const c = getCell(x,y);
        if (c && !c.cracked && !c.rainbow && c.color===targetColor)
        {
            spawnClearParticles(x,y,c.color);
            setCell(x,y,null);
            ++removed;
        }
    }
    const neighbors = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx,dy] of neighbors)
    {
        const nx = rainbowPos.x+dx, ny = rainbowPos.y+dy;
        const nc = getCell(nx,ny);
        if (nc && nc.cracked) { setCell(nx,ny,null); ++removed; }
    }

    if (!removed) return;
    score += removed*15;
    noMoveTicks = 0;
    sound_goodMove.play();
    unicorn.triggerHappy(true);
    applyGravity();
}
function applyGravity()
{
    for (let x=0; x<GRID_COLS; ++x)
    {
        const col = [];
        for (let y=0; y<GRID_ROWS; ++y)
        {
            const c = getCell(x,y);
            if (c) col.push({cell:c, fromY:y});
        }
        for (let y=0; y<GRID_ROWS; ++y)
        {
            if (y < col.length)
            {
                const {cell, fromY} = col[y];
                if (fromY > y) cell._visualOffsetY = (cell._visualOffsetY||0) + (fromY-y);
                setCell(x,y,cell);
            }
            else setCell(x,y,null);
        }
    }
}
function decayFallOffsets()
{
    for (const c of grid)
    {
        if (!c || !c._visualOffsetY) continue;
        c._visualOffsetY *= .8;
        if (Math.abs(c._visualOffsetY) < .02) c._visualOffsetY = 0;
    }
}
function spawnClearParticles(x,y,colorIndex)
{
    const pos = vec2(x+.5,y+.5);
    const color1 = BLOCK_COLORS[colorIndex];
    const color2 = color1.lerp(WHITE,.5);
    new LJS.ParticleEmitter(
        pos, 0,
        .5, .1, 200, Math.PI,
        0,
        color1, color2,
        color1.scale(1,0), color2.scale(1,0),
        .5, .3, .2, .05, .05,
        .99, 1, 1, Math.PI, .05,
        .5, 0, 1
    );
}
function gameOver(won)
{
    if (gameState !== 'playing') return;
    gameState = won ? 'won' : 'lost';
    unicorn.setWon(won, curLevel === LEVELS.length-1);

    if (won && !levelWon[curLevel])
    {
        levelWon[curLevel] = true;
        localStorage[WON_KEY] = JSON.stringify(levelWon);
    }
}

function worldToGridPos(pos)
{
    if (pos.x<0 || pos.x>=GRID_COLS || pos.y<0 || pos.y>=GRID_ROWS) return null;
    return {x:Math.floor(pos.x), y:Math.floor(pos.y)};
}

function updateMouseInput()
{
    const gridPos = worldToGridPos(LJS.mousePos);

    if (!LJS.mouseIsDown(0)) draggingFb = null;

    // grabbing a falling block (press must land on the block itself) lets you drag it into another column
    if (LJS.mouseWasPressed(0))
    {
        const hit = fallingBlocks.find(fb => Math.abs(LJS.mousePos.x-fb.pos.x)<.5 && Math.abs(LJS.mousePos.y-fb.pos.y)<.5);
        if (hit) draggingFb = hit;
    }
    if (draggingFb)
    {
        const col = Math.floor(LJS.mousePos.x);
        if (col>=0 && col<GRID_COLS) setFallingBlockColumn(draggingFb, col);
        return;
    }

    if (LJS.mouseWasPressed(0) && gridPos && !swapAnim)
        dragStart = gridPos;
    else if (LJS.mouseIsDown(0) && dragStart && !swapAnim && gridPos)
    {
        const dx = gridPos.x-dragStart.x, dy = gridPos.y-dragStart.y;
        if (Math.abs(dx)+Math.abs(dy) === 1)
        {
            attemptSwap(dragStart, gridPos);
            dragStart = null;
        }
    }
    else if (!LJS.mouseIsDown(0)) dragStart = null;
}
function updateKeyboardInput()
{
    // A/D move the newest falling block sideways (while hovering or dropping), snapped to grid columns
    const fb = fallingBlocks[fallingBlocks.length-1];
    if (fb)
    {
        if (LJS.keyWasPressed('KeyA')) moveFallingBlock(fb, -1);
        if (LJS.keyWasPressed('KeyD')) moveFallingBlock(fb, 1);
    }

    if (swapAnim) return;
    if (LJS.keyWasPressed('ArrowLeft'))  cursorPos.x = Math.max(0, cursorPos.x-1);
    if (LJS.keyWasPressed('ArrowRight')) cursorPos.x = Math.min(GRID_COLS-1, cursorPos.x+1);
    if (LJS.keyWasPressed('ArrowUp'))    cursorPos.y = Math.min(GRID_ROWS-1, cursorPos.y+1);
    if (LJS.keyWasPressed('ArrowDown'))  cursorPos.y = Math.max(0, cursorPos.y-1);

    if (LJS.keyWasPressed('Space'))
    {
        if (!selectedPos) selectedPos = {x:cursorPos.x, y:cursorPos.y};
        else
        {
            attemptSwap(selectedPos, cursorPos);
            selectedPos = null;
        }
    }
}
function updateMenuInput()
{
    if (LJS.keyWasPressed('Escape')) { gameState='splash'; return; }
    if (LJS.keyWasPressed('Space') || LJS.keyWasPressed('Enter')) { startLevel(menuLevel); return; }

    if (LJS.mouseWasPressed(0))
    {
        const p = LJS.mousePos;
        if (pointInWorldRect(p, vec2(1,6), 1.2,1.6)) menuLevel = Math.max(0, menuLevel-1);
        else if (pointInWorldRect(p, vec2(5,6), 1.2,1.6)) menuLevel = Math.min(maxUnlockedLevel(), menuLevel+1);
        else if (pointInWorldRect(p, PLAY_BTN.pos, PLAY_BTN.w, PLAY_BTN.h)) startLevel(menuLevel);
    }
}
function updateSplashInput()
{
    // keyboard
    if (LJS.keyWasPressed('Space') || LJS.keyWasPressed('Enter')) { gameState = 'menu'; return; }
    if (LJS.keyWasPressed('ArrowLeft'))  menuLevel = Math.max(0, menuLevel-1);
    if (LJS.keyWasPressed('ArrowRight')) menuLevel = Math.min(maxUnlockedLevel(), menuLevel+1);

    if (!LJS.mouseWasPressed(0)) return;
    // convert world mousePos back to screen pixels for hit-testing splash UI
    const sp = worldToScreenLocal(LJS.mousePos);
    const dx = sp.x, dy = sp.y;
    if (Math.abs(dx-SPLASH_BTN.x)<SPLASH_BTN.w/2 && Math.abs(dy-SPLASH_BTN.y)<SPLASH_BTN.h/2)
        { startLevel(menuLevel); return; }
    if (Math.abs(dx-SPLASH_LVL_LEFT.x)<SPLASH_LVL_ARROW_HIT && Math.abs(dy-SPLASH_LVL_LEFT.y)<SPLASH_LVL_ARROW_HIT)
        menuLevel = Math.max(0, menuLevel-1);
    if (Math.abs(dx-SPLASH_LVL_RIGHT.x)<SPLASH_LVL_ARROW_HIT && Math.abs(dy-SPLASH_LVL_RIGHT.y)<SPLASH_LVL_ARROW_HIT)
        menuLevel = Math.min(maxUnlockedLevel(), menuLevel+1);
}
function gameUpdate()
{
    if (gameState === 'splash')
    {
        updateSplashInput();
        return;
    }
    if (gameState === 'menu')
    {
        updateMenuInput();
        unicorn.setDanger(0);
        unicorn.update(LJS.timeDelta);
        return;
    }

    const menuClicked = LJS.mouseWasPressed(0) && pointInWorldRect(LJS.mousePos, PANEL_BTN_MENU.pos, PANEL_BTN_MENU.w, PANEL_BTN_MENU.h);
    if (LJS.keyWasPressed('KeyM') || menuClicked) { gameState = 'splash'; return; }

    const primaryClicked = LJS.mouseWasPressed(0) && pointInWorldRect(LJS.mousePos, PANEL_BTN_PRIMARY.pos, PANEL_BTN_PRIMARY.w, PANEL_BTN_PRIMARY.h);

    if (gameState === 'paused')
    {
        if (primaryClicked || LJS.keyWasPressed('KeyP')) gameState = 'playing';
        return;
    }
    if (gameState === 'playing' && (primaryClicked || LJS.keyWasPressed('KeyP'))) { gameState = 'paused'; return; }

    if (LJS.keyWasPressed('KeyR') && gameState !== 'won') gameReset();
    if (gameState === 'lost' && primaryClicked) gameReset();
    if (gameState === 'won' && curLevel < LEVELS.length-1 && (LJS.keyWasPressed('KeyC') || primaryClicked)) startLevel(curLevel+1);

    if (gameState === 'playing')
    {
        tickTimer += LJS.timeDelta;
        while (tickTimer >= TICK_INTERVAL && gameState==='playing')
        {
            tickTimer -= TICK_INTERVAL;
            onTick();
        }
        updateFallingBlocks(LJS.timeDelta);
        updateSwapAnim(LJS.timeDelta);
        updateMouseInput();
        updateKeyboardInput();
        decayFallOffsets();
    }

    unicorn.setDanger(dangerRatio());
    unicorn.update(LJS.timeDelta);

    if (score > bestScores[curLevel])
    {
        bestScores[curLevel] = score;
        localStorage[BEST_KEY] = JSON.stringify(bestScores);
    }
}
function gameUpdatePost() {}
function drawCell(cell, center)
{
    if (!cell) return;

    // Rainbow block – still animate, but now as a pixel block
    if (cell.rainbow) {
        const hue = (LJS.time*.4) % 1;
        LJS.drawRect(center, vec2(.92), hsl(hue,1,.5));
        LJS.drawRegularPoly(center, vec2(.55), 8, hsl((hue+.5)%1,1,.7));
        return;
    }
    const color = BLOCK_COLORS[cell.color];
    const baseColor = cell.cracked ? color.scale(.5,1) : color;

    LJS.drawRect(center.add(vec2(.06, -.06)), vec2(.94), rgb(0,0,0,.4));

    LJS.drawRect(center, vec2(.94), baseColor);

    LJS.drawRect(center.add(vec2(-.25, .25)), vec2(.3), rgb(1,1,1,.25));

    if (cell.cracked) {
        const c = rgb(0,0,0,.6);
        LJS.drawLine(center.add(vec2(-.3,-.3)), center.add(vec2(.35,.25)), .06, c);
        LJS.drawLine(center.add(vec2(-.1,.35)), center.add(vec2(.2,-.35)), .06, c);
    }
}
function drawGridHighlight(pos, color)
{
    LJS.drawRect(cellCenter(pos), vec2(1.04), color);
}
function drawBackgroundPanels()
{
    LJS.drawRect(vec2(GRID_COLS/2, GRID_ROWS/2), vec2(GRID_COLS, GRID_ROWS), rgb(0,0,0,.5));
    LJS.drawRect(vec2(GRID_COLS+PANEL_WIDTH/2, GRID_ROWS/2), vec2(PANEL_WIDTH, GRID_ROWS), rgb(.15,.05,.25,.6));
}
function drawSplashScreenRect(x, y, w, h, r, g, b, a=1)
{
    // raw canvas rect — bypasses world transform entirely
    const cvs = document.querySelector('canvas');
    const c = cvs.getContext('2d');
    c.fillStyle = `rgb(${r*255|0} ${g*255|0} ${b*255|0} / ${a})`;
    c.fillRect(x-w/2, y-h/2, w, h);
}
function drawSplash()
{
    // full-screen dark gradient background
    drawSplashScreenRect(CANVAS_W/2, CANVAS_H/2, CANVAS_W, CANVAS_H, .05, .04, .12);

    // decorative colour bar strips at top and bottom
    const barH = 18;
    const colors = BLOCK_COLORS;
    const bw = CANVAS_W/colors.length;
    for (let i=0; i<colors.length; ++i)
    {
        const c = colors[i];
        drawSplashScreenRect(bw*i+bw/2, barH/2, bw+1, barH, c.r, c.g, c.b);
        drawSplashScreenRect(bw*i+bw/2, CANVAS_H-barH/2, bw+1, barH, c.r, c.g, c.b);
    }

    // rainbow + unicorn — drawn at its world position, up top, static (no road/bounce)
    splashUnicorn.render();

    // title
    LJS.drawTextScreen('UniBlocks', vec2(CANVAS_W/2, 620), 90, WHITE);

    // tagline
    LJS.drawTextScreen('Match blocks. Beat the rising wall.', vec2(CANVAS_W/2, 720), 28, rgb(1,1,1,.8));

    // START button
    drawSplashScreenRect(SPLASH_BTN.x, SPLASH_BTN.y, SPLASH_BTN.w, SPLASH_BTN.h, .2,.8,.35,.92);
    LJS.drawTextScreen('START', vec2(SPLASH_BTN.x, SPLASH_BTN.y), 48, rgb(0,0,0,.85));

    // level chooser below start
    LJS.drawTextScreen('Starting Level', vec2(CANVAS_W/2, 935), 26, rgb(1,1,1,.7));
    LJS.drawTextScreen('◀', vec2(SPLASH_LVL_LEFT.x,  SPLASH_LVL_LEFT.y),  54, WHITE);
    LJS.drawTextScreen('▶', vec2(SPLASH_LVL_RIGHT.x, SPLASH_LVL_RIGHT.y), 54, menuLevel>=maxUnlockedLevel() ? rgb(1,1,1,.2) : WHITE);
    LJS.drawTextScreen(`${menuLevel+1}`, vec2(CANVAS_W/2, SPLASH_LVL_LEFT.y), 40, rgb(1,.9,.3));
    LJS.drawTextScreen(`Goal: ${LEVELS[menuLevel].tick} ticks`, vec2(CANVAS_W/2, 1025), 24, rgb(1,1,1,.65));
    LJS.drawTextScreen(`Best: ${bestScores[menuLevel]}`, vec2(CANVAS_W/2, 1060), 24, rgb(1,.85,.3,.9));

    // controls hint
    LJS.drawTextScreen('js13k  2026', vec2(CANVAS_W/2, CANVAS_H-58), 22, rgb(1,1,1,.45));
    LJS.drawTextScreen('Space/tap START \u2022 \u2190/\u2192 to pick level', vec2(CANVAS_W/2, CANVAS_H-32), 22, rgb(1,1,1,.5));
}
function drawMenu()
{
    drawBackgroundPanels();

    const lvl = LEVELS[menuLevel];
    LJS.drawTextScreen('UniBlocks', vec2(CANVAS_W/2, 140), 70, WHITE);
    LJS.drawTextScreen('Match 3+ blocks. Survive the rising wall!', vec2(CANVAS_W/2, 200), 24, rgb(1,1,1,.7));

    drawButton(PLAY_BTN.pos, PLAY_BTN.w, PLAY_BTN.h, rgb(.2,.8,.3,.9), 'PLAY');

    LJS.drawTextScreen('\u2190/\u2192 or tap arrows to choose a level, Space/tap PLAY to start', vec2(CANVAS_W/2,CANVAS_H-25), 20, rgb(1,1,1,.6));

    unicorn.render();
}
function gameRender()
{
    if (gameState === 'splash') { drawSplash(); return; }
    if (gameState === 'menu') { drawMenu(); return; }

    drawBackgroundPanels();
    LJS.drawRect(vec2(GRID_COLS/2, GRID_ROWS+HOVER_HEIGHT), vec2(GRID_COLS,.9), rgb(1,1,1,.06));
    if (gameState==='playing')
    {
        drawGridHighlight(cursorPos, rgb(1,1,1,.25));
        if (selectedPos) drawGridHighlight(selectedPos, rgb(1,1,0,.4));
    }
    for (let y=0; y<GRID_ROWS; ++y)
    for (let x=0; x<GRID_COLS; ++x)
    {
        if (swapAnim && ((x===swapAnim.posA.x&&y===swapAnim.posA.y) || (x===swapAnim.posB.x&&y===swapAnim.posB.y)))
            continue;
        const cell = getCell(x,y);
        if (!cell) continue;
        const center = vec2(x+.5, y+.5 + (cell._visualOffsetY||0));
        drawCell(cell, center);
    }
    if (swapAnim)
    {
        const p = swapAnim.t;
        const centerA = cellCenter(swapAnim.posA), centerB = cellCenter(swapAnim.posB);
        drawCell(getCell(swapAnim.posA.x,swapAnim.posA.y), lerpVec(centerB,centerA,p));
        drawCell(getCell(swapAnim.posB.x,swapAnim.posB.y), lerpVec(centerA,centerB,p));
    }
    for (const fb of fallingBlocks)
        drawCell({color:fb.color, cracked:false, rainbow:fb.rainbow}, fb.pos);

    unicorn.render();
    drawPanelButtons();
}

function gameRenderPost()
{
    if (gameState === 'splash' || gameState === 'menu') return;

    LJS.drawTextScreen(`Level ${curLevel+1}   Score ${score}   Best ${bestScores[curLevel]}`, vec2(CANVAS_W/2,50), 32, WHITE);
    LJS.drawTextScreen(`Tick ${tickCount}/${LEVELS[curLevel].tick}`, vec2(CANVAS_W/2,95), 28, WHITE);
    LJS.drawTextScreen('Arrows: move   Space: select/swap   A/D: shift falling block   Drag: swap', vec2(CANVAS_W/2,CANVAS_H-25), 20, rgb(1,1,1,.6));

    if (gameState !== 'playing')
    {
        if (gameState === 'paused')
        {
            LJS.drawTextScreen('PAUSED', vec2(CANVAS_W/2,CANVAS_H/2-30), 60, rgb(1,1,1,.9));
            return;
        }
        const won = gameState==='won';
        LJS.drawTextScreen(won?'YOU SURVIVED!':'GAME OVER', vec2(CANVAS_W/2,CANVAS_H/2-30), 60, won?rgb(.3,1,.5):rgb(1,.3,.3));
        const wonLastLevel = won && curLevel === LEVELS.length-1;
        LJS.drawTextScreen(
            wonLastLevel ? 'You beat the game! M for menu' : won?'Press C to continue, M for menu':'Press R to restart, M for menu',
            vec2(CANVAS_W/2,CANVAS_H/2+30), 30, WHITE);
    }
}
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, []);