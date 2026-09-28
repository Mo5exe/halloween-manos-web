// Simulacion local del juego para el modo solo (un solo jugador, sin
// servidor de por medio) -- misma logica que rooms.js del servidor
// (usado para el modo multijugador), para que ambos modos se sientan
// iguales.
const SPAWN_MIN_MS = 650;
const SPAWN_MAX_MS = 1500;
const CATCH_RADIUS = 0.045;

const OBJECT_TYPES = [
  { type: "pumpkin", weight: 6, r: 0.055, baseSpeed: 0.16 },
  { type: "vampire", weight: 2, r: 0.065, baseSpeed: 0.2 },
  { type: "ghost", weight: 2, r: 0.065, baseSpeed: 0.18 },
  { type: "witch_hat", weight: 1, r: 0.055, baseSpeed: 0.17 },
];

function pickType() {
  const total = OBJECT_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of OBJECT_TYPES) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return OBJECT_TYPES[0];
}

export class Simulation {
  constructor() {
    this.objects = [];
    this.nextObjectId = 1;
    this.score = 0;
    this.misses = 0;
    this.speedMultiplier = 1;
    this.windy = false;
    this.powerupUntil = 0;
    this.nextSpawnAt = Date.now() + 900;
    this.lastEvent = null; // "catch_pumpkin" | "hit" | "powerup" | "miss_pumpkin"
  }

  setOptions({ speed, windy }) {
    if (typeof speed === "number" && speed > 0) this.speedMultiplier = speed;
    if (typeof windy === "boolean") this.windy = windy;
  }

  tick(dtSec, handPointsNorm) {
    const now = Date.now();
    this.lastEvent = null;

    if (now >= this.nextSpawnAt) {
      const def = pickType();
      this.objects.push({
        id: this.nextObjectId++,
        type: def.type,
        x: 0.08 + Math.random() * 0.84,
        y: -0.08,
        r: def.r,
        speed: def.baseSpeed * this.speedMultiplier * (this.windy ? 1.7 : 1),
        drift: this.windy ? (Math.random() - 0.5) * 1.0 : (Math.random() - 0.5) * 0.12,
        phase: Math.random() * Math.PI * 2,
      });
      const gap = SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
      this.nextSpawnAt = now + gap / Math.max(0.6, this.speedMultiplier);
    }

    const scoreMult = now < this.powerupUntil ? 2 : 1;
    const survivors = [];

    for (const o of this.objects) {
      o.y += o.speed * dtSec;
      o.x += Math.sin(now / 380 + o.phase) * o.drift * dtSec;
      o.x = Math.min(0.98, Math.max(0.02, o.x));

      let caught = false;
      const catchR = o.r + CATCH_RADIUS;
      for (const h of handPointsNorm) {
        const dx = h.x - o.x;
        const dy = h.y - o.y;
        if (dx * dx + dy * dy <= catchR * catchR) {
          caught = true;
          break;
        }
      }

      if (caught) {
        if (o.type === "pumpkin") {
          this.score += 10 * scoreMult;
          this.lastEvent = "catch_pumpkin";
        } else if (o.type === "witch_hat") {
          this.powerupUntil = now + 8000;
          this.lastEvent = "powerup";
        } else {
          this.misses += 1;
          this.lastEvent = "hit";
        }
        continue;
      }

      if (o.y > 1.1) {
        if (o.type === "pumpkin") {
          this.misses += 1;
          this.lastEvent = this.lastEvent || "miss_pumpkin";
        }
        continue;
      }

      survivors.push(o);
    }

    this.objects = survivors;
  }

  publicState() {
    return {
      score: this.score,
      misses: this.misses,
      powerup: Date.now() < this.powerupUntil,
      objects: this.objects,
    };
  }
}
