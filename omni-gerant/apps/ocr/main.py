"""FastAPI OCR service for document data extraction.

BUSINESS RULE [CDC-2.2]: OCR Mobile (V-IA) - scanner tickets de caisse
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers.extract import router as extract_router

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(
    title="Omni-Gerant OCR Service",
    description="Document OCR extraction for invoices and receipts",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(extract_router, tags=["extraction"])


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "ocr", "engine": settings.ocr_engine}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)
