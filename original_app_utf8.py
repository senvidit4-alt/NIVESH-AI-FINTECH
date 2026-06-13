# ============================================================
#  FINSIGHT AI ΓÇö FastAPI Backend
#  Track B: app.py
# ============================================================
import os
import time
import asyncio
import logging
import json
import requests as req_lib

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import httpx
import numpy as np
import yfinance as yf
import pandas as pd
from scipy.optimize import minimize

from logic_agent import (
    financial_agent, get_price_with_fallback, get_price_cached,
    get_portfolio_from_db, cache_get, cache_set,
    calculate_var_cvar, get_sector_breakdown,
    get_news_with_fallback, analyze_sentiment_finbert,
    llm, DB_PATH,
)
import sqlite3

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ΓöÇΓöÇ ENV CONFIG ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
API_SECRET_TOKEN = os.environ.get("API_SECRET_TOKEN", "")
_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]
# Always allow localhost for local dev
for _local in ["http://localhost:3000", "http://127.0.0.1:3000",
                "http://localhost:3001", "http://127.0.0.1:3001"]:
    if _local not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(_local)
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = ["*"]

# ΓöÇΓöÇ APP SETUP ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
app = FastAPI(
    title="FinSight AI API",
    description="Track B Financial Research AI ΓÇö Powered by LangGraph + FinBERT",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ΓöÇΓöÇ WEBSOCKET CLIENTS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
connected_clients: list[WebSocket] = []

# ΓöÇΓöÇ BEARER TOKEN AUTH ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
security = HTTPBearer(auto_error=False)

UNPROTECTED = {"/", "/docs", "/redoc", "/openapi.json"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not API_SECRET_TOKEN or request.url.path in UNPROTECTED:
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[7:] != API_SECRET_TOKEN:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)

# ΓöÇΓöÇ REQUEST MODELS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
class AnalyzeRequest(BaseModel):
    symbol: str
    query: Optional[str] = None

class PortfolioHolding(BaseModel):
    symbol: str
    quantity: float
    avg_price: float

class PortfolioRequest(BaseModel):
    holdings: List[PortfolioHolding]

class ChatRequest(BaseModel):
    message: str

class OptimizeRequest(BaseModel):
    symbols: List[str]
    risk_tolerance: str = "medium"
    investment_amount: float = 100000

class WatchlistAddRequest(BaseModel):
    symbol: str

class AlertRequest(BaseModel):
    symbol: str
    target_price: float
    direction: str  # "above" or "below"

class EfficientFrontierRequest(BaseModel):
    symbols: List[str]

# ΓöÇΓöÇ RATE LIMITING ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
request_counts: dict = {}

def check_rate_limit(client_ip: str, limit: int = 60, window: int = 60):
    # Skip rate limiting for local development
    if client_ip in ("127.0.0.1", "localhost", "::1"):
        return
    now = time.time()
    request_counts.setdefault(client_ip, [])
    request_counts[client_ip] = [t for t in request_counts[client_ip] if now - t < window]
    if len(request_counts[client_ip]) >= limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 60 requests per minute.")
    request_counts[client_ip].append(now)

# ΓöÇΓöÇ ASYNC PRICE HELPERS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
async def fetch_price_async(symbol: str) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_price_cached, symbol)

async def fetch_multiple_prices(symbols: list) -> dict:
    logger.info(f"[ASYNC] Fetching {len(symbols)} symbols concurrently...")
    start = time.time()
    tasks = [fetch_price_async(s) for s in symbols]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = round(time.time() - start, 2)
    logger.info(f"[ASYNC] Fetched {len(symbols)} prices in {elapsed}s")
    return {
        sym: (res if not isinstance(res, Exception) else
              {"price": None, "source": "ERROR", "symbol": sym})
        for sym, res in zip(symbols, results)
    }

# ΓöÇΓöÇ ASYNC PRICE HELPERS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
async def fetch_price_async(symbol: str) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_price_cached, symbol)

async def fetch_multiple_prices(symbols: list) -> dict:
    logger.info(f"[ASYNC] Fetching {len(symbols)} symbols concurrently...")
    start = time.time()
    tasks = [fetch_price_async(s) for s in symbols]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = round(time.time() - start, 2)
    logger.info(f"[ASYNC] Fetched {len(symbols)} prices in {elapsed}s")
    return {
        sym: (res if not isinstance(res, Exception) else
              {"price": None, "source": "ERROR", "symbol": sym})
        for sym, res in zip(symbols, results)
    }

