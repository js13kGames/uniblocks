
'use strict';
export function lerp(a, b, p) { return a + (b - a) * p; }
export function randInt(a, b) { if (b === undefined) { b = a; a = 0; } return (a + Math.random() * (b - a)) | 0; }
function rand(a = 1, b = 0) { return b + (a - b) * Math.random(); }

export class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
    scale(s) { return new Vector2(this.x * s, this.y * s); }
}
export function vec2(x = 0, y = x) { return new Vector2(x, y); }

export class Color {
    constructor(r = 1, g = 1, b = 1, a = 1) { this.r = r; this.g = g; this.b = b; this.a = a; }
    scale(s, aScale = s) { return new Color(this.r * s, this.g * s, this.b * s, this.a * aScale); }
    lerp(c, p) { return new Color(lerp(this.r, c.r, p), lerp(this.g, c.g, p), lerp(this.b, c.b, p), lerp(this.a, c.a, p)); }
    toString() {
        return `rgb(${this.r * 255 | 0} ${this.g * 255 | 0} ${this.b * 255 | 0} / ${this.a})`;
    }
}
export function rgb(r = 1, g = 1, b = 1, a = 1) { return new Color(r, g, b, a); }
export function hsl(h = 0, s = 0, l = 1, a = 1) {
    h *= 360;
    const k = n => (n + h / 30) % 12;
    const c = s * Math.min(l, 1 - l);
    const f = n => l - c * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return new Color(f(0), f(8), f(4), a);
}
let canvas, ctx, cameraPos = vec2(), cameraScale = 32;
let fixedSize = null, clearColor = new Color(0, 0, 0, 1);
export let time = 0, timeDelta = 0;

