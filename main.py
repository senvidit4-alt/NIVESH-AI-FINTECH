"""
Financial Research AI Agent — Streamlit App  (v2 — Full Charts Edition)
=======================================================================
Run with:  streamlit run app.py

Required packages:
    pip install streamlit langchain-groq langgraph langchain-core
                yfinance pandas matplotlib mplfinance textblob ta
                duckduckgo-search plotly
"""

# ─────────────────────────────────────────────
# 1.  IMPORTS
# ─────────────────────────────────────────────
import os
import sqlite3
import warnings
warnings.filterwarnings("ignore")

from dotenv import load_dotenv
load_dotenv()

import streamlit as st
import yfinance as yf
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
from textblob import TextBlob
import ta
from duckduckgo_search import DDGS

from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent

try:
    from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
    HAS_FINBERT = True
except ImportError:
    HAS_FINBERT = False

NEWS_API_KEY = os.environ.get("NEWS_API_KEY", "")
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "JSBGLZIUF8OSK4VW")

# ── Module-level FinBERT singleton (loaded once, not per agent call) ──
@st.cache_resource
def _load_finbert_cached():
    if not HAS_FINBERT:
        return None
    try:
        tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
        model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert")
        return pipeline("text-classification", model=model, tokenizer=tokenizer, device=-1)
    except Exception:
        return None


# ─────────────────────────────────────────────
# 2.  PAGE CONFIG
# ─────────────────────────────────────────────
st.set_page_config(
    page_title="Financial Research AI Agent",
    page_icon="📈",
    layout="wide",
)

st.markdown("""
<style>
    .stMetric { background-color: #1e2130; border-radius: 10px; padding: 10px; }
    .stTabs [data-baseweb="tab"] { font-size: 14px; font-weight: 600; }
</style>
""", unsafe_allow_html=True)


# ─────────────────────────────────────────────
# 3.  DATABASE INIT
# ─────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portfolio.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio (
            symbol        TEXT,
            quantity      INTEGER,
            avg_buy_price REAL DEFAULT 0,
            added_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS watchlist (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol   TEXT UNIQUE NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()


# ─────────────────────────────────────────────
# 4.  CORE TOOL FUNCTIONS  (unchanged logic)
# ─────────────────────────────────────────────

def search_news(query: str) -> str:
    results = []
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=5):
                results.append(r["title"])
    except Exception:
        pass
    return " ".join(results)


import requests

def get_stock_price(symbol: str) -> str:
    if not symbol:
        return "I couldn't identify the exact stock symbol."
    
    # Primary: yFinance
    try:
        stock = yf.Ticker(symbol)
        data  = stock.history(period="5d")
        if not data.empty:
            price = float(data["Close"].iloc[-1])
            return f"Latest price of {symbol} is {price:.2f}. (Data via yFinance)"
    except Exception:
        pass
        
    # Track B Enhancement: Fallback to AlphaVantage
    try:
        clean_sym = symbol.replace(".NS", "").replace(".BO", "")
        url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={clean_sym}&apikey={ALPHA_VANTAGE_KEY}"
        av_data = requests.get(url, timeout=5).json()
        av_price = av_data.get("Global Quote", {}).get("05. price")
        if av_price:
            return f"Latest price of {symbol} is {float(av_price):.2f}. (Data via AlphaVantage Fallback)"
    except Exception:
        pass

    return f"Stock data not found for {symbol}. All API sources failed."


def analyze_stock_trend(symbol: str) -> str:
    stock = yf.Ticker(symbol)
    data  = stock.history(period="1mo")
    if data.empty:
        return "No stock data available."
    data["MA5"]    = data["Close"].rolling(5).mean()
    latest_price   = data["Close"].iloc[-1]
    moving_avg     = data["MA5"].iloc[-1]
    trend          = "Uptrend 📈" if latest_price > moving_avg else "Downtrend 📉"
    return f"{symbol} current trend: {trend}. Latest price: {latest_price:.2f}"


def get_news_headlines(query: str) -> list:
    """Fetch headlines: NewsAPI primary, DuckDuckGo fallback."""
    if NEWS_API_KEY:
        try:
            url = "https://newsapi.org/v2/everything"
            params = {"q": query, "language": "en", "sortBy": "publishedAt",
                      "pageSize": 6, "apiKey": NEWS_API_KEY}
            r = requests.get(url, params=params, timeout=8)
            r.raise_for_status()
            articles = r.json().get("articles", [])
            headlines = [a["title"] for a in articles if a.get("title")]
            if headlines:
                return headlines
        except Exception:
            pass
    # DuckDuckGo fallback
    try:
        with DDGS() as ddgs:
            return [r["title"] for r in ddgs.text(query, max_results=6)]
    except Exception:
        return []


def analyze_news_sentiment(query: str) -> str:
    headlines = get_news_headlines(query)
    if not headlines:
        return f"No news found for '{query}'."

    finbert = _load_finbert_cached()
    if finbert:
        try:
            chunks = [h[:400] for h in headlines if len(h) > 5]
            if chunks:
                results = finbert(chunks)
                scores = {"positive": 0, "negative": 0, "neutral": 0}
                for r in results:
                    scores[r["label"].lower()] += r["score"]
                winner = max(scores, key=scores.get)
                emoji = "📈" if winner == "positive" else "📉" if winner == "negative" else "➡️"
                return f"News sentiment for '{query}' appears {winner.capitalize()} {emoji} (FinBERT)"
        except Exception:
            pass

    # TextBlob fallback
    sentiment_score = TextBlob(" ".join(headlines)).sentiment.polarity
    if sentiment_score > 0:
        sentiment = "Positive 📈"
    elif sentiment_score < 0:
        sentiment = "Negative 📉"
    else:
        sentiment = "Neutral ➡️"
    return f"News sentiment for '{query}' appears {sentiment} (TextBlob Fallback)"


