// Cliente de WebSocket para el modo multijugador online: crea o une salas
// por codigo, manda las manos detectadas localmente y recibe el estado
// compartido del juego (objetos que caen, puntaje) que calcula el
// servidor a partir de las manos de todos los jugadores conectados.
export class MultiplayerClient {
  constructor() {
    this.ws = null;
    this.roomCode = null;
    this.playerId = null;
    this.isHost = false;
    this.onState = null;
    this.onJoined = null;
    this.onError = null;
  }

  _connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      let settled = false;
      ws.onopen = () => {
        settled = true;
        resolve();
      };
      ws.onerror = () => {
        if (!settled) reject(new Error("No se pudo conectar al servidor de salas."));
      };
      ws.onmessage = (ev) => this._onMessage(ev);
      ws.onclose = () => {
        if (this.onError) this.onError(new Error("Se perdio la conexion con la sala."));
      };
      this.ws = ws;
    });
  }

  _onMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (_e) {
      return;
    }
    if (msg.type === "joined") {
      this.roomCode = msg.code;
      this.playerId = msg.playerId;
      this.isHost = !!msg.isHost;
      if (this.onJoined) this.onJoined(msg);
    } else if (msg.type === "state") {
      if (this.onState) this.onState(msg);
    } else if (msg.type === "error") {
      if (this.onError) this.onError(new Error(msg.message));
    }
  }

  async createRoom(name) {
    await this._connect();
    this.ws.send(JSON.stringify({ type: "create_room", name }));
  }

  async joinRoom(code, name) {
    await this._connect();
    this.ws.send(JSON.stringify({ type: "join_room", code, name }));
  }

  sendHands(points) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "hands", points }));
    }
  }

  setOptions(opts) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "set_options", ...opts }));
    }
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_e) {}
    }
    this.ws = null;
  }
}
