"""Tests pour common/metadata.py : détection de DOI dans le texte, mapping
pays/continent (logique pure, sans réseau), et récupération CrossRef/OpenAlex
par DOI (réseau réel : se SKIPPE si hors ligne ou API indisponible, même
convention que les tests dépendant d'un état externe ailleurs dans ce dépôt,
ex. test_corr_matrix.py::_read_fixture).
"""
import pytest

from ia_cad.common.metadata import (
    find_doi_in_text, fetch_metadata,
    cc_to_continent, cc_to_country_name, country_to_continent,
)

# DOI stable et ancien (Nature, 2013) utilisé comme fixture réseau : peu de
# risque qu'il soit un jour retiré ou que ses métadonnées changent.
_KNOWN_DOI = "10.1038/nature12373"


# ─── find_doi_in_text (pure, aucun réseau) ─────────────────────────────────

def test_find_doi_plain():
    assert find_doi_in_text("see 10.1038/nature12373 for details") == "10.1038/nature12373"


def test_find_doi_url_form():
    text = "Available at https://doi.org/10.1016/j.eatbeh.2025.102050 (accessed 2026)."
    assert find_doi_in_text(text) == "10.1016/j.eatbeh.2025.102050"


def test_find_doi_prefixed_label():
    text = "Article info\nDOI: 10.35365/ctjpp.22.1.02\nReceived 2022"
    assert find_doi_in_text(text) == "10.35365/ctjpp.22.1.02"


def test_find_doi_strips_trailing_punctuation():
    text = "This study (doi:10.1186/s40337-025-01269-z) reports that..."
    # la parenthèse fermante ne doit pas être capturée dans le DOI
    assert find_doi_in_text(text) == "10.1186/s40337-025-01269-z"


def test_find_doi_absent():
    assert find_doi_in_text("Aucun identifiant ici, juste du texte normal.") is None


def test_find_doi_empty_text():
    assert find_doi_in_text("") is None
    assert find_doi_in_text(None) is None


# ─── country/continent (pure, aucun réseau) ────────────────────────────────

def test_cc_to_continent_known_codes():
    assert cc_to_continent("US") == "America"
    assert cc_to_continent("FR") == "Europe"
    assert cc_to_continent("AU") == "Oceania"
    assert cc_to_continent("CN") == "Asia"
    assert cc_to_continent("ZA") == "Africa"


def test_cc_to_continent_case_insensitive_and_unknown():
    assert cc_to_continent("fr") == "Europe"
    assert cc_to_continent("") is None
    assert cc_to_continent(None) is None
    assert cc_to_continent("XX") is None  # code inconnu, pas d'exception


def test_cc_to_country_name_controlled_vocab():
    # GB -> "United Kingdom" (forme canonique du vocabulaire contrôlé), pas "England"
    assert cc_to_country_name("GB") == "United Kingdom"
    assert cc_to_country_name("US") == "United States of America"
    assert cc_to_country_name("HR") == "Croatia"


def test_cc_to_country_name_unknown_returns_none():
    # Pays hors des 34 valeurs contrôlées : None plutôt qu'une valeur inventée
    # (ontology_values.yaml est un vocabulaire contrôlé, pas à étendre seul).
    assert cc_to_country_name("ZZ") is None


def test_country_to_continent_from_llm_text():
    assert country_to_continent("Croatia") == "Europe"
    assert country_to_continent("United States of America") == "America"
    assert country_to_continent("USA") == "America"
    assert country_to_continent("UK") == "Europe"


def test_country_to_continent_multi_country_composite():
    assert country_to_continent("New Zealand Australia") == "Oceania"


def test_country_to_continent_unknown():
    assert country_to_continent("Atlantide") is None
    assert country_to_continent(None) is None


# ─── fetch_metadata (réseau réel) ──────────────────────────────────────────

def test_fetch_metadata_empty_doi_no_network_call():
    assert fetch_metadata(None) is None
    assert fetch_metadata("") is None


def test_fetch_metadata_known_doi():
    meta = fetch_metadata(_KNOWN_DOI)
    if meta is None:
        pytest.skip("CrossRef/OpenAlex injoignables (hors ligne ou API indisponible)")
    assert meta["doi"] == _KNOWN_DOI
    assert meta["title"] and "thermometry" in meta["title"].lower()
    assert meta["date"]  # année non vide
    assert meta["source"] in ("crossref", "openalex", "crossref+openalex")


def test_fetch_metadata_unknown_doi_returns_none():
    meta = fetch_metadata("10.9999/this-doi-does-not-exist-ia-cad-test")
    # Ni erreur ni exception : DOI inconnu des deux API -> None
    assert meta is None