def technical_analysis(symbol: str) -> str:
    stock = yf.Ticker(symbol)
    data  = stock.history(period="3mo")
    if data.empty:
        return f"No technical data found for {symbol}."
    close_prices   = data["Close"].squeeze()
    data["MA20"]   = close_prices.rolling(window=20).mean()
    data["MA50"]   = close_prices.rolling(window=50).mean()
    rsi            = ta.momentum.RSIIndicator(close_prices)
    data["RSI"]    = rsi.rsi()
    latest         = data.iloc[-1]
    return (
        f"Technical Analysis for {symbol}\n\n"
        f"Latest Price : {latest['Close']:.2f}\n"
        f"MA20         : {latest['MA20']:.2f}\n"
        f"MA50         : {latest['MA50']:.2f}\n"
        f"RSI          : {latest['RSI']:.2f}\n\n"
        "(RSI > 70 → Overbought | RSI < 30 → Oversold)"
    )


def compare_stocks(symbol1: str, symbol2: str) -> str:
    s1      = yf.download(symbol1, period="1mo", progress=False)
    s2      = yf.download(symbol2, period="1mo", progress=False)
    p1      = float(s1["Close"].values.flatten()[-1])
    p2      = float(s2["Close"].values.flatten()[-1])
    p1_start = float(s1["Close"].values.flatten()[0])
    p2_start = float(s2["Close"].values.flatten()[0])
    change1 = ((p1 - p1_start) / p1_start) * 100
    change2 = ((p2 - p2_start) / p2_start) * 100
    better  = symbol1 if change1 > change2 else symbol2
    return (
        f"Stock Comparison\n\n"
        f"{symbol1}\n  Price: {p1:.2f} | 1-Month Change: {change1:.2f}%\n\n"
        f"{symbol2}\n  Price: {p2:.2f} | 1-Month Change: {change2:.2f}%\n\n"
        f"Better performer this month: {better}"
    )


def moving_average_signal(symbol: str) -> str:
    data        = yf.download(symbol, period="1y", progress=False)
    data["MA50"]  = data["Close"].rolling(window=50).mean()
    data["MA200"] = data["Close"].rolling(window=200).mean()
    ma50          = data["MA50"].iloc[-1]
    ma200         = data["MA200"].iloc[-1]
    if ma50 > ma200:
        signal = "BUY signal 📈 (Golden Cross)"
    elif ma50 < ma200:
        signal = "SELL signal 📉 (Death Cross)"
    else:
        signal = "HOLD"
    return (
        f"Technical Signal for {symbol}\n\n"
        f"50-Day MA  : {ma50:.2f}\n"
        f"200-Day MA : {ma200:.2f}\n\n"
        f"Trading Signal: {signal}"
    )


def analyze_portfolio(symbols: str) -> str:
    results = []
    for sym in symbols.split(","):
        sym  = sym.strip()
        data = yf.Ticker(sym).history(period="1mo")
        if data.empty:
            results.append(f"{sym}: No data found")
            continue
        change = ((data["Close"].iloc[-1] - data["Close"].iloc[0]) / data["Close"].iloc[0]) * 100
        results.append(f"{sym}: {change:.2f}% change in last month")
    return "\n".join(results)


def add_to_portfolio(symbol: str, quantity: int, avg_buy_price: float = 0.0) -> str:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO portfolio (symbol, quantity, avg_buy_price) VALUES (?, ?, ?)",
        (symbol, int(quantity), float(avg_buy_price))
    )
    conn.commit()
    conn.close()
    return f"{quantity} shares of {symbol} added to portfolio (avg buy: {avg_buy_price:.2f})."


def view_portfolio() -> str:
    conn  = sqlite3.connect(DB_PATH)
    rows  = conn.execute("SELECT symbol, quantity, avg_buy_price FROM portfolio").fetchall()
    conn.close()
    if not rows:
        return "Portfolio is empty."
    result = "📊 Your Portfolio\n\n"
    for symbol, quantity, avg_price in rows:
        result += f"  {symbol} : {quantity} shares (avg buy: {avg_price:.2f})\n"
    return result


def portfolio_value() -> str:
    conn  = sqlite3.connect(DB_PATH)
    rows  = conn.execute("SELECT symbol, quantity, avg_buy_price FROM portfolio").fetchall()
    conn.close()
    if not rows:
        return "Portfolio is empty."
    total  = 0.0
    report = "📊 Portfolio Value\n\n"
    for symbol, quantity, avg_buy_price in rows:
        data = yf.download(symbol, period="1d", progress=False)
        if data.empty:
            report += f"  {symbol} : {quantity} shares | price unavailable\n"
            continue
        price = data["Close"].iloc[-1]
        if hasattr(price, "item"):
            price = price.item()
        value  = price * quantity
        total += value
        pnl = (price - avg_buy_price) * quantity if avg_buy_price else 0
        report += f"  {symbol} : {quantity} shares | {value:.2f} | P&L: {pnl:+.2f}\n"
    report += f"\nTotal Portfolio Value: {total:.2f}"
    return report


def research_report(symbol: str) -> str:
    price     = get_stock_price(symbol)
    trend     = analyze_stock_trend(symbol)
    tech      = technical_analysis(symbol)
    signal    = moving_average_signal(symbol)
    sentiment = analyze_news_sentiment(symbol)
    return (
        f"📊 STOCK RESEARCH REPORT\nSymbol: {symbol}\n"
        f"{'─'*40}\nPRICE\n{price}\n"
        f"{'─'*40}\nTREND ANALYSIS\n{trend}\n"
        f"{'─'*40}\nTECHNICAL INDICATORS\n{tech}\n"
        f"{'─'*40}\nTRADING SIGNAL\n{signal}\n"
        f"{'─'*40}\nNEWS SENTIMENT\n{sentiment}\n"
        f"{'─'*40}\n"
        "AI Summary:\n"
        "Based on current technical indicators and sentiment, "
        "review the trend and signal before making investment decisions."
    )


