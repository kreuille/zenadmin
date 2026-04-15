import { createHmac, timingSafeEqual } from 'crypto';

// BUSINESS RULE [CDC-3.2]: Client Stripe pour paiements par carte
// BUSINESS RULE [CDC-3.2]: Stripe Connect pour encaisser au nom du tenant

export interface StripeConfig {
  secret_key: string;
  webhook_secret: string;
  connect_client_id: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  payment_intent_id: string;
  amount_cents: number;
  currency: string;
  metadata: Record<string, string>;
}

export interface PaymentIntent {
  id: string;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export function createStripeClient(config: StripeConfig) {
  const baseUrl = 'https://api.stripe.com/v1';

  async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${config.secret_key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Stripe API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    /**
     * Create a Checkout Session for invoice payment
     */
    async createCheckoutSession(params: {
      amount_cents: number;
      currency: string;
      invoice_id: string;
      invoice_number: string;
      tenant_stripe_account_id?: string;
      success_url: string;
      cancel_url: string;
    }): Promise<CheckoutSession> {
      const body = new URLSearchParams({
        'mode': 'payment',
        'line_items[0][price_data][currency]': params.currency,
        'line_items[0][price_data][product_data][name]': `Facture ${params.invoice_number}`,
        'line_items[0][price_data][unit_amount]': String(params.amount_cents),
        'line_items[0][quantity]': '1',
        'metadata[invoice_id]': params.invoice_id,
        'metadata[invoice_number]': params.invoice_number,
        'success_url': params.success_url,
        'cancel_url': params.cancel_url,
      });

      const headers: Record<string, string> = {};
      if (params.tenant_stripe_account_id) {
        headers['Stripe-Account'] = params.tenant_stripe_account_id;
      }

      return apiRequest<CheckoutSession>('/checkout/sessions', {
        method: 'POST',
        body: body.toString(),
        headers,
      });
    },

    /**
     * Retrieve a payment intent
     */
    async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
      return apiRequest<PaymentIntent>(`/payment_intents/${paymentIntentId}`);
    },

    /**
     * Create a Connect account link for onboarding
     */
    async createConnectAccountLink(accountId: string, returnUrl: string): Promise<{ url: string }> {
      const body = new URLSearchParams({
        'account': accountId,
        'type': 'account_onboarding',
        'return_url': returnUrl,
        'refresh_url': returnUrl,
      });

      return apiRequest<{ url: string }>('/account_links', {
        method: 'POST',
        body: body.toString(),
      });
    },

    /**
     * Verify webhook signature
     */
    verifyWebhookSignature(payload: string, signature: string): boolean {
      const parts = signature.split(',');
      const timestampPart = parts.find((p) => p.startsWith('t='));
      const signaturePart = parts.find((p) => p.startsWith('v1='));

      if (!timestampPart || !signaturePart) return false;

      const timestamp = timestampPart.substring(2);
      const sig = signaturePart.substring(3);

      const signedPayload = `${timestamp}.${payload}`;
      const expectedSig = createHmac('sha256', config.webhook_secret)
        .update(signedPayload)
        .digest('hex');

      try {
        return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
      } catch {
        return false;
      }
    },
  };
}
