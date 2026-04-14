"""Extract router - POST /extract endpoint.

BUSINESS RULE [CDC-2.2]: Pipeline OCR extraction donnees factures
"""

from __future__ import annotations

import io
import logging

from fastapi import APIRouter, UploadFile, File, HTTPException
from PIL import Image

from config import settings
from models.schemas import ExtractionResult, ErrorResponse
from services.ocr_engine import create_engine, preprocess_image, image_from_pdf_page
from services.document_classifier import classify_document
from services.field_extractor import extract_fields, extract_lines
from services.confidence_scorer import calculate_overall_confidence, generate_warnings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/extract",
    response_model=ExtractionResult,
    responses={400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
async def extract_document(file: UploadFile = File(...)) -> ExtractionResult:
    """Extract structured data from a document image or PDF.

    Accepts: image (PNG, JPG, TIFF, BMP) or PDF
    Returns: extracted fields, lines, confidence scores
    """
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    extension = _get_extension(file.filename)
    if extension not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {extension}. Allowed: {settings.allowed_extensions}",
        )

    # Read file content
    content = await file.read()
    if len(content) > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum: {settings.max_file_size_mb}MB",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Convert to image
    try:
        if extension == ".pdf":
            image = image_from_pdf_page(content)
            if image is None:
                raise HTTPException(status_code=400, detail="Could not read PDF file")
        else:
            image = Image.open(io.BytesIO(content))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to open image: %s", e)
        raise HTTPException(status_code=400, detail="Could not read image file")

    # Pre-process
    processed = preprocess_image(image)

    # OCR
    engine = create_engine(settings.ocr_engine)
    raw_text, ocr_confidence = engine.extract_text(processed)

    if not raw_text.strip():
        return ExtractionResult(
            document_type="unknown",
            document_type_confidence=0.0,
            overall_confidence=0.0,
            raw_text="",
            warnings=["Aucun texte detecte dans le document"],
        )

    # Classify document
    doc_type, doc_type_confidence = classify_document(raw_text)

    # Extract fields
    fields = extract_fields(raw_text)

    # Extract lines
    lines = extract_lines(raw_text)

    # Calculate confidence
    overall_confidence = calculate_overall_confidence(fields, lines, ocr_confidence)

    # Generate warnings
    warnings = generate_warnings(fields, lines)

    return ExtractionResult(
        document_type=doc_type,
        document_type_confidence=doc_type_confidence,
        fields=fields,
        lines=lines,
        overall_confidence=overall_confidence,
        raw_text=raw_text,
        warnings=warnings,
    )


def _get_extension(filename: str) -> str:
    """Get lowercase file extension."""
    idx = filename.rfind(".")
    if idx == -1:
        return ""
    return filename[idx:].lower()
