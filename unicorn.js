/*
    NES 8-bit Unicorn - pixel sprite with crisp scaling.
    Bounces in a gallop rhythm while a road scrolls beneath him during play.
    On win, the gallop stops, a wide rainbow arcs in behind him (clipped to
    his panel so it never spills outside it), and he bounces in celebration.
*/

import * as LJS from './littlejs.esm.js';
const { vec2, rgb, hsl } = LJS;

// Pixel data: 16x16, indices 0=transparent, 1=white, 2=gray, 3=black, 4=gold, 5=dark gray, 6=pink
const PIXEL_DATA = new Uint8Array([
  0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,4,4,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,4,4,0,0,0,
  0,0,0,0,0,0,0,0,0,2,2,1,1,0,0,0,
  0,0,0,0,0,0,0,0,2,1,1,1,1,1,0,0,
  0,0,0,0,0,0,0,2,1,1,1,3,1,1,0,0,
  0,0,0,0,0,0,0,6,1,1,1,3,1,1,1,0,
  0,6,6,6,0,0,0,6,6,1,1,1,1,1,1,0,
  0,6,4,4,6,1,1,1,6,6,1,1,1,1,1,0,
  0,4,2,2,1,1,1,1,1,6,6,0,0,0,0,0,
  4,2,2,1,1,1,1,1,1,1,6,0,0,0,0,0,
  4,2,5,1,1,1,1,1,1,1,1,0,0,0,0,0,
  2,5,3,1,1,1,0,0,1,1,1,0,0,0,0,0,
  5,3,0,1,1,1,0,0,1,1,1,0,0,0,0,0,
  0,0,0,5,5,5,0,0,5,5,5,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
]);

const PALETTE = [
  null,                      // 0 transparent
  rgb(1,1,1),                // 1 white
  rgb(0.7,0.7,0.7),          // 2 light gray (shading)
  rgb(0.08,0.08,0.08),       // 3 black outline
  rgb(1,0.85,0.2),           // 4 gold horn
  rgb(0.2,0.2,0.2),          // 5 dark gray (eye)
  rgb(1,0.45,0.65),          // 6 pink mane
];

const RAINBOW_BANDS = [
  rgb(.95,.15,.15), // red
  rgb(1,.55,.1),    // orange
  rgb(1,.85,.15),   // yellow
  rgb(.2,.8,.3),    // green
  rgb(.2,.55,1),    // blue
  rgb(.65,.3,.9),   // purple
];