# ΓöÇΓöÇ PORTFOLIO MATH (MPT) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
def get_historical_returns(symbols: list, period: str = "1y") -> pd.DataFrame:
    returns_data = {}
    for symbol in symbols:
        try:
            hist = yf.Ticker(symbol).history(period=period)
            if not hist.empty:
                returns_data[symbol] = hist["Close"].pct_change().dropna()
        except Exception as e:
            logger.warning(f"[MPT] No history for {symbol}: {e}")
    if not returns_data:
        return pd.DataFrame()
    return pd.DataFrame(returns_data).dropna()

def calculate_portfolio_metrics(weights, mean_returns, cov_matrix, risk_free=0.065):
    port_return = np.sum(mean_returns * weights) * 252
    port_vol = np.sqrt(np.dot(weights.T, np.dot(cov_matrix * 252, weights)))
    sharpe = (port_return - risk_free) / port_vol if port_vol > 0 else 0
    return {
        "annual_return": round(float(port_return) * 100, 2),
        "annual_volatility": round(float(port_vol) * 100, 2),
        "sharpe_ratio": round(float(sharpe), 3),
    }

def optimize_portfolio(symbols: list, risk_tolerance: str = "medium") -> dict:
    logger.info(f"[MPT] Optimizing portfolio: {symbols}")
    returns_df = get_historical_returns(symbols)
    if returns_df.empty or len(returns_df.columns) < 2:
        n = len(symbols)
        weights = [round(1/n, 4)] * n
        return {"weights": dict(zip(symbols, weights)), "method": "equal_weight_fallback", "metrics": None}
    mean_returns = returns_df.mean()
    cov_matrix = returns_df.cov()
    n = len(returns_df.columns)
    risk_map = {"low": 0.5, "medium": 1.0, "high": 1.5}
    modifier = risk_map.get(risk_tolerance, 1.0)
    def neg_sharpe(weights):
        m = calculate_portfolio_metrics(weights, mean_returns.values, cov_matrix.values)
        return -m["sharpe_ratio"] * modifier
    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    bounds = tuple((0.05, 0.60) for _ in range(n))
    x0 = np.array([1/n] * n)
    try:
        result = minimize(neg_sharpe, x0, method="SLSQP", bounds=bounds,
                          constraints=constraints, options={"maxiter": 1000})
        opt_weights = result.x
    except Exception as e:
        logger.warning(f"[MPT] Optimization failed: {e}. Using equal weights.")
        opt_weights = x0
    opt_weights = np.abs(opt_weights)
    opt_weights = opt_weights / opt_weights.sum()
    metrics = calculate_portfolio_metrics(opt_weights, mean_returns.values, cov_matrix.values)
    corr = returns_df.corr().round(3).to_dict()
    return {
        "weights": {sym: round(float(w), 4) for sym, w in zip(returns_df.columns, opt_weights)},
        "metrics": metrics,
        "correlation_matrix": corr,
        "method": "max_sharpe_mpt",
        "risk_tolerance": risk_tolerance,
    }

def calculate_sharpe_ratio(symbol: str, risk_free: float = 0.065) -> dict:
    try:
        hist = yf.Ticker(symbol).history(period="1y")
        if hist.empty:
            return {"sharpe": None, "error": "No data"}
        returns = hist["Close"].pct_change().dropna()
        ann_return = returns.mean() * 252
        ann_vol = returns.std() * (252 ** 0.5)
        sharpe = (ann_return - risk_free) / ann_vol if ann_vol > 0 else 0
        return {
            "symbol": symbol,
            "sharpe_ratio": round(float(sharpe), 3),
            "annual_return_pct": round(float(ann_return) * 100, 2),
            "annual_volatility_pct": round(float(ann_vol) * 100, 2),
            "risk_free_rate_pct": round(risk_free * 100, 2),
        }
    except Exception as e:
        return {"symbol": symbol, "sharpe": None, "error": str(e)}