export function setCameraPos(p) { cameraPos = p; }
export function setCameraScale(s) { cameraScale = s; }
export function setCanvasFixedSize(v) { fixedSize = v; resizeCanvas(); }
export function setCanvasClearColor(c) { clearColor = c; }
export function setCanvasPixelated(b) {
    if (canvas) canvas.style.imageRendering = b ? 'pixelated' : 'auto';
}
function resizeCanvas() {
    if (!canvas) return;
    if (fixedSize) { canvas.width = fixedSize.x; canvas.height = fixedSize.y; }
    else { canvas.width = innerWidth; canvas.height = innerHeight; }
    const s = Math.min(innerWidth / canvas.width, innerHeight / canvas.height);
    canvas.style.width = canvas.width * s + 'px';
    canvas.style.height = canvas.height * s + 'px';
}
function worldToScreen(p) {
    return vec2(
        canvas.width / 2 + (p.x - cameraPos.x) * cameraScale,
        canvas.height / 2 - (p.y - cameraPos.y) * cameraScale
    );
}
function screenToWorld(sx, sy) {
    return vec2(
        cameraPos.x + (sx - canvas.width / 2) / cameraScale,
        cameraPos.y - (sy - canvas.height / 2) / cameraScale
    );
}
export function drawRect(pos, size, color = rgb()) {
    const p = worldToScreen(pos);
    const w = size.x * cameraScale, h = size.y * cameraScale;
    ctx.fillStyle = color.toString();
    ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
}
export function drawLine(a, b, thickness = .1, color = rgb()) {
    const pa = worldToScreen(a), pb = worldToScreen(b);
    ctx.strokeStyle = color.toString();
    ctx.lineWidth = thickness * cameraScale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
}
export function drawRegularPoly(pos, size, sides, color = rgb(), lineWidth = 0, lineColor = rgb(0, 0, 0), angle = 0) {
    const p = worldToScreen(pos);
    const rx = size.x * cameraScale, ry = size.y * cameraScale;
    ctx.beginPath();
    for (let i = 0; i <= sides; ++i) {
        const a = angle + i / sides * Math.PI * 2;
        const x = p.x + Math.sin(a) * rx, y = p.y - Math.cos(a) * ry;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color.toString();
    ctx.fill();
    if (lineWidth) {
        ctx.strokeStyle = lineColor.toString();
        ctx.lineWidth = lineWidth * cameraScale;
        ctx.stroke();
    }
}
export function drawCircleGradient(pos, size = 1, colorInner = rgb(), colorOuter = rgb(1, 1, 1, 0)) {
    const p = worldToScreen(pos);
    const r = Math.max(1, size * cameraScale);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, colorInner.toString());
    g.addColorStop(1, colorOuter.toString());
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
}
export function drawImage(image, pos, size) {
    const p = worldToScreen(pos);
    const w = size.x * cameraScale, h = size.y * cameraScale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, p.x - w / 2, p.y - h / 2, w, h);
}
export function drawTextScreen(text, pos, size = 20, color = rgb(), font = 'sans-serif') {
    ctx.fillStyle = color.toString();
    ctx.font = `bold ${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pos.x, pos.y);
}
let particles = [];
export class ParticleEmitter {
    constructor(pos, angle = 0, emitSize = 0, emitTime = 0, emitRate = 0, emitCone = Math.PI,
        tileInfo, colorStartA = rgb(), colorStartB = rgb(), colorEndA = rgb(1, 1, 1, 0), colorEndB = rgb(1, 1, 1, 0),
        particleTime = .5, sizeStart = .1, sizeEnd = 0, speed = .1, angleSpeed = 0,
        damping = 1, angleDamping = 1, gravityScale = 0, particleConeAngle = Math.PI, fadeRate = .1,
        randomness = .2, collideTiles = 0, additive = 0)
    {
        const count = Math.max(1, Math.round(emitRate * Math.max(emitTime, 1 / 60)));
        for (let i = 0; i < count; ++i) {
            const spawnR = emitSize * Math.sqrt(Math.random());
            const spawnA = Math.random() * Math.PI * 2;
            const dir = angle + rand(emitCone, -emitCone);
            const spd = speed * rand(1 + randomness, 1 - randomness);
            particles.push({
                x: pos.x + Math.cos(spawnA) * spawnR,
                y: pos.y + Math.sin(spawnA) * spawnR,
                vx: Math.cos(dir) * spd,
                vy: Math.sin(dir) * spd,
                age: 0,
                life: Math.max(.05, particleTime * rand(1 + randomness * .5, 1 - randomness * .5)),
                sizeStart: Math.max(0, sizeStart * rand(1 + randomness, 1 - randomness)),
                sizeEnd: Math.max(0, sizeEnd * rand(1 + randomness, 1 - randomness)),
                colorStart: colorStartA.lerp(colorStartB, Math.random()),
                colorEnd: colorEndA.lerp(colorEndB, Math.random()),
                damping, gravityScale, additive
            });
        }
    }
}
function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; --i) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.life) { particles.splice(i, 1); continue; }
        const d = Math.pow(p.damping, dt * 60);
        p.vx *= d; p.vy *= d;
        p.vy -= p.gravityScale * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
    }
}
function renderParticles() {
    for (const p of particles) {
        const t = p.age / p.life;
        const size = lerp(p.sizeStart, p.sizeEnd, t);
        const color = p.colorStart.lerp(p.colorEnd, t);
        if (p.additive) ctx.globalCompositeOperation = 'lighter';
        drawRect(vec2(p.x, p.y), vec2(size), color);
        if (p.additive) ctx.globalCompositeOperation = 'source-over';
    }
}
const keysDown = new Set(), keysPressed = new Set();
const mouseDown = new Set(), mousePressed = new Set();
export let mousePos = vec2();
export function keyIsDown(code) { return keysDown.has(code); }
export function keyWasPressed(code) { return keysPressed.has(code); }
export function mouseIsDown(b = 0) { return mouseDown.has(b); }
export function mouseWasPressed(b = 0) { return mousePressed.has(b); }
function initInput() {
    addEventListener('keydown', e => { if (!e.repeat) { keysDown.add(e.code); keysPressed.add(e.code); } });
    addEventListener('keyup', e => keysDown.delete(e.code));

    const updateMouse = (clientX, clientY) => {
        const r = canvas.getBoundingClientRect();
        const sx = (clientX - r.left) * canvas.width / r.width;
        const sy = (clientY - r.top) * canvas.height / r.height;
        mousePos = screenToWorld(sx, sy);
    };
    canvas.addEventListener('mousemove', e => updateMouse(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', e => { updateMouse(e.clientX, e.clientY); mouseDown.add(e.button); mousePressed.add(e.button); });
    addEventListener('mouseup', e => mouseDown.delete(e.button));

    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0]; updateMouse(t.clientX, t.clientY);
        mouseDown.add(0); mousePressed.add(0);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        const t = e.touches[0]; updateMouse(t.clientX, t.clientY);
    }, { passive: false });
    addEventListener('touchend', () => mouseDown.delete(0));
}
let audioCtx;
function zzfxG(volume = 1, randomness = .05, frequency = 220, attack = 0, sustain = 0, release = .1,
    shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0,
    repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0, delay = 0, sustainVolume = 1,
    decay = 0, tremolo = 0, filter = 0)
{
    const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, sign = Math.sign,
        max = Math.max, min = Math.min, round = Math.round, tan = Math.tan;
    const sampleRate = 44100, PI2 = PI * 2;
    let startSlide = slide *= 500 * PI2 / sampleRate / sampleRate,
        startFrequency = frequency *= (1 + rand(randomness, -randomness)) * PI2 / sampleRate,
        modOffset = 0, repeat = 0, crush = 0, jump = 1, length, b = [], t = 0, i = 0, s = 0, f,
        quality = 2, w = PI2 * abs(filter) * 2 / sampleRate,
        cosw = cos(w), alpha = sin(w) / 2 / quality,
        a0 = 1 + alpha, a1 = -2 * cosw / a0, a2 = (1 - alpha) / a0,
        b0 = (1 + sign(filter) * cosw) / 2 / a0, b1 = -(sign(filter) + cosw) / a0, b2 = b0,
        x2 = 0, x1 = 0, y2 = 0, y1 = 0;
    const minAttack = 9;
    attack = attack * sampleRate || minAttack;
    decay *= sampleRate; sustain *= sampleRate; release *= sampleRate; delay *= sampleRate;
    deltaSlide *= 500 * PI2 / sampleRate ** 3;
    modulation *= PI2 / sampleRate;
    pitchJump *= PI2 / sampleRate;
    pitchJumpTime *= sampleRate;
    repeatTime = repeatTime * sampleRate | 0;
    for (length = attack + decay + sustain + release + delay | 0; i < length; b[i++] = s * volume) {
        if (!(++crush % (bitCrush * 100 | 0))) {
            s = shape ? shape > 1 ? shape > 2 ? shape > 3 ? shape > 4 ?
                (t / PI2 % 1 < shapeCurve / 2 ? 1 : -1) :
                sin(t ** 3) :
                max(min(tan(t), 1), -1) :
                1 - (2 * t / PI2 % 2 + 2) % 2 :
                1 - 4 * abs(round(t / PI2) - t / PI2) :
                sin(t);

            s = (repeatTime ? 1 - tremolo + tremolo * sin(PI2 * i / repeatTime) : 1) *
                (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) *
                (i < attack ? i / attack :
                i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume) :
                i < attack + decay + sustain ? sustainVolume :
                i < length - delay ? (length - i - delay) / release * sustainVolume : 0);

            s = delay ? s / 2 + (delay > i ? 0 :
                (i < length - delay ? 1 : (length - i) / delay) * b[i - delay | 0] / 2 / volume) : s;

            if (filter) s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
        }

        f = (frequency += slide += deltaSlide) * cos(modulation * modOffset++);
        t += f + f * noise * sin(i ** 5);

        if (jump && ++jump > pitchJumpTime) { frequency += pitchJump; startFrequency += pitchJump; jump = 0; }

        if (repeatTime && !(++repeat % repeatTime)) { frequency = startFrequency; slide = startSlide; jump ||= 1; }
    }
    return b;
}
export class Sound {
    constructor(zzfxSound) { this.params = zzfxSound; }
    play() {
        audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const samples = zzfxG(...this.params);
        const buffer = audioCtx.createBuffer(1, samples.length, 44100);
        buffer.getChannelData(0).set(samples);
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(audioCtx.destination);
        src.start();
    }
}
export function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageUrls = []) {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resizeCanvas();
    addEventListener('resize', resizeCanvas);
    initInput();
    const start = () => {
        gameInit();
        let last = performance.now();
        function frame(now) {
            timeDelta = Math.min(.1, (now - last) / 1000);
            last = now;
            time += timeDelta;

            gameUpdate();
            gameUpdatePost();
            updateParticles(timeDelta);

            ctx.fillStyle = clearColor.toString();
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            gameRender();
            renderParticles();
            gameRenderPost();

            keysPressed.clear();
            mousePressed.clear();
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    };
    if (!imageUrls.length) { start(); return; }
    let remaining = imageUrls.length;
    for (const url of imageUrls) {
        const img = new Image();
        img.onload = img.onerror = () => { if (!--remaining) start(); };
        img.src = url;
    }
}