import { loginPlayer, saveScore } from "./api.js";
import { createWeatherWatcher } from "./weather.js";
import { WeatherLayer } from "./weatherLayer.js";
import { startHandTracking } from "./hands.js";
import { AudioEngine } from "./audio.js";
import { GameView } from "./game.js";
import { MultiplayerClient } from "./multiplayer.js";

const screens = {
  mode: document.getElementById("screen-mode"),
  login: document.getElementById("screen-login"),
  room: document.getElementById("screen-room"),
  setup: document.getElementById("screen-setup"),
  game: document.getElementById("screen-game"),
};

function showScreen(name) {
  for (const el of Object.values(screens)) el.classList.remove("active");
  screens[name].classList.add("active");
}

for (const btn of document.querySelectorAll("[data-back]")) {
  btn.addEventListener("click", () => showScreen(btn.dataset.back));
}

const state = {
  mode: null, // "solo" | "multi"
  username: null,
  playerName: null,
  orientation: "horizontal",
  speed: 4.2,
  volume: 70,
  isHost: true,
  roomCode: null,
};

const audio = new AudioEngine();
audio.setVolume(state.volume);

// --- Pantalla de modo -----------------------------------------------
document.getElementById("mode-solo-btn").addEventListener("click", () => {
  state.mode = "solo";
  showScreen("login");
});
document.getElementById("mode-multi-btn").addEventListener("click", () => {
  state.mode = "multi";
  showScreen("room");
});

// --- Pantalla de usuario (modo solo) ---------------------------------
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
loginForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const username = document.getElementById("username-input").value.trim();
  if (!username) return;
  loginStatus.textContent = "Buscando tu progreso...";
  try {
    const player = await loginPlayer(username);
    state.username = player.username;
    state.isHost = true;
    document.getElementById("setup-greeting").textContent = `Hola, ${player.username}`;
    document.getElementById("setup-score-line").textContent = player.isNew
      ? "¡Bienvenido! Arrancás desde 0."
      : `Seguís donde lo dejaste: ${player.score} puntos.`;
    document.getElementById("speed-group").classList.remove("hidden");
    document.getElementById("speed-guest-hint").classList.add("hidden");
    loginStatus.textContent = "";
    showScreen("setup");
  } catch (err) {
    loginStatus.textContent = err.message || "No se pudo iniciar sesión.";
  }
});

// --- Pantalla de sala (modo multijugador) ----------------------------
const roomStatus = document.getElementById("room-status");
const roomCodeDisplay = document.getElementById("room-code-display");
const roomCodeValue = document.getElementById("room-code-value");
let multiplayerClient = null;

document.getElementById("create-room-btn").addEventListener("click", async () => {
  const name = document.getElementById("room-name-input").value.trim() || "Anfitrión";
  roomStatus.textContent = "Creando sala...";
  multiplayerClient = new MultiplayerClient();
  multiplayerClient.onError = (err) => {
    roomStatus.textContent = err.message;
  };
  try {
    await multiplayerClient.createRoom(name);
    multiplayerClient.onJoined = (msg) => {
      state.playerName = name;
      state.isHost = true;
      state.roomCode = msg.code;
      roomCodeValue.textContent = msg.code;
      roomCodeDisplay.classList.remove("hidden");
      roomStatus.textContent = "Sala creada. Cuando quieras, empezá a jugar.";
      document.getElementById("setup-greeting").textContent = `Sala ${msg.code}`;
      document.getElementById("setup-score-line").textContent = "Puntaje compartido de la partida.";
      document.getElementById("speed-group").classList.remove("hidden");
      document.getElementById("speed-guest-hint").classList.add("hidden");
      setTimeout(() => showScreen("setup"), 900);
    };
  } catch (err) {
    roomStatus.textContent = err.message || "No se pudo crear la sala.";
  }
});

