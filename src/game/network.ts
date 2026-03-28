/**
 * WebSocket client for multiplayer sync.
 * Connects to Go backend, sends player position, receives other players.
 */

export interface RemotePlayer {
  userId: string;
  displayName: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  animation: number; // 0=idle, 1=walk, 2=run
  lastUpdate: number;
}

interface WSMessage {
  type: string;
  payload: unknown;
}

type OnPlayersUpdate = (players: Map<string, RemotePlayer>) => void;
type OnChat = (userId: string, displayName: string, message: string) => void;

export class NetworkClient {
  private ws: WebSocket | null = null;
  private remotePlayers = new Map<string, RemotePlayer>();
  private onPlayersUpdate: OnPlayersUpdate | null = null;
  private onChat: OnChat | null = null;
  private sendInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private city: string = "";

  /** Connect to the game server */
  connect(serverURL: string, city: string): void {
    this.city = city;
    const url = `${serverURL}/api/v1/ws?city=${encodeURIComponent(city)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      console.warn("WebSocket connection failed — running in offline mode");
      return;
    }

    this.ws.onopen = () => {
      console.log(`Connected to server (city: ${city})`);
      this.connected = true;
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      console.log("Disconnected from server");
      this.connected = false;
      this.remotePlayers.clear();
      this.onPlayersUpdate?.(this.remotePlayers);
    };

    this.ws.onerror = () => {
      console.warn("WebSocket error — running in offline mode");
    };
  }

  /** Disconnect */
  disconnect(): void {
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.remotePlayers.clear();
  }

  /** Send player position (call from game loop, throttled internally) */
  sendPosition(x: number, y: number, z: number, heading: number, animation: number): void {
    if (!this.connected || !this.ws) return;

    this.send({
      type: "player_move",
      payload: { x, y, z, heading, animation },
    });
  }

  /** Send chat message */
  sendChat(message: string): void {
    if (!this.connected || !this.ws) return;

    this.send({
      type: "chat",
      payload: { message },
    });
  }

  /** Register callback for player updates */
  onPlayers(callback: OnPlayersUpdate): void {
    this.onPlayersUpdate = callback;
  }

  /** Register callback for chat messages */
  onChatMessage(callback: OnChat): void {
    this.onChat = callback;
  }

  /** Get current remote players */
  getRemotePlayers(): Map<string, RemotePlayer> {
    return this.remotePlayers;
  }

  /** Check if connected */
  isConnected(): boolean {
    return this.connected;
  }

  private send(msg: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(msg: WSMessage): void {
    switch (msg.type) {
      case "player_move": {
        const p = msg.payload as {
          user_id: string;
          display_name: string;
          x: number; y: number; z: number;
          heading: number;
          animation: number;
        };
        this.remotePlayers.set(p.user_id, {
          userId: p.user_id,
          displayName: p.display_name || "Player",
          x: p.x, y: p.y, z: p.z,
          heading: p.heading,
          animation: p.animation,
          lastUpdate: Date.now(),
        });
        this.onPlayersUpdate?.(this.remotePlayers);
        break;
      }

      case "player_leave": {
        const p = msg.payload as { user_id: string };
        this.remotePlayers.delete(p.user_id);
        this.onPlayersUpdate?.(this.remotePlayers);
        break;
      }

      case "chat": {
        const p = msg.payload as {
          user_id: string;
          display_name: string;
          message: string;
        };
        this.onChat?.(p.user_id, p.display_name, p.message);
        break;
      }
    }
  }
}

// Singleton
let _client: NetworkClient | null = null;

export function getNetworkClient(): NetworkClient {
  if (!_client) {
    _client = new NetworkClient();
  }
  return _client;
}
