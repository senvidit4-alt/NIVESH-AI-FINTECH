#!/bin/bash
echo "Starting FinSight AI..."
uvicorn app:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!
cd finsight-ui && npm run dev &
FRONTEND_PID=$!
echo "Backend  PID: $BACKEND_PID  -> http://localhost:8001"
echo "Frontend PID: $FRONTEND_PID -> http://localhost:3000"
echo "Docs          -> http://localhost:8001/docs"
wait