document.getElementById("join-room-btn").addEventListener("click", async () => {
  const name = document.getElementById("room-name-input").value.trim() || "Jugador";
  const code = document.getElementById("room-code-input").value.trim().toUpperCase();
  if (!code) {
    roomStatus.textContent = "Escribí el código de la sala.";
    return;
  }
  roomStatus.textContent = "Uniéndose...";
  multiplayerClient = new MultiplayerClient();
  multiplayerClient.onError = (err) => {
    roomStatus.textContent = err.message;
  };
  try {
    await multiplayerClient.joinRoom(code, name);
    multiplayerClient.onJoined = (msg) => {
      state.playerName = name;
      state.isHost = msg.isHost;
      state.roomCode = msg.code;
      roomStatus.textContent = `Te uniste a la sala ${msg.code}.`;
      document.getElementById("setup-greeting").textContent = `Sala ${msg.code}`;
      document.getElementById("setup-score-line").textContent = "Puntaje compartido de la partida.";
      if (msg.isHost) {
        document.getElementById("speed-group").classList.remove("hidden");
        document.getElementById("speed-guest-hint").classList.add("hidden");
      } else {
        document.getElementById("speed-group").classList.add("hidden");
        document.getElementById("speed-guest-hint").classList.remove("hidden");
      }
      setTimeout(() => showScreen("setup"), 500);
    };
  } catch (err) {
    roomStatus.textContent = err.message || "No se pudo unir a la sala.";
  }
});

// --- Pantalla de configuracion -----------------------------------------
function wireOptionGroup(selector, attr, onPick) {
  const buttons = document.querySelectorAll(selector);
  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      for (const b of buttons) b.classList.remove("selected");
      btn.classList.add("selected");
      onPick(btn.dataset[attr]);
    });
  }
}

wireOptionGroup("[data-orientation]", "orientation", (v) => { state.orientation = v; });
wireOptionGroup("[data-speed]", "speed", (v) => { state.speed = parseFloat(v); });

// selecciones por defecto
document.querySelector('[data-orientation="horizontal"]').classList.add("selected");
document.querySelector('[data-speed="4.2"]').classList.add("selected");

const volumeSlider = document.getElementById("volume-slider");
volumeSlider.addEventListener("input", () => {
  state.volume = parseInt(volumeSlider.value, 10);
  document.getElementById("volume-value").textContent = state.volume;
  audio.setVolume(state.volume);
});

// --- Juego ---------------------------------------------------------------
const video = document.getElementById("input-video");
const canvas = document.getElementById("game-canvas");
const weatherCanvas = document.getElementById("weather-canvas");
const cameraWarning = document.getElementById("camera-warning");
const hud = {
  username: document.getElementById("hud-username"),
  score: document.getElementById("hud-score"),
  misses: document.getElementById("hud-misses"),
  weather: document.getElementById("hud-weather"),
  room: document.getElementById("hud-room"),
  players: document.getElementById("hud-players"),
};

const weatherLayer = new WeatherLayer();
const gameView = new GameView({ canvas, video, hud, audio, weatherLayer, weatherCanvas });

let weatherWatcher = null;
let handTracker = null;
let scoreSaveTimer = null;

document.getElementById("start-game-btn").addEventListener("click", async () => {
  audio.resumeAfterGesture();
  gameView.setOrientation(state.orientation);
  window.addEventListener("resize", () => gameView.setOrientation(state.orientation));

  await gameView.init();
  showScreen("game");
  audio.startMusic();

  hud.username.textContent =
    state.mode === "solo" ? state.username : `${state.playerName} · Sala ${state.roomCode}`;
  hud.room.textContent = state.mode === "multi" ? `Código: ${state.roomCode}` : "";

  weatherWatcher = createWeatherWatcher((w) => {
    weatherLayer.setState(w);
    hud.weather.textContent = w.label;
    gameView.setWindy(w.windy);
  });

  handTracker = startHandTracking(
    video,
    (results) => gameView.onHandResults(results),
    (_err) => cameraWarning.classList.remove("hidden")
  );

  if (state.mode === "solo") {
    gameView.startSolo({ speed: state.speed, windy: false });
    scoreSaveTimer = setInterval(() => {
      const s = gameView.simulation.publicState();
      saveScore(state.username, s.score, s.misses);
    }, 5000);
    window.addEventListener("beforeunload", () => {
      const s = gameView.simulation.publicState();
      saveScore(state.username, s.score, s.misses);
    });
  } else {
    if (state.isHost) multiplayerClient.setOptions({ speed: state.speed });
    gameView.startMulti(multiplayerClient);
    // encadena el manejador de estado de GameView (que actualiza el
    // render) con la actualizacion de la lista de jugadores en el HUD
    const gameStateHandler = multiplayerClient.onState;
    multiplayerClient.onState = (s) => {
      gameStateHandler(s);
      const names = (s.players || []).map((p) => (p.isHost ? `${p.name} (host)` : p.name));
      hud.players.textContent = `Jugadores: ${names.join(", ")}`;
    };
  }
});
