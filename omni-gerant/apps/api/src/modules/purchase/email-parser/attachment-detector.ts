// BUSINESS RULE [CDC-2.2]: Detection pieces jointes "Facture"
// Detection basee sur nom de fichier, type MIME, et expediteur

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: Buffer;
}

export interface EmailMessage {
  messageId: string;
  from: string;
  subject: string;
  date: Date;
  attachments: EmailAttachment[];
  flags?: string[];
}

// BUSINESS RULE [CDC-2.2]: Nom fichier contient : facture, invoice, fac_, avoir
const INVOICE_FILENAME_PATTERNS = [
  /facture/i,
  /invoice/i,
  /fac[_\-\s]/i,
  /avoir/i,
  /credit.?note/i,
  /note.?de.?credit/i,
  /debit/i,
  /receipt/i,
  /recu/i,
];

// BUSINESS RULE [CDC-2.2]: Type MIME : application/pdf, image/jpeg, image/png
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/bmp',
]);

export interface DetectionResult {
  attachment: EmailAttachment;
  confidence: number;
  reason: string;
}

export function detectInvoiceAttachments(
  email: EmailMessage,
  knownSupplierEmails: Set<string>,
): DetectionResult[] {
  const results: DetectionResult[] = [];

  for (const attachment of email.attachments) {
    const detection = analyzeAttachment(attachment, email, knownSupplierEmails);
    if (detection) {
      results.push(detection);
    }
  }

  return results;
}

function analyzeAttachment(
  attachment: EmailAttachment,
  email: EmailMessage,
  knownSupplierEmails: Set<string>,
): DetectionResult | null {
  // Must be an allowed MIME type
  if (!ALLOWED_MIME_TYPES.has(attachment.contentType)) {
    return null;
  }

  // Skip tiny files (likely signatures/logos)
  if (attachment.size < 1000) {
    return null;
  }

  let confidence = 0;
  const reasons: string[] = [];

  // Check filename patterns
  const filenameMatch = INVOICE_FILENAME_PATTERNS.some((p) => p.test(attachment.filename));
  if (filenameMatch) {
    confidence += 0.4;
    reasons.push('filename_match');
  }

  // Check if sender is a known supplier
  const senderDomain = extractDomain(email.from);
  const isKnownSupplier = knownSupplierEmails.has(email.from.toLowerCase()) ||
    [...knownSupplierEmails].some((e) => extractDomain(e) === senderDomain);
  if (isKnownSupplier) {
    confidence += 0.3;
    reasons.push('known_supplier');
  }

  // Check subject for invoice keywords
  const subjectMatch = INVOICE_FILENAME_PATTERNS.some((p) => p.test(email.subject));
  if (subjectMatch) {
    confidence += 0.2;
    reasons.push('subject_match');
  }

  // PDF files are more likely to be invoices
  if (attachment.contentType === 'application/pdf') {
    confidence += 0.1;
    reasons.push('pdf_format');
  }

  // Only return if we have some confidence
  if (confidence >= 0.3) {
    return {
      attachment,
      confidence: Math.min(1, confidence),
      reason: reasons.join(', '),
    };
  }

  return null;
}

function extractDomain(email: string): string {
  const match = email.match(/@([^>]+)>?$/);
  return match ? match[1]!.toLowerCase() : '';
}

export function isAlreadyProcessed(email: EmailMessage, processedLabel: string): boolean {
  return email.flags?.includes(processedLabel) ?? false;
}
