type MessageHandler = (data: Record<string, unknown>) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  public status: "connected" | "disconnected" | "connecting" = "disconnected";

  connect(url: string) {
    if (typeof window === "undefined") return;
    this.status = "connecting";
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.status = "connected";
      };
      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          this.handlers.forEach((h) => h(data));
        } catch {}
      };
      this.ws.onclose = () => {
        this.status = "disconnected";
        this.reconnectTimer = setTimeout(() => this.connect(url), 3000);
      };
      this.ws.onerror = () => {
        this.status = "disconnected";
      };
    } catch {
      this.status = "disconnected";
    }
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler);
  }
  unsubscribe(handler: MessageHandler) {
    this.handlers.delete(handler);
  }
  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

export const wsManager = new WebSocketManager();
