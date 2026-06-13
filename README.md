# FinSight AI 📈
> **Next-Gen Financial Research AI Agent & Portfolio Tracker**  
> Powered by **LangGraph** (StateGraph Pipeline), **ProsusAI/FinBERT**, and **Modern Portfolio Theory (MPT)**.

FinSight AI is an elite financial research assistant and portfolio optimization dashboard specifically tailored for Indian stock markets (NSE/BSE) as well as global equities. It leverages multi-agent graph architectures, cutting-edge sentiment models, and mathematical optimization models to give users institutional-grade insights.

---

## 🏗️ System Architecture

FinSight AI is built using a dual-frontend architecture designed to support both modern, interactive web applications and quick dashboard prototypes.

```mermaid
graph TD
    subgraph Frontends
        UI[Next.js Web App - Port 3000]
        ST[Streamlit Dashboard - Port 8501]
    end

    subgraph Backend Services
        API[FastAPI Backend - Port 8001]
    end

    subgraph Databases & Caching
        DB_SQL[PostgreSQL / SQLite]
        Cache[Redis / FakeRedis]
    end

    subgraph AI Agent Engine (LangGraph Pipeline)
        Node1[Research Node: Stock Extraction] --> Node2[Data Fetch Node: Technical Indicators]
        Node2 --> Node3[Sentiment Node: News Sentiment]
        Node3 --> Node4[Risk Node: VaR & CVaR]
        Node4 --> Node5[Decision Node: AI Recommendation]
    end

    subgraph External Financial API Fallbacks
        yF[yFinance API]
        AV[AlphaVantage API]
        FMP[Financial Modeling Prep]
    end

    UI -->|HTTP / WS / SSE| API
    ST -->|Direct Library Calls| Node1
    API -->|Invokes| Node1
    
    Node2 -->|Cache Check| Cache
    Node2 -->|Fetch Price| External_API_Gate[Price Fallback Engine]
    External_API_Gate --> yF
    External_API_Gate --> AV
    External_API_Gate --> FMP
    
    Node3 -->|NLP Sentiment| FinBERT[ProsusAI / FinBERT Model]
    Node3 -->|Fallback NLP| TextBlob[TextBlob Sentiment]
    
    Node4 -->|Historical Returns| yF
    
    Node5 -->|Synthesize Insights| LLM[LLM: Claude 3.5 / GPT-4o / Llama3]
    
    API --> DB_SQL
```

---

## ✨ Key Features

* **🤖 Conversational AI Chatbot**: A natural language interface that allows users to interact with the LangGraph pipeline, query portfolio metrics, and get real-time market insights via an intuitive chat UI.
* **🧠 LangGraph 5-Node Agent Pipeline**: Routes stock analysis queries through a structured pipeline:
  1. `research`: Extracts and normalizes stock symbols (appending `.NS` for NSE, `.BO` for BSE).
  2. `data_fetch`: Captures latest prices and technical metrics (SMA 20, SMA 50, RSI).
  3. `sentiment`: Pulls query-related news and performs NLP sentiment analysis.
  4. `risk`: Conducts annualized return, volatility, Sharpe Ratio, and historical risk simulations.
  5. `decision`: Synthesizes all data points into a final buy/sell/hold outlook.
* **📰 Advanced Sentiment Analysis**: Employs **ProsusAI/FinBERT** (a BERT model fine-tuned for financial sentiment) on headlines retrieved via NewsAPI, falling back automatically to TextBlob and DuckDuckGo Search.
* **📈 Modern Portfolio Theory (MPT) Optimization**: Computes maximum Sharpe Ratio weight allocations for custom portfolios using SLSQP numerical optimization. Also simulates 500+ random allocations to plot the **Efficient Frontier**.
* **🛡️ Risk Analytics**: Calculates advanced metrics including:
  * Value at Risk (**VaR 95%**) and Conditional Value at Risk (**CVaR 95%**).
  * Volatility (Standard Deviation) & Sharpe Ratio.
  * Asset Sector Breakdown and Diversification Scores.
* **🔄 Live Updates & Background Tasks**:
  * Real-time WebSocket connection (`/ws/market-updates`) and Server-Sent Events (SSE) streaming live ticker data.
  * Background price alert monitoring that runs continuously to check price conditions.
* **💾 Persistent Watchlist & Alerts**: Fully integrates with **PostgreSQL** in production and **SQLite** for local development.

---

## 💻 Tech Stack

### Backend & AI
* **Framework**: FastAPI (Python 3.11)
* **Agent Framework**: LangGraph & LangChain Core
* **LLM Engine**: Priority list: Claude 3.5 Sonnet ➔ OpenAI GPT-4o ➔ Groq Llama 3 (70B)
* **NLP Models**: Hugging Face Transformers (`ProsusAI/finbert`), PyTorch, TextBlob
* **Financial Math**: SciPy (Optimization), TA (Technical Analysis library), Pandas, NumPy, yFinance
* **Database**: PostgreSQL (Production) / SQLite (Dev)
* **Cache**: Redis / FakeRedis

### Frontends
* **Next.js Web App**: Next.js 14, React 18, Zustand (State Management), TailwindCSS, Recharts, Framer Motion (Animations), Lucide Icons
* **Streamlit Dashboard**: Streamlit 1.35, Plotly (Candlesticks, OBV, Bollinger Bands, Efficient Frontier), Matplotlib

---

## 🚀 Getting Started

### 📋 Prerequisites
* Python 3.11+
* Node.js 20+

### 🔑 Setup Environment Variables
Create a `.env` file in the root directory and a `.env.local` inside `finsight-ui/`.

**Root `.env` Configuration:**
```ini
GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
NEWS_API_KEY=your_news_api_key
ALPHA_VANTAGE_KEY=demo
FMP_KEY=demo
REDIS_URL=
DATABASE_URL=
API_SECRET_TOKEN=
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
LLM_TRACK=auto
```

**Frontend `finsight-ui/.env.local` Configuration:**
```ini
NEXT_PUBLIC_API_URL=http://localhost:8001
NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws/market-updates
NEXT_PUBLIC_API_TOKEN=
```

---

### 🛠️ Local Running (Manual)

#### 1. Setup Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Start backend server
python -m uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

#### 2. Setup Next.js Frontend
```bash
cd finsight-ui
npm install
npm run dev
```
*Frontend runs on http://localhost:3000*

#### 3. Setup Streamlit Dashboard (Alternative Interface)
```bash
# Launch Streamlit app
streamlit run main.py
```
*Streamlit runs on http://localhost:8501*

*Note: Windows users can simply run the provided `dev.bat` script to start both the Next.js Frontend and FastAPI Backend automatically.*

---

## 🐳 Docker Deployment

The entire system—including Redis, PostgreSQL, FastAPI Backend, Next.js Web App, and Streamlit—can be booted up with a single Docker Compose command:

```bash
docker-compose up --build
```

### Port Mappings in Container Setup:
* **Next.js Web App**: http://localhost:3000
* **Streamlit Dashboard**: http://localhost:8501
* **FastAPI Backend (API)**: http://localhost:8001
* **Swagger API Documentation**: http://localhost:8001/docs
* **PostgreSQL Database**: Port 5432
* **Redis Cache**: Port 6379

---

## ⚠️ Disclaimer
*This application is for educational and hackathon submission purposes only. None of the recommendations, reports, or portfolio optimization metrics generated by FinSight AI constitute official financial, tax, or investment advice.*
