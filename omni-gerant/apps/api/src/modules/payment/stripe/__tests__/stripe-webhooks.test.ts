import { describe, it, expect, vi } from 'vitest';
import { createStripeWebhookHandler, type InvoicePaymentCallback } from '../stripe-webhooks.js';
import type { StripeEvent } from '../stripe-client.js';

function createMockCallback(): InvoicePaymentCallback & { calls: Array<{ invoiceId: string; amount: number; ref: string }> } {
  const calls: Array<{ invoiceId: string; amount: number; ref: string }> = [];
  return {
    calls,
    async markInvoicePaid(invoiceId, amountCents, paymentRef) {
      calls.push({ invoiceId, amount: amountCents, ref: paymentRef });
    },
  };
}

describe('StripeWebhookHandler', () => {
  it('handles payment_intent.succeeded', async () => {
    const callback = createMockCallback();
    const handler = createStripeWebhookHandler(callback);

    const event: StripeEvent = {
      id: 'evt_001',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_abc123',
          amount: 120000,
          metadata: { invoice_id: 'inv-001', invoice_number: 'FAC-001' },
        },
      },
    };

    const result = await handler.handleEvent(event);

    expect(result.processed).toBe(true);
    expect(result.event_type).toBe('payment_intent.succeeded');
    expect(result.invoice_id).toBe('inv-001');
    expect(result.amount_cents).toBe(120000);
    expect(callback.calls).toHaveLength(1);
    expect(callback.calls[0]!.invoiceId).toBe('inv-001');
    expect(callback.calls[0]!.amount).toBe(120000);
  });

  it('handles checkout.session.completed', async () => {
    const callback = createMockCallback();
    const handler = createStripeWebhookHandler(callback);

    const event: StripeEvent = {
      id: 'evt_002',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_abc123',
          amount_total: 96000,
          payment_intent: 'pi_xyz789',
          metadata: { invoice_id: 'inv-002' },
        },
      },
    };

    const result = await handler.handleEvent(event);

    expect(result.processed).toBe(true);
    expect(result.invoice_id).toBe('inv-002');
    expect(result.amount_cents).toBe(96000);
    expect(result.payment_intent_id).toBe('pi_xyz789');
    expect(callback.calls).toHaveLength(1);
  });

  it('ignores unknown event types', async () => {
    const callback = createMockCallback();
    const handler = createStripeWebhookHandler(callback);

    const event: StripeEvent = {
      id: 'evt_003',
      type: 'customer.created',
      data: { object: { id: 'cus_123' } },
    };

    const result = await handler.handleEvent(event);

    expect(result.processed).toBe(false);
    expect(result.event_type).toBe('customer.created');
    expect(callback.calls).toHaveLength(0);
  });

  it('skips marking if no invoice_id in metadata', async () => {
    const callback = createMockCallback();
    const handler = createStripeWebhookHandler(callback);

    const event: StripeEvent = {
      id: 'evt_004',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_no_invoice',
          amount: 50000,
          metadata: {},
        },
      },
    };

    const result = await handler.handleEvent(event);

    expect(result.processed).toBe(true);
    expect(result.invoice_id).toBeUndefined();
    expect(callback.calls).toHaveLength(0);
  });
});
