"""Confidence scorer - calculates overall extraction confidence.

Weighs individual field confidences and cross-validates extracted data.
"""

from __future__ import annotations

from models.schemas import ExtractedFields, ExtractedLine


# Field weights for overall confidence calculation
FIELD_WEIGHTS = {
    "supplier_name": 0.15,
    "invoice_number": 0.10,
    "invoice_date": 0.10,
    "total_ht": 0.20,
    "total_tva": 0.15,
    "total_ttc": 0.20,
    "lines": 0.10,
}


def calculate_overall_confidence(
    fields: ExtractedFields,
    lines: list[ExtractedLine],
    ocr_confidence: float,
) -> float:
    """Calculate overall extraction confidence score.

    Combines:
    - Individual field confidences (weighted)
    - Cross-validation checks (HT + TVA = TTC)
    - OCR engine confidence
    - Line item consistency
    """
    weighted_sum = 0.0
    total_weight = 0.0

    # Field confidences
    field_scores = {
        "supplier_name": fields.supplier_name_confidence,
        "invoice_number": fields.invoice_number_confidence,
        "invoice_date": fields.invoice_date_confidence,
        "total_ht": fields.total_ht_confidence,
        "total_tva": fields.total_tva_confidence,
        "total_ttc": fields.total_ttc_confidence,
    }

    for field, weight in FIELD_WEIGHTS.items():
        if field == "lines":
            if lines:
                avg_line_conf = sum(l.confidence for l in lines) / len(lines)
                weighted_sum += avg_line_conf * weight
            total_weight += weight
        elif field in field_scores:
            score = field_scores[field]
            if score > 0:
                weighted_sum += score * weight
                total_weight += weight

    field_confidence = weighted_sum / total_weight if total_weight > 0 else 0.0

    # Cross-validation: HT + TVA should equal TTC
    cross_validation_bonus = 0.0
    if (
        fields.total_ht_cents is not None
        and fields.total_tva_cents is not None
        and fields.total_ttc_cents is not None
    ):
        calculated_ttc = fields.total_ht_cents + fields.total_tva_cents
        if fields.total_ttc_cents > 0:
            # Allow 1% margin for rounding
            diff_ratio = abs(calculated_ttc - fields.total_ttc_cents) / fields.total_ttc_cents
            if diff_ratio < 0.01:
                cross_validation_bonus = 0.1
            elif diff_ratio < 0.05:
                cross_validation_bonus = 0.05

    # Line totals validation
    if lines and fields.total_ht_cents is not None:
        line_total = sum(l.total_ht_cents for l in lines)
        if fields.total_ht_cents > 0:
            diff_ratio = abs(line_total - fields.total_ht_cents) / fields.total_ht_cents
            if diff_ratio < 0.01:
                cross_validation_bonus += 0.05

    # Combine: field confidence (60%), OCR confidence (25%), cross-validation (15%)
    overall = (
        field_confidence * 0.60
        + ocr_confidence * 0.25
        + cross_validation_bonus * 0.15 / 0.15  # Normalize bonus
    )

    return min(1.0, max(0.0, round(overall, 2)))


def generate_warnings(
    fields: ExtractedFields,
    lines: list[ExtractedLine],
) -> list[str]:
    """Generate warnings about extraction quality."""
    warnings: list[str] = []

    if fields.supplier_name is None:
        warnings.append("Nom du fournisseur non detecte")

    if fields.invoice_number is None:
        warnings.append("Numero de facture non detecte")

    if fields.invoice_date is None:
        warnings.append("Date de facture non detectee")

    if fields.total_ttc_cents is None:
        warnings.append("Montant total TTC non detecte")

    # Cross-validation
    if (
        fields.total_ht_cents is not None
        and fields.total_tva_cents is not None
        and fields.total_ttc_cents is not None
    ):
        calculated = fields.total_ht_cents + fields.total_tva_cents
        if abs(calculated - fields.total_ttc_cents) > max(100, fields.total_ttc_cents * 0.02):
            warnings.append(
                f"Incoherence montants: HT ({fields.total_ht_cents}) + TVA ({fields.total_tva_cents}) "
                f"!= TTC ({fields.total_ttc_cents})"
            )

    if not lines:
        warnings.append("Aucune ligne de detail detectee")

    # Low confidence fields
    low_conf_fields = []
    if fields.supplier_name_confidence > 0 and fields.supplier_name_confidence < 0.5:
        low_conf_fields.append("nom fournisseur")
    if fields.total_ttc_confidence > 0 and fields.total_ttc_confidence < 0.5:
        low_conf_fields.append("total TTC")

    if low_conf_fields:
        warnings.append(f"Confiance faible sur: {', '.join(low_conf_fields)}")

    return warnings
