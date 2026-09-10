"""Résolution centralisée des chemins du dépôt IA-CAD.

Les données lourdes (corpus PDF, ontologie, résultats, ground truth) vivent à la
racine du dépôt, pas dans le package. On les localise à partir de l'emplacement
réel de ce fichier — ce qui suppose une installation editable (`pip install -e .`),
le mode de travail documenté.

Override : variable d'environnement ``IA_CAD_ROOT`` (utile pour les tests, ou un
déploiement où le dépôt n'est pas au même endroit que le package installé).

Les données embarquées dans le package (prompts, vocabulaires, models.yaml…) sont
résolues relativement à ce module et suivent le package quel que soit le mode
d'installation.
"""
import os
from pathlib import Path

_ENV = os.environ.get("IA_CAD_ROOT")
# src/ia_cad/paths.py -> src/ia_cad -> src -> racine du dépôt
REPO_ROOT: Path = Path(_ENV).resolve() if _ENV else Path(__file__).resolve().parents[2]

# --- Données à la racine du dépôt (hors package) -----------------------------
ARTICLES_DIR: Path = REPO_ROOT / "articles"
ARTICLES_SECTIONS_DIR: Path = REPO_ROOT / "articles_sections"
ONTOLOGY_DIR: Path = REPO_ROOT / "ontology"
DATA_DIR: Path = REPO_ROOT / "data"
GROUND_TRUTH_DIR: Path = REPO_ROOT / "ground_truth"
RESULTS_DIR: Path = REPO_ROOT / "results"
REPORTS_DIR: Path = REPO_ROOT / "reports"

# --- Données embarquées dans le package --------------------------------------
_PKG: Path = Path(__file__).resolve().parent  # src/ia_cad/
PROMPTS_DIR: Path = _PKG / "extraction" / "prompts"
VOCABS_DIR: Path = _PKG / "common" / "vocabs"
MODELS_YAML: Path = _PKG / "common" / "config" / "models.yaml"
ARTICLE_INDEX: Path = _PKG / "common" / "config" / "article_index.json"
