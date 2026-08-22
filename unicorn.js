/*
    NES 8-bit Unicorn - pixel sprite with crisp scaling.
*/

import * as LJS from '../LittleJS/dist/littlejs.esm.js';
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

export class Unicorn {
    constructor(centerPos) {
        this.center = centerPos;
        this.happyTimer = 0;
        this.happyBig = false;
        this.sadTimer = 0;
        this.danger = 0;
        this.sprite = createSprite();
        // cache the drawn size to avoid recomputing
        this.baseSize = vec2(2.2, 2.2);
    }

    triggerHappy(big) {
        this.happyTimer = big ? 1.2 : .6;
        this.happyBig = !!big;
        this.spawnSparkles(big);
    }

    triggerSad() { this.sadTimer = 1; }
    setDanger(ratio) { this.danger = ratio; }

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
    }

    render() {
        const time = LJS.time;
        // Idle bob + happy bounce + sad droop
        const bob = Math.sin(time*2) * .15;
        const happyBounce = this.happyTimer>0 ? Math.sin(this.happyTimer*20) * .25 * (this.happyBig?1.6:1) : 0;
        const sadDroop = this.sadTimer>0 ? -.25*this.sadTimer : 0;
        const bodyPos = this.center.add(vec2(0, bob+happyBounce+sadDroop));

        // Danger aura
        if (this.danger > .75) {
            const pulse = (Math.sin(time*8)+1) * .5;
            LJS.drawCircleGradient(bodyPos, 3.4+pulse*.3, rgb(1,0,0,.35*this.danger), rgb(1,0,0,0));
        }

        // Scale with squash/stretch
        let sx = 2.2, sy = 2.2;
        if (this.happyTimer > 0) {
          const s = 1 + Math.sin(this.happyTimer*20) * 0.15 * (this.happyBig ? 1.6 : 1);
          sx *= s;
          sy *= s;
        }
        if (this.sadTimer > 0) {
          sy *= (1 - this.sadTimer * 0.15);
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