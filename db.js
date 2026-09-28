// Conexion a Postgres + migracion minima. Usa la variable de entorno
// DATABASE_URL que Render inyecta automaticamente cuando se conecta una
// base de datos Postgres al servicio web (ver render.yaml).
//
// Si no hay DATABASE_URL configurada (por ejemplo corriendo local sin
// Postgres), el servidor sigue funcionando pero sin persistencia real:
// usa un mapa en memoria como respaldo, para poder probar el juego sin
// tener que instalar Postgres.
"use strict";

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;
let memoryStore = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  });
} else {
  console.warn(
    "Aviso: no hay DATABASE_URL configurada. Usando almacenamiento en " +
      "memoria (se pierde al reiniciar el servidor) -- solo para probar " +
      "local. En Render, conecta una base de datos Postgres al servicio."
  );
  memoryStore = new Map();
}

async function init() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      username TEXT PRIMARY KEY,
      score INTEGER NOT NULL DEFAULT 0,
      misses INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function normalizeUsername(username) {
  return String(username || "").trim().slice(0, 40);
}

// Busca un jugador por nombre de usuario. Si no existe, lo crea con
// puntaje 0. Devuelve { username, score, misses, isNew }.
async function findOrCreatePlayer(username) {
  const name = normalizeUsername(username);
  if (!name) throw new Error("Nombre de usuario vacio");

  if (pool) {
    const existing = await pool.query(
      "SELECT username, score, misses FROM players WHERE username = $1",
      [name]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return { username: row.username, score: row.score, misses: row.misses, isNew: false };
    }
    await pool.query(
      "INSERT INTO players (username, score, misses) VALUES ($1, 0, 0)",
      [name]
    );
    return { username: name, score: 0, misses: 0, isNew: true };
  }

  // respaldo en memoria
  if (memoryStore.has(name)) {
    const data = memoryStore.get(name);
    return { username: name, score: data.score, misses: data.misses, isNew: false };
  }
  memoryStore.set(name, { score: 0, misses: 0 });
  return { username: name, score: 0, misses: 0, isNew: true };
}

// Guarda el puntaje actual de un jugador (sobreescribe con el valor dado,
// que siempre es el estado mas reciente de la partida en curso).
async function saveScore(username, score, misses) {
  const name = normalizeUsername(username);
  if (!name) throw new Error("Nombre de usuario vacio");
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const safeMisses = Math.max(0, Math.floor(Number(misses) || 0));

  if (pool) {
    await pool.query(
      `INSERT INTO players (username, score, misses, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (username)
       DO UPDATE SET score = $2, misses = $3, updated_at = now()`,
      [name, safeScore, safeMisses]
    );
    return { username: name, score: safeScore, misses: safeMisses };
  }

  memoryStore.set(name, { score: safeScore, misses: safeMisses });
  return { username: name, score: safeScore, misses: safeMisses };
}

module.exports = { init, findOrCreatePlayer, saveScore, normalizeUsername };
