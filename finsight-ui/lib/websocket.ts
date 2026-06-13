// FIXED: Next.js websocket status updates
type MessageHandler = (data: Record<string, any>) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  public status: "connected" | "disconnected" | "connecting" = "disconnected";
  private currentUrl: string = "";

  connect(url: string) {
    if (typeof window === "undefined") return;
    this.currentUrl = url;
    this.status = "connecting";
    this.notifyStatus();
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.status = "connected";
        this.notifyStatus();
      };
      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          this.handlers.forEach((h) => h(data));
        } catch {}
      };
      this.ws.onclose = () => {
        this.status = "disconnected";
        this.notifyStatus();
        if (this.currentUrl) {
          this.reconnectTimer = setTimeout(() => this.connect(this.currentUrl), 3000);
        }
      };
      this.ws.onerror = () => {
        this.status = "disconnected";
        this.notifyStatus();
      };
    } catch {
      this.status = "disconnected";
      this.notifyStatus();
    }
  }

  private notifyStatus() {
    this.handlers.forEach((h) => h({ type: "status", status: this.status }));
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler);
    // Immediately send current status to new subscriber
    handler({ type: "status", status: this.status });
  }
  unsubscribe(handler: MessageHandler) {
    this.handlers.delete(handler);
  }
  disconnect() {
    this.currentUrl = "";
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.status = "disconnected";
    this.notifyStatus();
  }
}

export const wsManager = new WebSocketManager();
