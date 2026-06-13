# Nivesh AI Fintech 📈🚀
> **Next-Gen Financial Research AI Agent & Portfolio Tracker**  
> Powered by **LangGraph** (StateGraph Pipeline), **ProsusAI/FinBERT**, and **Modern Portfolio Theory (MPT)**.

Nivesh AI is an elite financial research assistant and portfolio optimization dashboard specifically tailored for Indian stock markets (NSE/BSE) as well as global equities. It leverages multi-agent graph architectures, cutting-edge sentiment models, and mathematical optimization models to give users institutional-grade insights with zero delays.

![Nivesh AI Dashboard](https://github.com/user-attachments/assets/nivesh-dashboard-mockup)

---

## 🏗️ System Architecture

Nivesh AI is built using a highly optimized, decoupled architecture allowing for real-time frontend interactions backed by a powerful asynchronous AI pipeline.

```mermaid
graph TD
    subgraph Frontend Client
        UI[Vite + React 19 App - Vercel]
    end

    subgraph Backend Services
        API[FastAPI Backend - Render]
    end

    subgraph Databases & State
        DB_SQL[SQLite Database]
        State[In-Memory LangGraph State]
    end

    subgraph AI Agent Engine (LangGraph Pipeline)
        Node1[Research Node: Stock Extraction] --> Node2[Data Fetch Node: Technical Indicators]
        Node2 --> Node3[Sentiment Node: News Sentiment]
        Node3 --> Node4[Risk Node: VaR & CVaR]
        Node4 --> Node5[Decision Node: AI Recommendation]
    end

    subgraph External Financial API Layer
        yF[Yahoo Finance Custom HTTP Client]
        AV[AlphaVantage API]
        FMP[Financial Modeling Prep]
    end

    UI -->|HTTP / WS / SSE| API
    API -->|Invokes| Node1
    
    Node2 -->|Fetch Price| External_API_Gate[Price Fallback Engine]
    External_API_Gate --> yF
    External_API_Gate --> AV
    External_API_Gate --> FMP
    
    Node3 -->|NLP Sentiment| FinBERT[ProsusAI / FinBERT Model]
    
    Node4 -->|Historical Returns| yF
    
    Node5 -->|Synthesize Insights| LLM[LLM: Groq Llama 3 70B / OpenAI]
    
    API --> DB_SQL
```

---

## ✨ Key Features

* **🤖 Conversational AI Chatbot**: A natural language interface that allows users to interact with the LangGraph pipeline, query portfolio metrics, and get real-time market insights via an intuitive chat UI with complete conversation memory.
* **🧠 LangGraph 5-Node Agent Pipeline**: Routes stock analysis queries through a structured pipeline:
  1. `research`: Extracts and normalizes stock symbols (appending `.NS` for NSE, `.BO` for BSE).
  2. `data_fetch`: Captures latest prices and technical metrics (SMA 20, SMA 50, RSI) using a robust HTTP client bypassing standard API rate limits.
  3. `sentiment`: Pulls query-related news and performs NLP sentiment analysis.
  4. `risk`: Conducts annualized return, volatility, Sharpe Ratio, and historical risk simulations.
  5. `decision`: Synthesizes all data points into a final buy/sell/hold outlook.
* **🌍 Automatic Global Alerts & News**: Features a background engine running 24/7 to monitor major global and domestic indices/stocks. Detects breakouts and crashes (>1% movements) and pushes them instantly to the dashboard, along with live worldwide stock market news.
* **📈 Modern Portfolio Theory (MPT) Optimization**: Computes maximum Sharpe Ratio weight allocations for custom portfolios using SLSQP numerical optimization. Also simulates random allocations to plot the **Efficient Frontier**.
* **🛡️ Institutional Risk Analytics**: Calculates advanced metrics including:
  * Value at Risk (**VaR 95%**) and Conditional Value at Risk (**CVaR 95%**).
  * Volatility (Standard Deviation) & Sharpe Ratio.
  * Asset Sector Breakdown and Diversification Scores.
* **🔄 Live Updates & WebSockets**:
  * Real-time WebSocket connection (`/ws/market-updates`) streaming live ticker data.
  * Automatic fallback and reconnect policies to ensure 100% uptime.

---

## 💻 Tech Stack

### Backend & AI (Render)
* **Framework**: FastAPI (Python 3.11+)
* **Agent Framework**: LangGraph & LangChain Core
* **LLM Engine**: Groq Llama-3.3-70b-versatile (Blazing Fast Inference)
* **NLP Models**: Hugging Face Transformers (`ProsusAI/finbert`)
* **Financial Math**: SciPy (Optimization), TA (Technical Analysis library), Pandas, NumPy
* **Database**: SQLite
* **Custom Clients**: Bypass blocks via direct HTTP session handling and User-Agent spoofing for financial data APIs.

### Frontend (Vercel)
* **Framework**: React 19 + Vite
* **Routing**: TanStack Router
* **Styling & UI**: TailwindCSS v4, Radix UI primitives, class-variance-authority
* **Animations**: Framer Motion & GSAP
* **Charts**: Recharts

---

## 🚀 Getting Started

### 📋 Prerequisites
* Python 3.11+
* Node.js 20+

### 🔑 Setup Environment Variables
Create a `.env` file in the root directory for the backend and a `.env` inside `nivesh-frontend/` for the frontend.

**Backend Root `.env` Configuration:**
```ini
GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key
NEWS_API_KEY=your_news_api_key
ALPHA_VANTAGE_KEY=demo
FMP_KEY=demo
LLM_TRACK=auto
```

**Frontend `nivesh-frontend/.env` Configuration:**
```ini
VITE_AGENT_API_URL=http://localhost:8000
VITE_API_TOKEN=your_secret_token_here
```

---

### 🛠️ Local Running (Manual)

#### 1. Setup Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Start backend server (runs on port 8000)
python app.py
```

#### 2. Setup React Frontend
```bash
cd nivesh-frontend
npm install
npm run dev
```
*Frontend runs on http://localhost:5173*

---

## ☁️ Cloud Deployment

The project is natively configured for easy deployment on **Vercel** (Frontend) and **Render** (Backend).
1. Set `VITE_AGENT_API_URL=https://<your-render-app>.onrender.com` in Vercel environment variables.
2. Ensure the UptimeRobot script is linked to `https://<your-render-app>.onrender.com/health` to prevent backend cold starts on Render's free tier.

---

## ⚠️ Disclaimer
*This application is for educational and hackathon submission purposes only. None of the recommendations, reports, or portfolio optimization metrics generated by Nivesh AI constitute official financial, tax, or investment advice.*
