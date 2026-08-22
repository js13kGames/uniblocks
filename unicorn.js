/*
    Dancing Unicorn mascot - procedural side panel decoration
    Reacts to game events: idle bob, happy bounce + sparkles on matches,
    sad droop on bomb drops, continuous danger pulse when the wall gets high.
*/

import * as LJS from '../LittleJS/dist/littlejs.esm.js';
const { vec2, rgb, hsl } = LJS;

export class Unicorn
{
    constructor(centerPos)
    {
        this.center = centerPos;
        this.happyTimer = 0;
        this.happyBig = false;
        this.sadTimer = 0;
        this.danger = 0;
    }

    triggerHappy(big)
    {
        this.happyTimer = big ? 1.2 : .6;
        this.happyBig = !!big;
        this.spawnSparkles(big);
    }

    triggerSad() { this.sadTimer = 1; }
    setDanger(ratio) { this.danger = ratio; }

    spawnSparkles(big)
    {
        const pos = this.center.add(vec2(0,1));
        new LJS.ParticleEmitter(
            pos, 0,                              // pos, angle
            1.5, .15, big?300:120, Math.PI,       // emitSize, emitTime, rate, cone
            0,                                    // tileInfo
            rgb(1,1,1), rgb(1,.4,1),              // colorStartA, colorStartB
            rgb(1,1,0,0), rgb(0,1,1,0),           // colorEndA, colorEndB
            .6, .2, .4, .15, .05,                 // time, sizeStart, sizeEnd, speed, angleSpeed
            .97, 1, 0, Math.PI, .1,               // damping, angleDamping, gravityScale, cone, fadeRate
            .6, 0, 1                              // randomness, collide, additive
        );
    }

    update(dt)
    {
        if (this.happyTimer > 0) this.happyTimer = Math.max(0, this.happyTimer-dt);
        if (this.sadTimer > 0) this.sadTimer = Math.max(0, this.sadTimer-dt);
    }

    render()
    {
        const time = LJS.time;
        const bob = Math.sin(time*2) * .15;
        const happyBounce = this.happyTimer>0 ? Math.sin(this.happyTimer*20) * .25 * (this.happyBig?1.6:1) : 0;
        const sadDroop = this.sadTimer>0 ? -.25*this.sadTimer : 0;
        const bodyPos = this.center.add(vec2(0, bob+happyBounce+sadDroop));

        // danger aura when the wall is getting close to the top
        if (this.danger > .75)
        {
            const pulse = (Math.sin(time*8)+1) * .5;
            LJS.drawCircleGradient(bodyPos, 3.4+pulse*.3, rgb(1,0,0,.35*this.danger), rgb(1,0,0,0));
        }

        // body + head
        LJS.drawEllipse(bodyPos, vec2(1.6,1.1), rgb(1,1,1));
        const headPos = bodyPos.add(vec2(1.05, .95 + sadDroop*.5));
        LJS.drawEllipse(headPos, vec2(.7,.6), rgb(1,1,1));

        // horn
        LJS.drawPoly(
            [headPos.add(vec2(.15,.5)), headPos.add(vec2(.35,1.3)), headPos.add(vec2(.5,.5))],
            rgb(1,.85,.3)
        );

        // eye
        LJS.drawCircle(headPos.add(vec2(.3,.05)), .1, rgb(0,0,0));

        // legs
        for (const dx of [-1,-.4,.4,1])
            LJS.drawRect(bodyPos.add(vec2(dx,-1.15)), vec2(.25,.7), rgb(.92,.92,.92));

        // rainbow mane
        for (let i=0; i<6; ++i)
        {
            const hue = (time*.15 + i/6) % 1;
            LJS.drawRect(headPos.add(vec2(-.1-i*.12, .2+i*.05)), vec2(.35,.14), hsl(hue,1,.6));
        }

        // rainbow tail
        for (let i=0; i<5; ++i)
        {
            const hue = (time*.15 + i/5 + .5) % 1;
            const wag = Math.sin(time*3+i) * .1;
            LJS.drawRect(bodyPos.add(vec2(-1.5-i*.1, .1+wag)), vec2(.3,.12), hsl(hue,1,.6));
        }
    }
}
