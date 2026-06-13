/**
 * useWebSocket.ts
 * Connects to the FastAPI WebSocket endpoint for live market price updates.
 * Auto-reconnects after 3 seconds on disconnect.
 * FIX 4: Exports lastEvent so components can react to backend push events (e.g. alert_triggered).
 */
import { useEffect, useRef, useState } from "react";

const WS_BASE = (import.meta.env.VITE_AGENT_API_URL as string | undefined) ?? "";

export interface PriceData {
  price: number;
  change: number;
  change_pct: number;
  source?: string;
}

// Generic event shape from the backend — alert_triggered, market_update, etc.
export type WebSocketEvent = { type: string; [key: string]: unknown } | null;

export interface UseWebSocketReturn {
  prices: Record<string, PriceData>;
  connected: boolean;
  lastEvent: WebSocketEvent; // FIX 4: last non-price event from backend
}

export function useWebSocket(): UseWebSocketReturn {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent>(null); // FIX 4
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    function getWsUrl(): string | null {
      if (!WS_BASE) return null;
      // Convert http(s) → ws(s)
      const wsUrl = WS_BASE.replace(/^https/, "wss").replace(/^http/, "ws").replace(/\/$/, "");
      return `${wsUrl}/ws/market-updates`;
    }

    function connect() {
      if (unmountedRef.current) return;
      const wsUrl = getWsUrl();
      if (!wsUrl) {
        // No backend configured — stay disconnected silently
        return;
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmountedRef.current) { ws.close(); return; }
          setConnected(true);
        };

        ws.onmessage = (event) => {
          if (unmountedRef.current) return;
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              data?: Record<string, PriceData>;
              [key: string]: unknown;
            };

            if (msg.type === "market_update" && msg.data) {
              // Price tick — update prices map
              setPrices((prev) => ({ ...prev, ...msg.data }));
            } else {
              // Any other event (alert_triggered, etc.) — expose via lastEvent
              setLastEvent(msg);
            }
          } catch {
            // malformed message — ignore
          }
        };

        ws.onclose = () => {
          if (unmountedRef.current) return;
          setConnected(false);
          // Auto-reconnect after 3 seconds
          reconnectTimerRef.current = setTimeout(() => {
            if (!unmountedRef.current) connect();
          }, 3000);
        };

        ws.onerror = () => {
          // Let onclose handle reconnect
          ws.close();
        };
      } catch {
        // WebSocket construction failed (e.g., invalid URL in test env) — ignore
      }
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      setConnected(false);
    };
  }, []);

  return { prices, connected, lastEvent };
}
