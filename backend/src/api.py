from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import logging
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Helios CTA - Gas Markets API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