# ═══════════════════════════════════════════════════════════════
# 5.  CHART FUNCTIONS  ← all new charts live here
# ═══════════════════════════════════════════════════════════════

CHART_THEME = dict(
    template="plotly_dark",
    paper_bgcolor="#0e1117",
    plot_bgcolor="#161b27",
    font=dict(color="#e8eaf6", family="Inter, sans-serif"),
)


# ── 5a.  Candlestick + Volume ────────────────────────────────────
def build_candlestick_chart(symbol: str, period: str = "3mo") -> go.Figure:
    data = yf.Ticker(symbol).history(period=period)
    if data.empty:
        return None

    fig = make_subplots(
        rows=2, cols=1, shared_xaxes=True,
        vertical_spacing=0.03, row_heights=[0.75, 0.25],
    )
    fig.add_trace(go.Candlestick(
        x=data.index,
        open=data["Open"], high=data["High"],
        low=data["Low"],  close=data["Close"],
        name="OHLC",
        increasing_line_color="#26a69a",
        decreasing_line_color="#ef5350",
    ), row=1, col=1)

    bar_colors = [
        "#26a69a" if data["Close"].iloc[i] >= data["Open"].iloc[i] else "#ef5350"
        for i in range(len(data))
    ]
    fig.add_trace(go.Bar(
        x=data.index, y=data["Volume"],
        name="Volume", marker_color=bar_colors, opacity=0.6,
    ), row=2, col=1)

    fig.update_layout(
        title=f"🕯️  {symbol} — Candlestick Chart ({period})",
        xaxis_rangeslider_visible=False,
        height=520, showlegend=False,
        **CHART_THEME,
    )
    fig.update_yaxes(title_text="Price",  row=1, col=1)
    fig.update_yaxes(title_text="Volume", row=2, col=1)
    return fig


# ── 5b.  Price + MAs + RSI + MACD ───────────────────────────────
def build_technical_chart(symbol: str, period: str = "6mo") -> go.Figure:
    data = yf.Ticker(symbol).history(period=period)
    if data.empty or len(data) < 30:
        return None

    close = data["Close"].squeeze()
    data["MA20"] = close.rolling(20).mean()
    data["MA50"] = close.rolling(50).mean()

    rsi_ind      = ta.momentum.RSIIndicator(close)
    data["RSI"]  = rsi_ind.rsi()

    macd_ind        = ta.trend.MACD(close)
    data["MACD"]    = macd_ind.macd()
    data["MACDSig"] = macd_ind.macd_signal()
    data["MACDHist"]= macd_ind.macd_diff()

    fig = make_subplots(
        rows=3, cols=1, shared_xaxes=True,
        vertical_spacing=0.03, row_heights=[0.55, 0.23, 0.22],
        subplot_titles=(f"{symbol} Price & Moving Averages", "RSI (14)", "MACD"),
    )

    # Price + MAs
    fig.add_trace(go.Scatter(x=data.index, y=data["Close"],  name="Close",
                             line=dict(color="#90caf9", width=1.8)), row=1, col=1)
    fig.add_trace(go.Scatter(x=data.index, y=data["MA20"],   name="MA 20",
                             line=dict(color="#ffd54f", width=1.2, dash="dot")), row=1, col=1)
    fig.add_trace(go.Scatter(x=data.index, y=data["MA50"],   name="MA 50",
                             line=dict(color="#ff8a65", width=1.2, dash="dash")), row=1, col=1)

    # RSI
    fig.add_trace(go.Scatter(x=data.index, y=data["RSI"], name="RSI",
                             line=dict(color="#ce93d8", width=1.6)), row=2, col=1)
    fig.add_hline(y=70, line_dash="dot", line_color="#ef5350", row=2, col=1)
    fig.add_hline(y=30, line_dash="dot", line_color="#26a69a", row=2, col=1)
    fig.add_hrect(y0=70, y1=100, fillcolor="#ef5350", opacity=0.04,
                  line_width=0, row=2, col=1)
    fig.add_hrect(y0=0,  y1=30,  fillcolor="#26a69a", opacity=0.04,
                  line_width=0, row=2, col=1)

    # MACD
    fig.add_trace(go.Scatter(x=data.index, y=data["MACD"],    name="MACD",
                             line=dict(color="#4dd0e1", width=1.4)), row=3, col=1)
    fig.add_trace(go.Scatter(x=data.index, y=data["MACDSig"], name="Signal",
                             line=dict(color="#f48fb1", width=1.4)), row=3, col=1)
    hist_colors = ["#26a69a" if v >= 0 else "#ef5350"
                   for v in data["MACDHist"].fillna(0)]
    fig.add_trace(go.Bar(x=data.index, y=data["MACDHist"], name="Histogram",
                         marker_color=hist_colors, opacity=0.7), row=3, col=1)

    fig.update_layout(
        title=f"📉 {symbol} — Technical Indicators ({period})",
        height=680, showlegend=True,
        **CHART_THEME,
    )
    return fig


