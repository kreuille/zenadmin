"""Document classifier - identifies document type from OCR text.

BUSINESS RULE [CDC-2.2]: Classification document (facture, ticket, avoir)
"""

from __future__ import annotations

import re
import logging

logger = logging.getLogger(__name__)

# Keywords that indicate document type
FACTURE_KEYWORDS = [
    r"\bfacture\b",
    r"\binvoice\b",
    r"\bfact[\.\s]",
    r"\bn[°o]\s*facture\b",
    r"\bfacture\s+n[°o]",
]

TICKET_KEYWORDS = [
    r"\bticket\b",
    r"\bticket\s+de\s+caisse\b",
    r"\brecu\b",
    r"\breceipt\b",
    r"\bcaisse\b",
]

AVOIR_KEYWORDS = [
    r"\bavoir\b",
    r"\bcredit\s*note\b",
    r"\bnote\s+de\s+credit\b",
    r"\bavoirs?\b",
    r"\bremboursement\b",
]


def classify_document(text: str) -> tuple[str, float]:
    """Classify a document based on its OCR text.

    Returns:
        Tuple of (document_type, confidence) where type is one of:
        'facture', 'ticket', 'avoir', 'unknown'
    """
    text_lower = text.lower()

    scores = {
        "facture": _score_keywords(text_lower, FACTURE_KEYWORDS),
        "ticket": _score_keywords(text_lower, TICKET_KEYWORDS),
        "avoir": _score_keywords(text_lower, AVOIR_KEYWORDS),
    }

    best_type = max(scores, key=scores.get)  # type: ignore[arg-type]
    best_score = scores[best_type]

    if best_score == 0:
        # Check for generic invoice patterns (amounts, dates, TVA)
        has_amounts = bool(re.search(r"\d+[.,]\d{2}\s*(?:€|EUR|eur)", text_lower))
        has_tva = bool(re.search(r"\btva\b", text_lower))
        has_total = bool(re.search(r"\btotal\b", text_lower))

        if has_amounts and (has_tva or has_total):
            return "facture", 0.4
        return "unknown", 0.0

    # Normalize confidence based on keyword matches
    confidence = min(0.95, 0.5 + best_score * 0.15)
    return best_type, confidence


def _score_keywords(text: str, patterns: list[str]) -> int:
    """Count keyword matches in text."""
    score = 0
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        score += len(matches)
    return score
