"""Pydantic schemas for OCR service."""

from pydantic import BaseModel, Field


class ExtractedLine(BaseModel):
    """A single line item extracted from a document."""

    label: str
    quantity: float = 1.0
    unit_price_cents: int = 0
    tva_rate: int = 2000  # basis points (2000 = 20%)
    total_ht_cents: int = 0
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)


class TvaBreakdown(BaseModel):
    """TVA breakdown by rate."""

    rate: int  # basis points
    base_cents: int = 0
    amount_cents: int = 0


class ExtractedFields(BaseModel):
    """Fields extracted from a document."""

    supplier_name: str | None = None
    supplier_name_confidence: float = Field(ge=0.0, le=1.0, default=0.0)

    invoice_number: str | None = None
    invoice_number_confidence: float = Field(ge=0.0, le=1.0, default=0.0)

    invoice_date: str | None = None  # ISO format YYYY-MM-DD
    invoice_date_confidence: float = Field(ge=0.0, le=1.0, default=0.0)

    due_date: str | None = None
    due_date_confidence: float = Field(ge=0.0, le=1.0, default=0.0)

    total_ht_cents: int | None = None
    total_ht_confidence: float = Field(ge=0.0, le=1.0, default=0.0)

    total_tva_cents: int | None = None
    total_tva_confidence: float = Field(ge=0.0, le=1.0, default=0.0)

    total_ttc_cents: int | None = None
    total_ttc_confidence: float = Field(ge=0.0, le=1.0, default=0.0)

    tva_breakdown: list[TvaBreakdown] = []


class ExtractionResult(BaseModel):
    """Complete OCR extraction result."""

    document_type: str = "unknown"  # facture, ticket, avoir, unknown
    document_type_confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    fields: ExtractedFields = Field(default_factory=ExtractedFields)
    lines: list[ExtractedLine] = []
    overall_confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    raw_text: str = ""
    warnings: list[str] = []


class ErrorResponse(BaseModel):
    """Error response."""

    error: str
    detail: str | None = None
