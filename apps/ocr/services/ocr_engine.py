"""OCR Engine - text extraction from images and PDFs.

BUSINESS RULE [CDC-2.2]: OCR Mobile (V-IA) - scanner tickets de caisse
Pipeline: reception image/PDF -> pre-traitement -> OCR
"""

from __future__ import annotations

import io
import logging
from typing import Protocol

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

logger = logging.getLogger(__name__)


class OCREngine(Protocol):
    """Protocol for OCR engines."""

    def extract_text(self, image: Image.Image) -> tuple[str, float]:
        """Extract text from image. Returns (text, confidence)."""
        ...


class TesseractEngine:
    """Tesseract OCR engine."""

    def __init__(self, lang: str = "fra+eng"):
        self.lang = lang

    def extract_text(self, image: Image.Image) -> tuple[str, float]:
        """Extract text using Tesseract."""
        try:
            import pytesseract

            data = pytesseract.image_to_data(
                image, lang=self.lang, output_type=pytesseract.Output.DICT
            )
            texts = []
            confidences = []
            for i, text in enumerate(data["text"]):
                conf = int(data["conf"][i])
                if conf > 0 and text.strip():
                    texts.append(text)
                    confidences.append(conf / 100.0)

            full_text = " ".join(texts)
            avg_confidence = (
                sum(confidences) / len(confidences) if confidences else 0.0
            )
            return full_text, avg_confidence

        except ImportError:
            logger.warning("pytesseract not installed, returning empty result")
            return "", 0.0
        except Exception as e:
            logger.error("Tesseract OCR failed: %s", e)
            return "", 0.0


class EasyOCREngine:
    """EasyOCR engine (fallback)."""

    def __init__(self, langs: list[str] | None = None):
        self.langs = langs or ["fr", "en"]
        self._reader = None

    @property
    def reader(self):
        if self._reader is None:
            try:
                import easyocr

                self._reader = easyocr.Reader(self.langs, gpu=False)
            except ImportError:
                logger.warning("easyocr not installed")
                return None
        return self._reader

    def extract_text(self, image: Image.Image) -> tuple[str, float]:
        """Extract text using EasyOCR."""
        if self.reader is None:
            return "", 0.0

        try:
            img_array = np.array(image)
            results = self.reader.readtext(img_array)

            texts = []
            confidences = []
            for _bbox, text, conf in results:
                if text.strip():
                    texts.append(text)
                    confidences.append(conf)

            full_text = " ".join(texts)
            avg_confidence = (
                sum(confidences) / len(confidences) if confidences else 0.0
            )
            return full_text, avg_confidence

        except Exception as e:
            logger.error("EasyOCR failed: %s", e)
            return "", 0.0


def preprocess_image(image: Image.Image) -> Image.Image:
    """Pre-process image for better OCR results.

    Steps: grayscale, contrast enhancement, denoising, thresholding.
    """
    # Convert to grayscale
    if image.mode != "L":
        image = image.convert("L")

    # Enhance contrast
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.5)

    # Sharpen
    image = image.filter(ImageFilter.SHARPEN)

    # Denoise with median filter
    image = image.filter(ImageFilter.MedianFilter(size=3))

    return image


def image_from_pdf_page(pdf_bytes: bytes, page_num: int = 0) -> Image.Image | None:
    """Extract a page from a PDF as an image."""
    try:
        from pdf2image import convert_from_bytes

        images = convert_from_bytes(pdf_bytes, first_page=page_num + 1, last_page=page_num + 1)
        return images[0] if images else None
    except ImportError:
        logger.warning("pdf2image not installed")
        return None
    except Exception as e:
        logger.error("PDF conversion failed: %s", e)
        return None


def create_engine(engine_type: str = "tesseract", **kwargs) -> OCREngine:
    """Factory for OCR engines."""
    if engine_type == "easyocr":
        return EasyOCREngine(langs=kwargs.get("langs"))
    return TesseractEngine(lang=kwargs.get("lang", "fra+eng"))
