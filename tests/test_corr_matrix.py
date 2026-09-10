"""Tests pour corr_matrix.py : les 3 parseurs déterministes de matrice de
corrélation, le repli LLM, et le scan de candidats statistiques en prose.

Fixtures hybrides :
- synthétiques (une par branche de code, tracées à la main contre la regex/logique
  réelle) ;
- réelles, extraites au moment du test depuis articles_sections/<stem>/tables.txt
  pour 4 articles déjà cités comme cas vérifiés dans les commentaires de
  corr_matrix.py (Baric.2024, AleksicVeljkovic.2020, Blackmer.2011, Al-Amouri.2025) —
  tests de non-régression qui figent le comportement actuel, pas des exemples
  inventés. articles_sections/ n'est pas versionné (cache régénérable par
  iacad-split-articles depuis le corpus PDF) : ces tests se SKIPPENT sur un
  clone sans corpus local.

classifier/llm_fn sont de faux objets simples (jamais VariableLinker ni Ollama) :
tests rapides, hermétiques, sans dépendance à Onto/ ni à un serveur local.
"""
import pytest

from ia_cad.extraction.core.corr_matrix import (
    _split_tables, _parse_numbered, _parse_named_diagonal, _parse_named_grid,
    _parse_sig_map, _make_relation, _DEFAULT_SIG,
    extract_table_relations, transcribe_region_llm, scan_statistical_candidates,
    scan_keyword_candidates,
)

from ia_cad.paths import ARTICLES_SECTIONS_DIR as _ARTICLES_SECTIONS


def _read_fixture(stem: str) -> str:
    path = _ARTICLES_SECTIONS / stem / "tables.txt"
    if not path.exists():
        pytest.skip(f"articles_sections/{stem}/tables.txt absent "
                    f"(cache non versionné — lancer iacad-split-articles)")
    return path.read_text(encoding="utf-8")


class _FakeClassifier:
    """.classify(name) -> {"CLASS": "DEAB"} si name (ou son préfixe avant '(')
    matche un des noms fournis, sinon None — remplace VariableLinker (SPARQL,
    lent, dépend de Onto/) pour ces tests."""

    def __init__(self, deab_names: list[str]):
        self._deab = {n.lower() for n in deab_names}

    def classify(self, name):
        base = name.split("(")[0].strip().lower()
        if base in self._deab or name.strip().lower() in self._deab:
            return {"CLASS": "DEAB"}
        return None


# ─── _parse_numbered ────────────────────────────────────────────────────────

def test_parse_numbered_valid_triangle():
    block = """1.
2.
3.
4.
1. EAT-26
2. BSQ
-0.42***
3. DASS
0.12
0.30**
4. RSES
-0.15
0.22*
-0.08
**p < .01. *p < .05. ***p < .001.""".splitlines()

    result = _parse_numbered(block)
    assert result is not None
    names, col_names, cells = result
    assert names == col_names == ["EAT-26", "BSQ", "DASS", "RSES"]
    assert [len(c) for c in cells] == [0, 1, 2, 3]
    assert cells[1] == [(-0.42, "***")]
    assert cells[3] == [(-0.15, ""), (0.22, "*"), (-0.08, "")]


def test_parse_numbered_non_triangular_returns_none():
    # Ligne 3 (DASS) n'a qu'UNE valeur au lieu de deux attendues -> pas un triangle.
    block = """1. EAT-26
2. BSQ
-0.42
3. DASS
0.12""".splitlines()
    assert _parse_numbered(block) is None


# ─── _parse_named_diagonal ──────────────────────────────────────────────────

def test_parse_named_diagonal_valid():
    block = """Variables
A
B
C
A
-
B
.50
-
C
.30*
.20
-
D
.10
.60**
.40
-""".splitlines()

    result = _parse_named_diagonal(block)
    assert result is not None
    row_names, col_names, cells = result
    assert row_names == ["A", "B", "C", "D"]
    assert col_names == ["A", "B", "C"]
    assert cells == [[], [(0.50, "")], [(0.30, "*"), (0.20, "")],
                      [(0.10, ""), (0.60, "**"), (0.40, "")]]


def test_parse_named_diagonal_header_continuation_merge():
    # "Oral" + "control" (minuscule) doit fusionner en "Oral control" (comportement
    # vérifié sur AleksicVeljkovic.2020 Table 2, voir test_aleksic_real_tables ci-dessous).
    # Même structure que test_parse_named_diagonal_valid, avec le 2e nom de colonne
    # scindé sur deux lignes au lieu d'une.
    block = """Variables
A
Oral
control
C
A
-
B
.50
-
C
.30*
.20
-
D
.10
.60**
.40
-""".splitlines()
    result = _parse_named_diagonal(block)
    assert result is not None
    row_names, col_names, cells = result
    assert col_names == ["A", "Oral control", "C"]
    assert row_names == ["A", "B", "C", "D"]


