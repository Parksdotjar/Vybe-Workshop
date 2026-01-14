export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/chat")) {
      const id = env.CHAT_ROOM.idFromName("main-room");
      const room = env.CHAT_ROOM.get(id);
      return room.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};

export class ChatRoom {
  constructor(state) {
    this.state = state;
    this.sessions = new Set();
    this.history = [];
    this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get("history");
      if (saved) this.history = saved;
    });
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    this.sessions.add(server);
    server.send(
      JSON.stringify({
        type: "history",
        messages: this.history,
      })
    );

    server.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== "chat") return;
        const message = {
          text: String(payload.text || "").slice(0, 500),
          role: String(payload.role || "member"),
          time: Number(payload.time || Date.now()),
        };
        this.history.push(message);
        if (this.history.length > 50) this.history.shift();
        this.state.storage.put("history", this.history);
        const outgoing = JSON.stringify({ type: "chat", message });
        for (const socket of this.sessions) {
          socket.send(outgoing);
        }
      } catch (error) {
        server.send(JSON.stringify({ type: "error", message: "Bad payload" }));
      }
    });

    const closeSession = () => {
      this.sessions.delete(server);
    };
    server.addEventListener("close", closeSession);
    server.addEventListener("error", closeSession);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}
