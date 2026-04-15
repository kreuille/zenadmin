import { describe, it, expect } from 'vitest';
import { createStripeClient } from '../stripe-client.js';
import { createHmac } from 'crypto';

describe('StripeClient', () => {
  const config = {
    secret_key: 'sk_test_123',
    webhook_secret: 'whsec_test_secret',
    connect_client_id: 'ca_test_123',
  };

  describe('verifyWebhookSignature', () => {
    const client = createStripeClient(config);

    it('verifies valid signature', () => {
      const payload = '{"id":"evt_test"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${payload}`;
      const sig = createHmac('sha256', config.webhook_secret)
        .update(signedPayload)
        .digest('hex');

      const signature = `t=${timestamp},v1=${sig}`;
      expect(client.verifyWebhookSignature(payload, signature)).toBe(true);
    });

    it('rejects invalid signature', () => {
      const payload = '{"id":"evt_test"}';
      const signature = 't=123456789,v1=invalidsignature';
      expect(client.verifyWebhookSignature(payload, signature)).toBe(false);
    });

    it('rejects malformed signature header', () => {
      const payload = '{"id":"evt_test"}';
      expect(client.verifyWebhookSignature(payload, 'malformed')).toBe(false);
      expect(client.verifyWebhookSignature(payload, '')).toBe(false);
    });

    it('rejects tampered payload', () => {
      const originalPayload = '{"id":"evt_test"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${originalPayload}`;
      const sig = createHmac('sha256', config.webhook_secret)
        .update(signedPayload)
        .digest('hex');

      const signature = `t=${timestamp},v1=${sig}`;
      const tamperedPayload = '{"id":"evt_tampered"}';
      expect(client.verifyWebhookSignature(tamperedPayload, signature)).toBe(false);
    });
  });
});
