import { describe, it, expect } from 'vitest';
import { formatDocumentNumber, createDocumentNumberGenerator, createInMemoryNumberRepo } from '../document-number.js';

// BUSINESS RULE [CDC-2.1]: Numerotation sequentielle

describe('formatDocumentNumber', () => {
  it('formats DEV number with zero-padded sequence', () => {
    expect(formatDocumentNumber('DEV', 2026, 1)).toBe('DEV-2026-00001');
    expect(formatDocumentNumber('DEV', 2026, 42)).toBe('DEV-2026-00042');
    expect(formatDocumentNumber('DEV', 2026, 12345)).toBe('DEV-2026-12345');
  });

  it('formats FAC number', () => {
    expect(formatDocumentNumber('FAC', 2026, 1)).toBe('FAC-2026-00001');
  });

  it('formats AV number', () => {
    expect(formatDocumentNumber('AV', 2026, 7)).toBe('AV-2026-00007');
  });
});

describe('createDocumentNumberGenerator', () => {
  it('generates sequential numbers', async () => {
    const repo = createInMemoryNumberRepo();
    const gen = createDocumentNumberGenerator(repo);
    const tenantId = 'tenant-1';

    const r1 = await gen.generate(tenantId, 'DEV');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value).toBe('DEV-2026-00001');

    const r2 = await gen.generate(tenantId, 'DEV');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value).toBe('DEV-2026-00002');

    const r3 = await gen.generate(tenantId, 'DEV');
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(r3.value).toBe('DEV-2026-00003');
  });

  it('has separate sequences per tenant', async () => {
    const repo = createInMemoryNumberRepo();
    const gen = createDocumentNumberGenerator(repo);

    const r1 = await gen.generate('tenant-1', 'DEV');
    const r2 = await gen.generate('tenant-2', 'DEV');

    if (r1.ok && r2.ok) {
      expect(r1.value).toBe('DEV-2026-00001');
      expect(r2.value).toBe('DEV-2026-00001');
    }
  });

  it('has separate sequences per prefix', async () => {
    const repo = createInMemoryNumberRepo();
    const gen = createDocumentNumberGenerator(repo);
    const tenantId = 'tenant-1';

    const dev = await gen.generate(tenantId, 'DEV');
    const fac = await gen.generate(tenantId, 'FAC');

    if (dev.ok && fac.ok) {
      expect(dev.value).toBe('DEV-2026-00001');
      expect(fac.value).toBe('FAC-2026-00001');
    }
  });

  it('uses provided date for year', async () => {
    const repo = createInMemoryNumberRepo();
    const gen = createDocumentNumberGenerator(repo);

    const r = await gen.generate('tenant-1', 'DEV', new Date('2025-06-15'));
    if (r.ok) expect(r.value).toBe('DEV-2025-00001');
  });
});
