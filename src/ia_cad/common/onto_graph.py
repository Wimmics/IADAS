"""
onto_graph.py — Graphe rdflib unique chargé depuis les TTL de hiérarchie IADAS,
mis en cache au premier accès. Toutes les requêtes SPARQL d'entity linking et de
vocabulaire passent par get_graph().

Lecture seule : les fichiers de ontology/ ne sont jamais réécrits.
L'ABox peuplée (ia-das-ontology-clean.ttl, 24 Mo) est volontairement exclue :
c'est la sortie annotée, pas la hiérarchie de classification.

Source : ontology/linking-tuned/ — copie des hiérarchies (sport, variable,
enrichissement SKOS) réglée pour maximiser l'entity linking, sans toucher à
ontology/Onto/ (la version canonique de l'équipe).
"""
from functools import lru_cache

from rdflib import Graph

from ia_cad.paths import ONTOLOGY_DIR

# Uniquement les hiérarchies de classification (sport, variable) requêtées par
# l'entity linking SPARQL. Le niveau sportif (sportLevel) n'y figure PAS : ce
# n'est pas un vocabulaire ontologique (aucune URI de concept dans IADAS) mais
# une liste contrôlée définie dans build_vocab._SPORT_LEVELS, injectée au prompt.
_TTL_FILES = [
    ONTOLOGY_DIR / "linking-tuned" / "sport-hierarchy-simple-clean.ttl",
    ONTOLOGY_DIR / "linking-tuned" / "variable-hierarchy-clean.ttl",
    ONTOLOGY_DIR / "linking-tuned" / "skos-acad-enrichment.ttl",
]


@lru_cache(maxsize=1)
def get_graph() -> Graph:
    """Charge (une fois) les TTL de hiérarchie dans un Graph rdflib et le retourne.

    Le Graph retourné est un singleton partagé mis en cache : ne pas muter le
    graphe retourné — instance partagée.

    Raises:
        FileNotFoundError si un TTL est absent.
    """
    g = Graph()
    for path in _TTL_FILES:
        if not path.exists():
            raise FileNotFoundError(f"TTL de hiérarchie introuvable : {path}")
        g.parse(str(path), format="turtle")
    return g
