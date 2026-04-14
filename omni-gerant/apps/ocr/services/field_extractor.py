"""Field extractor - extracts structured fields from OCR text.

BUSINESS RULE [CDC-2.2]: L'IA doit extraire :
  Nom fournisseur, Date, HT, TVA (multi-taux), TTC
"""

from __future__ import annotations

import re
import logging
from datetime import datetime
from dateutil import parser as dateutil_parser

from models.schemas import ExtractedFields, ExtractedLine, TvaBreakdown

logger = logging.getLogger(__name__)

# BUSINESS RULE [R02]: Montants en centimes
TVA_RATES_MAP = {
    "20": 2000,
    "20,0": 2000,
    "20.0": 2000,
    "10": 1000,
    "10,0": 1000,
    "10.0": 1000,
    "5,5": 550,
    "5.5": 550,
    "2,1": 210,
    "2.1": 210,
}


def extract_fields(text: str) -> ExtractedFields:
    """Extract structured fields from OCR text."""
    fields = ExtractedFields()

    fields.supplier_name, fields.supplier_name_confidence = _extract_supplier_name(text)
    fields.invoice_number, fields.invoice_number_confidence = _extract_invoice_number(text)
    fields.invoice_date, fields.invoice_date_confidence = _extract_date(text, "invoice")
    fields.due_date, fields.due_date_confidence = _extract_date(text, "due")
    fields.total_ht_cents, fields.total_ht_confidence = _extract_amount(text, "ht")
    fields.total_tva_cents, fields.total_tva_confidence = _extract_amount(text, "tva")
    fields.total_ttc_cents, fields.total_ttc_confidence = _extract_amount(text, "ttc")
    fields.tva_breakdown = _extract_tva_breakdown(text)

    return fields


def extract_lines(text: str) -> list[ExtractedLine]:
    """Extract line items from OCR text.

    Looks for patterns like: description  qty  price  total
    """
    lines: list[ExtractedLine] = []

    # Pattern: text followed by numbers (qty, price, total)
    line_pattern = re.compile(
        r"^(.{3,50}?)\s+"  # label (3-50 chars)
        r"(\d+(?:[.,]\d+)?)\s+"  # quantity
        r"(\d+(?:[.,]\d{2}))\s+"  # unit price
        r"(\d+(?:[.,]\d{2}))",  # total
        re.MULTILINE,
    )

    for match in line_pattern.finditer(text):
        label = match.group(1).strip()
        quantity = _parse_number(match.group(2))
        unit_price = _parse_amount(match.group(3))
        total = _parse_amount(match.group(4))

        if label and quantity > 0 and total > 0:
            lines.append(
                ExtractedLine(
                    label=label,
                    quantity=quantity,
                    unit_price_cents=unit_price,
                    tva_rate=2000,  # Default, refined later
                    total_ht_cents=total,
                    confidence=0.6,
                )
            )

    return lines


def _extract_supplier_name(text: str) -> tuple[str | None, float]:
    """Extract supplier name - usually the first significant line."""
    lines = text.strip().split("\n")
    for line in lines[:5]:
        line = line.strip()
        # Skip empty, numeric-only, or very short lines
        if len(line) < 3:
            continue
        if re.match(r"^[\d\s\-/.,]+$", line):
            continue
        # Skip common non-name patterns
        if re.match(r"(?i)^(facture|date|n[°o]|total|tva|page)", line):
            continue
        return line, 0.6

    return None, 0.0


def _extract_invoice_number(text: str) -> tuple[str | None, float]:
    """Extract invoice number."""
    patterns = [
        (r"(?i)(?:facture|invoice|fact\.?)\s*n[°o]?\s*[:.]?\s*([A-Z0-9\-/]+)", 0.9),
        (r"(?i)n[°o]\s*[:.]?\s*([A-Z0-9\-/]{3,20})", 0.7),
        (r"(?i)(?:ref|reference)\s*[:.]?\s*([A-Z0-9\-/]+)", 0.6),
    ]
    for pattern, confidence in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip(), confidence

    return None, 0.0


