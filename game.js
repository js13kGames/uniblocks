/*
    Rainbow Unicorn Cascade - js13k entry
    A Bejeweled/Tetris hybrid: a wall of colored blocks rises from the bottom
    while single blocks fall from the top. Swap adjacent blocks to make runs
    of 3+ (bonus for 4+ chains). Stall too long and a bomb cracks some blocks;
    keep matching and a rainbow block appears to wipe out a whole color.
    Survive 100 ticks without the stack reaching the top to win.
*/

import * as LJS from '../LittleJS/dist/littlejs.esm.js';
import { Unicorn } from './unicorn.js';
const { vec2, rgb, hsl } = LJS;

///////////////////////////////////////////////////////////////////////////////
// tunables (see plan notes: difficulty ramp / bomb / rainbow thresholds are
// best-guess defaults meant to be retuned after playtesting)

const GRID_COLS = 6;
const GRID_ROWS = 12;
const PANEL_WIDTH = 3.5;
const TOP_MARGIN = 1.5;
const BOTTOM_MARGIN = .5;
const WORLD_WIDTH = GRID_COLS + PANEL_WIDTH;
const WORLD_HEIGHT = GRID_ROWS + TOP_MARGIN + BOTTOM_MARGIN;
const CANVAS_W = 1000, CANVAS_H = 1400;

const TICK_INTERVAL = 2.5;         // seconds per game "tick"
const SWAP_TIME = .2;              // seconds for a swap animation
const HOVER_TIME = 1;              // seconds a falling block hovers before dropping
const HOVER_HEIGHT = .8;           // world units above the grid a block hovers at
const DROP_SPEED = 7;             // world units/sec while a block is dropping
const MAX_CONCURRENT_FALLING = 2;  // caps the falling-block backlog
const BOMB_CRACK_COUNT = 3;        // blocks cracked per bomb
const NO_MOVE_BOMB_TICKS = 10;
const RAINBOW_TICKS = 25;
const RAINBOW_TICKS_FAST = 10;
const WIN_TICK = 50;
const BEST_SCORE_KEY = 'unigameBestScore';

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
const BLOCK_SHAPES = [3,4,5,6,8,10]; // regular-poly sides per color, redundant coding

///////////////////////////////////////////////////////////////////////////////
// sounds (zzfx arrays - placeholder values, tune later)

const sound_goodMove = new LJS.Sound([.4,.2,250,.04,,.04,,,1,,,,,3]);
const sound_badMove  = new LJS.Sound([,,700,,,.07,,,,3.7,,,,3,,,.1]);
const sound_bomb      = new LJS.Sound([1.5,.1,90,.02,.02,.2,4,.3,,,,,.05]);
const sound_wallRise   = new LJS.Sound([.3,,150,.02,.05,.15,,.2]);

///////////////////////////////////////////////////////////////////////////////
// game state

let grid;                  // flat array, index = x + y*GRID_COLS, y=0 is bottom
let fallingBlocks;          // blocks currently hovering/dropping toward the grid
let swapAnim;                // {posA:{x,y}, posB:{x,y}, t, reverse} or null
let dragStart;                // {x,y} or null (mouse swap start)
let cursorPos;                 // {x,y} keyboard cursor
let selectedPos;                // {x,y} or null keyboard-selected cell
let lastSpawnColumn;
let tickCount, tickTimer, wallInsertCounter, noMoveTicks;
let rainbowProgress, fastRainbowFlag;
let score, bestScore;
let gameState; // 'playing' | 'won' | 'lost'
let unicorn;

///////////////////////////////////////////////////////////////////////////////
// grid helpers

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
function computeWallInterval(tick) { return tick>=75 ? 1 : tick>=40 ? 2 : 3; }

function dangerRatio()
{
    for (let y=GRID_ROWS-1; y>=0; --y)
        for (let x=0; x<GRID_COLS; ++x)
            if (getCell(x,y)) return (y+1)/GRID_ROWS;
    return 0;
}

///////////////////////////////////////////////////////////////////////////////
// setup

function gameInit()
{
    LJS.setCanvasPixelated(true);
    LJS.setCanvasFixedSize(vec2(CANVAS_W, CANVAS_H));
    LJS.setCanvasClearColor(rgb(.08,.08,.14));
    bestScore = +localStorage[BEST_SCORE_KEY] || 0;

    const worldCenterY = (GRID_ROWS + TOP_MARGIN - BOTTOM_MARGIN) / 2;
    LJS.setCameraPos(vec2(WORLD_WIDTH/2, worldCenterY));
    LJS.setCameraScale(CANVAS_H/WORLD_HEIGHT);

unicorn = new Unicorn(
    vec2(GRID_COLS + PANEL_WIDTH/2, GRID_ROWS/2),
    PANEL_WIDTH - .3,
    { left: GRID_COLS, right: GRID_COLS + PANEL_WIDTH, top: GRID_ROWS, bottom: 0 }
);    gameReset();
}