# ── 5c.  Price + Bollinger Bands ────────────────────────────────
def build_line_chart(symbol: str, period: str = "3mo") -> go.Figure:
    data = yf.Ticker(symbol).history(period=period)
    if data.empty:
        return None

    close         = data["Close"].squeeze()
    data["SMA20"] = close.rolling(20).mean()
    std           = close.rolling(20).std()
    data["Upper"] = data["SMA20"] + 2 * std
    data["Lower"] = data["SMA20"] - 2 * std

    idx   = data.index
    upper = data["Upper"]
    lower = data["Lower"]

    fig = go.Figure()

    # Shaded Bollinger band
    fig.add_trace(go.Scatter(
        x=list(idx) + list(idx[::-1]),
        y=list(upper) + list(lower[::-1]),
        fill="toself",
        fillcolor="rgba(100,149,237,0.10)",
        line=dict(color="rgba(0,0,0,0)"),
        name="Bollinger Band",
        showlegend=True,
    ))
    fig.add_trace(go.Scatter(x=idx, y=upper, name="Upper Band",
                             line=dict(color="#6495ED", width=1, dash="dot")))
    fig.add_trace(go.Scatter(x=idx, y=lower, name="Lower Band",
                             line=dict(color="#6495ED", width=1, dash="dot")))
    fig.add_trace(go.Scatter(x=idx, y=data["SMA20"], name="SMA 20",
                             line=dict(color="#ffd54f", width=1.3, dash="dash")))
    fig.add_trace(go.Scatter(x=idx, y=close, name="Close",
                             line=dict(color="#90caf9", width=2)))

    fig.update_layout(
        title=f"📈 {symbol} — Price & Bollinger Bands ({period})",
        xaxis_title="Date", yaxis_title="Price",
        height=450, hovermode="x unified",
        **CHART_THEME,
    )
    return fig


# ── 5d.  Volume + OBV ────────────────────────────────────────────
def build_volume_chart(symbol: str, period: str = "3mo") -> go.Figure:
    data = yf.Ticker(symbol).history(period=period)
    if data.empty:
        return None

    obv_ind     = ta.volume.OnBalanceVolumeIndicator(
        data["Close"].squeeze(), data["Volume"].squeeze()
    )
    data["OBV"] = obv_ind.on_balance_volume()

    bar_colors = [
        "#26a69a" if data["Close"].iloc[i] >= data["Open"].iloc[i] else "#ef5350"
        for i in range(len(data))
    ]

    fig = make_subplots(
        rows=2, cols=1, shared_xaxes=True,
        vertical_spacing=0.04, row_heights=[0.58, 0.42],
        subplot_titles=("Volume", "On-Balance Volume (OBV)"),
    )
    fig.add_trace(go.Bar(x=data.index, y=data["Volume"], name="Volume",
                         marker_color=bar_colors, opacity=0.8), row=1, col=1)
    fig.add_trace(go.Scatter(x=data.index, y=data["OBV"], name="OBV",
                             line=dict(color="#ba68c8", width=1.8),
                             fill="tozeroy",
                             fillcolor="rgba(186,104,200,0.10)"), row=2, col=1)

    fig.update_layout(
        title=f"📦 {symbol} — Volume & OBV ({period})",
        height=460, showlegend=False,
        **CHART_THEME,
    )
    return fig


# ── 5e.  Portfolio Pie ────────────────────────────────────────────
def build_portfolio_pie() -> go.Figure:
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT symbol, quantity FROM portfolio").fetchall()
    conn.close()
    if not rows:
        return None

    labels, values = [], []
    for symbol, quantity in rows:
        data = yf.download(symbol, period="1d", progress=False)
        if data.empty:
            continue
        price = float(data["Close"].iloc[-1])
        labels.append(symbol)
        values.append(round(price * quantity, 2))

    if not labels:
        return None

    fig = go.Figure(go.Pie(
        labels=labels, values=values, hole=0.45,
        marker=dict(colors=px.colors.qualitative.Vivid,
                    line=dict(color="#0e1117", width=2)),
        textinfo="label+percent",
        hovertemplate="<b>%{label}</b><br>Value: %{value:,.2f}<br>%{percent}<extra></extra>",
    ))
    fig.update_layout(
        title="🥧 Portfolio Allocation by Value",
        height=420,
        annotations=[dict(text="Portfolio", x=0.5, y=0.5,
                          font_size=14, showarrow=False, font_color="#e8eaf6")],
        **CHART_THEME,
    )
    return fig


# ── 5f.  Portfolio Holdings Bar ───────────────────────────────────
def build_portfolio_bar() -> go.Figure:
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT symbol, quantity FROM portfolio").fetchall()
    conn.close()
    if not rows:
        return None

    records = []
    for symbol, quantity in rows:
        data = yf.download(symbol, period="1d", progress=False)
        if data.empty:
            continue
        price = float(data["Close"].iloc[-1])
        records.append({
            "Symbol": symbol, "Quantity": quantity,
            "Price": price, "Value": round(price * quantity, 2),
        })

    if not records:
        return None

    df = pd.DataFrame(records).sort_values("Value", ascending=True)
    fig = go.Figure(go.Bar(
        x=df["Value"], y=df["Symbol"], orientation="h",
        marker=dict(color=df["Value"], colorscale="Viridis",
                    showscale=True, colorbar=dict(title="Value")),
        text=[f"{v:,.0f}" for v in df["Value"]], textposition="outside",
        hovertemplate="<b>%{y}</b><br>Value: %{x:,.2f}<extra></extra>",
    ))
    fig.update_layout(
        title="📊 Holdings by Value",
        xaxis_title="Value",
        height=max(300, len(records) * 55 + 100),
        **CHART_THEME,
    )
    return fig


