# ============================================================
#  FINSIGHT AI — FastAPI Backend
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

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Depends, WebSocket, WebSocketDisconnect, Body
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
    llm, DB_PATH, get_db_connection, financial_graph
)
import sqlite3

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ── NaN/Inf sanitizer — FastAPI's JSON encoder can't handle float('nan') ─────
def _safe_float(v, default=None):
    """Return None (or default) if v is nan/inf, else round to 4dp."""
    try:
        if v is None:
            return default
        f = float(v)
        if f != f or f == float("inf") or f == float("-inf"):  # nan / inf check
            return default
        return round(f, 4)
    except (TypeError, ValueError):
        return default

# ── ENV CONFIG ────────────────────────────────────────────────
API_SECRET_TOKEN = os.environ.get("API_SECRET_TOKEN", "")

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

# ── APP SETUP ─────────────────────────────────────────────────
app = FastAPI(
    title="FinSight AI API",
    description="Track B Financial Research AI — Powered by LangGraph + FinBERT",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WEBSOCKET CLIENTS ─────────────────────────────────────────
connected_clients: list[WebSocket] = []

# ── BEARER TOKEN AUTH ─────────────────────────────────────────
security = HTTPBearer(auto_error=False)

UNPROTECTED = {"/", "/docs", "/redoc", "/openapi.json", "/portfolio/summary"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    if not API_SECRET_TOKEN or request.url.path in UNPROTECTED:
        return await call_next(request)

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[7:] != API_SECRET_TOKEN:
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized"},
            headers={"Access-Control-Allow-Origin": "*"},
        )

    return await call_next(request)

# ── REQUEST MODELS ────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    symbol: str
    query: Optional[str] = None

class PortfolioHolding(BaseModel):
    symbol: str
    quantity: float
    avg_price: float

class PortfolioRequest(BaseModel):
    holdings: List[PortfolioHolding]

class PortfolioAddRequest(BaseModel):
    symbol: str
    quantity: float
    avg_buy_price: float

class ChatRequest(BaseModel):
    message: str
    history: list = []

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

# ── RATE LIMITING ─────────────────────────────────────────────
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

# ── ASYNC PRICE HELPERS ───────────────────────────────────────
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

# ── PORTFOLIO MATH (MPT) ──────────────────────────────────────
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

# ── ALERT BACKGROUND TASK ─────────────────────────────────────
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

# ── CORS-safe exception handlers ─────────────────────────────
# FastAPI's default error responses (422, 500) don't go through
# CORSMiddleware, so the browser sees a CORS error instead of
# the real error. These handlers add the header back manually.
from fastapi.exceptions import RequestValidationError
from fastapi.responses import Response as FastAPIResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
        headers={"Access-Control-Allow-Origin": "*"},
    )

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={"Access-Control-Allow-Origin": "*"},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"[ERROR] Unhandled: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )

# ══════════════════════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════════════════════

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
            "/health", "/news/{symbol}", "/alerts/global"
        ],
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/analyze-stock")
async def analyze_stock(req: AnalyzeRequest, request: Request):
    check_rate_limit(request.client.host)
    try:
        query = req.query or f"Analyze {req.symbol}"
        logger.info(f"[API] /analyze-stock called for {req.symbol}")
        start = time.time()
        result = financial_agent(query, thread_id="user_session_1")
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