def test_parse_named_diagonal_no_dash_returns_none():
    block = """A
B
C
.50
.30
.20""".splitlines()
    assert _parse_named_diagonal(block) is None


# ─── _parse_named_grid ───────────────────────────────────────────────────────

def test_parse_named_grid_form_b_no_reference_row():
    block = """ColA
ColB
Row1
1.0
2.0
Row2
3.0
4.0""".splitlines()
    result = _parse_named_grid(block)
    assert result is not None
    row_names, col_names, cells = result
    assert row_names == ["Row1", "Row2"]
    assert col_names == ["ColA", "ColB"]
    assert cells == [[(1.0, ""), (2.0, "")], [(3.0, ""), (4.0, "")]]


def test_parse_named_grid_form_a_with_reference_row():
    block = """ColA
ColB
Ref
Row1
1.0
2.0
Row2
3.0
4.0""".splitlines()
    result = _parse_named_grid(block)
    assert result is not None
    row_names, col_names, cells = result
    assert row_names == ["Ref", "Row1", "Row2"]
    assert cells[0] == []  # ligne de référence : aucune valeur


def test_parse_named_grid_rejects_subgroup_header():
    # 'Male'/'Female' en en-tête = sous-groupe démographique, pas une variable ->
    # refus explicite (repli LLM), jamais une reconstruction approximative.
    block = """Male
Female
Row1
1.0
2.0
Row2
3.0
4.0""".splitlines()
    assert _parse_named_grid(block) is None


def test_parse_named_grid_rejects_scaffold_word_header():
    # 'Item'/'r' = échafaudage de tableau générique, pas des noms de variables.
    block = """Item
r
Row1
1.0
2.0
Row2
3.0
4.0""".splitlines()
    assert _parse_named_grid(block) is None


# ─── _parse_sig_map ──────────────────────────────────────────────────────────

def test_parse_sig_map_reads_legend():
    block = ["** p < 0.01. * p < 0.05. *** p < 0.001."]
    sig = _parse_sig_map(block)
    assert sig == {"**": 0.01, "*": 0.05, "***": 0.001}


def test_parse_sig_map_defaults_when_absent():
    assert _parse_sig_map(["no legend here"]) == _DEFAULT_SIG


# ─── _make_relation ──────────────────────────────────────────────────────────

def test_make_relation_sign_mapping():
    pos = _make_relation("A", "B", 0.5, "p<.05", "corr_matrix", None)
    neg = _make_relation("A", "B", -0.5, "p<.05", "corr_matrix", None)
    ns = _make_relation("A", "B", 0.1, "N.S.", "corr_matrix", None)
    assert pos["stats"][-1] == {"predicate": "iadas:resultatRelation", "object": "positive"}
    assert neg["stats"][-1] == {"predicate": "iadas:resultatRelation", "object": "negative"}
    assert ns["stats"][-1] == {"predicate": "iadas:resultatRelation", "object": "non-significant"}


def test_make_relation_no_r_value_omits_degreR():
    rel = _make_relation("A", "B", None, "N.S.", "corr_matrix", None)
    preds = [s["predicate"] for s in rel["stats"]]
    assert "iadas:degreR" not in preds


def test_make_relation_focal_side_becomes_v1():
    focal = {"A": False, "B": True}
    rel = _make_relation("A", "B", 0.3, "p<.05", "corr_matrix", focal)
    assert rel["V1"] == "B" and rel["V2"] == "A"


def test_make_relation_neither_focal_returns_none():
    focal = {"A": False, "B": False}
    assert _make_relation("A", "B", 0.3, "p<.05", "corr_matrix", focal) is None


def test_make_relation_both_focal_keeps_table_order():
    focal = {"A": True, "B": True}
    rel = _make_relation("A", "B", 0.3, "p<.05", "corr_matrix", focal)
    assert rel["V1"] == "A" and rel["V2"] == "B"


# ─── extract_table_relations : filtre d'en-tête + repli LLM ────────────────

def test_extract_table_relations_skips_non_correlation_tables():
    text = "Table 1. Sample demographics\n1. Age\n25.0\n"
    assert extract_table_relations(text, classifier=None, llm_fn=None) == []


