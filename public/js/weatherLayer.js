// Capa visual traslucida de clima, dibujada sobre un canvas aparte
// (weather-canvas) encima del juego. Se configura sola segun el clima
// real de Cordoba (ver weather.js): lluvia, tormenta (+ nubes grises y
// rayos), o cielo despejado (llamas desde abajo). El viento no dibuja
// nada propio -- lo usa game.js para mover mas rapido y en diagonal a
// los objetos que caen.
export class WeatherLayer {
  constructor() {
    this.drops = [];
    this.flames = [];
    this.lightningUntil = 0;
    this.nextLightning = 0;
    this.state = { kind: "none", windy: false };
  }

  setState(state) {
    this.state = state;
  }

  _ensureDrops(width, height, count) {
    while (this.drops.length < count) {
      this.drops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        len: 14 + Math.random() * 18,
        speed: 500 + Math.random() * 300,
      });
    }
    if (this.drops.length > count) this.drops.length = count;
  }

  _ensureFlames(width, count) {
    while (this.flames.length < count) {
      this.flames.push({
        x: Math.random() * width,
        h: 40 + Math.random() * 60,
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 1.5,
      });
    }
    if (this.flames.length > count) this.flames.length = count;
  }

  update(dt, width, height) {
    const kind = this.state.kind;

    if (kind === "rain" || kind === "storm") {
      this._ensureDrops(width, height, 140);
      // gotas cayendo en diagonal: de arriba-izquierda hacia abajo-derecha
      for (const d of this.drops) {
        d.x += d.speed * 0.35 * dt;
        d.y += d.speed * dt;
        if (d.y > height + 20 || d.x > width + 20) {
          d.x = Math.random() * width * 0.6 - width * 0.1;
          d.y = -20;
        }
      }
    }

    if (kind === "storm") {
      const now = performance.now();
      if (now > this.nextLightning) {
        this.lightningUntil = now + 120 + Math.random() * 100;
        this.nextLightning = now + 3000 + Math.random() * 6000;
      }
    }

    if (kind === "fire") {
      this._ensureFlames(width, 28);
      for (const f of this.flames) {
        f.phase += dt * f.speed;
      }
    }
  }

  draw(ctx, width, height) {
    const kind = this.state.kind;
    ctx.clearRect(0, 0, width, height);

    if (kind === "rain" || kind === "storm") {
      // tinte grisaceo general
      ctx.fillStyle = "rgba(90, 100, 115, 0.18)";
      ctx.fillRect(0, 0, width, height);

      // nubes gordas en la mitad superior
      this._drawClouds(ctx, width, height);

      // gotas de lluvia (diagonal, arriba-izq a abajo-der)
      ctx.strokeStyle = "rgba(190, 210, 230, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const d of this.drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * 0.35, d.y + d.len);
      }
      ctx.stroke();

      if (kind === "storm" && performance.now() < this.lightningUntil) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.fillRect(0, 0, width, height);
        this._drawBolt(ctx, width, height);
      }
    } else if (kind === "fire") {
      this._drawFlames(ctx, width, height);
    }
  }

  _drawClouds(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = "rgba(120, 125, 135, 0.35)";
    const cloudY = height * 0.16;
    const puffs = 6;
    for (let i = 0; i < puffs; i++) {
      const cx = (width / puffs) * i + (width / puffs) * 0.5;
      const cy = cloudY + Math.sin(i * 1.3) * 18;
      const r = 70 + (i % 3) * 20;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawBolt(ctx, width, height) {
    const startX = width * (0.2 + Math.random() * 0.6);
    let x = startX;
    let y = height * 0.14;
    ctx.strokeStyle = "rgba(255, 255, 200, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 6;
    for (let i = 0; i < segments; i++) {
      x += (Math.random() - 0.5) * 40;
      y += height * 0.45 * (1 / segments);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _drawFlames(ctx, width, height) {
    const baseY = height;
    const maxH = height * 0.5;
    ctx.save();
    for (const f of this.flames) {
      const flicker = (Math.sin(f.phase) + 1) / 2;
      const h = Math.min(maxH, f.h * (0.6 + flicker * 0.6));
      const w = 22 + flicker * 10;
      const grad = ctx.createLinearGradient(0, baseY, 0, baseY - h);
      grad.addColorStop(0, "rgba(255, 90, 20, 0.55)");
      grad.addColorStop(0.5, "rgba(255, 160, 30, 0.45)");
      grad.addColorStop(1, "rgba(255, 220, 80, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(f.x - w / 2, baseY);
      ctx.quadraticCurveTo(f.x - w * 0.3, baseY - h * 0.6, f.x, baseY - h);
      ctx.quadraticCurveTo(f.x + w * 0.3, baseY - h * 0.6, f.x + w / 2, baseY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
