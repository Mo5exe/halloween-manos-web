import { drawBoneSkeleton, catchPointsFromLandmarks, catchPointsNormalized } from "./render.js";
import { loadSprites, loadImage } from "./sprites.js";
import { Simulation } from "./simulation.js";

const SPRITE_SIZE = { pumpkin: 0.13, vampire: 0.16, ghost: 0.16, witch_hat: 0.12 };
const ANIM_FPS = 10;

// Controla el canvas del juego: fondo de camara (espejado), objetos que
// caen (con sprites), esqueleto de huesos de las manos detectadas, y las
// particulas del power-up del sombrero de bruja. Funciona tanto en modo
// solo (con una Simulation local) como en modo multijugador (mostrando el
// estado que manda el servidor).
export class GameView {
  constructor({ canvas, video, hud, audio, weatherLayer, weatherCanvas }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.video = video;
    this.hud = hud;
    this.audio = audio;
    this.weatherLayer = weatherLayer;
    this.weatherCanvas = weatherCanvas;
    this.wctx = weatherCanvas.getContext("2d");

    this.sprites = null;
    this.orientation = "horizontal";

    this.mode = "solo"; // "solo" | "multi"
    this.simulation = null;
    this.multi = null;

    this.handsLocalPx = []; // [{landmarks:[{x,y}x21], handedness}]
    this.handsLocalNorm = [];

    this.particles = [];
    this._animClock = 0;
    this._running = false;
    this._lastTs = 0;
    this._onFrame = this._onFrame.bind(this);

    this._remoteState = { score: 0, misses: 0, powerup: false, objects: [] };
    this._prevPowerup = false;
    this._prevMisses = 0;

    this._lastHandCenter = null;
    this._handMovedSinceSound = false;
    this._nextHandMoveSoundAt = 0;
  }

  async init() {
    this.sprites = await loadSprites();
    this.backgroundImg = await loadImage("/assets/background.jpg");
  }

  setOrientation(orientation) {
    this.orientation = orientation;
    const isVertical = orientation === "vertical";
    const w = isVertical ? Math.min(window.innerHeight * 0.75, 720) : Math.min(window.innerWidth * 0.92, 1280);
    const h = isVertical ? Math.min(window.innerHeight * 0.92, 1280) : Math.min(window.innerHeight * 0.75, 720);
    for (const c of [this.canvas, this.weatherCanvas]) {
      c.width = Math.round(w);
      c.height = Math.round(h);
    }
  }

  // Llamado desde hands.js con los resultados crudos de MediaPipe en cada
  // cuadro de camara.
  onHandResults(results) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const landmarksList = results.multiHandLandmarks || results.multi_hand_landmarks || [];
    const handednessList = results.multiHandedness || results.multi_handedness || [];

    this.handsLocalPx = [];
    this.handsLocalNorm = [];

