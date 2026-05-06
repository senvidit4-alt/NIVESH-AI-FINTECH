# ============================================================
#  FINSIGHT AI — Agent Logic
#  Track B: logic_agent.py
# ============================================================

import os, time, sqlite3, requests, json, operator, logging
import yfinance as yf
import pandas as pd
import numpy as np
import ta
import psycopg2
from psycopg2.extras import RealDictCursor
from textblob import TextBlob
from duckduckgo_search import DDGS
from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

# Fix pydantic forward-ref issue on Python 3.13
try:
    from langchain_core.language_models.base import BaseLanguageModel
    BaseLanguageModel.model_rebuild()
    ChatGroq.model_rebuild()
except Exception:
    pass

# ── LLM TRACK SELECTOR ────────────────────────────────────────
# Track B uses GPT-4o or Claude 3.5 Sonnet if keys are present.
# Falls back to Groq (Track A tier) automatically.
LLM_TRACK = os.environ.get("LLM_TRACK", "auto")   # "auto" | "groq" | "openai" | "anthropic"

from typing import TypedDict, Annotated
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch
from dotenv import load_dotenv

load_dotenv()

# ── LOGGING ───────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── LANGSMITH TRACING ─────────────────────────────────────────
if os.environ.get("LANGCHAIN_TRACING_V2", "false").lower() == "true":
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ.setdefault("LANGCHAIN_PROJECT", os.environ.get("LANGCHAIN_PROJECT", "finsight-ai"))
    logger.info("[LANGSMITH] Tracing enabled.")

# ── REDIS ─────────────────────────────────────────────────────
REDIS_URL = os.environ.get("REDIS_URL", "")
redis_client = None

if REDIS_URL:
    try:
        import redis as real_redis
        redis_client = real_redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        logger.info(f"✅ Redis connected: {REDIS_URL}")
    except Exception as e:
        logger.warning(f"⚠️ Redis connection failed ({e}), falling back to fakeredis.")
        redis_client = None

if redis_client is None:
    try:
        import fakeredis
        redis_client = fakeredis.FakeRedis(decode_responses=True)
        logger.warning("⚠️ Using fakeredis (in-memory). Set REDIS_URL for production.")
    except Exception as e:
        redis_client = None
        logger.warning(f"⚠️ Redis unavailable: {e}")