# ΓöÇΓöÇ ALERT BACKGROUND TASK ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
async def check_alerts_loop():
    """Background task: check price alerts every 5 minutes."""
    while True:
        await asyncio.sleep(300)
        try:
            conn = sqlite3.connect(DB_PATH)
            alerts = conn.execute(
                "SELECT id, symbol, target_price, direction FROM alerts WHERE triggered=0"
            ).fetchall()
            conn.close()
            for alert_id, symbol, target_price, direction in alerts:
                try:
                    price_data = get_price_with_fallback(symbol)
                    price = price_data.get("price")
                    if price is None:
                        continue
                    triggered = (direction == "above" and price >= target_price) or \
                                (direction == "below" and price <= target_price)
                    if triggered:
                        conn = sqlite3.connect(DB_PATH)
                        conn.execute("UPDATE alerts SET triggered=1 WHERE id=?", (alert_id,))
                        conn.commit(); conn.close()
                        logger.info(f"[ALERT] TRIGGERED: {symbol} {direction} {target_price} (current={price})")
                except Exception as e:
                    logger.warning(f"[ALERT] Check error for {symbol}: {e}")
        except Exception as e:
            logger.warning(f"[ALERT] Loop error: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(check_alerts_loop())
    logger.info("[STARTUP] Alert background task started.")

# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
#  ENDPOINTS
# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

@app.get("/")
def root():
    return {
        "status": "online",
        "app": "FinSight AI",
        "version": "2.0.0 Track B",
        "endpoints": [
            "/analyze-stock", "/get-portfolio-risk", "/market-summary",
            "/chat", "/stock-price/{symbol}", "/optimize-portfolio",
            "/sharpe/{symbol}", "/prices-bulk", "/watchlist",
            "/alerts", "/economic-indicators", "/efficient-frontier", "/docs",
        ],
    }

@app.post("/analyze-stock")
async def analyze_stock(req: AnalyzeRequest, request: Request):
    check_rate_limit(request.client.host)
    try:
        query = req.query or f"Analyze {req.symbol}"
        logger.info(f"[API] /analyze-stock called for {req.symbol}")
        start = time.time()
        result = financial_agent(query)
        elapsed = round(time.time() - start, 2)
        return {
            "status": "success", "symbol": req.symbol,
            "analysis": result, "time_taken": f"{elapsed}s",
            "disclaimer": "Not financial advice. For educational purposes only.",
        }
    except Exception as e:
        logger.error(f"[API] analyze-stock error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stock-price/{symbol}")
async def get_stock_price(symbol: str, request: Request):
    check_rate_limit(request.client.host)
    try:
        result = get_price_with_fallback(symbol)
        if result["price"] is None:
            raise HTTPException(status_code=404, detail=f"Could not fetch price for {symbol}")
        return {
            "status": "success", "symbol": symbol,
            "price": result["price"], "source": result["source"],
            "currency": "INR" if ".NS" in symbol or ".BO" in symbol else "USD",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/get-portfolio-risk")
async def get_portfolio_risk(req: PortfolioRequest, request: Request):
    check_rate_limit(request.client.host)
    try:
        holdings = req.holdings
        if not holdings:
            raise HTTPException(status_code=400, detail="No holdings provided")

        total_value = 0
        portfolio_returns = []
        results = []
        symbols = []

        for h in holdings:
            symbol = h.symbol
            quantity = h.quantity
            avg_price = h.avg_price
            symbols.append(symbol)

            price_data = get_price_with_fallback(symbol)
            current_price = price_data["price"] or avg_price
            current_value = current_price * quantity
            total_value += current_value

            try:
                hist = yf.Ticker(symbol).history(period="1y")
                if not hist.empty:
                    returns = hist["Close"].pct_change().dropna().tolist()
                    portfolio_returns.extend(returns)
            except:
                pass

            pnl = (current_price - avg_price) * quantity
            pnl_pct = ((current_price - avg_price) / avg_price * 100 if avg_price > 0 else 0)
            results.append({
                "symbol": symbol, "quantity": quantity,
                "avg_price": avg_price, "current_price": current_price,
                "current_value": round(current_value, 2),
                "pnl": round(pnl, 2), "pnl_pct": round(pnl_pct, 2),
                "source": price_data["source"],
            })

        if portfolio_returns:
            returns_series = pd.Series(portfolio_returns)
            volatility = returns_series.std() * (252 ** 0.5) * 100
            avg_return = returns_series.mean() * 252 * 100
            risk_free = 6.5
            sharpe = (avg_return - risk_free) / (volatility if volatility > 0 else 1)
            var_95 = float(np.percentile(returns_series, 5)) * 100
            cvar_95 = float(returns_series[returns_series <= np.percentile(returns_series, 5)].mean()) * 100
            risk_level = "≡ƒƒó Low Risk" if volatility < 20 else "≡ƒƒí Medium Risk" if volatility < 40 else "≡ƒö┤ High Risk"
        else:
            volatility = sharpe = avg_return = var_95 = cvar_95 = 0
            risk_level = "ΓÜ¬ Unknown"

        sector_breakdown = get_sector_breakdown(symbols)

        return {
            "status": "success",
            "total_value": round(total_value, 2),
            "holdings": results,
            "risk_metrics": {
                "risk_level": risk_level,
                "volatility_pct": round(volatility, 2),
                "sharpe_ratio": round(sharpe, 2),
                "annualized_return_pct": round(avg_return, 2),
                "diversification_score": len(set(h.symbol for h in holdings)),
                "var_95_pct": round(var_95, 3),
                "cvar_95_pct": round(cvar_95, 3),
            },
            "sector_breakdown": sector_breakdown,
            "disclaimer": "Not financial advice. For educational purposes only.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API] portfolio-risk error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/market-summary")
async def market_summary(request: Request):
    check_rate_limit(request.client.host)
    cached = cache_get("market_summary")
    if cached:
        return cached
    try:
        symbols = {
            "NIFTY 50": "^NSEI", "SENSEX": "^BSESN",
            "BANK NIFTY": "^NSEBANK", "NIFTY IT": "^CNXIT",
        }
        summary = []
        for name, sym in symbols.items():
            try:
                data = yf.Ticker(sym).history(period="2d")
                if not data.empty and len(data) >= 2:
                    prev = data["Close"].iloc[-2]
                    curr = data["Close"].iloc[-1]
                    chg = curr - prev
                    chg_pct = (chg / prev) * 100
                    summary.append({
                        "name": name, "symbol": sym,
                        "price": round(curr, 2), "change": round(chg, 2),
                        "change_pct": round(chg_pct, 2),
                        "direction": "up" if chg > 0 else "down",
                    })
            except:
                pass
        result = {"status": "success", "market": "NSE/BSE", "indices": summary}
        if summary:
            cache_set("market_summary", result, ttl=15)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat(req: ChatRequest, request: Request):
    """Streaming chat with the LangGraph financial agent via SSE."""
    check_rate_limit(request.client.host)

    SYSTEM_PROMPT = """You are FinSight AI, a friendly and knowledgeable financial assistant specializing in Indian stock markets (NSE/BSE).

Personality:
- Warm, approachable and conversational ΓÇö greet users back, use their name if they share it
- When someone says hi/hello/hey/namaste, respond warmly, introduce yourself, and ask how you can help with their investments today
- Use light emojis where appropriate (≡ƒôê ≡ƒôë ≡ƒÆ░ ≡ƒæï ≡ƒÿè) but don't overdo it
- Be encouraging ΓÇö investing can be intimidating, make users feel comfortable
- Keep responses concise unless a detailed analysis is requested

Expertise:
- Indian equities (NIFTY, SENSEX, NSE/BSE stocks)
- Portfolio analysis, risk metrics, Sharpe ratio, VaR
- Technical analysis (RSI, MACD, moving averages)
- News sentiment and market trends

Rules:
- Always end financial advice with: ΓÜá∩╕Å Not financial advice ΓÇö for educational purposes only.
- For greetings or casual chat, skip the disclaimer and just be friendly
- If asked something outside finance, politely redirect to financial topics
- Never be robotic ΓÇö you are a helpful companion, not just a data tool"""

    async def event_stream():
        try:
            logger.info(f"[API] /chat stream: {req.message}")
            from langchain_core.messages import SystemMessage, HumanMessage
            messages = [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=req.message),
            ]
            full_response = []
            async for chunk in llm.astream(messages):
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if token:
                    full_response.append(token)
                    yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True, 'full': ''.join(full_response)})}\n\n"
        except Exception as e:
            logger.error(f"[API] /chat stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@app.post("/optimize-portfolio")
async def optimize_portfolio_endpoint(req: OptimizeRequest, request: Request):
    check_rate_limit(request.client.host)
    try:
        if len(req.symbols) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 symbols for optimization")
        logger.info(f"[API] /optimize-portfolio: {req.symbols}")
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, optimize_portfolio, req.symbols, req.risk_tolerance)
        allocation = {
            sym: {"weight_pct": round(w * 100, 2), "amount_inr": round(w * req.investment_amount, 2)}
            for sym, w in result["weights"].items()
        }
        return {
            "status": "success", "symbols": req.symbols,
            "risk_tolerance": req.risk_tolerance,
            "investment_amount": req.investment_amount,
            "optimal_allocation": allocation,
            "portfolio_metrics": result["metrics"],
            "correlation_matrix": result.get("correlation_matrix"),
            "method": result["method"],
            "disclaimer": "Not financial advice. Educational only.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API] optimize error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sharpe/{symbol}")