    for (let i = 0; i < landmarksList.length; i++) {
      const raw = landmarksList[i];
      // se espeja horizontalmente (1 - x) para que la vista sea "selfie"
      const norm = raw.map((p) => ({ x: 1 - p.x, y: p.y }));
      const px = norm.map((p) => ({ x: p.x * w, y: p.y * h }));
      let label = null;
      const entry = handednessList[i];
      if (entry) {
        const c = entry.classification ? entry.classification[0] : entry;
        label = c && c.label;
        // la mano tambien se espeja al invertir x, asi que Left/Right se
        // intercambian respecto de lo que reporta MediaPipe
        if (label === "Left") label = "Right";
        else if (label === "Right") label = "Left";
      }
      this.handsLocalNorm.push(norm);
      this.handsLocalPx.push({ landmarks: px, handedness: label });
    }
  }

  startSolo({ speed, windy }) {
    this.mode = "solo";
    this.simulation = new Simulation();
    this.simulation.setOptions({ speed, windy });
    this._start();
  }

  startMulti(multiplayerClient) {
    this.mode = "multi";
    this.multi = multiplayerClient;
    this.multi.onState = (state) => {
      this._remoteState = state;
    };
    this._start();
  }

  setWindy(windy) {
    if (this.mode === "solo" && this.simulation) this.simulation.setOptions({ windy });
    if (this.mode === "multi" && this.multi) this.multi.setOptions({ windy });
  }

  setSpeed(speed) {
    if (this.mode === "solo" && this.simulation) this.simulation.setOptions({ speed });
    if (this.mode === "multi" && this.multi) this.multi.setOptions({ speed });
  }

  _start() {
    this._running = true;
    this._lastTs = performance.now();
    requestAnimationFrame(this._onFrame);
  }

  stop() {
    this._running = false;
  }

  _onFrame(ts) {
    if (!this._running) return;
    const dt = Math.min(0.05, (ts - this._lastTs) / 1000);
    this._lastTs = ts;
    this._animClock += dt;

    let state;
    if (this.mode === "solo") {
      const handPoints = [];
      for (const norm of this.handsLocalNorm) handPoints.push(...catchPointsNormalized(norm));
      this.simulation.tick(dt, handPoints);
      state = this.simulation.publicState();
      this._maybePlaySoundsSolo();

      // manda las manos aunque sea solo, para reusar la misma UI de
      // envio si en el futuro se agrega "ver mi partida" -- no-op real
    } else if (this.mode === "multi") {
      if (this.multi) {
        const points = [];
        for (const norm of this.handsLocalNorm) points.push(...catchPointsNormalized(norm));
        this.multi.sendHands(points);
      }
      state = this._remoteState;
      this._maybePlaySoundsMulti(state);
    }

    this.weatherLayer.update(dt, this.canvas.width, this.canvas.height);
    this._updateParticles(dt);
    this._updateGhostMoveSound();
    this._draw(state);

    requestAnimationFrame(this._onFrame);
  }

  _maybePlaySoundsSolo() {
    const ev = this.simulation.lastEvent;
    if (ev === "catch_pumpkin") this.audio.playCatch();
    else if (ev === "hit") this.audio.playHit();
    else if (ev === "powerup") {
      this.audio.playPowerup();
      this._spawnPowerupParticles();
    }
  }

  _maybePlaySoundsMulti(state) {
    if (state.misses > this._prevMisses) this.audio.playHit();
    this._prevMisses = state.misses;
    if (state.powerup && !this._prevPowerup) {
      this.audio.playPowerup();
      this._spawnPowerupParticles();
    }
    this._prevPowerup = state.powerup;
  }

  // igual que en el juego de escritorio: cada tanto mientras una mano se
  // mueve (aunque sea lento), suena el aullido del fantasma real
  _updateGhostMoveSound() {
    const allPts = [];
    for (const hand of this.handsLocalPx) allPts.push(...hand.landmarks);

    if (allPts.length > 0) {
      let cx = 0, cy = 0;
      for (const p of allPts) { cx += p.x; cy += p.y; }
      cx /= allPts.length;
      cy /= allPts.length;

      if (this._lastHandCenter) {
        const dist = Math.hypot(cx - this._lastHandCenter.x, cy - this._lastHandCenter.y);
        if (dist > Math.max(6, this.canvas.width * 0.01)) this._handMovedSinceSound = true;
      }
      this._lastHandCenter = { x: cx, y: cy };
    } else {
      this._lastHandCenter = null;
    }

    const now = performance.now();
    if (this._handMovedSinceSound && now >= this._nextHandMoveSoundAt) {
      this.audio.playGhostMove();
      this._nextHandMoveSoundAt = now + (2000 + Math.random() * 1200);
      this._handMovedSinceSound = false;
    }
  }

  _spawnPowerupParticles() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: w / 2,
        y: h / 2,
        vx: (Math.random() - 0.5) * 420,
        vy: (Math.random() - 0.5) * 420,
        life: 0.6 + Math.random() * 0.4,
        age: 0,
        color: Math.random() < 0.5 ? "#b58af2" : "#ff9f2f",
      });
    }
  }

  _updateParticles(dt) {
    const alive = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      alive.push(p);
    }
    this.particles = alive;
  }

  _draw(state) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // fondo: la imagen decorativa de Halloween (igual que en la version de
    // escritorio) -- la camara real NUNCA se dibuja, solo se usa para
    // rastrear la mano
    if (this.backgroundImg) {
      this._drawCover(this.backgroundImg, this.backgroundImg.naturalWidth, this.backgroundImg.naturalHeight, w, h);
    } else {
      ctx.fillStyle = "#0e0710";
      ctx.fillRect(0, 0, w, h);
    }

    // objetos que caen
    const frameIdx = Math.floor(this._animClock * ANIM_FPS) % 12;
    for (const o of state.objects) {
      const sheet = this.sprites[o.type];
      if (!sheet) continue;
      const img = sheet[frameIdx];
      const size = SPRITE_SIZE[o.type] * Math.min(w, h);
      const x = o.x * w;
      const y = o.y * h;
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    }

    // esqueletos de manos locales
    for (const hand of this.handsLocalPx) {
      drawBoneSkeleton(ctx, hand.landmarks, w, hand.handedness);
    }

    // particulas del power-up
    for (const p of this.particles) {
      const alpha = 1 - p.age / p.life;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // capa de clima, en su propio canvas encima
    this.weatherLayer.draw(this.wctx, w, h);

    this._updateHud(state);
  }

  _drawCover(media, mediaW, mediaH, w, h) {
    const scale = Math.max(w / mediaW, h / mediaH);
    const dw = mediaW * scale;
    const dh = mediaH * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    this.ctx.drawImage(media, dx, dy, dw, dh);
  }

  _updateHud(state) {
    if (!this.hud) return;
    this.hud.score.textContent = `Puntaje: ${state.score}`;
    this.hud.misses.textContent = `Sustos: ${state.misses}`;
    if (state.powerup) {
      this.hud.score.classList.add("powerup");
    } else {
      this.hud.score.classList.remove("powerup");
    }
  }
}
