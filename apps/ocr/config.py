"""Configuration for the OCR service."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """OCR service configuration."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8001
    debug: bool = False

    # OCR Engine
    ocr_engine: str = "tesseract"  # tesseract or easyocr
    tesseract_lang: str = "fra+eng"
    easyocr_langs: list[str] = ["fr", "en"]

    # Confidence thresholds
    min_confidence: float = 0.3
    high_confidence: float = 0.8

    # File limits
    max_file_size_mb: int = 20
    allowed_extensions: list[str] = [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"]

    # API
    api_base_url: str = "http://localhost:3000"

    model_config = {"env_prefix": "OCR_"}


settings = Settings()
