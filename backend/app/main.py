from fastapi import FastAPI

app = FastAPI(title="RAG Web UI", version="0.1.0")

@app.get("/")
def root():
    return {"message": "Welcome to RAG Web UI API"}

@app.get("/api/health")
def health():
    return {"status": "healthy"}