# ── 5g.  Normalised Multi-stock Comparison ────────────────────────
def build_comparison_chart(symbols: list, period: str = "1mo") -> go.Figure:
    fig     = go.Figure()
    palette = px.colors.qualitative.Plotly

    for i, sym in enumerate(symbols):
        data = yf.Ticker(sym).history(period=period)
        if data.empty:
            continue
        norm = (data["Close"] / data["Close"].iloc[0] - 1) * 100
        color_hex = palette[i % len(palette)]
        r, g, b = int(color_hex[1:3], 16), int(color_hex[3:5], 16), int(color_hex[5:7], 16)
        fig.add_trace(go.Scatter(
            x=data.index, y=norm, name=sym,
            line=dict(width=2, color=color_hex),
            fill="tozeroy",
            fillcolor=f"rgba({r},{g},{b},0.07)",
        ))

    fig.add_hline(y=0, line_color="white", line_dash="dot", line_width=1)
    fig.update_layout(
        title=f"📊 Normalised Return Comparison ({period})",
        xaxis_title="Date", yaxis_title="Return (%)",
        height=420, hovermode="x unified",
        **CHART_THEME,
    )
    return fig


# ── 5h.  1-Month Returns Bar ──────────────────────────────────────
def build_returns_bar(symbols: list) -> go.Figure:
    rows_data = []
    for sym in symbols:
        d = yf.Ticker(sym).history(period="1mo")
        if d.empty or len(d) < 2:
            continue
        ret = ((d["Close"].iloc[-1] - d["Close"].iloc[0]) / d["Close"].iloc[0]) * 100
        rows_data.append({"Symbol": sym, "Return": round(float(ret), 2)})

    if not rows_data:
        return None

    df     = pd.DataFrame(rows_data).sort_values("Return", ascending=False)
    colors = ["#26a69a" if r >= 0 else "#ef5350" for r in df["Return"]]

    fig = go.Figure(go.Bar(
        x=df["Symbol"], y=df["Return"],
        marker_color=colors,
        text=[f"{r:+.1f}%" for r in df["Return"]], textposition="outside",
        hovertemplate="<b>%{x}</b><br>Return: %{y:.2f}%<extra></extra>",
    ))
    fig.add_hline(y=0, line_color="white", line_dash="dot", line_width=1)
    fig.update_layout(
        title="📊 1-Month Returns",
        xaxis_title="Symbol", yaxis_title="Return (%)",
        height=380,
        **CHART_THEME,
    )
    return fig


# ─────────────────────────────────────────────
# 6.  LANGGRAPH AGENT BUILDER
# ─────────────────────────────────────────────

def build_agent(api_key: str):
    if api_key:
        os.environ["GROQ_API_KEY"] = api_key

    def _build_llm():
        if os.environ.get("GOOGLE_API_KEY"):
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                return ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0)
            except Exception:
                pass
        if os.environ.get("OPENAI_API_KEY"):
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(model="gpt-3.5-turbo", temperature=0)
        if os.environ.get("GROQ_API_KEY"):
            from langchain_groq import ChatGroq
            return ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
        raise RuntimeError("No LLM key found")

    llm = _build_llm()
    # FinBERT is loaded once at module level via @st.cache_resource

    @tool
    def get_stock_price_tool(symbol: str) -> str:
        """Gets the latest live stock price. Input: Yahoo Finance ticker (e.g. RELIANCE.NS, AAPL)."""
        return get_stock_price(symbol)

    @tool
    def analyze_stock_trend_tool(symbol: str) -> str:
        """Analyzes if a stock is in an uptrend or downtrend using moving averages."""
        return analyze_stock_trend(symbol)

    @tool
    def analyze_news_tool(query: str) -> str:
        """Searches the web for the latest news and returns sentiment (Positive/Negative/Neutral)."""
        return analyze_news_sentiment(query)

    @tool
    def technical_analysis_tool(symbol: str) -> str:
        """Provides RSI, MA20, MA50 technical indicators for a stock."""
        return technical_analysis(symbol)

    @tool
    def plot_chart_tool(symbol: str) -> str:
        """Plots a candlestick chart for the stock and stores it for Streamlit rendering."""
        fig = build_candlestick_chart(symbol, period="3mo")
        if fig is not None:
            st.session_state["pending_chart"] = fig
        return f"Candlestick chart generated for {symbol}."

    @tool
    def add_to_portfolio_tool(symbol_and_qty: str) -> str:
        """Adds a stock to the portfolio. Input format: 'SYMBOL QUANTITY' e.g. 'RELIANCE.NS 10'"""
        parts = symbol_and_qty.strip().split()
        if len(parts) < 2:
            return "Please provide both a ticker symbol and a quantity."
        symbol, qty = parts[0], parts[1]
        try:
            return add_to_portfolio(symbol, int(qty))
        except ValueError:
            return "Quantity must be an integer."

    @tool
    def view_portfolio_tool(_: str = "") -> str:
        """Returns the current portfolio holdings."""
        return view_portfolio()

    @tool
    def portfolio_value_tool(_: str = "") -> str:
        """Returns the live total value of the portfolio."""
        return portfolio_value()

    @tool
    def compare_stocks_tool(symbols: str) -> str:
        """Compares 1-month performance of two stocks. Input: 'SYMBOL1 SYMBOL2'"""
        parts = symbols.strip().split()
        if len(parts) < 2:
            return "Provide two ticker symbols separated by a space."
        return compare_stocks(parts[0], parts[1])

    @tool
    def research_report_tool(symbol: str) -> str:
        """Generates a full research report (price, trend, technicals, signal, sentiment)."""
        return research_report(symbol)

    financial_tools = [
        get_stock_price_tool, analyze_stock_trend_tool,
        analyze_news_tool, technical_analysis_tool,
        plot_chart_tool, add_to_portfolio_tool,
        view_portfolio_tool, portfolio_value_tool,
        compare_stocks_tool, research_report_tool,
    ]

    system_prompt = (
        "You are an elite, professional financial AI assistant with real-time tools. "
        "Always use your tools to fetch live data before answering. "
        "Break complex questions into steps. "
        "Auto-correct ticker typos; append .NS for Indian stocks."
    )

    # Track B Enhancement: Using LangGraph prebuilt react agent for complex tool orchestration
    return create_react_agent(llm, financial_tools, prompt=system_prompt)


