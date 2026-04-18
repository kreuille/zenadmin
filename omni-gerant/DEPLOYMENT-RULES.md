# Regles de deploiement zenAdmin

Ce document existe parce qu'on a perdu plusieurs chantiers importants (161 metiers DUERP, Invoice NF525, bug fixes) qui vivaient sur des branches jamais mergees.

Objectif : **zero desynchronisation entre le code livre et le code annonce comme livre**.

---

## R1 — La verite, c'est `origin/main`

**Un module n'est "fait" que s'il est mergee dans `origin/main`.**

Tout ce qui n'est pas dans `origin/main` n'existe pas pour la production.

Consequence :
- Ne jamais marquer `COMPLETED` dans un fichier `*-PROGRESS.md` sans avoir verifie que le commit est dans `origin/main`.
- Un commit local ou pushe sur une branche sans PR ne compte pas.
- Une PR ouverte mais pas mergee ne compte pas.

---

## R2 — Verifier avant de celebrer

Avant de marquer un chantier `COMPLETED` ou d'annoncer "fait" a l'utilisateur :

```bash
# 1. Verifier que les commits du chantier sont dans origin/main
git fetch origin main
git branch -a --contains <commit-sha>  # Doit lister "remotes/origin/main"

# 2. Sinon, push + PR + merge
git push
gh pr create --base main
gh pr merge --merge
```

---

## R3 — Audit regulier des branches

Lancer `./scripts/check-unmerged.sh` apres chaque session de developpement importante :

```bash
./scripts/check-unmerged.sh           # Resume
./scripts/check-unmerged.sh --verbose # Detail des commits
```

Si le script sort avec exit code 1 : il y a du travail non merge qui ressemble a du travail real (plusieurs commits `feat:` ou `fix:`). A arbitrer :
- Soit merger dans main (via PR)
- Soit supprimer la branche si le travail est obsolete

---

## R4 — Un PROGRESS.md sans verification = mensonge

Avant toute mise a jour d'un fichier `*-PROGRESS.md` :

1. Le commit doit etre **dans origin/main** (pas juste pushe)
2. La PR doit etre **mergee** (pas juste ouverte)
3. Le journal doit mentionner le **SHA du commit merge dans main**

Template de ligne de journal :
```
| 2026-04-18 | Ex | COMPLETED | 123 tests | abc1234 (main) | Notes |
```

Le `(main)` indique que le SHA est bien sur main.

---

## R5 — Un seul orchestrateur, une seule branche par chantier

Quand plusieurs orchestrateurs Claude tournent en parallele sur des worktrees differents :
- Chacun a sa branche `claude/<nom>`
- Chacun **doit creer sa PR** et la merger avant de marquer son chantier complete
- Ne jamais supposer qu'un autre orchestrateur va merger pour nous

Si l'orchestrateur est interrompu :
- Sa branche reste en `IN_PROGRESS` tant que ses commits ne sont pas dans main
- L'utilisateur doit voir clairement : branche ouverte + commits non mergees

---

## R6 — Deploy = commits dans main

Les deploiements Vercel/Render sont **declenches par un push sur main**, jamais par un push sur une branche `claude/*`.

Consequence : avant d'annoncer "c'est deploye" :

```bash
# 1. Verifier le dernier commit de main
git fetch origin main
git log origin/main -1 --format='%h %s'

# 2. Verifier qu'il contient bien le travail
git show origin/main:<fichier-attendu> | head -20
```

---

## R7 — Checklist avant "c'est fait"

Avant d'annoncer qu'un chantier est termine a l'utilisateur :

- [ ] `git push` depuis ma branche — OK
- [ ] `gh pr create` — PR cree
- [ ] `gh pr merge --merge` — PR mergee dans main
- [ ] `git fetch origin main && git log origin/main -1` — mon commit est dedans
- [ ] `./scripts/check-unmerged.sh` — pas d'alerte sur ma branche
- [ ] Mise a jour du fichier `*-PROGRESS.md` avec le SHA merge dans main

Sans ces 6 points, **ne pas dire "c'est en prod"**.

---

## Incident de reference : 2026-04-18

Contexte : le fichier `DUERP-PROGRESS.md` affichait `COMPLETED` pour E0-E12 (161 metiers), alors que tout ce travail vivait sur la branche locale `claude/determined-clarke` jamais pushee ni mergee.

Impact :
- 15 commits sur DUERP (161 metiers, PAPRIPACT, archive 40 ans, formations, EPI) manquants en prod
- 5 commits sur Invoice (NF525, Factur-X parser, e-reporting) manquants en prod
- 7 commits de bug fixes manquants en prod
- Utilisateur croyait avoir un produit qui n'existait pas

Rattrapage :
- Audit via `git branch -a --contains <sha>`
- Merge manuel de chaque branche en resolvant les conflits
- PR #25 avec 2762 tests OK avant merge

Regle a retenir : **R1 + R4 ensemble**. Un PROGRESS.md sans verification dans `origin/main` est un mensonge.