function gameReset()
{
    grid = new Array(GRID_COLS*GRID_ROWS).fill(null);
    fallingBlocks = [];
    swapAnim = null;
    dragStart = null;
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

///////////////////////////////////////////////////////////////////////////////
// tick-driven mechanics: wall rise, falling spawn, bomb timer, win check

function onTick()
{
    if (gameState !== 'playing') return;
    ++tickCount;

    if (++wallInsertCounter >= computeWallInterval(tickCount))
    {
        wallInsertCounter = 0;
        insertWallRow();
        if (gameState !== 'playing') return;
    }

    trySpawnFallingBlock();

    if (++noMoveTicks >= NO_MOVE_BOMB_TICKS)
    {
        noMoveTicks = 0;
        triggerBomb();
    }

    if (tickCount >= WIN_TICK)
        gameOver(true);
}

function insertWallRow()
{
    // topped out: no room to push the stack up further
    for (let x=0; x<GRID_COLS; ++x)
        if (getCell(x,GRID_ROWS-1)) { gameOver(false); return; }

    for (let y=GRID_ROWS-1; y>0; --y)
        for (let x=0; x<GRID_COLS; ++x)
            setCell(x,y, getCell(x,y-1));

    const colorCount = computeColorCount(tickCount);
    for (let x=0; x<GRID_COLS; ++x)
        setCell(x,0, {color:LJS.randInt(colorCount), cracked:false, rainbow:false});

    // keep any airborne blocks visually in sync with the raised stack
    for (const fb of fallingBlocks) fb.pos.y += 1;

    sound_wallRise.play();
}

function trySpawnFallingBlock()
{
    if (fallingBlocks.length >= MAX_CONCURRENT_FALLING) return;

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

///////////////////////////////////////////////////////////////////////////////
// falling blocks

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

///////////////////////////////////////////////////////////////////////////////
// swapping + match resolution

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

    // no effect: undo the swap and animate back
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
    ++rainbowProgress; // approximates "ticks with successful moves" per successful swap
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
    unicorn.setWon(won);   // <-- add this line
}

///////////////////////////////////////////////////////////////////////////////
// input

function worldToGridPos(pos)
{
    if (pos.x<0 || pos.x>=GRID_COLS || pos.y<0 || pos.y>=GRID_ROWS) return null;
    return {x:Math.floor(pos.x), y:Math.floor(pos.y)};
}

function updateMouseInput()
{
    const gridPos = worldToGridPos(LJS.mousePos);
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
    // A/D nudge the oldest hovering falling block sideways before it drops
    const hoveringFb = fallingBlocks.find(fb=>fb.state==='hover');
    if (hoveringFb)
    {
        if (LJS.keyWasPressed('KeyA')) hoveringFb.col = Math.max(0, hoveringFb.col-1);
        if (LJS.keyWasPressed('KeyD')) hoveringFb.col = Math.min(GRID_COLS-1, hoveringFb.col+1);
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

///////////////////////////////////////////////////////////////////////////////
// main loop

function gameUpdate()
{
    if (LJS.keyWasPressed('KeyR')) gameReset();

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

    if (score > bestScore)
    {
        bestScore = score;
        localStorage[BEST_SCORE_KEY] = bestScore;
    }
}

function gameUpdatePost() {}

///////////////////////////////////////////////////////////////////////////////
// rendering

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

    // 1) Dark drop shadow (bottom-right)
    LJS.drawRect(center.add(vec2(.06, -.06)), vec2(.94), rgb(0,0,0,.4));

    // 2) Main block
    LJS.drawRect(center, vec2(.94), baseColor);

    // 3) White highlight (top-left) – creates the NES 3D effect
    LJS.drawRect(center.add(vec2(-.25, .25)), vec2(.3), rgb(1,1,1,.25));

    // 4) Crack lines (if bombed)
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

function gameRender()
{
    // backgrounds
    LJS.drawRect(vec2(GRID_COLS/2, GRID_ROWS/2), vec2(GRID_COLS, GRID_ROWS), rgb(0,0,0,.5));
    LJS.drawRect(vec2(GRID_COLS+PANEL_WIDTH/2, GRID_ROWS/2), vec2(PANEL_WIDTH, GRID_ROWS), rgb(.15,.05,.25,.6));
    LJS.drawRect(vec2(GRID_COLS/2, GRID_ROWS+HOVER_HEIGHT), vec2(GRID_COLS,.9), rgb(1,1,1,.06));

    // keyboard cursor / selection highlights
    if (gameState==='playing')
    {
        drawGridHighlight(cursorPos, rgb(1,1,1,.25));
        if (selectedPos) drawGridHighlight(selectedPos, rgb(1,1,0,.4));
    }

    // settled grid cells (skip the two mid-swap)
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

    // swap animation
    if (swapAnim)
    {
        const p = swapAnim.t;
        const centerA = cellCenter(swapAnim.posA), centerB = cellCenter(swapAnim.posB);
        drawCell(getCell(swapAnim.posA.x,swapAnim.posA.y), lerpVec(centerB,centerA,p));
        drawCell(getCell(swapAnim.posB.x,swapAnim.posB.y), lerpVec(centerA,centerB,p));
    }

    // falling blocks
    for (const fb of fallingBlocks)
        drawCell({color:fb.color, cracked:false, rainbow:fb.rainbow}, fb.pos);

    unicorn.render();
}

function gameRenderPost()
{
    LJS.drawTextScreen(`Score ${score}   Best ${bestScore}`, vec2(CANVAS_W/2,50), 40, WHITE);
    LJS.drawTextScreen(`Tick ${tickCount}/${WIN_TICK}`, vec2(CANVAS_W/2,95), 28, WHITE);
    LJS.drawTextScreen('Arrows: move   Space: select/swap   A/D: shift falling block   Drag: swap', vec2(CANVAS_W/2,CANVAS_H-25), 20, rgb(1,1,1,.6));

    if (gameState !== 'playing')
    {
        const won = gameState==='won';
        LJS.drawTextScreen(won?'YOU SURVIVED!':'GAME OVER', vec2(CANVAS_W/2,CANVAS_H/2-30), 60, won?rgb(.3,1,.5):rgb(1,.3,.3));
        LJS.drawTextScreen('Press R to restart', vec2(CANVAS_W/2,CANVAS_H/2+30), 32, WHITE);
    }
}

///////////////////////////////////////////////////////////////////////////////
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, []);