@app.get("/news/{symbol}")
async def get_news_endpoint(symbol: str, request: Request):
    check_rate_limit(request.client.host)
    try:
        sym = symbol.upper().strip()
        
        # Fetch news from Yahoo Finance search API using requests with strict 1.2s timeout
        loop = asyncio.get_event_loop()
        def _get_yf_news():
            try:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
                url = f"https://query2.finance.yahoo.com/v1/finance/search?q={sym}&newsCount=10"
                r = req_lib.get(url, headers=headers, timeout=1.2)
                r.raise_for_status()
                return r.json().get("news", [])
            except Exception as e:
                logger.warning(f"[NEWS] Direct Yahoo news fetch failed for {sym}: {e}")
                return []
        
        try:
            yfinance_news = await asyncio.wait_for(
                loop.run_in_executor(None, _get_yf_news),
                timeout=1.5
            )
        except asyncio.TimeoutError:
            logger.warning(f"[NEWS] Direct Yahoo news fetch timed out for {sym}. Using fallback.")
            yfinance_news = []
        
        articles = []
        if yfinance_news:
            for item in yfinance_news:
                content = item.get("content", {}) if isinstance(item.get("content"), dict) else item
                articles.append({
                    "title": content.get("title") or item.get("title") or "",
                    "publisher": (content.get("provider", {}).get("displayName")
                                  if isinstance(content.get("provider"), dict)
                                  else content.get("publisher") or item.get("publisher") or "Yahoo Finance"),
                    "link": (content.get("clickThroughUrl", {}).get("url")
                             if isinstance(content.get("clickThroughUrl"), dict)
                             else content.get("link") or item.get("link") or ""),
                    "published": str(content.get("pubDate") or item.get("providerPublishTime") or "")
                })
        
        if not articles:
            # get_news_with_fallback is fast and uses newsapi / duckduckgo scraper
            headlines = get_news_with_fallback(f"{sym} stock")
            for h in headlines:
                articles.append({
                    "title": h,
                    "publisher": "News Fallback",
                    "link": "#",
                    "published": ""
                })
                
        return {"status": "success", "symbol": sym, "news": articles}
    except Exception as e:
        logger.error(f"[API] get_news_endpoint error for {symbol}: {e}")
        return {"status": "success", "symbol": symbol, "news": []}

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
            current_price = _safe_float(price_data["price"]) or avg_price
            current_value = current_price * quantity
            total_value += current_value

            try:
                hist = yf.Ticker(symbol).history(period="1y")
                if not hist.empty:
                    returns = hist["Close"].pct_change().dropna().tolist()
                    portfolio_returns.extend([r for r in returns if r == r])  # filter nan
            except:
                pass

            pnl = (current_price - avg_price) * quantity
            pnl_pct = ((current_price - avg_price) / avg_price * 100 if avg_price > 0 else 0)
            results.append({
                "symbol": symbol, "quantity": quantity,
                "avg_price": avg_price, "current_price": current_price,
                "current_value": round(current_value, 2),
                "pnl": _safe_float(pnl, 0.0), "pnl_pct": _safe_float(pnl_pct, 0.0),
                "source": price_data["source"],
            })

        if portfolio_returns:
            returns_series = pd.Series(portfolio_returns).dropna()
            volatility = _safe_float(returns_series.std() * (252 ** 0.5) * 100, 0.0)
            avg_return = _safe_float(returns_series.mean() * 252 * 100, 0.0)
            risk_free = 6.5
            sharpe = _safe_float((avg_return - risk_free) / (volatility if volatility > 0 else 1), 0.0)
            var_95 = _safe_float(float(np.percentile(returns_series, 5)) * 100, 0.0)
            cvar_95 = _safe_float(float(returns_series[returns_series <= np.percentile(returns_series, 5)].mean()) * 100, 0.0)
            risk_level = "🟢 Low Risk" if volatility < 20 else "🟡 Medium Risk" if volatility < 40 else "🔴 High Risk"
        else:
            volatility = sharpe = avg_return = var_95 = cvar_95 = 0.0
            risk_level = "⚪ Unknown"

        sector_breakdown = get_sector_breakdown(symbols)

        return {
            "status": "success",
            "total_value": _safe_float(total_value, 0.0),
            "holdings": results,
            "risk_metrics": {
                "risk_level": risk_level,
                "volatility_pct": volatility,
                "sharpe_ratio": sharpe,
                "annualized_return_pct": avg_return,
                "diversification_score": len(set(h.symbol for h in holdings)),
                "var_95_pct": var_95,
                "cvar_95_pct": cvar_95,
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
                url = f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=2d"
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                r = req_lib.get(url, headers=headers, timeout=5)
                r.raise_for_status()
                result = r.json().get("chart", {}).get("result", [])
                if result:
                    meta = result[0]["meta"]
                    curr = meta["regularMarketPrice"]
                    prev = meta["chartPreviousClose"]
                    chg = curr - prev
                    chg_pct = (chg / prev) * 100
                    summary.append({
                        "name": name, "symbol": sym,
                        "price": round(curr, 2), "change": round(chg, 2),
                        "change_pct": round(chg_pct, 2),
                        "direction": "up" if chg > 0 else "down",
                    })
            except Exception as e:
                logger.warning(f"market_summary failed for {sym}: {e}")
        result = {"status": "success", "market": "NSE/BSE", "indices": summary}
        if summary:
            cache_set("market_summary", result, ttl=15)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ══════════════════════════════════════════════════════════════
#  PORTFOLIO TOOLS — LLM has full authority via tool-calling
# ══════════════════════════════════════════════════════════════
from langchain_core.tools import tool as lc_tool

@lc_tool
def portfolio_add_shares(symbol: str, quantity: float, avg_price: float = 0.0) -> str:
    """Add shares to the portfolio. Increments existing position using weighted average price.
    
    Args:
        symbol: Stock ticker in yFinance format. Indian stocks end in .NS (e.g. RELIANCE.NS, TCS.NS, HDFCBANK.NS, INFY.NS, WIPRO.NS, ITC.NS, SBIN.NS). Crypto ends in -USD (e.g. BTC-USD). US stocks use bare ticker (e.g. AAPL).
        quantity: Number of shares/stocks to add.
        avg_price: Average buy price per share. Pass 0 to auto-fetch current market price.
    """
    symbol = symbol.upper().strip()
    # Normalize: add .NS if no suffix for Indian-looking symbols
    if symbol and not symbol.endswith(".NS") and not symbol.endswith(".BO") and "-" not in symbol and "." not in symbol:
        symbol = f"{symbol}.NS"
    
    # Auto-fetch price if not provided
    if avg_price <= 0:
        try:
            price_info = get_price_cached(symbol)
            avg_price = price_info.get("price") or 0.0
        except Exception:
            pass

    def _weighted_avg(old_qty, old_avg, new_qty, new_price):
        total = old_qty + new_qty
        if total <= 0:
            return total, new_price
        return total, round(((old_qty * old_avg) + (new_qty * new_price)) / total, 4)

    # Try PostgreSQL first, then SQLite
    pg_conn = get_db_connection()
    if pg_conn:
        try:
            cur = pg_conn.cursor()
            cur.execute("SELECT quantity, avg_buy_price FROM portfolio WHERE symbol=%s", (symbol,))
            row = cur.fetchone()
            if row:
                new_qty, new_avg = _weighted_avg(float(row[0]), float(row[1]), quantity, avg_price)
                cur.execute("UPDATE portfolio SET quantity=%s, avg_buy_price=%s WHERE symbol=%s",
                            (new_qty, new_avg, symbol))
            else:
                new_qty, new_avg = quantity, avg_price
                cur.execute("INSERT INTO portfolio (symbol, quantity, avg_buy_price) VALUES (%s,%s,%s)",
                            (symbol, new_qty, new_avg))
            pg_conn.commit(); cur.close(); pg_conn.close()
            return f"✅ Added {quantity} shares of {symbol}. Total: {new_qty} shares @ ₹{new_avg:.2f} avg."
        except Exception as e:
            logger.warning(f"[TOOL] pg portfolio_add_shares error: {e}")
            if pg_conn: pg_conn.close()

    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT quantity, avg_buy_price FROM portfolio WHERE symbol=?", (symbol,))
        row = cur.fetchone()
        if row:
            new_qty, new_avg = _weighted_avg(float(row[0]), float(row[1]), quantity, avg_price)
            conn.execute("UPDATE portfolio SET quantity=?, avg_buy_price=? WHERE symbol=?",
                         (new_qty, new_avg, symbol))
        else:
            new_qty, new_avg = quantity, avg_price
            conn.execute("INSERT INTO portfolio (symbol, quantity, avg_buy_price) VALUES (?,?,?)",
                         (symbol, new_qty, new_avg))
        conn.commit(); conn.close()
        return f"✅ Added {quantity} shares of {symbol}. Total: {new_qty} shares @ ₹{new_avg:.2f} avg."
    except Exception as e:
        logger.error(f"[TOOL] SQLite portfolio_add_shares error: {e}")
        return f"❌ Failed to add {symbol}: {e}"


@lc_tool
def portfolio_remove_stock(symbol: str) -> str:
    """Remove a stock completely from the portfolio.
    
    Args:
        symbol: Stock ticker (e.g. RELIANCE.NS, TCS.NS, BTC-USD). Auto-appends .NS for Indian stocks.
    """
    symbol = symbol.upper().strip()
    if symbol and not symbol.endswith(".NS") and not symbol.endswith(".BO") and "-" not in symbol and "." not in symbol:
        symbol = f"{symbol}.NS"

    pg_conn = get_db_connection()
    if pg_conn:
        try:
            cur = pg_conn.cursor()
            cur.execute("DELETE FROM portfolio WHERE symbol=%s", (symbol,))
            pg_conn.commit(); cur.close(); pg_conn.close()
            return f"✅ Removed {symbol} from portfolio."
        except Exception as e:
            logger.warning(f"[TOOL] pg portfolio_remove_stock error: {e}")
            if pg_conn: pg_conn.close()

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM portfolio WHERE symbol=?", (symbol,))
        conn.commit(); conn.close()
        return f"✅ Removed {symbol} from portfolio."
    except Exception as e:
        logger.error(f"[TOOL] SQLite portfolio_remove_stock error: {e}")
        return f"❌ Failed to remove {symbol}: {e}"


@lc_tool
def portfolio_set_holding(symbol: str, quantity: float, avg_price: float) -> str:
    """Explicitly SET (override) the exact quantity and average price for a holding.
    Use this when user says 'set my X to Y shares' or 'update avg price to Z'.
    
    Args:
        symbol: Stock ticker (e.g. RELIANCE.NS). Auto-appends .NS for Indian stocks.
        quantity: New exact total quantity to set.
        avg_price: New exact average buy price to set.
    """
    symbol = symbol.upper().strip()
    if symbol and not symbol.endswith(".NS") and not symbol.endswith(".BO") and "-" not in symbol and "." not in symbol:
        symbol = f"{symbol}.NS"

    pg_conn = get_db_connection()
    if pg_conn:
        try:
            cur = pg_conn.cursor()
            cur.execute("SELECT id FROM portfolio WHERE symbol=%s", (symbol,))
            row = cur.fetchone()
            if row:
                cur.execute("UPDATE portfolio SET quantity=%s, avg_buy_price=%s WHERE symbol=%s",
                            (quantity, avg_price, symbol))
            else:
                cur.execute("INSERT INTO portfolio (symbol, quantity, avg_buy_price) VALUES (%s,%s,%s)",
                            (symbol, quantity, avg_price))
            pg_conn.commit(); cur.close(); pg_conn.close()
            return f"✅ Set {symbol}: {quantity} shares @ ₹{avg_price:.2f} avg."
        except Exception as e:
            logger.warning(f"[TOOL] pg portfolio_set_holding error: {e}")
            if pg_conn: pg_conn.close()

    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT rowid FROM portfolio WHERE symbol=?", (symbol,))
        row = cur.fetchone()
        if row:
            conn.execute("UPDATE portfolio SET quantity=?, avg_buy_price=? WHERE symbol=?",
                         (quantity, avg_price, symbol))
        else:
            conn.execute("INSERT INTO portfolio (symbol, quantity, avg_buy_price) VALUES (?,?,?)",
                         (symbol, quantity, avg_price))
        conn.commit(); conn.close()
        return f"✅ Set {symbol}: {quantity} shares @ ₹{avg_price:.2f} avg."
    except Exception as e:
        logger.error(f"[TOOL] SQLite portfolio_set_holding error: {e}")
        return f"❌ Failed to set {symbol}: {e}"


@lc_tool
def portfolio_view() -> str:
    """View all current portfolio holdings with quantities and average prices."""
    try:
        holdings = get_portfolio_from_db()
        if not holdings:
            return "Portfolio is empty."
        lines = [f"- {h['symbol']}: {h['quantity']} shares @ ₹{h.get('avg_buy_price', 0):.2f} avg" for h in holdings]
        return "Current Portfolio:\n" + "\n".join(lines)
    except Exception as e:
        return f"Error reading portfolio: {e}"


# Bind all portfolio tools to the LLM so it can call them autonomously
PORTFOLIO_TOOLS = [portfolio_add_shares, portfolio_remove_stock, portfolio_set_holding, portfolio_view]

def _execute_tool_call(tool_call: dict) -> str:
    """Execute a single tool call from the LLM and return the result string."""
    name = tool_call.get("name", "")
    args = tool_call.get("args", {})
    tool_map = {t.name: t for t in PORTFOLIO_TOOLS}
    fn = tool_map.get(name)
    if not fn:
        return f"Unknown tool: {name}"
    try:
        return fn.invoke(args)
    except Exception as e:
        logger.error(f"[TOOL] {name} execution error: {e}")
        return f"Tool error ({name}): {e}"


@app.post("/chat")
async def chat(req: ChatRequest, request: Request):
    """Streaming chat endpoint. LLM has full authority to modify portfolio via tool-calling."""
    check_rate_limit(request.client.host)

    # Load current portfolio state for LLM context
    try:
        holdings_list = get_portfolio_from_db()
        holdings_str = (
            "\n".join(
                f"- {h['symbol']}: {h['quantity']} shares (avg ₹{h.get('avg_buy_price', 0):.2f})"
                for h in holdings_list
            ) if holdings_list else "No holdings yet."
        )
    except Exception as e:
        logger.warning(f"Failed to fetch holdings: {e}")
        holdings_str = "Error fetching holdings."

    # Build read-only portfolio context for TYPE 1 proactive comparison
    try:
        if holdings_list:
            total_val = 0.0
            pnl_pct_sum = 0.0
            top_holdings = []
            for h in holdings_list[:3]:
                price_info = get_price_cached(h["symbol"])
                cmp = price_info.get("price") or h.get("avg_buy_price", 0)
                val = cmp * h["quantity"]
                total_val += val
                avg = h.get("avg_buy_price", cmp) or cmp
                pnl = ((cmp - avg) / avg * 100) if avg > 0 else 0.0
                pnl_pct_sum += pnl
                top_holdings.append(f"{h['symbol'].replace('.NS','').replace('.BO','')} ({pnl:+.1f}%)")
            avg_pnl = pnl_pct_sum / len(holdings_list[:3]) if holdings_list else 0
            portfolio_context_hint = (
                f"Portfolio value ≈ ₹{total_val:,.0f} | Avg P&L of top holdings: {avg_pnl:+.1f}% "
                f"({', '.join(top_holdings)}). Isse add karne se concentration check karein."
            )
        else:
            portfolio_context_hint = "Portfolio empty — good time to start building a position."
    except Exception:
        portfolio_context_hint = "Portfolio data unavailable right now."


    SYSTEM_PROMPT = f"""You are Nivesh AI — a confident, sharp SEBI-registered analyst who speaks to users like a trusted friend who happens to be a financial expert. You are brutally honest, proactively insightful, and never give vague answers.

CURRENT PORTFOLIO STATE:
{holdings_str}

=========================================
RESPONSE INTELLIGENCE (MANDATORY — Predict & Deliver)
=========================================
NEVER ask "How can I help?" or "What would you like to know?" — Predict user needs from context and DELIVER immediately.
- If user mentions a stock name → auto-run analysis: price, trend, sentiment, risk.
- If user mentions portfolio → auto-compute P&L, top holdings, risk level.
- If user asks "should I buy/sell" → give a direct recommendation with reasoning (add disclaimer).
- If query is vague ("kya lagta hai market ka?") → give today's top movers + sector sentiment.
- Always end with a proactive next step: "Chahte ho main [XYZ] bhi dekh loon?" or "Next, I can run a full comparison."

=========================================
RESPONSE TYPES — Use the Right Format Automatically
=========================================
TYPE 1 — STOCK ANALYSIS (any stock query):
Structure: 📊 [Stock Name] | ₹[Price] | [Trend ↑/↓]
- Quick Summary (2 lines)
- Strengths: bullet points
- Risks: bullet points
- Outlook: Bullish/Bearish/Neutral with confidence %
- Risk Profile: Vol, Sharpe, VaR
- Portfolio Context: "{portfolio_context_hint}"
- Proactive Rule: If the research_node has read-only portfolio context, add one brief sentence comparing the target stock's risk/return profile to the user's portfolio's average risk (Fetch from `/prices-bulk` correlation data). E.g., 'Isse add karne se aapka profile HDFC Bank heavy ho jayega, watch for rotation.'
- End: ⚠️ Not financial advice.

TYPE 2 — COMPARISON TABLE (2+ stocks mentioned):
Auto-generate a markdown table. Max 5 columns. Bold headers. Right-align numbers.
| Stock | Price ₹ | 1M Return % | RSI | Verdict |
Always sort by most relevant metric. Add a "Winner: [Stock]" verdict row.

TYPE 3 — PORTFOLIO ANALYSIS:
- Total Value: ₹X | P&L: +/-X%
- Top 3 Holdings table
- Risk Level: 🟢/🟡/🔴 with Sharpe ratio
- Sector concentration warning if >40% in one sector
- Rebalancing suggestion

TYPE 4 — SIP / MUTUAL FUND:
Auto-generate a fund comparison table:
| Fund | CAGR 3Y | Min SIP ₹ | Risk | Rating |
Always suggest 3 options: conservative, balanced, aggressive.

TYPE 5 — TECHNICAL ANALYSIS:
Format as levels table:
| Indicator | Value | Signal |
| RSI | 67.2 | Overbought |
| MA20 | ₹2,340 | Support |

TYPE 6 — MARKET OVERVIEW (NIFTY/SENSEX queries):
- Today's snapshot: NIFTY / SENSEX levels + change %
- Top gainers / losers (3 each)
- Sector heatmap (text-based)
- FII/DII sentiment if data available

TYPE 7 — EARNINGS / FUNDAMENTALS:
Auto-generate a financials table:
| Metric | Q3FY25 | Q2FY25 | YoY% |
Include: Revenue, PAT, EPS, PE Ratio, Debt/Equity

TYPE 8 — CASUAL / GREETING:
- Warm 1-line greeting
- Proactively suggest: "Aaj kaunsa stock dekhna hai? Ya main aapke portofolio summary se related kuch bataoon? 📈"
- Skip financial disclaimer

TYPE 9 — RISK QUERY (VaR, Sharpe, Beta):
- Give numeric answer first, then explain in simple Hinglish
- Compare to benchmark (NIFTY avg Sharpe ~0.4)
- Practical implication: "Iska matlab aapka portfolio..."

TYPE 10 — SCREENER / DISCOVERY:
When user asks "best stocks to buy", "top IT stocks", etc.:
Auto-generate a screening table with 5 stocks:
| Stock | Sector | Price ₹ | PE | Verdict |
Sort by value (low PE + growth). Add risk caveat.

=========================================
DYNAMIC TABLE GENERATION PROTOCOL (MANDATORY)
=========================================
When ANY response contains 2+ comparable dimensions, auto-render a structured markdown table. NEVER list data as plain text when a table would be clearer.

Auto-trigger conditions:
- 2+ stocks mentioned → comparison table
- Portfolio with 2+ holdings → allocation table  
- Multiple SIP/MF options → fund comparison table
- Technical levels → S/R levels table
- Earnings data → financials table
- Sector rotation → sector performance table

Table rules:
- Max 5 columns for readability
- **Bold headers** always
- Right-align all numeric columns
- Use ₹ for Indian prices, % for returns
- Sort by most relevant metric (return, risk, value)
- Add a summary row at the bottom

=========================================
LANGUAGE HARMONY (MANDATORY)
=========================================
Auto-detect the user's language blend and mirror it EXACTLY:
- Pure English → Respond in clean English
- Pure Hindi → Respond in Hindi (Devanagari OK but Roman preferred)
- Hinglish (most common) → Match their exact blend: "Reliance ka RSI 72 hai, thoda overbought lag raha hai — but fundamentals strong hain 💪"
- Never translate unnecessarily. If they say "kya lagta hai", reply with same casual register.
- Technical terms (RSI, VaR, Sharpe) stay in English always.
- Emojis: use naturally, not excessively (2-4 per response max).

=========================================
PERSONALITY — Confident SEBI Analyst as a Friend
=========================================
- Direct: Give answers, not questions. "HDFC Bank is a BUY at these levels because..." not "It depends on your risk tolerance."
- Empathetic: Acknowledge market anxiety. "Haan market abhi volatile hai, par long-term picture clear hai."
- Proactive: Always end with what to check next. Never leave user without a next step.
- Honest: If data is unavailable, say "Real-time data nahi mila, but based on last close..." — don't make things up.
- No corporate jargon: Speak like a smart friend, not a fund house prospectus.
- Disclaimer ONLY for investment advice, NOT for greetings/portfolio actions/explanations.

=========================================
UNIVERSAL COMPLIANCE
=========================================
- ALWAYS end stock analysis / buy-sell advice with: ⚠️ Not financial advice — for educational purposes only.
- NEVER skip the portfolio-context hint for Type 1 analysis when portfolio data is available.
- Formatting: Use markdown (bold, tables, bullets) — the frontend renders it correctly."""

    async def event_stream():
        try:
            from langchain_core.messages import SystemMessage, HumanMessage
            
            logger.info(f"[CHAT] Message: {req.message}")
            
            msg_lower = req.message.lower().strip()
            greetings = ["hi", "hello", "hey", "namaste", "good morning", "good afternoon", "good evening", "how are you", "who are you", "what is your name"]
            is_greeting = any(g in msg_lower for g in greetings) and len(msg_lower.split()) <= 4
            
            # Detect stock analysis query
            analysis_keywords = ["analyze", "analysis", "research", "report", "technicals", "sentiment", "val", "sharpe", "var", "cvar", "risk of", "perform", "outlook", "trend"]
            has_keyword = any(k in msg_lower for k in analysis_keywords)
            common_stocks = ["reliance", "tcs", "infy", "hdfc", "sbi", "icici", "itc", "infosys", "wipro", "tata", "reliance.ns", "tcs.ns", "infy.ns", "nifty", "sensex", "reliance.bo", "tcs.bo", "infy.bo"]
            has_stock_mention = any(s in msg_lower for s in common_stocks) or ".ns" in msg_lower or ".bo" in msg_lower
            
            is_stock_query = (has_keyword or has_stock_mention) and not is_greeting
            
            if is_stock_query:
                logger.info(f"[CHAT] Routing to 5-node LangGraph pipeline...")
                config = {"configurable": {"thread_id": "user_session_1"}}
                inputs = {
                    "query": req.message, "symbol": "",
                    "research_result": "", "data_result": "",
                    "sentiment_result": "", "risk_result": "", "final_answer": "",
                    "chat_history": req.history or []
                }
                
                # Stream the LangGraph nodes progression
                async for chunk in financial_graph.astream(inputs, config=config):
                    for node_name, output in chunk.items():
                        logger.info(f"[GRAPH STREAM] Node finished: {node_name}")
                        yield f"data: {json.dumps({'node': node_name})}\n\n"
                        
                        # Once the decision node finishes, stream the final answer
                        if node_name == "decision" and "final_answer" in output:
                            final_ans = output["final_answer"]
                            # Stream words for typing effect:
                            words = final_ans.split(" ")
                            for i, word in enumerate(words):
                                token = word + (" " if i < len(words) - 1 else "")
                                yield f"data: {json.dumps({'token': token})}\n\n"
                            yield f"data: {json.dumps({'done': True, 'full': final_ans, 'portfolio_updated': False})}\n\n"
                            return
                return

            # Otherwise, use standard conversational LLM stream
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
            yield f"data: {json.dumps({'done': True, 'full': ''.join(full_response), 'portfolio_updated': False})}\n\n"

        except Exception as e:
            logger.error(f"[CHAT] Stream error: {e}")
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
async def get_bulk_prices(request: Request, background_tasks: BackgroundTasks, symbols: List[str] = Body(...)):
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
                "price": _safe_float(data.get("price")),
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

# ── WATCHLIST ENDPOINTS ───────────────────────────────────────
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

# ── ALERTS ENDPOINTS ──────────────────────────────────────────
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

@app.get("/alerts/global")
async def get_global_alerts(request: Request):
    check_rate_limit(request.client.host)
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute("SELECT id, symbol, name, change_pct, price, alert_type, created_at FROM global_alerts ORDER BY created_at DESC LIMIT 50").fetchall()
        conn.close()
        alerts = [{
            "id": r[0],
            "symbol": r[1],
            "name": r[2],
            "change_pct": float(r[3]),
            "price": float(r[4]),
            "alert_type": r[5],
            "created_at": r[6]
        } for r in rows]
        return {"status": "success", "alerts": alerts}
    except Exception as e:
        logger.warning(f"[API] global_alerts check/fetch warning: {e}")
        return {"status": "success", "alerts": []}

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

@app.get("/portfolio/summary")
def get_portfolio_summary_endpoint():
    """Retrieve only total_value, total_pnl_percent, and top_3_holdings."""
    try:
        holdings = get_portfolio_from_db()
        total_val = 0.0
        pnl_pct_sum = 0.0
        holdings_list = []
        for h in holdings:
            price_info = get_price_cached(h["symbol"])
            cmp = price_info.get("price") or h.get("avg_buy_price", 0)
            val = cmp * h["quantity"]
            total_val += val
            avg = h.get("avg_buy_price", cmp) or cmp
            pnl = ((cmp - avg) / avg * 100) if avg > 0 else 0.0
            pnl_pct_sum += pnl
            holdings_list.append((h["symbol"], val, pnl))
        holdings_list.sort(key=lambda x: x[1], reverse=True)
        top_3 = [f"{x[0].replace('.NS','').replace('.BO','')}: {x[2]:+.1f}%" for x in holdings_list[:3]]
        avg_pnl = pnl_pct_sum / len(holdings) if holdings else 0.0
        return {
            "total_value": round(total_val, 2),
            "total_pnl_percent": round(avg_pnl, 2),
            "top_3_holdings": top_3
        }
    except Exception as e:
        logger.error(f"[API] portfolio/summary error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── PORTFOLIO CRUD ENDPOINTS ──────────────────────────────────
@app.get("/portfolio")
async def portfolio_get(request: Request):
    """Return all portfolio holdings from DB."""
    check_rate_limit(request.client.host)
    try:
        holdings = get_portfolio_from_db()
        formatted = []
        for h in holdings:
            formatted.append({
                "symbol": h.get("symbol", ""),
                "quantity": float(h.get("quantity", 0)),
                "avg_buy_price": float(h.get("avg_buy_price", 0) or h.get("avg_price", 0) or 0)
            })
        return {"status": "success", "holdings": formatted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/portfolio")
async def portfolio_add(req: PortfolioAddRequest, request: Request):
    """Add or update a portfolio holding."""
    check_rate_limit(request.client.host)
    symbol = req.symbol.upper().strip()
    if symbol and not symbol.endswith(".NS") and not symbol.endswith(".BO") and "-" not in symbol and "." not in symbol:
         symbol = f"{symbol}.NS"
    
    success = False
    pg_conn = get_db_connection()
    if pg_conn:
        try:
            cur = pg_conn.cursor()
            cur.execute("SELECT quantity FROM portfolio WHERE symbol=%s", (symbol,))
            row = cur.fetchone()
            if row:
                cur.execute("UPDATE portfolio SET quantity=%s, avg_buy_price=%s WHERE symbol=%s",
                            (req.quantity, req.avg_buy_price, symbol))
            else:
                cur.execute("INSERT INTO portfolio (symbol, quantity, avg_buy_price) VALUES (%s,%s,%s)",
                            (symbol, req.quantity, req.avg_buy_price))
            pg_conn.commit(); cur.close(); pg_conn.close()
            success = True
        except Exception as e:
            logger.warning(f"[API] pg portfolio_add error: {e}")
            if pg_conn: pg_conn.close()

    if not success:
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("SELECT quantity FROM portfolio WHERE symbol=?", (symbol,))
            row = cur.fetchone()
            if row:
                conn.execute("UPDATE portfolio SET quantity=?, avg_buy_price=? WHERE symbol=?",
                             (req.quantity, req.avg_buy_price, symbol))
            else:
                conn.execute("INSERT INTO portfolio (symbol, quantity, avg_buy_price) VALUES (?,?,?)",
                             (symbol, req.quantity, req.avg_buy_price))
            conn.commit(); conn.close()
            success = True
        except Exception as e:
            logger.error(f"[API] SQLite portfolio_add error: {e}")
            
    if success:
        return {"status": "success", "symbol": symbol, "quantity": req.quantity, "avg_buy_price": req.avg_buy_price}
    raise HTTPException(status_code=500, detail="Failed to add holding to database")

@app.delete("/portfolio/{symbol}")
async def portfolio_remove(symbol: str, request: Request):
    """Remove a holding from portfolio by symbol."""
    check_rate_limit(request.client.host)
    sym = symbol.upper().strip()
    if sym and not sym.endswith(".NS") and not sym.endswith(".BO") and "-" not in sym and "." not in sym:
         sym = f"{sym}.NS"
         
    success = False
    pg_conn = get_db_connection()
    if pg_conn:
        try:
            cur = pg_conn.cursor()
            cur.execute("DELETE FROM portfolio WHERE symbol=%s", (sym,))
            pg_conn.commit(); cur.close(); pg_conn.close()
            success = True
        except Exception as e:
            logger.warning(f"[API] pg portfolio_remove error: {e}")
            if pg_conn: pg_conn.close()

    if not success:
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.execute("DELETE FROM portfolio WHERE symbol=?", (sym,))
            conn.commit(); conn.close()
            success = True
        except Exception as e:
            logger.error(f"[API] SQLite portfolio_remove error: {e}")
            
    if success:
        return {"status": "success", "message": f"{sym} removed from portfolio."}
    raise HTTPException(status_code=500, detail="Failed to remove holding from database")

# ── ECONOMIC INDICATORS ───────────────────────────────────────
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

# ── EFFICIENT FRONTIER ────────────────────────────────────────
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

# ── LIVE PRICE SSE ────────────────────────────────────────────
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

# ── MARKET PULSE — 1-MIN CANDLES ─────────────────────────────
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

# ── WEBSOCKET — REAL MARKET UPDATES ──────────────────────────
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

# ── RUN SERVER ────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
