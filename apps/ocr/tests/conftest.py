"""Test configuration and fixtures for OCR service."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Add parent dir to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def sample_invoice_text():
    """Sample OCR text from a typical French invoice."""
    return """
Materiaux Pro SAS
10 Rue du Commerce
75015 Paris

FACTURE N° FAC-2026-00042
Date: 14/04/2026
Echeance: 14/05/2026

Designation                    Qte    P.U. HT    Total HT
Ciment Portland CEM II         50    12,50       625,00
Sable de riviere 0/4           20    8,00        160,00
Gravier concasse 6/10          30    9,50        285,00

                             Total HT:    1 070,00 EUR
                         TVA 20%    214,00
                         TVA 10%     0,00
                             Total TVA:      214,00 EUR
                             Total TTC:    1 284,00 EUR

Net a payer: 1 284,00 EUR
"""


@pytest.fixture
def sample_ticket_text():
    """Sample OCR text from a receipt/ticket."""
    return """
BRICO DEPOT
Ticket de caisse
Date: 14/04/2026

Vis inox 4x40 x100     1    8,99
Cheville 10mm x50      2    5,49
Colle PVC 500ml         1   12,90

Total:  32,87 EUR
TVA 20%: 5,48 EUR
"""


@pytest.fixture
def sample_avoir_text():
    """Sample OCR text from a credit note."""
    return """
Materiaux Pro SAS

AVOIR N° AV-2026-00005
Remboursement partiel
Date: 14/04/2026
Ref facture: FAC-2026-00042

Designation            Qte    P.U. HT    Total HT
Retour Ciment abime     10    12,50       125,00

Total HT: 125,00 EUR
TVA 20%: 25,00 EUR
Total TTC: 150,00 EUR
"""