def run_agent(agent_executor, query: str) -> str:
    try:
        response = agent_executor.invoke({"messages": [("user", query)]})
        return response["messages"][-1].content
    except Exception as exc:
        return f"⚠️ An error occurred: {exc}"


# ─────────────────────────────────────────────
# 7.  SESSION STATE DEFAULTS
# ─────────────────────────────────────────────
for key, default in {
    "messages":      [],
    "agent":         None,
    "api_key":       "",
    "pending_chart": None,
}.items():
    if key not in st.session_state:
        st.session_state[key] = default

# Auto-initialize agent if keys are present in the environment
if st.session_state.agent is None:
    if os.environ.get("GOOGLE_API_KEY") or os.environ.get("OPENAI_API_KEY") or os.environ.get("GROQ_API_KEY"):
        try:
            st.session_state.agent = build_agent("")
            st.session_state.api_key = os.environ.get("GROQ_API_KEY") or os.environ.get("GOOGLE_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""
        except Exception:
            pass


# ─────────────────────────────────────────────
# 8.  SIDEBAR
# ─────────────────────────────────────────────
with st.sidebar:
    st.markdown("## ⚙️ Configuration")

    api_key_input = st.text_input(
        "Groq API Key", type="password",
        placeholder="gsk_...",
        help="Your key is never stored beyond this session.",
    )

    if api_key_input and api_key_input != st.session_state.api_key:
        with st.spinner("Initialising agent…"):
            try:
                st.session_state.agent   = build_agent(api_key_input)
                st.session_state.api_key = api_key_input
                st.success("✅ Agent ready!")
            except Exception as e:
                st.error(f"Failed to build agent: {e}")

    st.divider()

    st.markdown("## 🗂️ Portfolio")
    col1, col2 = st.columns(2)
    if col1.button("Holdings", use_container_width=True):
        st.text(view_portfolio())
    if col2.button("Live Value", use_container_width=True):
        with st.spinner("Fetching prices…"):
            st.text(portfolio_value())

    with st.expander("➕ Add a Stock"):
        add_sym = st.text_input("Ticker", placeholder="e.g. TCS.NS")
        add_qty = st.number_input("Quantity", min_value=1, step=1, value=1)
        add_avg = st.number_input("Avg Buy Price (₹)", min_value=0.0, step=0.01, value=0.0,
                                   help="Your average purchase price per share")
        if st.button("Add to Portfolio"):
            if add_sym:
                st.success(add_to_portfolio(add_sym.upper().strip(), int(add_qty), float(add_avg)))
            else:
                st.warning("Enter a valid ticker symbol first.")

    st.divider()

    st.markdown("## ⚡ Quick Actions")
    QUICK = [
        ("📊 NIFTY 50 price",   "What is the current price of NIFTY 50 (^NSEI)?"),
        ("🔍 Reliance report",  "Give me a full research report for RELIANCE.NS"),
        ("📰 TCS sentiment",    "What is the news sentiment for TCS?"),
        ("📈 Infosys vs Wipro", "Compare INFY.NS and WIPRO.NS"),
        ("🔬 AAPL technical",  "Technical analysis for AAPL"),
        ("📉 BTC trend",       "What is the current trend of BTC-USD?"),
    ]
    for label, prompt in QUICK:
        if st.button(label, use_container_width=True):
            st.session_state["quick_prompt"] = prompt

    st.divider()
    if st.button("🗑️ Clear Chat", use_container_width=True):
        st.session_state.messages = []
        st.rerun()


# ─────────────────────────────────────────────
# 9.  MAIN AREA  —  3 tabs
# ─────────────────────────────────────────────
st.title("📈 Financial Research AI Agent")
st.caption("Powered by Groq · LangGraph · yfinance · Plotly")

tab_chat, tab_charts, tab_watchlist, tab_portfolio = st.tabs(
    ["💬 AI Chat", "📊 Charts Explorer", "👁️ Watchlist", "🗂️ Portfolio Dashboard"]
)


# ══════════════════════════════════════════════
# TAB 1  —  AI Chat
# ══════════════════════════════════════════════
with tab_chat:
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])
            if msg.get("chart") is not None:
                st.plotly_chart(msg["chart"], use_container_width=True)

    if "quick_prompt" in st.session_state:
        user_input = st.session_state.pop("quick_prompt")
    else:
        user_input = st.chat_input(
            "Ask about stocks, portfolio, charts, market news…",
            disabled=(st.session_state.agent is None),
        )

    if user_input:
        if st.session_state.agent is None:
            st.warning("Please enter your Groq API key in the sidebar first.")
            st.stop()

        st.session_state.messages.append({"role": "user", "content": user_input})
        with st.chat_message("user"):
            st.markdown(user_input)

        st.session_state.pending_chart = None

        with st.chat_message("assistant"):
            with st.spinner("Analysing…"):
                response_text = run_agent(st.session_state.agent, user_input)
            st.markdown(response_text)
            chart_fig = st.session_state.pop("pending_chart", None)
            if chart_fig is not None:
                st.plotly_chart(chart_fig, use_container_width=True)

        history_entry = {"role": "assistant", "content": response_text}
        if chart_fig is not None:
            history_entry["chart"] = chart_fig
        st.session_state.messages.append(history_entry)

    if not st.session_state.messages:
        st.info(
            "👋 **Welcome!**  \n"
            "Enter your **Groq API key** in the sidebar, then ask anything.\n\n"
            "💡 Try: *Show me the candlestick chart for RELIANCE.NS*",
            icon="💡",
        )


