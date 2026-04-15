import type { MatchCandidate, MatchRule } from './rules.js';
import { ALL_RULES } from './rules.js';

// BUSINESS RULE [CDC-2.3]: Scoring de correspondance pour rapprochement bancaire

export interface MatchScore {
  candidate: MatchCandidate;
  score: number; // 0-100
  matched_rules: string[];
  auto_match: boolean; // true if score >= 100 (auto-match)
}

/**
 * Score de confiance:
 *  - Match exact montant + reference : 100% → auto-match
 *  - Match exact montant + client : 90% → suggestion
 *  - Match montant seul : 60% → suggestion
 *  - Match partiel : suggestion avec details
 */
export function scoreCandidate(
  transactionAmountCents: number,
  transactionLabel: string,
  transactionDate: Date,
  candidate: MatchCandidate,
  rules: MatchRule[] = ALL_RULES,
): MatchScore {
  let totalScore = 0;
  const matchedRules: string[] = [];

  for (const rule of rules) {
    const ruleScore = rule.evaluate(
      transactionAmountCents,
      transactionLabel,
      transactionDate,
      candidate,
    );

    if (ruleScore !== null && ruleScore > 0) {
      totalScore += ruleScore;
      matchedRules.push(rule.name);
    }
  }

  // Cap at 100
  const finalScore = Math.min(totalScore, 100);

  return {
    candidate,
    score: finalScore,
    matched_rules: matchedRules,
    auto_match: finalScore >= 100,
  };
}

/**
 * Score and rank multiple candidates for a transaction
 * Returns only candidates with score > 0, sorted by score descending
 */
export function rankCandidates(
  transactionAmountCents: number,
  transactionLabel: string,
  transactionDate: Date,
  candidates: MatchCandidate[],
  minScore = 30,
): MatchScore[] {
  return candidates
    .map((candidate) =>
      scoreCandidate(
        transactionAmountCents,
        transactionLabel,
        transactionDate,
        candidate,
      ),
    )
    .filter((match) => match.score >= minScore)
    .sort((a, b) => b.score - a.score);
}
