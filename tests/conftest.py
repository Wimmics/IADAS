"""Configuration pytest.

Le package ``ia_cad`` est installé en mode editable (``pip install -e ".[dev]"``),
donc les imports fonctionnent sans manipuler ``sys.path``. Ce fichier fixe
seulement ``IA_CAD_ROOT`` sur la racine du dépôt pour que les tests qui lisent
``articles/``, ``ground_truth/`` ou ``ontology/`` trouvent les données même
lancés depuis un autre répertoire de travail.
"""
import os
from pathlib import Path

os.environ.setdefault("IA_CAD_ROOT", str(Path(__file__).resolve().parents[1]))