# ══════════════════════════════════════════════
# TAB 2  —  Charts Explorer
# ══════════════════════════════════════════════
with tab_charts:
    st.markdown("### 🔍 Stock Chart Explorer")

    c1, c2, c3 = st.columns([2, 1, 1])
    with c1:
        chart_symbol = st.text_input(
            "Ticker Symbol", value="RELIANCE.NS",
            placeholder="e.g. TCS.NS  |  AAPL  |  BTC-USD",
            key="chart_sym",
        )
    with c2:
        chart_period = st.selectbox(
            "Period", ["1mo", "3mo", "6mo", "1y", "2y"], index=1, key="chart_period",
        )
    with c3:
        st.markdown("<br>", unsafe_allow_html=True)
        load_charts = st.button("📊 Load Charts", use_container_width=True)

    st.markdown("**Compare multiple stocks** *(comma-separated)*")
    comp_cols = st.columns([3, 1])
    comp_input   = comp_cols[0].text_input(
        "Symbols to compare", value="TCS.NS, INFY.NS, WIPRO.NS", key="comp_in"
    )
    load_compare = comp_cols[1].button("📈 Compare", use_container_width=True)

    # ── Single stock charts ──────────────────────────────────────
    if load_charts and chart_symbol:
        sym = chart_symbol.strip().upper()
        st.markdown(f"---\n#### Charts for **{sym}**")

        with st.spinner(f"Loading charts for {sym}…"):

            # Row 1 — Candlestick (full width)
            st.markdown("##### 🕯️ Candlestick + Volume")
            fig = build_candlestick_chart(sym, chart_period)
            if fig:
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.warning("No candlestick data available.")

            # Row 2 — Line + Bollinger (full width)
            st.markdown("##### 📈 Price & Bollinger Bands")
            fig = build_line_chart(sym, chart_period)
            if fig:
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.warning("No line chart data available.")

            # Row 3 — Technical (left) | Volume (right)
            col_l, col_r = st.columns(2)
            with col_l:
                st.markdown("##### 📉 RSI, MACD & Moving Averages")
                fig = build_technical_chart(sym, "6mo")
                if fig:
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("Need 6 months of data for full technical chart.")

            with col_r:
                st.markdown("##### 📦 Volume & On-Balance Volume")
                fig = build_volume_chart(sym, chart_period)
                if fig:
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.warning("No volume data available.")

    # ── Comparison charts ────────────────────────────────────────
    if load_compare and comp_input:
        symbols_list = [s.strip().upper() for s in comp_input.split(",") if s.strip()]
        if symbols_list:
            st.markdown(f"---\n#### 📊 Comparison: {', '.join(symbols_list)}")
            with st.spinner("Loading comparison data…"):
                fig = build_comparison_chart(symbols_list, chart_period)
                if fig:
                    st.plotly_chart(fig, use_container_width=True)
                fig = build_returns_bar(symbols_list)
                if fig:
                    st.plotly_chart(fig, use_container_width=True)

    if not load_charts and not load_compare:
        st.info(
            "Enter a ticker above and click **Load Charts** to see:\n"
            "- 🕯️ Candlestick chart with volume\n"
            "- 📈 Price + Bollinger Bands\n"
            "- 📉 RSI, MACD & Moving Averages\n"
            "- 📦 Volume & OBV\n\n"
            "Or enter multiple tickers to **compare** their returns.",
            icon="📊",
        )


# ══════════════════════════════════════════════
# TAB 3  —  Watchlist
# ══════════════════════════════════════════════
with tab_watchlist:
    st.markdown("### 👁️ Watchlist")

    wl_col1, wl_col2 = st.columns([3, 1])
    new_watch_sym = wl_col1.text_input("Add symbol to watchlist", placeholder="e.g. INFY.NS", key="wl_add_sym")
    if wl_col2.button("➕ Add", use_container_width=True):
        if new_watch_sym:
            sym_clean = new_watch_sym.upper().strip()
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.execute("INSERT OR IGNORE INTO watchlist (symbol) VALUES (?)", (sym_clean,))
                conn.commit(); conn.close()
                st.success(f"{sym_clean} added to watchlist.")
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")
        else:
            st.warning("Enter a ticker symbol.")

    conn = sqlite3.connect(DB_PATH)
    wl_rows = conn.execute("SELECT id, symbol FROM watchlist ORDER BY added_at DESC").fetchall()
    conn.close()

    if not wl_rows:
        st.info("Your watchlist is empty. Add symbols above.", icon="👁️")
    else:
        if st.button("🔄 Refresh Watchlist", key="refresh_wl"):
            st.rerun()
        with st.spinner("Fetching live prices…"):
            for wl_id, wl_sym in wl_rows:
                try:
                    d = yf.Ticker(wl_sym).history(period="2d")
                    if not d.empty and len(d) >= 2:
                        price = float(d["Close"].iloc[-1])
                        prev  = float(d["Close"].iloc[-2])
                        chg   = price - prev
                        chg_pct = (chg / prev) * 100
                        arrow = "🟢" if chg >= 0 else "🔴"
                        col_a, col_b, col_c, col_d = st.columns([2, 2, 2, 1])
                        col_a.write(f"**{wl_sym}**")
                        col_b.write(f"₹{price:.2f}")
                        col_c.write(f"{arrow} {chg_pct:+.2f}%")
                        if col_d.button("🗑️", key=f"rm_wl_{wl_id}"):
                            conn = sqlite3.connect(DB_PATH)
                            conn.execute("DELETE FROM watchlist WHERE id=?", (wl_id,))
                            conn.commit(); conn.close()
                            st.rerun()
                    else:
                        col_a, col_b = st.columns([3, 1])
                        col_a.write(f"**{wl_sym}** — no data")
                        if col_b.button("🗑️", key=f"rm_wl_{wl_id}"):
                            conn = sqlite3.connect(DB_PATH)
                            conn.execute("DELETE FROM watchlist WHERE id=?", (wl_id,))
                            conn.commit(); conn.close()
                            st.rerun()
                except Exception:
                    st.write(f"{wl_sym} — error fetching price")


