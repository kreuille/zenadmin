import { describe, it, expect } from 'vitest';
import { parseCsvBank, parseOfx, parseBankFile } from '../import/csv-parser.js';

describe('B3 — CSV parser format Qonto', () => {
  const qontoCsv = `Date;Libelle;Montant;Categorie
15/04/2026;Paiement fournisseur ACME;-250,00;Fournitures
14/04/2026;Virement client DUPONT;1 200,00;Ventes
10/04/2026;Cotisation Qonto;-9,00;Frais bancaires`;

  it('parse 3 transactions', () => {
    const r = parseCsvBank(qontoCsv);
    expect(r.transactions.length).toBe(3);
  });

  it('montant negatif pour debits', () => {
    const r = parseCsvBank(qontoCsv);
    const acme = r.transactions.find((t) => t.label.includes('ACME'));
    expect(acme?.amountCents).toBe(-25000);
  });

  it('montant positif pour credits', () => {
    const r = parseCsvBank(qontoCsv);
    const dupont = r.transactions.find((t) => t.label.includes('DUPONT'));
    expect(dupont?.amountCents).toBe(120000);
  });

  it('date parsee correctement', () => {
    const r = parseCsvBank(qontoCsv);
    expect(r.transactions[0]!.date.getFullYear()).toBe(2026);
    expect(r.transactions[0]!.date.getMonth()).toBe(3); // avril = 3
  });
});

describe('B3 — CSV parser BNP format (debit/credit separes)', () => {
  const bnpCsv = `Date Operation,Libelle,Debit,Credit
01/04/2026,SALAIRE MARS,,2500.00
05/04/2026,LOYER BUREAU,850.00,
10/04/2026,EDF,120.50,`;

  it('parse credit 2500', () => {
    const r = parseCsvBank(bnpCsv);
    const sal = r.transactions.find((t) => t.label.includes('SALAIRE'));
    expect(sal?.amountCents).toBe(250000);
  });

  it('parse debit 850', () => {
    const r = parseCsvBank(bnpCsv);
    const loyer = r.transactions.find((t) => t.label.includes('LOYER'));
    expect(loyer?.amountCents).toBe(-85000);
  });
});

describe('B3 — Format ISO date', () => {
  const csv = `date,montant,label
2026-04-15,-150.00,Achat materiel
2026-04-20,500.00,Vente`;

  it('parse ISO date', () => {
    const r = parseCsvBank(csv);
    expect(r.transactions.length).toBe(2);
    expect(r.transactions[0]!.date.toISOString().startsWith('2026-04-15')).toBe(true);
  });
});

describe('B3 — OFX parser', () => {
  const ofx = `OFXHEADER:100
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260415000000
<TRNAMT>-42.50
<NAME>CARREFOUR
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260420000000
<TRNAMT>1500.00
<NAME>VIREMENT CLIENT
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

  it('parse 2 transactions OFX', () => {
    const r = parseOfx(ofx);
    expect(r.transactions.length).toBe(2);
  });

  it('montants OFX corrects', () => {
    const r = parseOfx(ofx);
    expect(r.transactions[0]!.amountCents).toBe(-4250);
    expect(r.transactions[1]!.amountCents).toBe(150000);
  });

  it('label OFX', () => {
    const r = parseOfx(ofx);
    expect(r.transactions[0]!.label).toBe('CARREFOUR');
  });
});

describe('B3 — Detection auto format', () => {
  it('fichier .csv -> parser CSV', () => {
    const r = parseBankFile('date,amount,label\n2026-01-01,100,test', 'releve.csv');
    expect(r.format).toBe('csv');
  });

  it('fichier .ofx -> parser OFX', () => {
    const r = parseBankFile('<OFX></OFX>', 'releve.ofx');
    expect(r.format).toBe('ofx');
  });

  it('contenu commencant par OFXHEADER -> parser OFX meme sans .ofx', () => {
    const r = parseBankFile('OFXHEADER:100\n<OFX></OFX>', 'releve.txt');
    expect(r.format).toBe('ofx');
  });
});

describe('B3 — Erreurs', () => {
  it('fichier vide -> erreur', () => {
    const r = parseCsvBank('');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.transactions.length).toBe(0);
  });

  it('pas de colonnes reconnues -> erreur', () => {
    const r = parseCsvBank('xxx;yyy;zzz\n1;2;3');
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
