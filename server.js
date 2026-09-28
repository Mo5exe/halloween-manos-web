"use strict";

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const db = require("./db");
const { RoomManager } = require("./rooms");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Busca (o crea) un jugador por nombre de usuario y devuelve su puntaje
// guardado, para que pueda "seguir donde lo dejo" -- modo solo.
app.post("/api/login", async (req, res) => {
  try {
    const { username } = req.body || {};
    const player = await db.findOrCreatePlayer(username);
    res.json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Guarda el puntaje actual de un jugador (modo solo). Se llama
// periodicamente durante la partida y al salir/perder foco.
app.post("/api/score", async (req, res) => {
  try {
    const { username, score, misses } = req.body || {};
    const saved = await db.saveScore(username, score, misses);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Multijugador online (salas por codigo, estado compartido) ---------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const roomManager = new RoomManager();

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

wss.on("connection", (ws) => {
  let currentRoom = null;
  let playerId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_e) {
      return;
    }

    if (msg.type === "create_room") {
      const room = roomManager.createRoom();
      playerId = randomId();
      room.addPlayer(playerId, ws, msg.name);
      currentRoom = room;
      ws.send(JSON.stringify({ type: "joined", code: room.code, playerId, isHost: true }));
      return;
    }

    if (msg.type === "join_room") {
      const room = roomManager.getRoom(msg.code);
      if (!room) {
        ws.send(JSON.stringify({ type: "error", message: "No existe una sala con ese codigo." }));
        return;
      }
      playerId = randomId();
      room.addPlayer(playerId, ws, msg.name);
      currentRoom = room;
      ws.send(JSON.stringify({ type: "joined", code: room.code, playerId, isHost: playerId === room.hostId }));
      return;
    }

    if (!currentRoom || !playerId) return;

    if (msg.type === "hands") {
      currentRoom.setHands(playerId, msg.points);
    } else if (msg.type === "set_options") {
      if (playerId === currentRoom.hostId) currentRoom.setOptions(msg);
    }
  });

  ws.on("close", () => {
    if (currentRoom && playerId) currentRoom.removePlayer(playerId);
  });
});

db.init()
  .catch((err) => console.error("Error inicializando la base de datos:", err))
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`Servidor escuchando en puerto ${PORT}`);
    });
  });
