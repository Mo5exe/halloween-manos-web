// Logica de las salas multijugador: cada sala corre su propia simulacion
// del juego (objetos que caen, puntaje compartido) en el servidor, para
// que todos los jugadores conectados -- cada uno en su casa, con su propia
// camara -- vean exactamente lo mismo. Cada cliente manda las posiciones
// de sus manos (detectadas localmente con MediaPipe) y el servidor decide
// que atrapa que.
"use strict";

const TICK_MS = 1000 / 20; // 20 veces por segundo alcanza para objetos que caen
const SPAWN_MIN_MS = 650;
const SPAWN_MAX_MS = 1500;
const CATCH_RADIUS = 0.045;
const ROOM_IDLE_CLEANUP_MS = 2 * 60 * 1000;

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

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin letras/numeros ambiguos

function makeCode() {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

class Room {
  constructor(code) {
    this.code = code;
    this.hostId = null;
    this.players = new Map(); // id -> { ws, name, hands }
    this.objects = [];
    this.nextObjectId = 1;
    this.score = 0;
    this.misses = 0;
    this.speedMultiplier = 1;
    this.windy = false;
    this.weatherKind = "none";
    this.powerupUntil = 0;
    this.nextSpawnAt = Date.now() + 900;
    this.createdAt = Date.now();
    this.emptySince = null;
  }

  addPlayer(id, ws, name) {
    this.players.set(id, { ws, name: name || "Jugador", hands: [] });
    if (!this.hostId) this.hostId = id;
    this.emptySince = null;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.players.size === 0) this.emptySince = Date.now();
    else if (this.hostId === id) this.hostId = this.players.keys().next().value;
  }

  setHands(id, points) {
    const p = this.players.get(id);
    if (p) p.hands = Array.isArray(points) ? points.slice(0, 8 * 7) : [];
  }

  setOptions(opts) {
    if (typeof opts.speed === "number" && opts.speed > 0) this.speedMultiplier = opts.speed;
    if (typeof opts.windy === "boolean") this.windy = opts.windy;
    if (typeof opts.weatherKind === "string") this.weatherKind = opts.weatherKind;
  }

  _allHandPoints() {
    const pts = [];
    for (const p of this.players.values()) {
      for (const h of p.hands) {
        if (h && typeof h.x === "number" && typeof h.y === "number") pts.push(h);
      }
    }
    return pts;
  }

  tick(dtSec) {
    if (this.players.size === 0) return;
    const now = Date.now();

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

    const hands = this._allHandPoints();
    const scoreMult = now < this.powerupUntil ? 2 : 1;
    const survivors = [];

    for (const o of this.objects) {
      o.y += o.speed * dtSec;
      o.x += Math.sin(now / 380 + o.phase) * o.drift * dtSec;
      o.x = Math.min(0.98, Math.max(0.02, o.x));

      let caught = false;
      const catchR = o.r + CATCH_RADIUS;
      for (const h of hands) {
        const dx = h.x - o.x;
        const dy = h.y - o.y;
        if (dx * dx + dy * dy <= catchR * catchR) {
          caught = true;
          break;
        }
      }

      if (caught) {
        if (o.type === "pumpkin") this.score += 10 * scoreMult;
        else if (o.type === "witch_hat") this.powerupUntil = now + 8000;
        else this.misses += 1;
        continue;
      }

      if (o.y > 1.1) {
        if (o.type === "pumpkin") this.misses += 1;
        continue;
      }

      survivors.push(o);
    }

    this.objects = survivors;
  }

  publicState() {
    return {
      type: "state",
      score: this.score,
      misses: this.misses,
      powerup: Date.now() < this.powerupUntil,
      objects: this.objects.map((o) => ({ id: o.id, type: o.type, x: o.x, y: o.y, r: o.r })),
      players: Array.from(this.players.entries()).map(([id, p]) => ({
        id,
        name: p.name,
        isHost: id === this.hostId,
      })),
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this._interval = setInterval(() => this._tickAll(), TICK_MS);
  }

  _tickAll() {
    const dtSec = TICK_MS / 1000;
    for (const room of this.rooms.values()) {
      if (room.players.size === 0) continue;
      room.tick(dtSec);
      const payload = JSON.stringify(room.publicState());
      for (const p of room.players.values()) {
        if (p.ws.readyState === 1) {
          try { p.ws.send(payload); } catch (_e) {}
        }
      }
    }

    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince && now - room.emptySince > ROOM_IDLE_CLEANUP_MS) {
        this.rooms.delete(code);
      }
    }
  }

  createRoom() {
    let code;
    do { code = makeCode(); } while (this.rooms.has(code));
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(String(code || "").trim().toUpperCase());
  }
}

module.exports = { RoomManager };
