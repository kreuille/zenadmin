// BUSINESS RULE [CDC-2.2]: Generation fichier SEPA XML (pain.001)
// BUSINESS RULE [R02]: Montants en centimes convertis en euros pour le XML

export interface SepaPaymentInfo {
  id: string;
  creditor_name: string;
  creditor_iban: string;
  creditor_bic?: string;
  amount_cents: number;
  reference: string;
  description?: string;
}

export interface SepaTransferConfig {
  message_id: string;
  creation_date: Date;
  debtor_name: string;
  debtor_iban: string;
  debtor_bic?: string;
  requested_execution_date: Date;
  payments: SepaPaymentInfo[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}

function centsToEuro(cents: number): string {
  return (cents / 100).toFixed(2);
}

// BUSINESS RULE [CDC-2.2]: Initialisation virement SEPA via API bancaire
export function generateSepaXml(config: SepaTransferConfig): string {
  if (config.payments.length === 0) {
    throw new Error('At least one payment is required');
  }

  const totalCents = config.payments.reduce((sum, p) => sum + p.amount_cents, 0);

  if (config.payments.some((p) => p.amount_cents <= 0)) {
    throw new Error('All payment amounts must be positive');
  }

  if (config.payments.some((p) => !p.creditor_iban)) {
    throw new Error('All payments must have a creditor IBAN');
  }

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">');
  lines.push('  <CstmrCdtTrfInitn>');

  // Group Header
  lines.push('    <GrpHdr>');
  lines.push(`      <MsgId>${escapeXml(config.message_id)}</MsgId>`);
  lines.push(`      <CreDtTm>${formatDateTime(config.creation_date)}</CreDtTm>`);
  lines.push(`      <NbOfTxs>${config.payments.length}</NbOfTxs>`);
  lines.push(`      <CtrlSum>${centsToEuro(totalCents)}</CtrlSum>`);
  lines.push('      <InitgPty>');
  lines.push(`        <Nm>${escapeXml(config.debtor_name)}</Nm>`);
  lines.push('      </InitgPty>');
  lines.push('    </GrpHdr>');

  // Payment Information
  lines.push('    <PmtInf>');
  lines.push(`      <PmtInfId>${escapeXml(config.message_id)}-PMT</PmtInfId>`);
  lines.push('      <PmtMtd>TRF</PmtMtd>');
  lines.push(`      <NbOfTxs>${config.payments.length}</NbOfTxs>`);
  lines.push(`      <CtrlSum>${centsToEuro(totalCents)}</CtrlSum>`);
  lines.push('      <PmtTpInf>');
  lines.push('        <SvcLvl>');
  lines.push('          <Cd>SEPA</Cd>');
  lines.push('        </SvcLvl>');
  lines.push('      </PmtTpInf>');
  lines.push(`      <ReqdExctnDt>${formatDate(config.requested_execution_date)}</ReqdExctnDt>`);
  lines.push('      <Dbtr>');
  lines.push(`        <Nm>${escapeXml(config.debtor_name)}</Nm>`);
  lines.push('      </Dbtr>');
  lines.push('      <DbtrAcct>');
  lines.push('        <Id>');
  lines.push(`          <IBAN>${escapeXml(config.debtor_iban)}</IBAN>`);
  lines.push('        </Id>');
  lines.push('      </DbtrAcct>');

  if (config.debtor_bic) {
    lines.push('      <DbtrAgt>');
    lines.push('        <FinInstnId>');
    lines.push(`          <BIC>${escapeXml(config.debtor_bic)}</BIC>`);
    lines.push('        </FinInstnId>');
    lines.push('      </DbtrAgt>');
  } else {
    lines.push('      <DbtrAgt>');
    lines.push('        <FinInstnId>');
    lines.push('          <Othr>');
    lines.push('            <Id>NOTPROVIDED</Id>');
    lines.push('          </Othr>');
    lines.push('        </FinInstnId>');
    lines.push('      </DbtrAgt>');
  }

  lines.push('      <ChrgBr>SLEV</ChrgBr>');

  // Credit Transfer Transactions
  for (const payment of config.payments) {
    lines.push('      <CdtTrfTxInf>');
    lines.push('        <PmtId>');
    lines.push(`          <EndToEndId>${escapeXml(payment.id)}</EndToEndId>`);
    lines.push('        </PmtId>');
    lines.push('        <Amt>');
    lines.push(`          <InstdAmt Ccy="EUR">${centsToEuro(payment.amount_cents)}</InstdAmt>`);
    lines.push('        </Amt>');

    if (payment.creditor_bic) {
      lines.push('        <CdtrAgt>');
      lines.push('          <FinInstnId>');
      lines.push(`            <BIC>${escapeXml(payment.creditor_bic)}</BIC>`);
      lines.push('          </FinInstnId>');
      lines.push('        </CdtrAgt>');
    }

    lines.push('        <Cdtr>');
    lines.push(`          <Nm>${escapeXml(payment.creditor_name)}</Nm>`);
    lines.push('        </Cdtr>');
    lines.push('        <CdtrAcct>');
    lines.push('          <Id>');
    lines.push(`            <IBAN>${escapeXml(payment.creditor_iban)}</IBAN>`);
    lines.push('          </Id>');
    lines.push('        </CdtrAcct>');

    if (payment.reference || payment.description) {
      lines.push('        <RmtInf>');
      lines.push(`          <Ustrd>${escapeXml(payment.reference || payment.description || '')}</Ustrd>`);
      lines.push('        </RmtInf>');
    }

    lines.push('      </CdtTrfTxInf>');
  }

  lines.push('    </PmtInf>');
  lines.push('  </CstmrCdtTrfInitn>');
  lines.push('</Document>');

  return lines.join('\n');
}
