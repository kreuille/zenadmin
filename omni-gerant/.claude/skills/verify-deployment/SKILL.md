---
name: verify-deployment
description: Use this skill BEFORE announcing "c'est deploye", "en prod", "chantier complete", "mergee" or updating any *-PROGRESS.md file to COMPLETED. Enforces the R1-R7 rules in DEPLOYMENT-RULES.md. Triggers when the user or the assistant is about to declare work shipped/done/in production.
---

# verify-deployment — Enforce R1-R7 before announcing "c'est fait"

## Context

On 2026-04-18, we discovered 27 critical commits (DUERP 161 metiers, Invoice NF525, bug fixes) marked as "COMPLETED" in PROGRESS files but never merged to `origin/main`. The code was written, orchestrator said done, PROGRESS.md said done — but production never saw it.

This skill prevents that from happening again.

## Rule

Before saying any of :
- "C'est deploye", "en prod", "live"
- "Chantier termine", "fait", "complete"
- Marking a row `COMPLETED` in a `*-PROGRESS.md` file
- Creating a final journal entry

You **MUST** run the 6-point checklist from `DEPLOYMENT-RULES.md` R7.

## Checklist (execute in order)

```bash
# 1. My latest commit is pushed
git push 2>&1 | tail -3

# 2. A PR exists and is merged (not just open)
gh pr list --state merged --limit 1
# OR if no PR yet:
gh pr create --base main
gh pr merge --merge

# 3. My commit is actually in origin/main
git fetch origin main
git log origin/main -1 --format='%h %s'

# 4. No important branches left behind
./scripts/check-unmerged.sh

# 5. If a PROGRESS.md is touched, the journal line cites the main SHA:
#    | date | Ex | COMPLETED | N tests | abc1234 (main) | notes |
```

If any of the 5 checks fail, **do not announce the work as shipped**. Fix the state first.

## What to say if checks fail

- Commits not in main : "Le code est ecrit mais pas encore en prod — je push et merge."
- PR not merged : "PR ouverte, je merge maintenant."
- Unmerged branches detected : "Avant de conclure, je dois arbitrer les branches X, Y."

## What to say when checks pass

Only then can you say :
- "Mergee en production — SHA abc1234 sur main"
- "Le chantier est fait : commit abc1234 est dans origin/main"

Never declare victory by reading a `*-PROGRESS.md` file alone. The file lies if nobody verified it against `origin/main`.

## Reference

- `omni-gerant/DEPLOYMENT-RULES.md` — regles R1 a R7 completes
- `omni-gerant/scripts/check-unmerged.sh` — script d'audit automatise
