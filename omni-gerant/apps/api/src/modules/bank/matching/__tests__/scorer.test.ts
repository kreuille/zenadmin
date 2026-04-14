import { describe, it, expect } from 'vitest';
import { scoreCandidate, rankCandidates } from '../scorer.js';
import type { MatchCandidate } from '../rules.js';

// BUSINESS RULE [CDC-2.3]: Tests scoring de correspondance

function makeCandidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: 'candidate-1',
    type: 'invoice',
    number: 'FAC-2026-00042',
    amount_ttc_cents: 150000,
    remaining_cents: 150000,
    due_date: new Date('2026-04-15'),
    entity_name: 'Dupont SARL',
    ...overrides,
  };
}

describe('scoreCandidate', () => {
  it('scores exact amount + reference = 100 (auto-match)', () => {
    // BUSINESS RULE [CDC-2.3]: Match exact montant + reference = 100%
    const candidate = makeCandidate();
    const result = scoreCandidate(
      150000,
      'VIR DUPONT FAC-2026-00042',
      new Date('2026-04-14'),
      candidate,
    );

    expect(result.score).toBe(100);
    expect(result.auto_match).toBe(true);
    expect(result.matched_rules).toContain('exact_amount');
    expect(result.matched_rules).toContain('reference');
  });

  it('scores exact amount + entity name = 90 (suggestion)', () => {
    // BUSINESS RULE [CDC-2.3]: Match exact montant + client = 90%
    const candidate = makeCandidate({ number: null, due_date: null });
    const result = scoreCandidate(
      150000,
      'VIR DUPONT SARL DIVERS',
      new Date('2026-06-01'), // far from any due_date
      candidate,
    );

    expect(result.score).toBe(90);
    expect(result.auto_match).toBe(false);
    expect(result.matched_rules).toContain('exact_amount');
    expect(result.matched_rules).toContain('entity_name');
  });

  it('scores exact amount only = 60 (suggestion)', () => {
    // BUSINESS RULE [CDC-2.3]: Match montant seul = 60%
    const candidate = makeCandidate({ number: null, entity_name: null });
    const result = scoreCandidate(
      150000,
      'VIR INCONNU 12345',
      new Date('2026-06-01'), // far from due date
      candidate,
    );

    expect(result.score).toBe(60);
    expect(result.auto_match).toBe(false);
    expect(result.matched_rules).toEqual(['exact_amount']);
  });

  it('scores reference only without amount match', () => {
    const candidate = makeCandidate();
    const result = scoreCandidate(
      100000, // different amount
      'VIR FAC-2026-00042 ACOMPTE',
      new Date('2026-06-01'),
      candidate,
    );

    // Only reference matched (40 points)
    expect(result.score).toBe(40);
    expect(result.matched_rules).toContain('reference');
    expect(result.matched_rules).not.toContain('exact_amount');
  });

  it('adds temporal bonus for close dates', () => {
    const candidate = makeCandidate({ number: null, entity_name: null });
    const result = scoreCandidate(
      150000,
      'VIR INCONNU',
      new Date('2026-04-15'), // same day as due_date
      candidate,
    );

    // exact_amount (60) + temporal (15)
    expect(result.score).toBe(75);
    expect(result.matched_rules).toContain('temporal');
  });

  it('caps score at 100', () => {
    // All rules match
    const candidate = makeCandidate();
    const result = scoreCandidate(
      150000,
      'VIR DUPONT SARL FAC-2026-00042',
      new Date('2026-04-15'), // exact date
      candidate,
    );

    // exact_amount(60) + reference(40) + entity_name(30) + temporal(15) = 145, capped at 100
    expect(result.score).toBe(100);
    expect(result.auto_match).toBe(true);
  });

  it('returns 0 for no matching rules', () => {
    const candidate = makeCandidate({
      number: null,
      entity_name: null,
      due_date: null,
      amount_ttc_cents: 999999,
      remaining_cents: 999999,
    });
    const result = scoreCandidate(
      100,
      'RANDOM LABEL',
      new Date('2026-01-01'),
      candidate,
    );

    expect(result.score).toBe(0);
    expect(result.matched_rules).toHaveLength(0);
  });

  it('matches against remaining_cents for partial payments', () => {
    const candidate = makeCandidate({
      amount_ttc_cents: 300000,
      remaining_cents: 150000, // partially paid
    });

    const result = scoreCandidate(
      150000,
      'VIR DIVERS',
      new Date('2026-06-01'),
      candidate,
    );

    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.matched_rules).toContain('exact_amount');
  });
});

describe('rankCandidates', () => {
  it('ranks candidates by score descending', () => {
    const candidates: MatchCandidate[] = [
      makeCandidate({ id: 'c1', number: null, entity_name: null }), // amount only = 60
      makeCandidate({ id: 'c2', number: 'FAC-2026-00042' }), // amount + ref = 100
      makeCandidate({ id: 'c3', number: null, entity_name: 'Dupont SARL' }), // amount + name = 90
    ];

    const ranked = rankCandidates(
      150000,
      'VIR DUPONT SARL FAC-2026-00042',
      new Date('2026-06-01'),
      candidates,
    );

    expect(ranked.length).toBe(3);
    expect(ranked[0]!.candidate.id).toBe('c2');
    expect(ranked[0]!.score).toBe(100);
    expect(ranked[1]!.candidate.id).toBe('c3');
    expect(ranked[2]!.candidate.id).toBe('c1');
  });

  it('filters out candidates below minimum score', () => {
    const candidates: MatchCandidate[] = [
      makeCandidate({ id: 'c1', amount_ttc_cents: 999, remaining_cents: 999, number: null, entity_name: null }),
      makeCandidate({ id: 'c2', number: 'FAC-2026-00042' }),
    ];

    const ranked = rankCandidates(
      150000,
      'VIR FAC-2026-00042',
      new Date('2026-06-01'),
      candidates,
      30,
    );

    // c1 should be filtered out (no rules match)
    expect(ranked.length).toBe(1);
    expect(ranked[0]!.candidate.id).toBe('c2');
  });

  it('returns empty array when no candidates match', () => {
    const candidates: MatchCandidate[] = [
      makeCandidate({ id: 'c1', amount_ttc_cents: 999, remaining_cents: 999, number: null, entity_name: null }),
    ];

    const ranked = rankCandidates(100, 'RANDOM', new Date('2026-01-01'), candidates);
    expect(ranked).toHaveLength(0);
  });
});
