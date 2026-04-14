// BUSINESS RULE [CDC-3.2]: Client GoCardless pour prelevements SEPA

export interface GoCardlessConfig {
  access_token: string;
  environment: 'sandbox' | 'live';
  webhook_secret: string;
}

export interface Mandate {
  id: string;
  status: string;
  reference: string;
  scheme: string;
  next_possible_charge_date: string;
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  mandate_id: string;
  description: string;
  metadata: Record<string, string>;
  charge_date: string;
}

export interface GoCardlessEvent {
  id: string;
  resource_type: string;
  action: string;
  links: Record<string, string>;
}

export function createGoCardlessClient(config: GoCardlessConfig) {
  const baseUrl = config.environment === 'sandbox'
    ? 'https://api-sandbox.gocardless.com'
    : 'https://api.gocardless.com';

  async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'GoCardless-Version': '2015-07-06',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GoCardless API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    /**
     * Create a redirect flow for mandate setup
     */
    async createRedirectFlow(params: {
      description: string;
      session_token: string;
      success_redirect_url: string;
    }): Promise<{ id: string; redirect_url: string }> {
      const result = await apiRequest<{ redirect_flows: { id: string; redirect_url: string } }>('/redirect_flows', {
        method: 'POST',
        body: JSON.stringify({
          redirect_flows: {
            description: params.description,
            session_token: params.session_token,
            success_redirect_url: params.success_redirect_url,
            scheme: 'sepa_core',
          },
        }),
      });
      return result.redirect_flows;
    },

    /**
     * Complete redirect flow and get mandate
     */
    async completeRedirectFlow(flowId: string, sessionToken: string): Promise<{ mandate_id: string }> {
      const result = await apiRequest<{ redirect_flows: { links: { mandate: string } } }>(`/redirect_flows/${flowId}/actions/complete`, {
        method: 'POST',
        body: JSON.stringify({
          data: { session_token: sessionToken },
        }),
      });
      return { mandate_id: result.redirect_flows.links.mandate };
    },

    /**
     * Create a payment (prelevement SEPA)
     */
    async createPayment(params: {
      amount_cents: number;
      currency: string;
      mandate_id: string;
      description: string;
      invoice_id: string;
    }): Promise<Payment> {
      const result = await apiRequest<{ payments: Payment }>('/payments', {
        method: 'POST',
        body: JSON.stringify({
          payments: {
            amount: params.amount_cents,
            currency: params.currency,
            links: { mandate: params.mandate_id },
            description: params.description,
            metadata: { invoice_id: params.invoice_id },
          },
        }),
      });
      return result.payments;
    },

    /**
     * Get mandate details
     */
    async getMandate(mandateId: string): Promise<Mandate> {
      const result = await apiRequest<{ mandates: Mandate }>(`/mandates/${mandateId}`);
      return result.mandates;
    },

    /**
     * Cancel a mandate
     */
    async cancelMandate(mandateId: string): Promise<Mandate> {
      const result = await apiRequest<{ mandates: Mandate }>(`/mandates/${mandateId}/actions/cancel`, {
        method: 'POST',
      });
      return result.mandates;
    },
  };
}
