# Organisation du dépôt : où trouver quoi

Ce document est une carte de navigation. Pour le **démarrage rapide** (installation,
commandes, conventions), voir [`README.md`](../README.md) à la racine. Pour
l'explication **technique** du pipeline (fonctionnement, choix d'architecture,
utilisation), voir [`rapport_technique.docx`](rapport_technique.docx).

## Arborescence commentée

```
Stage/
├── pyproject.toml          Package « ia-cad » : dépendances, commandes iacad-*, config pytest.
├── README.md               Démarrage rapide : installation, commandes, conventions, glossaire.
├── .gitignore              Exclut articles/, articles_sections/, caches, environnements.
│
├── src/ia_cad/             LE CODE (package installable, `pip install -e ".[dev]"`).
│   ├── paths.py            Point unique de résolution des chemins. Toute la localisation
│   │                       des données passe par ici ($IA_CAD_ROOT pour surcharger).
│   ├── extraction/         Le pipeline d'extraction (LLM vers triplets).
│   │   ├── extract.py      Orchestration : les 5 blocs, un _process_*() par bloc.
│   │   ├── core/
│   │   │   ├── readfile.py   Lecture du PDF (PyMuPDF) vers texte brut.
│   │   │   ├── llm.py        Appel Ollama : retry, num_ctx dynamique, JSON tronqué récupéré.
│   │   │   ├── ontology.py   Lit common/vocabs/type_schema.yaml (schéma de classes/propriétés).
│   │   │   ├── validator.py  Validation structurelle + factuelle + Self-Refine + relance de rappel.
│   │   │   └── corr_matrix.py  Reconstruction déterministe des tableaux de corrélation.
│   │   └── prompts/        Un .txt par bloc + factcheck*.txt + few_shots/ (exemples annotés).
│   ├── common/
│   │   ├── corpus.py       « Ce stem est-il dans le corpus annoté ? », route test/production.
│   │   ├── onto_graph.py   Graphe rdflib singleton (chargé depuis ontology/linking-tuned/).
│   │   ├── pdf_signets.py  Lecture des signets PDF bruts.
│   │   ├── metadata.py     Recherche de métadonnées bibliographiques par DOI (CrossRef, OpenAlex).
│   │   ├── config/
│   │   │   ├── models.yaml       Config Ollama par modèle.
│   │   │   └── article_index.json  Repli figé doi/titre vers stem (216 stems d'origine).
│   │   ├── linking/
│   │   │   ├── sparql_linking.py   Entity linking : nom vers URI vers chaîne de classes (SPARQL).
│   │   │   ├── redirections.yaml   Pansements « nom annoté vers label canonique » (à justifier par l'ABox).
│   │   │   └── sport_practice.yaml  Catégorie de sport vers Team/Individual (trou de l'ontologie).
│   │   └── vocabs/         Vocabulaires GÉNÉRÉS par iacad-build-vocab (+ normalization.yaml, manuel).
│   ├── tools/              Scripts CLI groupés (commandes iacad-* via pyproject.toml) :
│   │   ├── evaluation/     compare_results, eval_linking, report_production, relations_variants, audit_evidence
│   │   ├── corpus/         split_articles, build_vocab, abox_to_gt
│   │   ├── ontology/       data_excel_to_ttl, sport_excel_to_ttl (correction des TTL depuis les Excel)
│   │   └── inspection/     try_linking, extract_signets, article_coverage_report
│   └── webapp/             Interface web Flask (app.py + jobs.py + static/ + templates/).
│
├── tests/                  Tests pytest + conftest.py (fixe IA_CAD_ROOT sur la racine du dépôt).
│
├── ontology/
│   ├── Onto/               Version canonique de l'équipe IADAS. LECTURE SEULE.
│   │                       IADAS-Model.ttl (TBox), ia-das-ontology-clean.ttl (ABox peuplée),
│   │                       hiérarchies sport/variable, enrichissement SKOS.
│   └── linking-tuned/      Copie des hiérarchies réglée pour maximiser l'entity linking
│                           (chargée par le pipeline ; corrections sans toucher à Onto/).
│
├── data/                  Fichiers Excel d'annotation de l'équipe (BDD_Extraction.xlsx, …).
│
├── ground_truth/          216 GT Type dérivés de l'ABox. LA RÉFÉRENCE d'évaluation.
│   ├── train/  (18)        Exemples annotés injectés dans les prompts (few-shot).
│   └── test/   (198)       Jeu d'évaluation.
│
├── results/              Sorties, un sous-dossier daté par jour d'exécution.
│   ├── Type/<date>/                    Extractions (<stem>_type.json).
│   ├── comparisons/<date>/             Rapports de compare / eval_linking / abox_to_gt.
│   └── relations_experiments/<tag>/    Harnais A/B du bloc relations (jamais mélangé aux extractions).
│
├── docs/
│   ├── ORGANISATION.md            Ce fichier.
│   ├── rapport_technique.docx      Rapport technique : fonctionnement, architecture, utilisation, limites.
│   └── rapport_non_technique.docx  Présentation du projet pour l'équipe (sans jargon).
│
└── articles/  articles_sections/     NON VERSIONNÉS. Corpus PDF (droits éditeurs) + cache IMRaD.
                                      Voir articles/README.md. Le cache se régénère par iacad-split-articles.
```

