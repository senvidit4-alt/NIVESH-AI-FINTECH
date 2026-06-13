# Nivesh AI · Agent Backend

FastAPI service that wraps `logic_agent.financial_agent` for the Nivesh AI frontend.

## Why a separate service?

The frontend runs on Cloudflare Workers (TanStack Start), which **cannot** execute
Python or load native ML models (PyTorch, transformers). `logic_agent.py` must run
as its own Python service on Render / Fly.io / Railway / Cloud Run / a VM.

## Local run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export GROQ_API_KEY=...
# Optional: OPENAI_API_KEY, ANTHROPIC_API_KEY, REDIS_URL, DATABASE_URL

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoints

- `POST /api/analyze` → `{ "answer": "..." }`
- `POST /api/analyze/stream` → SSE: node-progress events + final answer
- `GET /health`

Body: `{ "query": "Analyze Reliance Industries" }`

## Wire the frontend

Set `VITE_AGENT_API_URL=https://your-backend.example.com` and rebuild. The chat
UI at `/#chat` will call `${VITE_AGENT_API_URL}/api/analyze`.

Lock CORS down in production via `CORS_ORIGINS=https://your-frontend,https://...`.