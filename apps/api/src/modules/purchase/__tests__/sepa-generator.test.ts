import { describe, it, expect } from 'vitest';
import { generateSepaXml, type SepaTransferConfig } from '../sepa-generator.js';

const BASE_CONFIG: SepaTransferConfig = {
  message_id: 'MSG-2026-04-001',
  creation_date: new Date('2026-04-14T10:00:00Z'),
  debtor_name: 'Ma Societe SAS',
  debtor_iban: 'FR7630006000011234567890189',
  debtor_bic: 'BNPAFRPP',
  requested_execution_date: new Date('2026-04-20'),
  payments: [
    {
      id: 'PAY-001',
      creditor_name: 'Materiaux Pro',
      creditor_iban: 'FR7630004000031234567890143',
      creditor_bic: 'BNPAFRPP',
      amount_cents: 120000,
      reference: 'FOURNISSEUR-001',
    },
  ],
};

describe('generateSepaXml', () => {
  it('generates valid SEPA XML structure', () => {
    const xml = generateSepaXml(BASE_CONFIG);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03');
    expect(xml).toContain('<CstmrCdtTrfInitn>');
    expect(xml).toContain('</CstmrCdtTrfInitn>');
    expect(xml).toContain('</Document>');
  });

  it('includes correct group header', () => {
    const xml = generateSepaXml(BASE_CONFIG);

    expect(xml).toContain('<MsgId>MSG-2026-04-001</MsgId>');
    expect(xml).toContain('<NbOfTxs>1</NbOfTxs>');
    expect(xml).toContain('<CtrlSum>1200.00</CtrlSum>');
    expect(xml).toContain('<Nm>Ma Societe SAS</Nm>');
  });

  it('includes debtor information', () => {
    const xml = generateSepaXml(BASE_CONFIG);

    expect(xml).toContain('<IBAN>FR7630006000011234567890189</IBAN>');
    expect(xml).toContain('<BIC>BNPAFRPP</BIC>');
    expect(xml).toContain('<PmtMtd>TRF</PmtMtd>');
    expect(xml).toContain('<Cd>SEPA</Cd>');
  });

  it('includes credit transfer transaction info', () => {
    const xml = generateSepaXml(BASE_CONFIG);

    expect(xml).toContain('<EndToEndId>PAY-001</EndToEndId>');
    expect(xml).toContain('<InstdAmt Ccy="EUR">1200.00</InstdAmt>');
    expect(xml).toContain('<Nm>Materiaux Pro</Nm>');
    expect(xml).toContain('<IBAN>FR7630004000031234567890143</IBAN>');
    expect(xml).toContain('<Ustrd>FOURNISSEUR-001</Ustrd>');
  });

  it('handles multiple payments', () => {
    const config: SepaTransferConfig = {
      ...BASE_CONFIG,
      payments: [
        {
          id: 'PAY-001',
          creditor_name: 'Materiaux Pro',
          creditor_iban: 'FR7630004000031234567890143',
          amount_cents: 120000,
          reference: 'FAC-001',
        },
        {
          id: 'PAY-002',
          creditor_name: 'Electricite Plus',
          creditor_iban: 'FR7630004000031234567890156',
          creditor_bic: 'CRLYFRPP',
          amount_cents: 85000,
          reference: 'FAC-002',
        },
      ],
    };

    const xml = generateSepaXml(config);

    expect(xml).toContain('<NbOfTxs>2</NbOfTxs>');
    expect(xml).toContain('<CtrlSum>2050.00</CtrlSum>');
    expect(xml).toContain('<EndToEndId>PAY-001</EndToEndId>');
    expect(xml).toContain('<EndToEndId>PAY-002</EndToEndId>');
    expect(xml).toContain('<InstdAmt Ccy="EUR">1200.00</InstdAmt>');
    expect(xml).toContain('<InstdAmt Ccy="EUR">850.00</InstdAmt>');
  });

  it('converts cents to euros correctly', () => {
    const config: SepaTransferConfig = {
      ...BASE_CONFIG,
      payments: [
        {
          id: 'PAY-001',
          creditor_name: 'Test',
          creditor_iban: 'FR7630004000031234567890143',
          amount_cents: 1, // 0.01 EUR
          reference: 'MIN',
        },
      ],
    };

    const xml = generateSepaXml(config);
    expect(xml).toContain('<InstdAmt Ccy="EUR">0.01</InstdAmt>');
    expect(xml).toContain('<CtrlSum>0.01</CtrlSum>');
  });

  it('handles debtor without BIC', () => {
    const config: SepaTransferConfig = {
      ...BASE_CONFIG,
      debtor_bic: undefined,
      payments: [
        {
          id: 'PAY-001',
          creditor_name: 'Materiaux Pro',
          creditor_iban: 'FR7630004000031234567890143',
          amount_cents: 120000,
          reference: 'FOURNISSEUR-001',
        },
      ],
    };

    const xml = generateSepaXml(config);
    expect(xml).toContain('<Id>NOTPROVIDED</Id>');
    expect(xml).not.toContain('<BIC>');
  });

  it('escapes special XML characters', () => {
    const config: SepaTransferConfig = {
      ...BASE_CONFIG,
      debtor_name: 'Societe "A & B" <Test>',
      payments: [
        {
          id: 'PAY-001',
          creditor_name: "L'Artisan & Fils",
          creditor_iban: 'FR7630004000031234567890143',
          amount_cents: 50000,
          reference: 'REF-001',
        },
      ],
    };

    const xml = generateSepaXml(config);
    expect(xml).toContain('Societe &quot;A &amp; B&quot; &lt;Test&gt;');
    expect(xml).toContain('L&apos;Artisan &amp; Fils');
  });

  it('sets correct execution date', () => {
    const xml = generateSepaXml(BASE_CONFIG);
    expect(xml).toContain('<ReqdExctnDt>2026-04-20</ReqdExctnDt>');
  });

  it('uses SLEV charge bearer', () => {
    const xml = generateSepaXml(BASE_CONFIG);
    expect(xml).toContain('<ChrgBr>SLEV</ChrgBr>');
  });

  it('throws error for empty payments', () => {
    const config: SepaTransferConfig = {
      ...BASE_CONFIG,
      payments: [],
    };

    expect(() => generateSepaXml(config)).toThrow('At least one payment is required');
  });

  it('throws error for negative amount', () => {
    const config: SepaTransferConfig = {
      ...BASE_CONFIG,
      payments: [
        {
          id: 'PAY-001',
          creditor_name: 'Test',
          creditor_iban: 'FR7630004000031234567890143',
          amount_cents: -100,
          reference: 'NEG',
        },
      ],
    };

    expect(() => generateSepaXml(config)).toThrow('All payment amounts must be positive');
  });

  it('throws error for missing IBAN', () => {
    const config: SepaTransferConfig = {
      ...BASE_CONFIG,
      payments: [
        {
          id: 'PAY-001',
          creditor_name: 'Test',
          creditor_iban: '',
          amount_cents: 50000,
          reference: 'NO-IBAN',
        },
      ],
    };

    expect(() => generateSepaXml(config)).toThrow('All payments must have a creditor IBAN');
  });
});
