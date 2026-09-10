from pathlib import Path

import pytest
from rdflib.namespace import SKOS

import ia_cad.common.onto_graph as og
from ia_cad.common.onto_graph import get_graph


def test_graph_loads_all_ttl():
    g = get_graph()
    # 3 fichiers TTL : sports + variables + enrichment (le niveau sportif n'est plus
    # chargé — liste contrôlée hors ontologie). ~4360 triplets ; marge ~10 %.
    assert len(g) > 4000, f"graphe trop petit : {len(g)} triplets"


def test_graph_is_cached_singleton():
    assert get_graph() is get_graph()


def test_graph_has_known_concepts():
    g = get_graph()
    labels = {str(o).lower() for _, _, o in g.triples((None, SKOS.prefLabel, None))}
    assert "anorexia" in labels
    assert "swimming" in labels


def test_missing_ttl_raises(monkeypatch):
    og.get_graph.cache_clear()
    fake = Path("does-not-exist.ttl")
    monkeypatch.setattr(og, "_TTL_FILES", [fake])
    with pytest.raises(FileNotFoundError) as exc:
        og.get_graph()
    assert "does-not-exist.ttl" in str(exc.value)
    og.get_graph.cache_clear()  # restore clean state for other tests