# ══════════════════════════════════════════════
# TAB 4  —  Portfolio Dashboard
# ══════════════════════════════════════════════
with tab_portfolio:
    st.markdown("### 🗂️ Live Portfolio Dashboard")

    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT symbol, quantity, avg_buy_price FROM portfolio").fetchall()
    conn.close()

    if not rows:
        st.info("Your portfolio is empty. Add stocks using the sidebar ➕", icon="💼")
    else:
        if st.button("🔄 Refresh Prices", key="refresh_portfolio"):
            st.rerun()

        records = []
        total_value = 0.0
        with st.spinner("Fetching live prices…"):
            for symbol, quantity, avg_buy_price in rows:
                d = yf.download(symbol, period="5d", progress=False)
                if d.empty or len(d) < 2:
                    records.append({
                        "Symbol": symbol, "Qty": quantity,
                        "Avg Buy": avg_buy_price,
                        "Price": None, "Value": None, "Day Change %": None, "P&L": None,
                    })
                    continue
                price = d["Close"].iloc[-1]
                prev = d["Close"].iloc[-2]
                if hasattr(price, "item"): price = price.item()
                if hasattr(prev, "item"):  prev  = prev.item()
                price = float(price); prev = float(prev)
                change = ((price - prev) / prev) * 100
                value  = price * quantity
                pnl    = (price - avg_buy_price) * quantity if avg_buy_price else 0
                total_value += value
                records.append({
                    "Symbol": symbol, "Qty": quantity,
                    "Avg Buy": round(avg_buy_price, 2),
                    "Price": round(price, 2),
                    "Value": round(value, 2),
                    "Day Change %": round(change, 2),
                    "P&L": round(pnl, 2),
                })

        # ── Metric cards ─────────────────────────────────────────
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("💼 Holdings",        f"{len(rows)} stocks")
        m2.metric("💰 Total Value",     f"{total_value:,.2f}")
        gainers = [r for r in records if r["Day Change %"] and r["Day Change %"] > 0]
        losers  = [r for r in records if r["Day Change %"] and r["Day Change %"] < 0]
        m3.metric("📈 Today's Gainers", str(len(gainers)))
        m4.metric("📉 Today's Losers",  str(len(losers)))

        st.divider()

        # ── Holdings table ────────────────────────────────────────
        st.markdown("#### 📋 Holdings Table")
        df_table = pd.DataFrame(records)

        def color_change(val):
            if isinstance(val, float):
                if val > 0:  return "color: #26a69a; font-weight: bold"
                if val < 0:  return "color: #ef5350; font-weight: bold"
            return ""

        st.dataframe(
            df_table.style
                .map(color_change, subset=["Day Change %"])  # FIXED: .applymap() deprecated in pandas 2.x
                .format({"Price": "{:.2f}", "Value": "{:,.2f}", "Avg Buy": "{:.2f}",
                         "P&L": "{:+,.2f}", "Day Change %": "{:+.2f}%"}, na_rep="—"),
            use_container_width=True,
            hide_index=True,
        )

        st.divider()

        # ── Pie + Bar side by side ────────────────────────────────
        col_pie, col_bar = st.columns(2)

        with col_pie:
            st.markdown("#### 🥧 Allocation (Pie Chart)")
            with st.spinner("Building pie…"):
                fig_pie = build_portfolio_pie()
            if fig_pie:
                st.plotly_chart(fig_pie, use_container_width=True)
            else:
                st.info("Live prices needed to show pie chart.")

        with col_bar:
            st.markdown("#### 📊 Value (Bar Chart)")
            with st.spinner("Building bar…"):
                fig_pbar = build_portfolio_bar()
            if fig_pbar:
                st.plotly_chart(fig_pbar, use_container_width=True)
            else:
                st.info("Live prices needed to show bar chart.")

        st.divider()

        # ── Sector Breakdown ──────────────────────────────────────
        valid_syms = [r["Symbol"] for r in records if r["Price"] is not None]
        if valid_syms:
            st.divider()
            st.markdown("#### 🏭 Sector Exposure")
            sector_map = {}
            for sym in valid_syms:
                try:
                    sector = yf.Ticker(sym).info.get("sector", "Unknown")
                except Exception:
                    sector = "Unknown"
                sector_map.setdefault(sector, []).append(sym)
            if sector_map:
                sector_labels = list(sector_map.keys())
                sector_counts = [len(v) for v in sector_map.values()]
                fig_sector = go.Figure(go.Pie(
                    labels=sector_labels, values=sector_counts, hole=0.4,
                    textinfo="label+percent",
                ))
                fig_sector.update_layout(title="Sector Allocation", height=380, **CHART_THEME)
                st.plotly_chart(fig_sector, use_container_width=True)

        # ── Performance comparison across all portfolio stocks ────
        if len(valid_syms) >= 2:
            st.markdown("#### 📈 Portfolio Performance (Normalised Return — 1 Month)")
            fig_comp = build_comparison_chart(valid_syms, period="1mo")
            if fig_comp:
                st.plotly_chart(fig_comp, use_container_width=True)

            st.markdown("#### 📊 1-Month Returns Bar")
            fig_ret = build_returns_bar(valid_syms)
            if fig_ret:
                st.plotly_chart(fig_ret, use_container_width=True)
        else:
            st.info("Add at least two stocks to compare portfolio performance.", icon="📊")
