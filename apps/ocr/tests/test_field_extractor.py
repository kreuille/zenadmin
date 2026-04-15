"""Tests for field extraction from OCR text.

BUSINESS RULE [CDC-2.2]: L'IA doit extraire :
  Nom fournisseur, Date, HT, TVA (multi-taux), TTC
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.field_extractor import extract_fields, extract_lines, _parse_amount
from services.document_classifier import classify_document
from services.confidence_scorer import (
    calculate_overall_confidence,
    generate_warnings,
)
from models.schemas import ExtractedFields, ExtractedLine


class TestDocumentClassifier:
    """Test document type classification."""

    def test_classifies_facture(self, sample_invoice_text):
        doc_type, confidence = classify_document(sample_invoice_text)
        assert doc_type == "facture"
        assert confidence >= 0.5

    def test_classifies_ticket(self, sample_ticket_text):
        doc_type, confidence = classify_document(sample_ticket_text)
        assert doc_type == "ticket"
        assert confidence >= 0.5

    def test_classifies_avoir(self, sample_avoir_text):
        doc_type, confidence = classify_document(sample_avoir_text)
        assert doc_type == "avoir"
        assert confidence >= 0.5

    def test_classifies_unknown_for_random_text(self):
        doc_type, confidence = classify_document("Hello world, this is random text.")
        assert doc_type == "unknown"
        assert confidence == 0.0

    def test_detects_facture_from_amount_patterns(self):
        text = "Total: 150,00 EUR\nTVA: 25,00"
        doc_type, confidence = classify_document(text)
        assert doc_type == "facture"
        assert confidence >= 0.3


class TestFieldExtractor:
    """Test structured field extraction."""

    def test_extracts_supplier_name(self, sample_invoice_text):
        fields = extract_fields(sample_invoice_text)
        assert fields.supplier_name is not None
        assert "Materiaux Pro" in fields.supplier_name
        assert fields.supplier_name_confidence > 0

    def test_extracts_invoice_number(self, sample_invoice_text):
        fields = extract_fields(sample_invoice_text)
        assert fields.invoice_number is not None
        assert "FAC-2026-00042" in fields.invoice_number
        assert fields.invoice_number_confidence >= 0.7

    def test_extracts_invoice_date(self, sample_invoice_text):
        fields = extract_fields(sample_invoice_text)
        assert fields.invoice_date is not None
        assert fields.invoice_date == "2026-04-14"
        assert fields.invoice_date_confidence >= 0.5

    def test_extracts_due_date(self, sample_invoice_text):
        fields = extract_fields(sample_invoice_text)
        assert fields.due_date is not None
        assert fields.due_date == "2026-05-14"
        assert fields.due_date_confidence >= 0.5

    def test_extracts_total_ht(self, sample_invoice_text):
        fields = extract_fields(sample_invoice_text)
        assert fields.total_ht_cents is not None
        assert fields.total_ht_cents == 107000  # 1070.00 EUR
        assert fields.total_ht_confidence >= 0.5

    def test_extracts_total_tva(self, sample_invoice_text):
        fields = extract_fields(sample_invoice_text)
        assert fields.total_tva_cents is not None
        assert fields.total_tva_cents == 21400  # 214.00 EUR

    def test_extracts_total_ttc(self, sample_invoice_text):
        fields = extract_fields(sample_invoice_text)
        assert fields.total_ttc_cents is not None
        assert fields.total_ttc_cents == 128400  # 1284.00 EUR

    def test_extracts_lines(self, sample_invoice_text):
        lines = extract_lines(sample_invoice_text)
        assert len(lines) >= 1
        # Check at least one line has reasonable data
        for line in lines:
            assert line.label
            assert line.quantity > 0
            assert line.total_ht_cents > 0


class TestParseAmount:
    """Test amount parsing to centimes."""

    def test_parses_simple_amount(self):
        assert _parse_amount("12,50") == 1250

    def test_parses_amount_with_dot(self):
        assert _parse_amount("12.50") == 1250

    def test_parses_amount_with_spaces(self):
        assert _parse_amount("1 070,00") == 107000

    def test_parses_large_amount(self):
        assert _parse_amount("12 345,67") == 1234567

    def test_handles_invalid_amount(self):
        assert _parse_amount("abc") == 0


class TestMultiTvaExtraction:
    """Test multi-rate TVA extraction."""

    def test_extracts_tva_breakdown(self):
        text = """
        Base HT        TVA         Montant
        TVA 20%    1000,00    200,00
        TVA 10%     500,00     50,00
        TVA 5,5%    200,00     11,00
        """
        fields = extract_fields(text)
        assert len(fields.tva_breakdown) >= 2

    def test_maps_standard_tva_rates(self):
        text = "TVA 20% 1000,00 200,00"
        fields = extract_fields(text)
        if fields.tva_breakdown:
            assert any(b.rate == 2000 for b in fields.tva_breakdown)


class TestConfidenceScorer:
    """Test confidence scoring."""

    def test_high_confidence_for_complete_extraction(self, sample_invoice_text):
        fields = extract_fields(sample_invoice_text)
        lines = extract_lines(sample_invoice_text)
        confidence = calculate_overall_confidence(fields, lines, 0.85)
        assert confidence >= 0.5

    def test_low_confidence_for_empty_text(self):
        fields = ExtractedFields()
        confidence = calculate_overall_confidence(fields, [], 0.0)
        assert confidence <= 0.3

    def test_cross_validation_boosts_confidence(self):
        fields = ExtractedFields(
            total_ht_cents=10000,
            total_ht_confidence=0.8,
            total_tva_cents=2000,
            total_tva_confidence=0.8,
            total_ttc_cents=12000,
            total_ttc_confidence=0.8,
        )
        confidence = calculate_overall_confidence(fields, [], 0.8)
        assert confidence >= 0.5

    def test_generates_warnings_for_missing_fields(self):
        fields = ExtractedFields()
        warnings = generate_warnings(fields, [])
        assert any("fournisseur" in w.lower() for w in warnings)
        assert any("facture" in w.lower() or "numero" in w.lower() for w in warnings)

    def test_generates_warning_for_incoherent_amounts(self):
        fields = ExtractedFields(
            total_ht_cents=10000,
            total_tva_cents=2000,
            total_ttc_cents=15000,  # Should be 12000
        )
        warnings = generate_warnings(fields, [])
        assert any("incoherence" in w.lower() for w in warnings)

    def test_no_incoherence_warning_for_matching_amounts(self):
        fields = ExtractedFields(
            total_ht_cents=10000,
            total_tva_cents=2000,
            total_ttc_cents=12000,
        )
        warnings = generate_warnings(fields, [])
        assert not any("incoherence" in w.lower() for w in warnings)
