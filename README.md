# IA-CAD : pipeline d'extraction IADAS

Pipeline Python qui lit un article scientifique PDF (psychologie du sport,
attitudes et comportements alimentaires dysfonctionnels chez les sportifs (ACAD /
DEAB) et en produit automatiquement, par des LLM exécutés **localement** via
Ollama, les données structurées attendues par l'ontologie **IADAS** : référence
bibliographique, pratique sportive, population étudiée, analyse, et triplets de
relations statistiques entre variables. Il a été développé au **LAMHESS**
(Université Côte d'Azur) pour remplacer l'intégration manuelle d'articles dans le
graphe de connaissances IADAS, qui ne suit plus le rythme d'actualisation du
corpus (216 articles de référence, une centaine d'autres à couvrir).

## Architecture

Chaîne par article (`iacad-extract`, code : `src/ia_cad/extraction/extract.py`) :

```
article.pdf
   │  lecture PDF (PyMuPDF) + assainissement typographique
   ▼
texte brut
   │  segmentation IMRaD par signets PDF (+ police + regex) → articles_sections/<stem>/<section>.txt
   ▼
sections routées par bloc de données
   │  5 extracteurs LLM indépendants, un prompt dédié par bloc :
   │    bibliographic · sport · population · analysis · relations
   │  chaque prompt reçoit : schéma du bloc + valeurs contrôlées (définies) + exemples few-shot
   ▼
triplets predicate/object bruts (par bloc)
   │  1) validation structurelle  : prédicat connu de la classe + type de la valeur (déterministe)
   │  2) validation factuelle      : 2ᵉ prompt LLM VRAI/FAUX par triplet contre le texte source
   │                                 (un triplet FAUX est retiré ; Self-Refine sur les stats rejetées)
   │  bloc relations en plus       : reconstruction déterministe des tableaux de corrélation,
   │                                 relance de rappel (« as-tu manqué une corrélation ? »)
   ▼
triplets validés
   │  entity linking SPARQL : nom de sport / variable → URI du thésaurus
   │  (skos:prefLabel/altLabel puis remontée skos:broader jusqu'à la racine)
   │  requêtes SPARQL sur un graphe rdflib en mémoire (ontology/linking-tuned/*.ttl)
   ▼
results/Type/<date>/<stem>_type.json   : triplets JSON-LD mappés sur IADAS (candidats)
```

Une étape de comparaison au jeu de référence (`iacad-compare`) est séparée du
pipeline d'extraction.

**Une seule variante de sortie est active : `Type`** (extraction directe en
triplets JSON-LD, mappés un-pour-un sur le schéma d'IADAS). Une variante `JSON`
plus ancienne (sortie tabulaire à plat, puis normalisée) a existé ; elle a été
retirée le 18/08/2026 et **il n'en reste aucun code dans le dépôt**.

## Installation

Prérequis : **Python ≥ 3.11**, **Ollama** installé et lancé
(<https://ollama.com>).

```bash
python -m venv .venv
# Windows : .venv\Scripts\activate      Linux/macOS : source .venv/bin/activate
pip install -e ".[dev]"
ollama pull qwen2.5:7b
```

`pip install -e ".[dev]"` installe le package `ia_cad` en mode editable et les
commandes `iacad-*` ci-dessous, plus `pytest`.

### Modèles

Modèles Ollama déclarés dans `src/ia_cad/common/config/models.yaml` :

| Modèle | Rôle | Note |
|---|---|---|
| `qwen2.5:7b` | **défaut** | bon compromis vitesse / qualité |
| `qwen2.5:14b` | meilleure précision | ~9 Go de RAM |
| `gemma3:12b` | point de comparaison | |
| `mistral-small:24b` | point de comparaison | ne tient pas sur un portable 16 Go |

Tous en `temperature: 0.0`, sortie JSON stricte, `keep_alive: 10m`. `num_ctx` vaut
131072 dans la config mais `ia_cad.extraction.core.llm.call_llm()` le **réduit
dynamiquement** à la taille réelle du prompt (gain CPU / RAM).

**Performance.** Sur un poste sans GPU l'extraction est lente (~10 appels LLM par
article). Deux solutions : pointer `OLLAMA_HOST` vers une machine avec GPU (LAN ou
Tailscale), ou lancer l'extraction directement sur cette machine. L'édition de
prompts et `iacad-compare` sont instantanés (pur Python) et restent faisables
partout.

**Dépannage Ollama (Windows).** Un `WinError 10054` (reset TCP) donne une
extraction vide ; un *retry* automatique avec *backoff* est prévu
(`max_retries=3`). Si l'erreur persiste, relancer le serveur Ollama.

### Variables d'environnement

Le pipeline **n'utilise aucune clé d'API** (LLM local uniquement) et **n'écrit
dans aucun triplestore** (voir « État du projet »). Deux variables sont
optionnelles :

| Variable | Effet | Défaut |
|---|---|---|
| `OLLAMA_HOST` | URL du serveur Ollama (lue par le paquet `ollama`), pour cibler une machine distante avec GPU | `http://localhost:11434` |
| `IA_CAD_ROOT` | racine des données (`articles/`, `ontology/`, `ground_truth/`, `results/`) si le dépôt n'est pas au même endroit que le package | emplacement du package |

### Données à fournir

Le corpus PDF n'est **pas** versionné (droits éditeurs). Placer les articles dans
`articles/`, nommés `<Stem>.pdf` (`<Stem>` = premier auteur + année, ex.
`Abras.2022.pdf`) ; voir `articles/README.md`. Les 216 stems du corpus annoté de
référence sont listés dans `ground_truth/train/` (18) et `ground_truth/test/`
(198).

## Utilisation

```bash
# extraction d'un article, tous les blocs de données
iacad-extract articles/Abras.2022.pdf

# plusieurs articles (glob), modèle imposé, sous-ensemble de blocs
iacad-extract "articles/*.pdf" --model qwen2.5:14b --chunks sport population

# désactive la validation factuelle LLM (plus rapide, moins fiable)
iacad-extract articles/Abras.2022.pdf --no-factcheck --debug
```

| Option de `iacad-extract` | Effet |
|---|---|
| `articles` (positionnel, 1+) | PDF ou TXT ; glob accepté ; un nom nu est cherché dans `articles/` |
| `--model NOM` | modèle Ollama (défaut : `qwen2.5:7b`, cf. `src/ia_cad/common/config/models.yaml`) |
| `--chunks ...` | blocs parmi `sport relations analysis population bibliographic` (défaut : les 5) |
| `--no-factcheck` | désactive la 2ᵉ passe LLM VRAI/FAUX |
| `--debug` | affiche la réponse LLM brute de chaque bloc |
| `--no-split` | envoie le texte entier à chaque prompt (désactive le routage par section) |
| `--no-metadata` | désactive la recherche de métadonnées par DOI (CrossRef/OpenAlex, voir plus bas) |

Sortie : `results/Type/<date>/<stem>_type.json`. Un article **hors des 216 du
corpus annoté** est routé vers `results/Type/<date>/production/`.

### Métadonnées bibliographiques (DOI)

Le bloc `bibliographic` est automatiquement complété par une recherche CrossRef
et OpenAlex à partir du DOI de l'article : titre, auteurs, année et revue
(prédicats `dcterms:title`/`creator`/`date`, `bibo:journal`/`doi`), plus
`iadas:country`/`continent` en repli si le LLM n'a rien trouvé dans le texte
(le pays lu dans le texte, celui de la population étudiée, reste toujours
prioritaire sur le pays d'affiliation des auteurs que donne l'API). Le DOI est
d'abord cherché dans le texte de l'article, puis dans `article_index.json` pour
les stems déjà connus. Tous ces triplets ajoutés portent `_source: "metadata"`.
Nécessite une connexion internet ; se désactive avec `--no-metadata`
(nécessaire hors ligne, n'interrompt jamais l'extraction en cas d'échec réseau).
Code : `src/ia_cad/common/metadata.py`.

### Autres commandes

| Commande | Rôle |
|---|---|
| `iacad-compare [--article STEM] [--summary] [--no-file]` | compare `results/Type/<date>/` au jeu de référence `ground_truth/` |
| `iacad-eval-linking [--article STEM] [--show-mismatches]` | évalue l'entity linking (sport + variable) sur les 216 articles annotés |
| `iacad-build-vocab` | régénère `src/ia_cad/common/vocabs/*.yaml` par SPARQL sur `ontology/linking-tuned/` |
| `iacad-abox-to-gt [--article STEM] [--dry-run]` | régénère `ground_truth/` depuis le graphe peuplé |
| `iacad-split-articles` | (re)génère le cache de sections `articles_sections/` |
| `iacad-try-linking "nom"` | testeur manuel de l'entity linking sur un nom de sport / variable |
| `iacad-report [--dir DOSSIER]` | contrôle qualité d'extractions **sans** jeu de référence |
| `iacad-webapp` | interface web de pilotage (`http://127.0.0.1:5000`) |
| `pytest` | suite de tests |

Outils de maintenance ponctuels (correction des sources à partir des Excel de
l'équipe, inspection) :

| Commande | Rôle |
|---|---|
| `python -m ia_cad.tools.inspection.extract_signets [--summary]` | inspecte les signets PDF bruts d'un article |
| `python -m ia_cad.tools.ontology.data_excel_to_ttl [--dry-run]` | corrige l'ABox depuis `data/BDD_Extraction.xlsx` |
| `python -m ia_cad.tools.ontology.sport_excel_to_ttl [--dry-run]` | corrige la hiérarchie des sports depuis `data/Sport hierarchy_VF_09avr26.xlsx` |

Chaque extraction, comparaison, évaluation ou rapport écrit dans un **dossier
daté** `<date>/` (les noms de fichiers ne portent plus la date).

## Structure du dépôt

```
pyproject.toml            métadonnées, dépendances, commandes iacad-*, config pytest
README.md                 ce fichier (démarrage rapide) ; voir aussi docs/

src/ia_cad/
  paths.py                résolution centralisée des chemins ($IA_CAD_ROOT pour surcharger)
  extraction/             le pipeline
    extract.py            orchestration : les 5 blocs de données, un _process_*() par bloc
    core/                 readfile (PDF→texte), llm (appel Ollama), ontology (lecture du schéma),
                          validator (structurel + factuel + Self-Refine + relance),
                          corr_matrix (reconstruction des tableaux de corrélation)
    prompts/              un .txt par bloc + factcheck*.txt + few_shots/ (exemples statiques)
  common/
    linking/              sparql_linking.py (entity linking SPARQL) + redirections.yaml +
                          sport_practice.yaml
    onto_graph.py         graphe rdflib chargé une fois depuis ontology/linking-tuned/
    corpus.py             « ce stem est-il dans le corpus annoté ? » → routage test / production
    pdf_signets.py        lecture des signets PDF bruts
    vocabs/               vocabulaires contrôlés GÉNÉRÉS par iacad-build-vocab
    config/               models.yaml (config Ollama) + article_index.json (index figé DOI/titre→stem)
  tools/                  scripts CLI, groupés : evaluation/ · corpus/ · ontology/ · inspection/
  webapp/                 interface web Flask (app.py, jobs.py, static/, templates/)

tests/                    suite pytest
ontology/
  Onto/                   version canonique de l'équipe IADAS (lecture seule) : IADAS-Model.ttl
                          (schéma), ia-das-ontology-clean.ttl (graphe peuplé), hiérarchies SKOS
  linking-tuned/          copie des hiérarchies réglée pour maximiser l'entity linking,
                          chargée par le pipeline (corrections sans toucher à Onto/)
data/                     fichiers Excel d'annotation de l'équipe
ground_truth/             216 jeux de référence dérivés du graphe peuplé : train/ (18) + test/ (198)
results/                  sorties d'extraction, comparaisons, expériences A/B (un sous-dossier par date)
docs/                     ORGANISATION.md (carte du dépôt) · rapport_technique.docx ·
                          rapport_non_technique.docx

(non versionnés) articles/  articles_sections/    : corpus PDF + cache de sections, en local
```

## Glossaire interne

Termes maison, pour éviter les malentendus :

| Terme | Sens exact ici |
|---|---|
| **bloc de données** | une des 5 **catégories de sortie** (`bibliographic`, `sport`, `population`, `relations`, `analysis`), chacune extraite par un prompt LLM dédié. C'est un découpage du **schéma de sortie**, PAS un découpage du texte source de l'article. |
| **entity linking** | résolution d'un nom libre (sport, variable) vers un concept normalisé du thésaurus IADAS, par requêtes SPARQL : correspondance `skos:prefLabel`/`skos:altLabel` puis remontée `skos:broader` jusqu'à la racine. Jamais de dictionnaire Python précompilé. C'est un *linking* vers un référentiel existant, pas une classification dans des catégories a priori. Code : `common/linking/`, module `sparql_linking.py`, classes `VariableLinker` / `SportLinker`. |
| **validation factuelle / factcheck** | 2ᵉ appel LLM qui répond VRAI/FAUX pour chaque triplet contre le texte source ; un triplet FAUX est retiré de la sortie. |
| **`Type` vs `JSON`** | `Type` = la seule variante de sortie active (triplets JSON-LD IADAS). `JSON` = variante tabulaire à plat, retirée le 18/08/2026, plus aucun code dans le dépôt. |
| **jeu de référence / ground truth** | `ground_truth/` : les données attendues par article, dérivées du graphe peuplé (`iacad-abox-to-gt`), pas d'une annotation Excel séparée. |
| **corpus annoté** | les 216 articles de `ground_truth/` : 18 servent à construire les exemples few-shot des prompts, 198 forment le jeu de test évalué. |
| **V1 / V2** (bloc relations) | V1 = la variable **DEAB** de la relation (le trouble ou l'attitude alimentaire lui-même) ; V2 = l'autre variable (autre construit DEAB, ou facteur intra-/inter-personnel/socioculturel lié, ou toute autre variable). V1 est décidé par **catégorie**, jamais par la grammaire de l'article (prédicteur/résultat). A remplacé VI/VD. |
| **acads** | classification hiérarchique IADAS d'une variable (jusqu'à 5 niveaux de sous-classes : `hasCategory`, `subClass1..4`, `finalClass`). |

## État du projet

**Stable**
- Extraction des 5 blocs de données, de bout en bout, sur n'importe quel article du corpus.
- Segmentation IMRaD par signets PDF ; routage d'un bloc vers ses sections utiles.
- Vocabulaire contrôlé + validation factuelle : les valeurs hors vocabulaire et
  les valeurs non supportées par le texte sont retirées.
- Entity linking SPARQL sur le graphe (aucune copie figée du thésaurus).
- Séparation test / production ; jeu de référence dérivé du graphe.
- Interface web Flask (lancer une extraction, suivre un job, consulter/comparer un résultat).
- Récupération de métadonnées bibliographiques par DOI (CrossRef, OpenAlex) :
  complète `bibliographic` avec titre/auteurs/année/revue et un repli
  country/continent (voir « Métadonnées bibliographiques » plus haut).
- Suite de tests (`pytest`).

**En cours / fragile**
- **Bloc relations** : point faible principal. Deux niveaux d'erreur : la
  détection de la paire de variables (rappel ≈ 1/3), puis l'exactitude des
  attributs chiffrés (mesure, coefficient, seuil de significativité) des
  relations retrouvées (nettement plus bas). Mécanismes déjà en place :
  reconstruction déterministe des tableaux de corrélation, relance de rappel,
  Self-Refine sur les stats rejetées. Chantier ouvert : la lecture des tableaux
  de résultats.
- Sélection few-shot **statique** par bloc (exemples fixes), pas dynamique par article.

**Non fait**
- **Écriture effective dans le graphe de connaissances IADAS** (mission 2). Le
  pipeline produit des fichiers JSON-LD *candidats* ; il n'y a **pas** d'export
  TTL par article ni d'insertion dans un triplestore. La qualité du bloc
  relations ne permet pas une alimentation automatique sans relecture manuelle.

## Contribution

```bash
pytest                              # doit être vert avant tout commit
python -m py_compile $(git ls-files '*.py')   # vérif syntaxe rapide (pas de linter configuré)
```

**Conventions de code**

- imports absolus `from ia_cad. …` (le package est installé, aucun `sys.path`) ;
- chemins de données **uniquement** via `ia_cad.paths` (jamais de chemin en dur) ;
- l'entity linking et les vocabulaires passent **exclusivement** par des requêtes
  SPARQL sur le graphe rdflib : jamais `g.triples()` / `g.value()` / dict précompilé.

**Fichiers à ne pas éditer à la main**

- `ontology/Onto/*.ttl` : version canonique de l'équipe IADAS, lecture seule
  (corrections à coordonner avec l'équipe).
- `src/ia_cad/common/vocabs/*.yaml` : régénérés par `iacad-build-vocab`
  (sauf `normalization.yaml`, vocabulaire contrôlé manuel).
- `ground_truth/` : régénéré par `iacad-abox-to-gt` depuis le graphe.
- `src/ia_cad/common/config/article_index.json` : index figé, ne pas régénérer.
- `src/ia_cad/common/linking/redirections.yaml` : chaque entrée doit être
  justifiée par l'ABox ; à retirer dès que le TTL source est corrigé.

**Vocabulaire** (dans le code, les prompts et la doc) : *entity linking* (jamais
« classifieur » ni « rangement »), *bloc de données* (jamais « chunk » ; le flag
CLI `--chunks` garde ce nom), *extraction de triplets* (plutôt que « de
relations »), *manuellement* (jamais « à la main »), *article* (le document
source, jamais « rapport »). Le format `Type` est du **JSON-LD**.

Explication technique complète du pipeline : `docs/rapport_technique.docx`.
Carte du dépôt : `docs/ORGANISATION.md`.

## Copyright

Code © 2026 Alban Maveyraud, stage LAMHESS / Université Côte d'Azur, usage
interne équipe IADAS. Les PDF d'articles scientifiques ne sont pas fournis avec ce
dépôt et ne doivent pas être redistribués.
