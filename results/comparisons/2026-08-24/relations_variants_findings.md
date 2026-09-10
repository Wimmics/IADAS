# Harnais relations_variants — résultats et recommandation (23-24/08/2026)

Écrit le 24/08/2026 après interruption manuelle des runs à 50 articles (tests lancés dans la nuit, arrêtés le lendemain matin). Objectif de ce fichier : garder la synthèse accessible même sans relire toute la conversation qui a produit ces chiffres.

## Réponse courte : quelle configuration est la meilleure ?

**Confirmé (10 articles, runs complets) :**
1. **Composition du texte** : `tables` seules > `tables+texte` (actuel) > `texte` seul, sur le critère qui compte le plus (paires de relations trouvées).
2. **Mots-clés qualitatifs en recall-check** (`--keywords`, expérimental) : **OFF > ON** — les ajouter a réduit le nombre de relations trouvées, pas augmenté.

**Non confirmé à grande échelle** : les runs à 50 articles ont été interrompus avant la fin (voir "État des runs" ci-dessous) — pas de conclusion à 50 articles pour l'instant, seulement une tendance cohérente avec le résultat à 10 articles.

**Combinaison non testée** : "tables seules" + mots-clés n'a jamais été lancé ensemble — les deux axes ont été testés indépendamment, chacun contre le même point de référence (`tables+texte`, sans mots-clés).

**Recommandation si un seul changement devait être fait maintenant** : passer le bloc relations sur la variante "tables seules" par défaut plutôt que "tables+texte", et laisser les mots-clés qualitatifs désactivés (déjà le cas par défaut — `include_keywords=False` partout dans `extract_type.py`/`relations_variants.py`).

## Détail des chiffres

### Axe 1 — composition du texte (10 articles à tableaux, 180 relations GT)

| Variante | Paires trouvées | Extraites | Precision champs | Recall champs | F1 champs |
|---|---|---|---|---|---|
| **tableaux seuls** | 73/180 (40,6 %) | 128 | 26,9 % | 21,5 % | 18,0 % |
| **texte seul** | 29/180 (16,1 %) | 72 | 25,0 % | 19,3 % | 13,5 % |
| **tableaux+texte** (actuel) | 59/180 (32,8 %) | 103 | 29,1 % | 21,7 % | 19,1 % |

Deux articles concentrent la perte quand le texte est ajouté aux tableaux : Abras.2022 (15→2 paires), Button.2024 (6→2). À l'inverse, Borowiec.2023/Benau.2020/Arbinaga.2024 s'améliorent avec le texte en plus — pas un effet uniforme.

Tags : `baseline-tables`, `baseline-texte`, `baseline-tables-texte` dans `relations_experiments/`.

### Axe 2 — mots-clés qualitatifs (variante tables+texte, avec vs sans `--keywords`)

**10 articles (complet) :**

| Run | Paires trouvées | Extraites | Precision | Recall | F1 |
|---|---|---|---|---|---|
| `kw-off-10` (sans mots-clés) | 64/180 (35,6 %) | 108 | 31,5 % | 22,7 % | 20,6 % |
| `kw-on-10` (avec mots-clés) | 55/180 (30,6 %) | 105 | 31,3 % | 22,0 % | 19,1 % |

Delta agrégat : precision −0,2pt, recall −0,7pt, **f1 −1,5pt**. 5 articles empirent (Abras.2022 −11,9pt, Arbinaga.2024 −11,1pt, Baric.2024 −10,2pt, Biedron.2025 −8,4pt, Benau.2020 −3,6pt), 3 stables, 2 s'améliorent (Arcelus.2015 +3,2pt, Borowiec.2023 +26,1pt).

**50 articles (INTERROMPU, tendance seulement)** : `kw-off-50` a traité 25/50 articles avant l'arrêt manuel (pas de `summary.json`, aucun agrégat officiel écrit par le harnais). Score calculé après coup sur ces 25 : 101/319 relations matchées (31,7 %), precision 28,8 %, recall 18,7 %, f1 19,3 % — cohérent en ordre de grandeur avec le résultat à 10 articles, sans le confirmer formellement. `kw-on-50` n'a jamais démarré (le run précédent dans la chaîne a été tué avant).

## Pourquoi les mots-clés semblent nuire (hypothèse, pas vérifiée)

Le scan par mots-clés (`scan_keyword_candidates`, voir `corr_matrix.py`) repère 2 à 6 phrases par article contenant "correlate/related/associated/mediated/moderated/positively/negatively" sans valeur chiffrée dans la même phrase — un volume raisonnable, pas un déluge. Le fait que le nombre de relations **trouvées** baisse (64→55 sur 10 articles) plutôt que d'augmenter suggère que ces phrases-indices supplémentaires détournent l'attention du LLM vers de fausses pistes (une phrase de méthode qui mentionne "correlation" sans rapporter une relation précise, par exemple) plutôt que de l'aider à couvrir des relations réellement manquées. Reste à vérifier en regardant le détail par article — pas fait ici, l'objectif de ce fichier est de garder trace du résultat chiffré, pas d'une analyse qualitative complète.

## État des runs (pour reprendre proprement)

| Tag | Portée | Statut |
|---|---|---|
| `baseline-tables` | 10 | ✅ complet |
| `baseline-texte` | 10 | ✅ complet |
| `baseline-tables-texte` | 10 | ✅ complet |
| `kw-off-10` | 10 | ✅ complet |
| `kw-on-10` | 10 | ✅ complet |
| `kw-off-50` | 50 | ⚠️ interrompu à 25/50, pas de summary.json |
| `kw-on-50` | 50 | ❌ jamais démarré |
| tables/texte/tables+texte à 50 | 50 | ❌ jamais démarré (prévu "à la fin", pas atteint) |

Pour reprendre : `python dev/acad/tools/relations_variants.py run --tag kw-off-50 --variant tables+texte --n 50` relance et **réécrit tout** `kw-off-50` depuis le début (pas de reprise partielle — le harnais n'a pas de checkpoint, voir limite ci-dessous).

## Limite identifiée pendant ce run

`compute_run_summary()` (`tools/relations_variants.py`) n'écrit son `summary.json` qu'à la toute fin, après tous les articles — une interruption en cours de route perd l'agrégat officiel (récupérable à la main depuis les `<stem>_type.json` déjà écrits, comme fait ci-dessus, mais pas automatique). Piste d'amélioration si des runs à cette échelle redeviennent courants : écrire un `summary.json` partiel après chaque article plutôt qu'une seule fois à la fin.