async def get_sharpe(symbol: str, request: Request):
    check_rate_limit(request.client.host)
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, calculate_sharpe_ratio, symbol)
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/prices-bulk")
async def get_bulk_prices(symbols: List[str], request: Request, background_tasks: BackgroundTasks):
    check_rate_limit(request.client.host)
    try:
        if len(symbols) > 20:
            raise HTTPException(status_code=400, detail="Max 20 symbols per request")
        start = time.time()
        prices = await fetch_multiple_prices(symbols)
        elapsed = round(time.time() - start, 2)
        results = [
            {
                "symbol": sym,
                "price": data.get("price"),
                "source": data.get("source"),
                "from_cache": data.get("from_cache", False),
            }
            for sym, data in prices.items()
        ]
        return {"status": "success", "count": len(results), "fetch_time": f"{elapsed}s", "prices": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ΓöÇΓöÇ WATCHLIST ENDPOINTS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
@app.post("/watchlist/add")
async def watchlist_add(req: WatchlistAddRequest, request: Request):
    check_rate_limit(request.client.host)
    symbol = req.symbol.upper().strip()
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("INSERT OR IGNORE INTO watchlist (symbol) VALUES (?)", (symbol,))
        conn.commit(); conn.close()
        return {"status": "success", "message": f"{symbol} added to watchlist."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/watchlist")
async def watchlist_get(request: Request):
    check_rate_limit(request.client.host)
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute("SELECT id, symbol, added_at FROM watchlist ORDER BY added_at DESC").fetchall()
        conn.close()
        items = [{"id": r[0], "symbol": r[1], "added_at": r[2]} for r in rows]
        return {"status": "success", "watchlist": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/watchlist/{symbol}")
async def watchlist_delete(symbol: str, request: Request):
    check_rate_limit(request.client.host)
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM watchlist WHERE symbol=?", (symbol.upper(),))
        conn.commit(); conn.close()
        return {"status": "success", "message": f"{symbol.upper()} removed from watchlist."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ΓöÇΓöÇ ALERTS ENDPOINTS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
@app.post("/alerts")
async def create_alert(req: AlertRequest, request: Request):
    check_rate_limit(request.client.host)
    if req.direction not in ("above", "below"):
        raise HTTPException(status_code=400, detail="direction must be 'above' or 'below'")
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("INSERT INTO alerts (symbol, target_price, direction) VALUES (?,?,?)",
                    (req.symbol.upper(), req.target_price, req.direction))
        conn.commit()
        alert_id = cur.lastrowid
        conn.close()
        return {"status": "success", "alert_id": alert_id, "symbol": req.symbol.upper(),
                "target_price": req.target_price, "direction": req.direction}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/alerts")
async def get_alerts(request: Request):
    check_rate_limit(request.client.host)
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute("SELECT id, symbol, target_price, direction, triggered, created_at FROM alerts").fetchall()
        conn.close()
        alerts = [{"id": r[0], "symbol": r[1], "target_price": r[2],
                   "direction": r[3], "triggered": bool(r[4]), "created_at": r[5]} for r in rows]
        return {"status": "success", "alerts": alerts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: int, request: Request):
    check_rate_limit(request.client.host)
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM alerts WHERE id=?", (alert_id,))
        conn.commit(); conn.close()
        return {"status": "success", "message": f"Alert {alert_id} deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ΓöÇΓöÇ ECONOMIC INDICATORS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
@app.get("/economic-indicators")
async def economic_indicators(request: Request):
    check_rate_limit(request.client.host)
    try:
        r = req_lib.get("https://api.rbi.org.in/api/v1/indicators", timeout=5)
        r.raise_for_status()
        data = r.json()
        return {"status": "success", "source": "rbi_api", **data}
    except Exception:
        return {
            "status": "success",
            "source": "hardcoded_fallback",
            "repo_rate": 6.5,
            "cpi_inflation": 5.1,
            "gdp_growth": 7.2,
            "usd_inr": 83.5,
            "sentiment": "BULLISH",
        }

# ΓöÇΓöÇ EFFICIENT FRONTIER ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
@app.post("/efficient-frontier")
async def efficient_frontier(req: EfficientFrontierRequest, request: Request):
    check_rate_limit(request.client.host)
    try:
        if len(req.symbols) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 symbols")
        returns_df = get_historical_returns(req.symbols)
        if returns_df.empty:
            raise HTTPException(status_code=422, detail="Could not fetch historical data")
        mean_returns = returns_df.mean().values
        cov_matrix = returns_df.cov().values
        n = len(req.symbols)
        points = []
        np.random.seed(42)
        for _ in range(500):
            w = np.random.dirichlet(np.ones(n))
            metrics = calculate_portfolio_metrics(w, mean_returns, cov_matrix)
            points.append({
                "weights": {sym: round(float(w[i]), 4) for i, sym in enumerate(req.symbols)},
                "annual_return": metrics["annual_return"],
                "annual_volatility": metrics["annual_volatility"],
                "sharpe_ratio": metrics["sharpe_ratio"],
            })
        return {"status": "success", "symbols": req.symbols, "points": points}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ΓöÇΓöÇ LIVE PRICE SSE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
@app.get("/live-price/{symbol}")
async def live_price_stream(symbol: str, request: Request):
    """Server-Sent Events: streams live price every 3 seconds."""
    async def price_generator():
        while True:
            try:
                if await request.is_disconnected():
                    break
                ticker = yf.Ticker(symbol)
                hist = ticker.history(period="1d", interval="1m")
                if not hist.empty:
                    latest = hist["Close"].iloc[-1]
                    prev = hist["Close"].iloc[-2] if len(hist) > 1 else latest
                    change = latest - prev
                    change_pct = (change / prev) * 100 if prev > 0 else 0
                    data = {
                        "symbol": symbol,
                        "price": round(float(latest), 2),
                        "change": round(float(change), 2),
                        "change_pct": round(float(change_pct), 4),
                        "timestamp": time.strftime("%H:%M:%S"),
                        "volume": int(hist["Volume"].iloc[-1]),
                    }
                else:
                    data = {"error": "No data", "symbol": symbol}
                yield f"data: {json.dumps(data)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            await asyncio.sleep(3)

    return StreamingResponse(
        price_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no",
        },
    )

# ΓöÇΓöÇ MARKET PULSE ΓÇö 1-MIN CANDLES ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
@app.get("/market-pulse/{symbol}")
async def market_pulse(symbol: str, request: Request):
    """Returns last 60 minutes of 1-minute candle data."""
    check_rate_limit(request.client.host)
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1d", interval="1m")
        if hist.empty:
            raise HTTPException(status_code=404, detail="No data")
        recent = hist.tail(60)
        candles = []
        for idx, row in recent.iterrows():
            candles.append({
                "time": idx.strftime("%H:%M"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })
        return {
            "status": "success",
            "symbol": symbol,
            "candles": candles,
            "latest": candles[-1] if candles else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ΓöÇΓöÇ WEBSOCKET ΓÇö REAL MARKET UPDATES ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
WS_DEFAULT_SYMBOLS = ["^NSEI", "^BSESN", "RELIANCE.NS", "TCS.NS", "INFY.NS",
                      "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS"]

@app.websocket("/ws/market-updates")
async def market_updates_ws(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    logger.info(f"[WS] Client connected. Total: {len(connected_clients)}")
    symbols = list(WS_DEFAULT_SYMBOLS)

    async def _send_prices():
        prices = await fetch_multiple_prices(symbols)
        payload = {
            "type": "market_update",
            "timestamp": time.strftime("%H:%M:%S"),
            "data": {}
        }
        for sym, info in prices.items():
            if info.get("price"):
                payload["data"][sym] = {
                    "price": round(float(info["price"]), 2),
                    "change": round(float(info.get("change", 0)), 2),
                    "change_pct": round(float(info.get("change_pct", 0)), 4),
                    "source": info.get("source", "yfinance"),
                }
        await websocket.send_json(payload)

    try:
        await _send_prices()
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
                msg = json.loads(raw)
                if msg.get("type") == "subscribe" and isinstance(msg.get("symbols"), list):
                    symbols = [s.upper().strip() for s in msg["symbols"][:20]]
                    logger.info(f"[WS] Subscribed: {symbols}")
                    await websocket.send_json({"type": "subscribed", "symbols": symbols})
            except asyncio.TimeoutError:
                pass
            except Exception:
                pass
            await _send_prices()
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"[WS] Error: {e}")
    finally:
        if websocket in connected_clients:
            connected_clients.remove(websocket)
        logger.info(f"[WS] Client disconnected. Total: {len(connected_clients)}")

# ΓöÇΓöÇ RUN SERVER ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