def test_extract_table_relations_falls_back_to_llm_for_unrecognized_format():
    # Format qu'aucun des 3 parseurs déterministes ne reconnaît (texte libre, pas
    # de diagonale, pas de grille rectangulaire) -> repli sur llm_fn.
    text = (
        "Table 1. Correlation results\n"
        "The correlation between Anxiety and Eating disorders was r = .40, p < .01.\n"
    )
    calls = []

    def fake_llm(system, user):
        calls.append(user)
        return {"relations": [{"V1": "Anxiety", "V2": "Eating disorders", "r": 0.40, "signeP": "p<.01"}]}

    clf = _FakeClassifier(["Eating disorders"])
    rels = extract_table_relations(text, classifier=clf, llm_fn=fake_llm)
    assert len(calls) == 1  # le repli LLM a bien été déclenché
    assert len(rels) == 1
    assert rels[0]["V1"] == "Eating disorders" and rels[0]["V2"] == "Anxiety"
    assert rels[0]["_source"] == "corr_matrix_llm"


# ─── scan_statistical_candidates ────────────────────────────────────────────

def test_scan_statistical_candidates_finds_prose_with_stat_value():
    text = ("Body dissatisfaction was strongly correlated with disordered eating "
            "symptoms in this sample (r = .42, p < .001).")
    out = scan_statistical_candidates(text)
    assert len(out) == 1
    assert "r = .42" in out[0]


def test_scan_statistical_candidates_ignores_short_fragments():
    text = "r=.42."  # < 40 caractères
    assert scan_statistical_candidates(text) == []


def test_scan_statistical_candidates_ignores_table_noise():
    # Forte densité de chiffres / mots très courts = fragment de tableau aspiré,
    # pas une phrase de prose, même si ça matche le pattern statistique.
    text = "0.42 0.31 -0.55 0.12 -0.08 0.33 0.19 -0.21 0.44 r 0.09 0.15 -0.02 0.5"
    assert scan_statistical_candidates(text) == []


def test_scan_statistical_candidates_respects_max_items():
    sentence = "Variable X was significantly correlated with variable Y overall (r = .30, p < .01). "
    text = sentence * 10
    assert len(scan_statistical_candidates(text, max_items=3)) == 3


# ─── Fixtures réelles : non-régression sur le corpus ────────────────────────
# Comportement observé au moment de l'écriture de ces tests (vérifié en exécutant
# le code contre le texte réel) — un futur changement de corr_matrix.py qui casse
# ces assertions doit être examiné, pas juste "corrigé" pour les faire repasser.

def test_baric_table3_numbered_matrix_recognized():
    text = _read_fixture("Baric.2024")
    tables = {num: block for num, header, block in _split_tables(text)}
    assert _parse_numbered(tables[3]) is not None


def test_baric_focal_relations_deterministic_only():
    text = _read_fixture("Baric.2024")
    clf = _FakeClassifier(["MASS", "EAT-26"])
    rels = extract_table_relations(text, classifier=clf, llm_fn=None, focal_only=True)
    # Toutes issues de la Table 3 (numbered) ; la Table 4 échoue aux 3 parseurs
    # déterministes (repli LLM, non testé ici sans llm_fn) et la Table 5
    # (régression) n'est même pas tentée -- voir test_baric_table5_regression_gap.
    assert len(rels) == 7
    assert all(r["_source"] == "corr_matrix" for r in rels)
    assert all("EAT-26" in r["V1"] for r in rels)  # côté focal toujours V1


def test_aleksic_both_correlation_tables_recognized():
    text = _read_fixture("AleksicVeljkovic.2020")
    tables = {num: block for num, header, block in _split_tables(text)
              if num in (2, 3)}
    for block in tables.values():
        assert _parse_named_diagonal(block) is not None


def test_aleksic_focal_relations_deterministic_only():
    text = _read_fixture("AleksicVeljkovic.2020")
    clf = _FakeClassifier(["EAT-26"])
    rels = extract_table_relations(text, classifier=clf, llm_fn=None, focal_only=True)
    assert len(rels) == 14  # Tables 2 + 3 combinées
    assert all(r["V1"] == "EAT-26" for r in rels)


def test_blackmer_table1_needs_llm_fallback():
    # Cité dans corr_matrix.py comme cas repli LLM vérifié -- confirme qu'aucun
    # des 3 parseurs déterministes ne le reconnaît (format non triangulaire/non
    # grille reconnu), donc extract_table_relations() doit passer par llm_fn.
    text = _read_fixture("Blackmer.2011")
    tables = {num: block for num, header, block in _split_tables(text)}
    block = tables[1]
    assert _parse_numbered(block) is None
    assert _parse_named_diagonal(block) is None
    assert _parse_named_grid(block) is None


