import type { StripeEvent } from './stripe-client.js';

// BUSINESS RULE [CDC-3.2]: Webhook Stripe
// payment_intent.succeeded → marquer facture payee
// checkout.session.completed → enregistrer paiement

export interface WebhookResult {
  event_type: string;
  processed: boolean;
  invoice_id?: string;
  amount_cents?: number;
  payment_intent_id?: string;
}

export interface InvoicePaymentCallback {
  markInvoicePaid(invoiceId: string, amountCents: number, paymentRef: string): Promise<void>;
}

export function createStripeWebhookHandler(callback: InvoicePaymentCallback) {
  return {
    async handleEvent(event: StripeEvent): Promise<WebhookResult> {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object;
          const invoiceId = (pi.metadata as Record<string, string>)?.invoice_id;
          const amount = pi.amount as number;

          if (invoiceId) {
            await callback.markInvoicePaid(invoiceId, amount, pi.id as string);
          }

          return {
            event_type: event.type,
            processed: true,
            invoice_id: invoiceId,
            amount_cents: amount,
            payment_intent_id: pi.id as string,
          };
        }

        case 'checkout.session.completed': {
          const session = event.data.object;
          const invoiceId = (session.metadata as Record<string, string>)?.invoice_id;
          const amount = session.amount_total as number;
          const paymentIntentId = session.payment_intent as string;

          if (invoiceId) {
            await callback.markInvoicePaid(invoiceId, amount, paymentIntentId);
          }

          return {
            event_type: event.type,
            processed: true,
            invoice_id: invoiceId,
            amount_cents: amount,
            payment_intent_id: paymentIntentId,
          };
        }

        default:
          return { event_type: event.type, processed: false };
      }
    },
  };
}