def _extract_date(text: str, date_type: str = "invoice") -> tuple[str | None, float]:
    """Extract a date from text."""
    if date_type == "due":
        patterns = [
            r"(?i)(?:echeance|due\s*date|date\s*limite|a\s*payer\s*avant)\s*[:.]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})",
        ]
    else:
        patterns = [
            r"(?i)(?:date\s*(?:de\s*)?facture|invoice\s*date|date)\s*[:.]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})",
            r"(?i)(?:le|du)\s+(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})",
        ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            date_str = match.group(1)
            try:
                parsed = dateutil_parser.parse(date_str, dayfirst=True)
                return parsed.strftime("%Y-%m-%d"), 0.8
            except (ValueError, OverflowError):
                continue

    # Fallback: find any date-like pattern
    date_match = re.search(r"(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})", text)
    if date_match:
        try:
            parsed = dateutil_parser.parse(date_match.group(1), dayfirst=True)
            return parsed.strftime("%Y-%m-%d"), 0.4
        except (ValueError, OverflowError):
            pass

    return None, 0.0


def _extract_amount(text: str, amount_type: str) -> tuple[int | None, float]:
    """Extract an amount in cents from text."""
    if amount_type == "ht":
        patterns = [
            (r"(?i)(?:total\s*)?h\.?t\.?\s*[:.]?\s*(\d[\d\s]*(?:[.,]\d{2}))\s*(?:€|EUR)?", 0.85),
            (r"(?i)(?:montant\s*)?h\.?t\.?\s*[:.]?\s*(\d[\d\s]*(?:[.,]\d{2}))", 0.7),
        ]
    elif amount_type == "tva":
        patterns = [
            (r"(?i)(?:total\s*)?t\.?v\.?a\.?\s*[:.]?\s*(\d[\d\s]*(?:[.,]\d{2}))\s*(?:€|EUR)?", 0.85),
            (r"(?i)montant\s*tva\s*[:.]?\s*(\d[\d\s]*(?:[.,]\d{2}))", 0.7),
        ]
    else:  # ttc
        patterns = [
            (r"(?i)(?:total\s*)?t\.?t\.?c\.?\s*[:.]?\s*(\d[\d\s]*(?:[.,]\d{2}))\s*(?:€|EUR)?", 0.85),
            (r"(?i)(?:net\s*a\s*payer|total\s*a\s*payer)\s*[:.]?\s*(\d[\d\s]*(?:[.,]\d{2}))", 0.9),
            (r"(?i)total\s*[:.]?\s*(\d[\d\s]*(?:[.,]\d{2}))\s*(?:€|EUR)", 0.6),
        ]

    for pattern, confidence in patterns:
        match = re.search(pattern, text)
        if match:
            amount = _parse_amount(match.group(1))
            if amount > 0:
                return amount, confidence

    return None, 0.0


def _extract_tva_breakdown(text: str) -> list[TvaBreakdown]:
    """Extract TVA breakdown by rate."""
    breakdown: list[TvaBreakdown] = []

    # Pattern: TVA rate% base amount tva_amount
    pattern = re.compile(
        r"(?i)(?:tva\s*)?(\d+(?:[.,]\d)?)\s*%\s*"
        r"(\d[\d\s]*(?:[.,]\d{2}))\s*"
        r"(\d[\d\s]*(?:[.,]\d{2}))"
    )

    for match in pattern.finditer(text):
        rate_str = match.group(1).replace(",", ".")
        rate = TVA_RATES_MAP.get(rate_str)
        if rate is None:
            try:
                rate = int(float(rate_str) * 100)
            except ValueError:
                continue

        base_cents = _parse_amount(match.group(2))
        amount_cents = _parse_amount(match.group(3))

        if base_cents > 0 or amount_cents > 0:
            breakdown.append(
                TvaBreakdown(rate=rate, base_cents=base_cents, amount_cents=amount_cents)
            )

    return breakdown


def _parse_amount(text: str) -> int:
    """Parse a monetary amount string to cents."""
    # Remove spaces
    cleaned = text.replace(" ", "").replace("\u00a0", "")
    # Normalize decimal separator
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")

    try:
        return round(float(cleaned) * 100)
    except ValueError:
        return 0


def _parse_number(text: str) -> float:
    """Parse a number string."""
    cleaned = text.replace(",", ".").replace(" ", "")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0