def test_al_amouri_table6_needs_llm_fallback():
    text = _read_fixture("Al-Amouri.2025")
    tables = [block for num, header, block in _split_tables(text)
              if num == 6 and "correl" in header.lower()]
    assert len(tables) == 1
    block = tables[0]
    assert _parse_numbered(block) is None
    assert _parse_named_diagonal(block) is None
    assert _parse_named_grid(block) is None


def test_baric_table5_regression_gap():
    """Documente un manque connu (pas un échec de test) : le tableau de régression
    (Table 5, "Contribution of predictor variables...") n'est reconnu par aucun
    parseur déterministe -- ET son intitulé ne contient ni "correl" ni "regress",
    donc extract_table_relations() l'ignore avant même d'essayer un parseur (le
    filtre d'en-tête l'exclut en amont). Un futur parseur de tableaux de régression
    devra mettre à jour ce test -- signal volontaire du changement de comportement,
    pas une régression silencieuse.
    """
    text = _read_fixture("Baric.2024")
    tables = {num: (header, block) for num, header, block in _split_tables(text)}
    header5, block5 = tables[5]
    assert "correl" not in header5.lower()
    assert "regress" not in header5.lower()
    assert _parse_numbered(block5) is None
    assert _parse_named_diagonal(block5) is None
    assert _parse_named_grid(block5) is None


# ─── scan_keyword_candidates (expérimental, 24/08/2026) ────────────────────
# Extension de scan_statistical_candidates() à des marqueurs qualitatifs sans
# valeur chiffrée -- correlate/related/associated/mediated/moderated/positively/
# negatively. Risque de bruit assumé dès la conception (mots très fréquents dans
# ce corpus) ; ces tests fixent le comportement actuel de l'implémentation, pas
# un jugement sur son utilité en production -- voir tools/relations_variants.py
# (--keywords) pour la validation empirique.

def test_scan_keyword_candidates_finds_qualitative_relation_no_number():
    text = ("Body dissatisfaction was significantly related to disordered eating "
            "symptoms among the athletes surveyed in this study overall.")
    out = scan_keyword_candidates(text)
    assert len(out) == 1
    assert "related" in out[0]


def test_scan_keyword_candidates_matches_each_target_word():
    samples = {
        "correlate": "Perfectionism was found to correlate with drive for thinness across the sample of athletes.",
        "correlation": "A strong correlation between anxiety and restrictive eating was observed in this cohort overall.",
        "associated": "Coach pressure was positively associated with body dissatisfaction among the female gymnasts studied.",
        "mediated": "The effect of perfectionism on disordered eating was mediated by body dissatisfaction in this sample.",
        "moderated": "This relationship between anxiety and eating symptoms was moderated by athlete status in the cohort.",
        "positively": "Self-esteem was positively linked to overall wellbeing among the athletes surveyed in this cohort.",
        "negatively": "Sleep quality was negatively linked to disordered eating symptoms among the athletes in this cohort.",
    }
    for label, sentence in samples.items():
        assert scan_keyword_candidates(sentence) == [sentence], f"no match for {label!r}"


def test_scan_keyword_candidates_excludes_relative_false_positive():
    # 'relative'/'relatively' ne doivent pas matcher 'relat(ed|ionship|es|ing)'
    # -- un faux positif réel du corpus (ex. Mickelsson.2020, 'Relative weight loss').
    text = "Relative weight loss was measured at baseline and follow-up for every athlete enrolled in the cohort."
    assert scan_keyword_candidates(text) == []


def test_scan_keyword_candidates_skips_sentences_already_numeric():
    # Une phrase avec ET un mot-clé ET une valeur chiffrée appartient au scan
    # numérique (scan_statistical_candidates), jamais dupliquée ici.
    text = "Body dissatisfaction was positively correlated with disordered eating symptoms (r = .42, p < .001)."
    assert scan_keyword_candidates(text) == []
    assert scan_statistical_candidates(text) == [text]


def test_scan_keyword_candidates_ignores_short_fragments():
    assert scan_keyword_candidates("X was related to Y.") == []  # < 40 caractères


def test_scan_keyword_candidates_respects_max_items():
    sentence = "Body dissatisfaction was significantly related to disordered eating symptoms overall in this cohort. "
    text = sentence * 10
    assert len(scan_keyword_candidates(text, max_items=3)) == 3
