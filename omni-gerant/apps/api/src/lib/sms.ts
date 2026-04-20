// Vague F2 : SMS transactionnel (OVH Telecom + Twilio) avec selection auto.
// Patron identique a lib/email.ts : provider interface + factory default.

import type { Result, AppError } from '@zenadmin/shared';
import { ok, err, appError } from '@zenadmin/shared';
import { createHash, createHmac } from 'node:crypto';

export interface SmsOptions {
  to: string;          // E.164 (+33...) ou format FR (0612...)
  text: string;        // 160 chars max pour un SMS unique
  sender?: string;     // nom emetteur 11 chars max, alphanumerique
}

export interface SmsResult {
  messageId: string;
  provider: 'console' | 'ovh' | 'twilio';
}

export interface SmsProvider {
  send(opts: SmsOptions): Promise<Result<SmsResult, AppError>>;
}

// Normalise un numero FR vers E.164 (+33 6/7 XX XX XX XX)
export function normalizePhoneFr(raw: string): string | null {
  const cleaned = raw.replace(/\D/g, '');
  if (cleaned.startsWith('33') && cleaned.length === 11) return `+${cleaned}`;
  if (cleaned.startsWith('0') && cleaned.length === 10) return `+33${cleaned.slice(1)}`;
  if (cleaned.length === 9 && /^[67]/.test(cleaned)) return `+33${cleaned}`;
  return null;
}

// --- Console (dev) ---
export function createConsoleSmsProvider(): SmsProvider {
  return {
    async send(opts) {
      const messageId = `sms-dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      console.log(`[SMS] to ${opts.to} from ${opts.sender ?? 'zenAdmin'} : ${opts.text}`);
      return ok({ messageId, provider: 'console' });
    },
  };
}

// --- OVH ---
// Doc : https://eu.api.ovh.com/console/#/sms
// Auth signature : SHA1(application_secret+consumer_key+METHOD+QUERY+BODY+TIMESTAMP)
export function createOvhSmsProvider(config: {
  appKey: string;
  appSecret: string;
  consumerKey: string;
  serviceName: string;  // ex: "sms-xx00000-1"
  endpoint?: string;    // "https://eu.api.ovh.com/1.0"
}): SmsProvider {
  const endpoint = config.endpoint ?? 'https://eu.api.ovh.com/1.0';
  return {
    async send(opts) {
      try {
        const path = `${endpoint}/sms/${encodeURIComponent(config.serviceName)}/jobs`;
        const body = JSON.stringify({
          message: opts.text,
          receivers: [opts.to],
          senderForResponse: !opts.sender,
          sender: opts.sender ?? undefined,
          noStopClause: false,
          priority: 'high',
          charset: 'UTF-8',
          coding: '7bit',
        });
        const timeResp = await fetch(`${endpoint}/auth/time`);
        const serverTime = await timeResp.text();
        const toSign = [
          config.appSecret,
          config.consumerKey,
          'POST',
          path,
          body,
          serverTime,
        ].join('+');
        const sig = '$1$' + createHash('sha1').update(toSign).digest('hex');
        const res = await fetch(path, {
          method: 'POST',
          headers: {
            'X-Ovh-Application': config.appKey,
            'X-Ovh-Consumer': config.consumerKey,
            'X-Ovh-Timestamp': serverTime,
            'X-Ovh-Signature': sig,
            'Content-Type': 'application/json',
          },
          body,
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          return err(appError('SERVICE_UNAVAILABLE', `OVH SMS error ${res.status}: ${txt.slice(0, 200)}`));
        }
        const data = await res.json() as { ids?: number[] };
        return ok({ messageId: String(data.ids?.[0] ?? 'unknown'), provider: 'ovh' });
      } catch (e) {
        return err(appError('SERVICE_UNAVAILABLE', `OVH SMS exception: ${e instanceof Error ? e.message : 'unknown'}`));
      }
    },
  };
}

// --- Twilio ---
// Doc : https://www.twilio.com/docs/messaging/api
export function createTwilioSmsProvider(config: {
  accountSid: string;
  authToken: string;
  from: string; // +33... ou alphanumeric sender
}): SmsProvider {
  return {
    async send(opts) {
      try {
        const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
        const body = new URLSearchParams({
          To: opts.to,
          From: opts.sender ?? config.from,
          Body: opts.text,
        });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          return err(appError('SERVICE_UNAVAILABLE', `Twilio error ${res.status}: ${txt.slice(0, 200)}`));
        }
        const data = await res.json() as { sid?: string };
        return ok({ messageId: data.sid ?? 'unknown', provider: 'twilio' });
      } catch (e) {
        return err(appError('SERVICE_UNAVAILABLE', `Twilio exception: ${e instanceof Error ? e.message : 'unknown'}`));
      }
    },
  };
}

export function createDefaultSmsProvider(): SmsProvider {
  if (process.env['OVH_SMS_APP_KEY']) {
    return createOvhSmsProvider({
      appKey: process.env['OVH_SMS_APP_KEY']!,
      appSecret: process.env['OVH_SMS_APP_SECRET'] ?? '',
      consumerKey: process.env['OVH_SMS_CONSUMER_KEY'] ?? '',
      serviceName: process.env['OVH_SMS_SERVICE'] ?? '',
    });
  }
  if (process.env['TWILIO_ACCOUNT_SID']) {
    return createTwilioSmsProvider({
      accountSid: process.env['TWILIO_ACCOUNT_SID']!,
      authToken: process.env['TWILIO_AUTH_TOKEN'] ?? '',
      from: process.env['TWILIO_FROM'] ?? '',
    });
  }
  return createConsoleSmsProvider();
}

// Verification signature webhook Twilio (HMAC SHA1)
export function verifyTwilioWebhook(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  const sorted = Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = createHmac('sha1', authToken).update(url + sorted).digest('base64');
  return expected === signature;
}