## « Je cherche… »

| Je cherche… | C'est ici |
|---|---|
| le prompt d'un bloc (sport, relations…) | `src/ia_cad/extraction/prompts/<bloc>.txt` |
| les exemples few-shot d'un bloc | `src/ia_cad/extraction/prompts/few_shots/<bloc>.json` |
| comment un nom de sport/variable devient une chaîne de classes | `src/ia_cad/common/linking/sparql_linking.py` |
| comment le titre/les auteurs/la revue sont récupérés par DOI | `src/ia_cad/common/metadata.py` |
| le schéma des triplets (classes, propriétés, domain/range) | `src/ia_cad/common/vocabs/type_schema.yaml` (généré) |
| la liste des valeurs possibles d'une propriété | `src/ia_cad/common/vocabs/ontology_values.yaml` (généré) |
| régénérer les vocabulaires après modif de l'ontologie | `iacad-build-vocab` |
| le ground truth d'un article | `ground_truth/train/<stem>.json` ou `ground_truth/test/<stem>.json` |
| régénérer le ground truth depuis l'ABox | `iacad-abox-to-gt` |
| les résultats d'extraction d'une date | `results/Type/<date>/` |
| le dernier score par bloc | `iacad-compare --summary` |
| la config du modèle LLM | `src/ia_cad/common/config/models.yaml` |
| ajouter un article au corpus | déposer `<Stem>.pdf` dans `articles/`, puis `iacad-split-articles` |
| tester l'entity linking sur un nom précis | `iacad-try-linking "nom"` |
| où sont résolus les chemins (si un fichier n'est pas trouvé) | `src/ia_cad/paths.py` (+ variable `IA_CAD_ROOT`) |

## Cycle de vie d'un article

| Étape | Entrée | Sortie | Code |
|---|---|---|---|
| 1. Lecture PDF | `articles/<stem>.pdf` | texte brut | `extraction/core/readfile.py` |
| 2. Découpage IMRaD | texte brut + signets | `articles_sections/<stem>/<section>.txt` | `iacad-split-articles` |
| 3. Extraction LLM | sections | triplets bruts par bloc | `extraction/extract.py` + `prompts/` |
| 4. Validation | triplets bruts | triplets validés / rejetés | `extraction/core/validator.py` |
| 5. Entity linking | noms de sport/variable | chaînes de classes de l'ontologie | `common/linking/sparql_linking.py` |
| 5b. Métadonnées DOI | DOI de l'article | titre/auteurs/année/revue + repli pays | `common/metadata.py` |
| 6. Écriture | résultat complet | `results/Type/<date>/<stem>_type.json` | `extraction/extract.py` |
| 7. Comparaison (séparée) | résultat + `ground_truth/<stem>.json` | statut par prédicat | `iacad-compare` |

## Généré vs écrit manuellement

- **Généré** (ne pas éditer à la main) : `src/ia_cad/common/vocabs/*.yaml` sauf
  `normalization.yaml` ; `ground_truth/` ; `articles_sections/` ; tout `results/`.
- **Manuel** : le code, les prompts, `models.yaml`, `redirections.yaml`,
  `sport_practice.yaml`, `normalization.yaml`, `article_index.json` (figé).

## Ce qui n'est pas dans le dépôt

- `articles/` : les PDF (droits éditeurs). À reconstituer, voir `articles/README.md`.
- `articles_sections/` : cache régénérable par `iacad-split-articles`.