function createSprite() {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 16;
  const ctx = cvs.getContext('2d');
  // CRISP PIXEL SCALING – this prevents blur when we enlarge later
  ctx.imageSmoothingEnabled = false;
  const imgData = ctx.createImageData(16, 16);
  const data = imgData.data;

  for (let i = 0; i < 256; i++) {
    const col = PALETTE[PIXEL_DATA[i]];
    const idx = i * 4;
    if (col) {
      data[idx] = Math.round(col.r * 255);
      data[idx+1] = Math.round(col.g * 255);
      data[idx+2] = Math.round(col.b * 255);
      data[idx+3] = 255;
    } else {
      data[idx+3] = 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return cvs;
}

// clamps a point into a rect (used to "cut off" the rainbow at panel edges
// rather than letting it draw outside it)
function clampToRect(p, rect) {
    if (!rect) return p;
    return vec2(
        Math.min(rect.right, Math.max(rect.left, p.x)),
        Math.min(rect.top, Math.max(rect.bottom, p.y))
    );
}

// draws an elliptical arc as a strip of line segments (LittleJS has no
// native arc draw). radiusX/radiusY let the arc be flattened/widened to
// fit a specific frame. If clipRect is given, every point is clamped into
// it so the arc gets cut off flush at the rect's edges instead of drawing
// outside it.
function drawArc(center, radiusX, radiusY, startAngle, endAngle, thickness, color, clipRect, segments = 28) {
    let prev = null;
    for (let i = 0; i <= segments; ++i) {
        const t = startAngle + (endAngle - startAngle) * i / segments;
        let p = vec2(center.x + Math.cos(t) * radiusX, center.y + Math.sin(t) * radiusY);
        p = clampToRect(p, clipRect);
        if (prev) LJS.drawLine(prev, p, thickness, color);
        prev = p;
    }
}

export class Unicorn {
    // panelBounds: {left, right, top, bottom} in world units - the panel
    // he lives on. Used to clip the win rainbow so it never spills outside it.
    constructor(centerPos, roadWidth = 3.2, panelBounds = null) {
        this.center = centerPos;
        this.roadWidth = roadWidth;
        this.panelBounds = panelBounds;
        this.happyTimer = 0;
        this.happyBig = false;
        this.sadTimer = 0;
        this.danger = 0;
        this.sprite = createSprite();
        // cache the drawn size to avoid recomputing
        this.baseSize = vec2(2.2, 2.2);

        this.gallopPhase = 0;    // drives the bounce
        this.roadScroll = 0;     // separate accumulator so the road can be frozen on win

        this.won = false;
        this.celebrationPhase = 0;
        this.rainbowIn = 0;      // 0-1 reveal progress for the win rainbow
    }

    triggerHappy(big) {
        this.happyTimer = big ? 1.2 : .6;
        this.happyBig = !!big;
        this.spawnSparkles(big);
    }

    triggerSad() { this.sadTimer = 1; }
    setDanger(ratio) { this.danger = ratio; }

    // call once when the run is won: stops the gallop/road and starts the
    // celebration bounce + rainbow reveal
    setWon(won) {
        this.won = !!won;
        if (this.won) this.spawnSparkles(true);
    }

    spawnSparkles(big) {
        const pos = this.center.add(vec2(0,1));
        new LJS.ParticleEmitter(
            pos, 0,
            1.5, .15, big?300:120, Math.PI,
            0,
            rgb(1,1,1), rgb(1,.4,1),
            rgb(1,1,0,0), rgb(0,1,1,0),
            .6, .2, .4, .15, .05,
            .97, 1, 0, Math.PI, .1,
            .6, 0, 1
        );
    }

    update(dt) {
        if (this.happyTimer > 0) this.happyTimer = Math.max(0, this.happyTimer-dt);
        if (this.sadTimer > 0) this.sadTimer = Math.max(0, this.sadTimer-dt);

        if (this.won) {
            // celebration bounce, gallop/road stay frozen
            this.celebrationPhase += dt*6;
            this.rainbowIn = Math.min(1, this.rainbowIn + dt*1.2);
            return;
        }

        // gallop cadence: faster when happy/in-danger, sluggish when sad
        let speed = 5.5 + this.danger*1.5;
        if (this.happyTimer > 0) speed += this.happyBig ? 4 : 2;
        if (this.sadTimer > 0) speed *= .5;
        this.gallopPhase += dt*speed;
        this.roadScroll += dt*speed*.4;
    }

    renderRoad() {
        const groundY = this.center.y - 1.55;
        const w = this.roadWidth, cx = this.center.x;

        // road bed + edge lines
        LJS.drawRect(vec2(cx, groundY), vec2(w, .55), rgb(.35,.28,.22));
        LJS.drawRect(vec2(cx, groundY+.24), vec2(w, .06), rgb(.5,.42,.32,.8));
        LJS.drawRect(vec2(cx, groundY-.24), vec2(w, .06), rgb(.2,.15,.1,.8));

        // scrolling dashes to sell forward motion; frozen once won
        const dashSpacing = .55;
        const offset = this.roadScroll % dashSpacing;
        const half = w/2;
        for (let x = -half-dashSpacing; x < half+dashSpacing; x += dashSpacing) {
            const dashX = cx + x + offset;
            if (dashX < cx-half+.05 || dashX > cx+half-.05) continue;
            LJS.drawRect(vec2(dashX, groundY), vec2(.22,.08), rgb(.9,.85,.7,.7));
        }
    }

    renderRainbow() {
        if (this.rainbowIn <= 0) return;
        const cx = this.center.x, cy = this.center.y - .7;
        const radiusX = this.roadWidth * .85;
        const radiusY = radiusX * .85;
        const sweep = Math.PI * this.rainbowIn; // sweeps in left-to-right as it reveals
        RAINBOW_BANDS.forEach((col, i) => {
            const rx = radiusX + i*.16;
            const ry = radiusY + i*.16;
            drawArc(vec2(cx,cy), rx, ry, Math.PI, Math.PI - sweep, .16, col, this.panelBounds);
        });
    }

    render() {
        const time = LJS.time;

        if (this.won) this.renderRainbow();
        this.renderRoad();

        // gallop bounce during play, celebration bounce once won
        const bounce = this.won
            ? Math.abs(Math.sin(this.celebrationPhase)) * .3
            : Math.abs(Math.sin(this.gallopPhase)) * .22;
        const happyBounce = this.happyTimer>0 ? Math.sin(this.happyTimer*20) * .25 * (this.happyBig?1.6:1) : 0;
        const sadDroop = this.sadTimer>0 ? -.25*this.sadTimer : 0;
        const bodyPos = this.center.add(vec2(0, bounce+happyBounce+sadDroop));

        // Danger aura
        if (!this.won && this.danger > .75) {
            const pulse = (Math.sin(time*8)+1) * .5;
            LJS.drawCircleGradient(bodyPos, 3.4+pulse*.3, rgb(1,0,0,.35*this.danger), rgb(1,0,0,0));
        }

        // Scale with squash/stretch
        let sx = 2.2, sy = 2.2 - bounce*.15;
        if (this.happyTimer > 0) {
          const s = 1 + Math.sin(this.happyTimer*20) * 0.15 * (this.happyBig ? 1.6 : 1);
          sx *= s;
          sy *= s;
        }
        if (this.sadTimer > 0) {
          sy *= (1 - this.sadTimer * 0.15);
        }
        if (this.won) {
          const s = 1 + Math.sin(this.celebrationPhase) * .12;
          sx *= s; sy *= s;
        }

        // Draw the pixel sprite
        // If `drawImage` is unavailable, we fallback to drawing each pixel
        // with `drawRect` – but that’s slow. Try `drawImage` first.
        try {
          LJS.drawImage(this.sprite, bodyPos, vec2(sx, sy));
        } catch(e) {
          // Fallback: draw pixel-by-pixel (works even if drawImage is broken)
          // (only runs if an error occurs, so it won't affect normal flow)
          this.renderPixelByPixel(bodyPos, sx, sy);
        }
    }

    // Slow fallback – only for debugging
    renderPixelByPixel(pos, scaleX, scaleY) {
      const pixelSize = scaleX / 16; // assume square
      for (let y=0; y<16; y++) {
        for (let x=0; x<16; x++) {
          const col = PALETTE[PIXEL_DATA[y*16 + x]];
          if (!col) continue;
          const cx = pos.x + (x - 8) * pixelSize + pixelSize/2;
          const cy = pos.y + (8 - y) * pixelSize - pixelSize/2;
          LJS.drawRect(vec2(cx, cy), vec2(pixelSize*0.9, pixelSize*0.9), col);
        }
      }
    }
}