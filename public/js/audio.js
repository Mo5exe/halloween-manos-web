// Motor de audio simple: musica de fondo real + aullido de fantasma real
// (los mismos archivos .wav del juego de escritorio) mas un par de
// efectos cortos sintetizados con Web Audio (blips de atrapar/golpear),
// todo controlado por un volumen maestro.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterVolume = 0.7;
    this.music = null;
    this.ghostMove = null;
    this.enabled = true;
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  setVolume(percent) {
    this.masterVolume = Math.max(0, Math.min(1, percent / 100));
    if (this.music) this.music.volume = this.masterVolume * 0.5;
    if (this.ghostMove) this.ghostMove.volume = this.masterVolume;
  }

  startMusic() {
    try {
      this.music = new Audio("/assets/background_music.wav");
      this.music.loop = true;
      this.music.volume = this.masterVolume * 0.5;
      this.music.play().catch(() => {
        // el navegador bloquea el autoplay hasta el primer click/tap; se
        // reintenta en el primer gesto del usuario (ver main.js)
      });
    } catch (_e) {}
    try {
      this.ghostMove = new Audio("/assets/ghost_move.wav");
      this.ghostMove.volume = this.masterVolume;
    } catch (_e) {}
  }

  resumeAfterGesture() {
    if (this.music && this.music.paused) this.music.play().catch(() => {});
    this._ensureCtx();
  }

  playGhostMove() {
    if (!this.ghostMove) return;
    try {
      const clip = this.ghostMove.cloneNode();
      clip.volume = this.masterVolume;
      clip.play().catch(() => {});
    } catch (_e) {}
  }

  // efecto corto sintetizado: tono simple con caida, usado para atrapar /
  // golpear objetos (no necesita archivos externos)
  playBlip(freq = 440, duration = 0.12, type = "sine") {
    if (!this.enabled) return;
    try {
      const ctx = this._ensureCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), ctx.currentTime + duration);
      gain.gain.setValueAtTime(this.masterVolume * 0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_e) {}
  }

  playCatch() { this.playBlip(660, 0.1, "triangle"); }
  playHit() { this.playBlip(140, 0.25, "sawtooth"); }
  playPowerup() { this.playBlip(880, 0.35, "square"); }
}
