"""
FastAPI wrapper around logic_agent.financial_agent.

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Then set VITE_AGENT_API_URL=http://localhost:8000 in the frontend.

Deploy targets that work out of the box: Render, Fly.io, Railway, Google Cloud Run.
(Cloudflare Workers cannot run this — it requires Python + native ML deps.)
"""
import asyncio
import json
import os
from typing import AsyncGenerator, Optional, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from logic_agent import financial_agent

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]

app = FastAPI(title="Nivesh AI · Agent Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    query: str
    history: Optional[List[dict]] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    """Synchronous endpoint returning the final agent answer."""
    loop = asyncio.get_event_loop()
    answer = await loop.run_in_executor(None, financial_agent, req.query, "user_session_1", req.history or [])
    return {"answer": answer}


@app.post("/api/analyze/stream")
async def analyze_stream(req: AnalyzeRequest):
    """SSE stream: emits node-progress events then the final answer.

    Frontend can subscribe via fetch + reader to highlight LangGraph nodes
    in real time. Falls back gracefully if streaming is unavailable.
    """
    async def gen() -> AsyncGenerator[bytes, None]:
        nodes = ["research", "data", "sentiment", "risk", "decision"]
        for n in nodes:
            yield f"data: {json.dumps({'type':'node','id':n})}\n\n".encode()
            await asyncio.sleep(0.4)
        loop = asyncio.get_event_loop()
        answer = await loop.run_in_executor(None, financial_agent, req.query, "user_session_1", req.history or [])
        yield f"data: {json.dumps({'type':'answer','text':answer})}\n\n".encode()
        yield b"data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")