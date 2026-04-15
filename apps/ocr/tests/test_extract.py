"""Tests for the /extract endpoint.

Tests use mock OCR to avoid requiring Tesseract/EasyOCR installed.
"""

import io
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent))


class TestExtractEndpoint:
    """Test POST /extract endpoint."""

    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "ocr"

    def test_extract_rejects_no_file(self, client):
        response = client.post("/extract")
        assert response.status_code == 422

    def test_extract_rejects_unsupported_extension(self, client):
        response = client.post(
            "/extract",
            files={"file": ("test.docx", b"content", "application/octet-stream")},
        )
        assert response.status_code == 400
        assert "Unsupported file type" in response.json()["detail"]

    def test_extract_rejects_empty_file(self, client):
        response = client.post(
            "/extract",
            files={"file": ("test.png", b"", "image/png")},
        )
        assert response.status_code == 400
        assert "Empty file" in response.json()["detail"]

    def test_extract_rejects_corrupt_image(self, client):
        response = client.post(
            "/extract",
            files={"file": ("test.png", b"not an image", "image/png")},
        )
        assert response.status_code == 400

    @patch("routers.extract.create_engine")
    def test_extract_returns_result_for_valid_image(self, mock_create_engine, client, sample_invoice_text):
        """Test extraction with mock OCR engine returning invoice text."""
        mock_engine = MagicMock()
        mock_engine.extract_text.return_value = (sample_invoice_text, 0.85)
        mock_create_engine.return_value = mock_engine

        # Create a valid PNG image
        img = Image.new("RGB", (100, 100), color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        response = client.post(
            "/extract",
            files={"file": ("invoice.png", buf.getvalue(), "image/png")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["document_type"] == "facture"
        assert data["fields"]["supplier_name"] is not None
        assert data["fields"]["invoice_number"] is not None
        assert data["overall_confidence"] > 0

    @patch("routers.extract.create_engine")
    def test_extract_handles_empty_ocr_result(self, mock_create_engine, client):
        """Test when OCR returns no text."""
        mock_engine = MagicMock()
        mock_engine.extract_text.return_value = ("", 0.0)
        mock_create_engine.return_value = mock_engine

        img = Image.new("RGB", (100, 100), color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        response = client.post(
            "/extract",
            files={"file": ("blank.png", buf.getvalue(), "image/png")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["document_type"] == "unknown"
        assert data["overall_confidence"] == 0.0
        assert any("Aucun texte" in w for w in data["warnings"])

    @patch("routers.extract.create_engine")
    def test_extract_ticket(self, mock_create_engine, client, sample_ticket_text):
        """Test extraction of a receipt/ticket."""
        mock_engine = MagicMock()
        mock_engine.extract_text.return_value = (sample_ticket_text, 0.75)
        mock_create_engine.return_value = mock_engine

        img = Image.new("RGB", (100, 100), color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        response = client.post(
            "/extract",
            files={"file": ("ticket.jpg", buf.getvalue(), "image/jpeg")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["document_type"] == "ticket"

    @patch("routers.extract.create_engine")
    def test_extract_multi_tva(self, mock_create_engine, client):
        """Test extraction with multi-rate TVA."""
        multi_tva_text = """
        Facture N° FAC-2026-100
        Date: 01/04/2026

        Article A    10    100,00    1000,00
        Article B     5     50,00     250,00

        TVA 20%    1000,00    200,00
        TVA 5,5%    250,00     13,75

        Total HT: 1 250,00 EUR
        Total TVA: 213,75 EUR
        Total TTC: 1 463,75 EUR
        """
        mock_engine = MagicMock()
        mock_engine.extract_text.return_value = (multi_tva_text, 0.80)
        mock_create_engine.return_value = mock_engine

        img = Image.new("RGB", (100, 100), color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        response = client.post(
            "/extract",
            files={"file": ("multi_tva.png", buf.getvalue(), "image/png")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["fields"]["total_ht_cents"] == 125000
        assert len(data["fields"]["tva_breakdown"]) >= 1

    def test_extract_accepts_jpg(self, client):
        """Test that JPG files are accepted."""
        img = Image.new("RGB", (100, 100), color="white")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        buf.seek(0)

        with patch("routers.extract.create_engine") as mock_create:
            mock_engine = MagicMock()
            mock_engine.extract_text.return_value = ("Facture test", 0.5)
            mock_create.return_value = mock_engine

            response = client.post(
                "/extract",
                files={"file": ("test.jpg", buf.getvalue(), "image/jpeg")},
            )
            assert response.status_code == 200