# ══════════════════════════════════════════════════════════════
#  1. API KEYS  (from environment only)
# ══════════════════════════════════════════════════════════════
GROQ_API_KEY      = os.environ.get("GROQ_API_KEY")
OPENAI_API_KEY    = os.environ.get("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "demo")
FMP_KEY           = os.environ.get("FMP_KEY", "demo")
NEWS_API_KEY      = os.environ.get("NEWS_API_KEY", "")

if not any([GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY]):
    logger.warning("⚠️ No LLM key found. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY.")

# ══════════════════════════════════════════════════════════════
#  2. DATABASE
# ══════════════════════════════════════════════════════════════
DATABASE_URL = os.environ.get("DATABASE_URL", "")
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portfolio.db")

def _parse_db_config(url: str) -> dict:
    """Parse postgresql://user:pass@host:port/dbname into psycopg2 kwargs."""
    import urllib.parse as up
    r = up.urlparse(url)
    return {
        "host": r.hostname, "port": r.port or 5432,
        "database": r.path.lstrip("/"),
        "user": r.username, "password": r.password,
    }

def get_db_connection():
    if not DATABASE_URL:
        return None
    try:
        cfg = _parse_db_config(DATABASE_URL)
        return psycopg2.connect(**cfg)
    except Exception as e:
        logger.warning(f"[DB] PostgreSQL unavailable: {e}")
        return None

def create_postgres_tables():
    """Create all required PostgreSQL tables on startup."""
    conn = get_db_connection()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS portfolio (
                id SERIAL PRIMARY KEY,
                symbol TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                avg_buy_price REAL DEFAULT 0,
                added_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS price_snapshots (
                id SERIAL PRIMARY KEY,
                symbol TEXT,
                price FLOAT,
                source TEXT,
                fetched_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS news_sentiment (
                id SERIAL PRIMARY KEY,
                query TEXT,
                symbol TEXT,
                sentiment_score FLOAT,
                sentiment_label TEXT,
                raw_headlines TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id SERIAL PRIMARY KEY,
                symbol TEXT UNIQUE NOT NULL,
                added_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                symbol TEXT NOT NULL,
                target_price FLOAT NOT NULL,
                direction TEXT NOT NULL,
                triggered BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
        logger.info("[DB] PostgreSQL tables created/verified.")
    except Exception as e:
        logger.warning(f"[DB] Table creation error: {e}")
        if conn:
            conn.close()

def init_sqlite():
    """Initialize SQLite with all required tables."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS portfolio (
        symbol TEXT, quantity INTEGER,
        avg_buy_price REAL DEFAULT 0,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT UNIQUE NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        target_price REAL NOT NULL,
        direction TEXT NOT NULL,
        triggered INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    conn.commit()
    conn.close()

# Run on import
init_sqlite()
create_postgres_tables()

CACHE_TTL = 60

def cache_get(key):
    if redis_client:
        try:
            val = redis_client.get(key)
            if val:
                logger.info(f"[CACHE] HIT: {key}")
                return json.loads(val)
        except Exception as e:
            logger.warning(f"[CACHE] get error: {e}")
    return None

def cache_set(key, value, ttl=CACHE_TTL):
    if redis_client:
        try:
            redis_client.setex(key, ttl, json.dumps(value))
        except Exception as e:
            logger.warning(f"[CACHE] set error: {e}")

def save_price_snapshot(symbol, price, source):
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("INSERT INTO price_snapshots (symbol, price, source) VALUES (%s,%s,%s)",
                        (symbol, price, source))
            conn.commit(); cur.close(); conn.close()
        except Exception as e:
            logger.warning(f"[DB] Snapshot error: {e}")
            if conn: conn.close()

def save_sentiment_to_db(symbol, query, score, label, headlines):
    conn = get_db_connection()
    if conn:
        try:
            clean = label.replace("📈","").replace("📉","").replace("➡️","").strip()
            cur = conn.cursor()
            cur.execute("""INSERT INTO news_sentiment
                (query,symbol,sentiment_score,sentiment_label,raw_headlines)
                VALUES (%s,%s,%s,%s,%s)""", (query, symbol, score, clean, headlines))
            conn.commit(); cur.close(); conn.close()
        except Exception as e:
            logger.warning(f"[DB] Sentiment error: {e}")
            if conn: conn.close()

def get_portfolio_from_db():
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT * FROM portfolio ORDER BY added_at DESC")
            rows = [dict(r) for r in cur.fetchall()]
            cur.close(); conn.close()
            return rows
        except Exception as e:
            logger.warning(f"[DB] Portfolio error: {e}")
            if conn: conn.close()
    # SQLite fallback
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT symbol, quantity, avg_buy_price FROM portfolio")
    rows = cur.fetchall(); conn.close()
    return [{"symbol": r[0], "quantity": r[1], "avg_buy_price": r[2]} for r in rows]

# ══════════════════════════════════════════════════════════════
#  3. LLM — Smart provider selection (Track B prefers GPT-4o or Claude)
# ══════════════════════════════════════════════════════════════
def _build_llm():
    """Priority: Anthropic Claude → OpenAI GPT-4o → Groq llama3 (fallback)"""
    track = LLM_TRACK.lower()

    if (track in ("auto", "anthropic")) and ANTHROPIC_API_KEY:
        try:
            from langchain_anthropic import ChatAnthropic
            llm = ChatAnthropic(model="claude-3-5-sonnet-20241022", temperature=0,
                                api_key=ANTHROPIC_API_KEY, max_tokens=2048)
            logger.info("✅ LLM: Anthropic Claude 3.5 Sonnet")
            return llm
        except ImportError:
            logger.warning("⚠️ langchain-anthropic not installed.")
        except Exception as e:
            logger.warning(f"⚠️ Anthropic init failed: {e}")

    if (track in ("auto", "openai")) and OPENAI_API_KEY:
        try:
            from langchain_openai import ChatOpenAI
            llm = ChatOpenAI(model="gpt-4o", temperature=0,
                             api_key=OPENAI_API_KEY, max_tokens=2048)
            logger.info("✅ LLM: OpenAI GPT-4o")
            return llm
        except ImportError:
            logger.warning("⚠️ langchain-openai not installed.")
        except Exception as e:
            logger.warning(f"⚠️ OpenAI init failed: {e}")

    if GROQ_API_KEY:
        try:
            llm = ChatGroq(model="llama3-70b-8192", temperature=0, api_key=GROQ_API_KEY)
            logger.info("✅ LLM: Groq llama3-70b (fallback)")
            return llm
        except Exception as e:
            logger.error(f"❌ Groq init failed: {e}")

    raise RuntimeError("No LLM available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY in .env")

llm = _build_llm()

# ══════════════════════════════════════════════════════════════
#  4. FINBERT  (module-level singleton, lazy background load)
# ══════════════════════════════════════════════════════════════
finbert_pipeline = None  # loaded lazily in background thread

def _load_finbert_background():
    global finbert_pipeline
    try:
        logger.info("[FINBERT] Loading model in background...")
        tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
        model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert")
        finbert_pipeline = pipeline("text-classification", model=model, tokenizer=tokenizer, device=-1)
        logger.info("[FINBERT] Loaded.")
    except Exception as e:
        logger.warning(f"[FINBERT] Failed: {e}")

import threading
threading.Thread(target=_load_finbert_background, daemon=True).start()

def analyze_sentiment_finbert(texts):
    if finbert_pipeline and texts:
        try:
            results = finbert_pipeline([t[:400] for t in texts])
            scores = {"positive": 0, "negative": 0, "neutral": 0}
            for r in results:
                scores[r["label"].lower()] = scores.get(r["label"].lower(), 0) + r["score"]
            winner = max(scores, key=scores.get)
            emoji_map = {"positive": "📈 Positive", "negative": "📉 Negative", "neutral": "➡️ Neutral"}
            return {"label": emoji_map[winner], "score": round(scores[winner]/len(results), 3), "model": "FinBERT"}
        except Exception as e:
            logger.warning(f"[FINBERT] Error: {e}")
    blob = TextBlob(" ".join(texts))
    s = blob.sentiment.polarity
    lbl = "📈 Positive" if s > 0.1 else "📉 Negative" if s < -0.1 else "➡️ Neutral"
    return {"label": lbl, "score": round(s, 3), "model": "TextBlob"}

# ══════════════════════════════════════════════════════════════
#  5. NEWS API
# ══════════════════════════════════════════════════════════════
def get_news_newsapi(query: str) -> list:
    if not NEWS_API_KEY:
        return []
    try:
        url = "https://newsapi.org/v2/everything"
        params = {"q": query, "language": "en", "sortBy": "publishedAt",
                  "pageSize": 6, "apiKey": NEWS_API_KEY}
        r = requests.get(url, params=params, timeout=8)
        r.raise_for_status()
        articles = r.json().get("articles", [])
        return [a["title"] for a in articles if a.get("title")]
    except Exception as e:
        logger.warning(f"[NEWS] NewsAPI error: {e}")
        return []

def get_news_with_fallback(query: str) -> list:
    headlines = get_news_newsapi(query)
    if headlines:
        logger.info(f"[NEWS] Got {len(headlines)} headlines from NewsAPI.")
        return headlines
    logger.info("[NEWS] NewsAPI empty/unavailable, falling back to DuckDuckGo.")
    try:
        return [r["title"] for r in DDGS().text(query, max_results=6)]
    except Exception as e:
        logger.warning(f"[NEWS] DuckDuckGo fallback error: {e}")
        return []

# ══════════════════════════════════════════════════════════════
#  6. PRICE FETCH WITH FALLBACK + CACHE
# ══════════════════════════════════════════════════════════════
def fetch_with_retry(func, retries=2, delay=1.0):
    for i in range(retries):
        try:
            r = func()
            if r is not None: return r
        except Exception as e:
            logger.warning(f"Attempt {i+1} failed: {e}")
            time.sleep(delay * (2 ** i))
    return None

def get_price_yfinance(symbol):
    data = yf.Ticker(symbol).history(period="5d")
    if data.empty: raise ValueError(f"No yFinance data for {symbol}")
    return round(float(data["Close"].iloc[-1]), 2)

def get_price_alpha_vantage(symbol):
    clean = symbol.replace(".NS","").replace(".BO","")
    r = requests.get(f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={clean}&apikey={ALPHA_VANTAGE_KEY}", timeout=8)
    r.raise_for_status()
    p = r.json().get("Global Quote",{}).get("05. price","")
    if not p: raise ValueError("AV no price")
    return round(float(p), 2)

def get_price_fmp(symbol):
    clean = symbol.replace(".NS","").replace(".BO","")
    r = requests.get(f"https://financialmodelingprep.com/api/v3/quote-short/{clean}?apikey={FMP_KEY}", timeout=8)
    r.raise_for_status()
    data = r.json()
    if not data: raise ValueError("FMP empty")
    return round(float(data[0]["price"]), 2)

def get_price_with_fallback(symbol):
    for name, fn in [("yFinance", lambda: get_price_yfinance(symbol)),
                      ("AlphaVantage", lambda: get_price_alpha_vantage(symbol)),
                      ("FMP", lambda: get_price_fmp(symbol))]:
        price = fetch_with_retry(fn)
        if price:
            logger.info(f"[DATA] {symbol}={price} via {name}")
            return {"price": price, "source": name, "symbol": symbol}
    return {"price": None, "source": "ALL_FAILED", "symbol": symbol}

def get_price_cached(symbol):
    key = f"price:{symbol}"
    cached = cache_get(key)
    if cached:
        cached["from_cache"] = True
        return cached
    result = get_price_with_fallback(symbol)
    if result["price"]:
        cache_set(key, result, ttl=CACHE_TTL)
        save_price_snapshot(symbol, result["price"], result.get("source","unknown"))
    return result

# ══════════════════════════════════════════════════════════════
#  7. RISK METRICS: VaR & CVaR
# ══════════════════════════════════════════════════════════════
def calculate_var_cvar(symbol: str, confidence: float = 0.95) -> dict:
    try:
        hist = yf.Ticker(symbol).history(period="1y")
        if hist.empty or len(hist) < 30:
            return {"var_95": None, "cvar_95": None, "error": "Insufficient data"}
        returns = hist["Close"].pct_change().dropna()
        var = float(np.percentile(returns, (1 - confidence) * 100))
        cvar = float(returns[returns <= var].mean())
        return {
            "var_95_pct": round(var * 100, 3),
            "cvar_95_pct": round(cvar * 100, 3),
            "confidence": confidence,
            "days_used": len(returns),
        }
    except Exception as e:
        return {"var_95": None, "cvar_95": None, "error": str(e)}

# ══════════════════════════════════════════════════════════════
#  8. SECTOR BREAKDOWN
# ══════════════════════════════════════════════════════════════
def get_sector_breakdown(symbols: list) -> dict:
    breakdown = {}
    for sym in symbols:
        try:
            sector = yf.Ticker(sym).info.get("sector", "Unknown")
        except Exception:
            sector = "Unknown"
        breakdown.setdefault(sector, []).append(sym)
    return breakdown

# ══════════════════════════════════════════════════════════════
#  9. TOOLS
# ══════════════════════════════════════════════════════════════
@tool
def get_stock_price(symbol: str) -> str:
    """Get latest stock price using multi-source fallback + Redis cache."""
    r = get_price_cached(symbol)
    if r["price"] is None: return f"Could not fetch price for {symbol}."
    note = " [cached]" if r.get("from_cache") else ""
    return f"Latest price of {symbol}: {r['price']:.2f} (via {r['source']}{note})"

@tool
def analyze_stock_trend(symbol: str) -> str:
    """Analyze stock trend using moving average."""
    data = yf.Ticker(symbol).history(period="1mo")
    if data.empty: return "No data."
    data["MA5"] = data["Close"].rolling(5).mean()
    trend = "Uptrend" if data["Close"].iloc[-1] > data["MA5"].iloc[-1] else "Downtrend"
    return f"{symbol}: {trend}. Price: {data['Close'].iloc[-1]:.2f}"

@tool
def technical_analysis(symbol: str) -> str:
    """RSI, MA20, MA50 indicators."""
    data = yf.Ticker(symbol).history(period="3mo")
    if data.empty: return f"No data for {symbol}."
    close = data['Close'].squeeze()
    ma20 = close.rolling(20).mean().iloc[-1]
    ma50 = close.rolling(50).mean().iloc[-1]
    rsi = ta.momentum.RSIIndicator(close).rsi().iloc[-1]
    return f"{symbol}: Price={close.iloc[-1]:.2f}, MA20={ma20:.2f}, MA50={ma50:.2f}, RSI={rsi:.2f}"

@tool
def compare_stocks(symbol1: str, symbol2: str) -> str:
    """Compares 1-month performance of two stocks."""
    s1 = yf.download(symbol1, period="1mo")['Close']
    s2 = yf.download(symbol2, period="1mo")['Close']
    c1 = ((s1.iloc[-1] - s1.iloc[0]) / s1.iloc[0]) * 100
    c2 = ((s2.iloc[-1] - s2.iloc[0]) / s2.iloc[0]) * 100
    winner = symbol1 if c1 > c2 else symbol2
    return f"{symbol1}({c1:.1f}%) vs {symbol2}({c2:.1f}%). Winner: {winner}"

@tool
def analyze_news_sentiment(query: str) -> str:
    """FinBERT news sentiment analysis with NewsAPI primary, DuckDuckGo fallback."""
    try:
        headlines = get_news_with_fallback(query)
        if not headlines: return f"No news for '{query}'"
        r = analyze_sentiment_finbert(headlines)
        return f"Sentiment for '{query}': {r['label']} (confidence:{r['score']:.2f}) via {r['model']}"
    except Exception as e:
        return f"Sentiment error: {e}"

@tool
def manage_portfolio_db(action: str, symbol: str = "", quantity: int = 0) -> str:
    """Manage portfolio. Actions: add/view/value."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    if action == "add":
        cur.execute("INSERT INTO portfolio (symbol, quantity) VALUES (?,?)", (symbol, quantity))
        conn.commit(); res = f"Added {quantity} shares of {symbol}."
    elif action == "view":
        cur.execute("SELECT symbol, quantity FROM portfolio")
        rows = cur.fetchall()
        res = f"Portfolio: {rows}" if rows else "Empty."
    else:
        cur.execute("SELECT symbol, quantity FROM portfolio")
        rows = cur.fetchall()
        total, failed = 0, []
        for s, q in rows:
            r = get_price_cached(s)
            if r["price"]: total += r["price"] * q
            else: failed.append(s)
        res = f"Total: {total:.2f}"
        if failed: res += f" (failed: {', '.join(failed)})"
    conn.close()
    return res

# ══════════════════════════════════════════════════════════════
#  10. LANGGRAPH STATE & NODES
# ══════════════════════════════════════════════════════════════
class AgentState(TypedDict):
    query: str; symbol: str
    messages: Annotated[list, operator.add]
    research_result: str; data_result: str
    sentiment_result: str; risk_result: str; final_answer: str

def research_node(state):
    logger.info("[NODE 1] Research...")
    msg = llm.invoke([
        SystemMessage(content="Extract Indian stock ticker. Add .NS for NSE, .BO for BSE. Return ONLY ticker. If none, return NIFTY50."),
        HumanMessage(content=state["query"])
    ])
    symbol = msg.content.strip().upper()
    logger.info(f"[NODE 1] Symbol: {symbol}")
    return {**state, "symbol": symbol, "research_result": f"Symbol: {symbol}",
            "messages": [HumanMessage(content=f"Symbol: {symbol}")]}

def data_fetch_node(state):
    logger.info("[NODE 2] Data fetch...")
    symbol = state["symbol"]
    price_data = get_price_cached(symbol)
    try:
        hist = yf.Ticker(symbol).history(period="3mo")
        if not hist.empty:
            close = hist["Close"].squeeze()
            ma20 = close.rolling(20).mean().iloc[-1]
            ma50 = close.rolling(50).mean().iloc[-1]
            rsi_val = ta.momentum.RSIIndicator(close).rsi().iloc[-1]
            tech = f"MA20:{ma20:.2f}|MA50:{ma50:.2f}|RSI:{rsi_val:.1f}"
            trend = "Uptrend" if close.iloc[-1] > ma20 else "Downtrend"
        else:
            tech, trend = "No data", "Unknown"
    except Exception as e:
        tech, trend = f"Error:{e}", "Unknown"
    note = " [cached]" if price_data.get("from_cache") else ""
    price_str = f"{price_data['price']:.2f} via {price_data['source']}{note}" if price_data["price"] else "N/A"
    data_result = f"Price:{price_str}|Trend:{trend}|{tech}"
    logger.info(f"[NODE 2] {data_result}")
    return {**state, "data_result": data_result,
            "messages": [HumanMessage(content=data_result)]}

def sentiment_node(state):
    logger.info("[NODE 3] Sentiment...")
    symbol = state["symbol"]
    query = symbol.replace(".NS","").replace(".BO","")
    try:
        headlines = get_news_with_fallback(f"{query} stock news India")
        if headlines:
            result = analyze_sentiment_finbert(headlines)
            sr = f"Sentiment:{result['label']} (conf:{result['score']:.2f}) via {result['model']} - {len(headlines)} headlines"
            save_sentiment_to_db(symbol, query, result["score"], result["label"], " | ".join(headlines[:3]))
        else:
            sr = "Sentiment: No news"
    except Exception as e:
        sr = f"Sentiment: Error - {e}"
    logger.info(f"[NODE 3] {sr}")
    return {**state, "sentiment_result": sr, "messages": [HumanMessage(content=sr)]}

def risk_node(state):
    logger.info("[NODE 4] Risk...")
    symbol = state["symbol"]
    try:
        hist = yf.Ticker(symbol).history(period="1y")
        if not hist.empty and len(hist) > 30:
            ret = hist["Close"].pct_change().dropna()
            vol = ret.std() * (252**0.5) * 100
            avg_ret = ret.mean() * 252 * 100
            sharpe = (avg_ret - 6.5) / (vol if vol > 0 else 1)
            lvl = "Low" if vol < 20 else "Medium" if vol < 40 else "High"
            var = float(np.percentile(ret, 5))
            cvar = float(ret[ret <= var].mean())
            rr = (f"{lvl} Risk|Vol:{vol:.1f}%|Sharpe:{sharpe:.2f}|Return:{avg_ret:.1f}%"
                  f"|VaR(95%):{var*100:.2f}%|CVaR(95%):{cvar*100:.2f}%")
        else:
            rr = "Risk: Insufficient data"
    except Exception as e:
        rr = f"Risk: Error - {e}"
    logger.info(f"[NODE 4] {rr}")
    return {**state, "risk_result": rr, "messages": [HumanMessage(content=rr)]}

def decision_node(state):
    logger.info("[NODE 5] Decision...")
    prompt = f"""Elite Indian financial analyst. Synthesize:
Query: {state['query']} | Symbol: {state['symbol']}
Data: {state['data_result']}
Sentiment: {state['sentiment_result']}
Risk: {state['risk_result']}

Give: 1.Quick Summary 2.Key Strengths 3.Key Risks 4.Outlook(Bullish/Bearish/Neutral)
End: Not financial advice."""
    msg = llm.invoke([HumanMessage(content=prompt)])
    logger.info("[NODE 5] Done.")
    return {**state, "final_answer": msg.content, "messages": [HumanMessage(content=msg.content)]}

def build_financial_graph():
    g = StateGraph(AgentState)
    g.add_node("research",   research_node)
    g.add_node("data_fetch", data_fetch_node)
    g.add_node("sentiment",  sentiment_node)
    g.add_node("risk",       risk_node)
    g.add_node("decision",   decision_node)
    g.set_entry_point("research")
    g.add_edge("research","data_fetch"); g.add_edge("data_fetch","sentiment")
    g.add_edge("sentiment","risk");      g.add_edge("risk","decision")
    g.add_edge("decision", END)
    return g.compile()

financial_graph = build_financial_graph()
logger.info("LangGraph 5-node pipeline compiled successfully.")

# ══════════════════════════════════════════════════════════════
#  11. MAIN ENTRY POINT
# ══════════════════════════════════════════════════════════════
def financial_agent(query: str) -> str:
    try:
        logger.info(f"[GRAPH] Starting: {query}")
        result = financial_graph.invoke({
            "query": query, "symbol": "", "messages": [],
            "research_result": "", "data_result": "",
            "sentiment_result": "", "risk_result": "", "final_answer": ""
        })
        run_id = result.get("run_id", "N/A")
        logger.info(f"[GRAPH] Complete. run_id={run_id}")
        return result["final_answer"]
    except Exception as e:
        logger.error(f"[GRAPH] Error: {e}")
        return f"Analysis Error: {e}"
