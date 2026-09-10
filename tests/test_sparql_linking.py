from ia_cad.common.linking.sparql_linking import (
    resolve_uri, VariableLinker, SportLinker,
    split_sport_names, split_variable_names, is_generic_multisport, apply_synonyms,
    aggregate_sport_results, classify_sport_field, _label,
)

_var = VariableLinker()
_sport = SportLinker()


def test_resolve_exact_preflabel():
    assert resolve_uri("anorexia") is not None
    assert resolve_uri("Swimming") is not None  # insensible à la casse


def test_resolve_miss_returns_none():
    assert resolve_uri("blood lactate concentration") is None
    assert resolve_uri("quidditch") is None


def test_resolve_contains_is_deterministic():
    # "coach pressure" n'est pas un prefLabel exact ; le repli CONTAINS doit
    # renvoyer toujours le même URI (label matchant le plus court, puis alpha).
    a = resolve_uri("coach pressure")
    b = resolve_uri("coach pressure")
    assert a is not None and a == b


def test_resolve_exact_ambiguous_is_deterministic():
    # 'weight control' normalise vers deux concepts distincts ; résolution stable.
    a = resolve_uri("weight control")
    b = resolve_uri("weight control")
    assert a is not None and a == b


def test_resolve_contains_multiword_still_works():
    # le repli borné aux mots doit garder 'coach pressure' -> concept contenant ces mots
    assert resolve_uri("coach pressure") is not None


def test_resolve_contains_respects_word_boundary():
    # aucun concept n'a 'art' comme mot isolé : le repli borné aux mots ne doit pas
    # matcher 'art' à l'intérieur de 'martial arts'.
    assert resolve_uri("art") is None


def test_var_anorexia():
    r = _var.classify("anorexia")
    assert r == {
        "CLASS": "DEAB", "subClass1": "Eating disorders",
        "subClass2": "Anorexia", "subClass3": None, "subClass4": None, "subClass5": None,
        "finalSubClass": "Anorexia",
    }


def test_var_anxiety():
    r = _var.classify("anxiety")
    assert r["CLASS"] == "Intrapersonal factor related to DEAB"
    assert r["subClass1"] == "Emotions"
    assert r["finalSubClass"] == "Anxiety"


def test_var_perfectionism():
    r = _var.classify("perfectionism")
    assert r["CLASS"] == "Intrapersonal factor related to DEAB"
    assert r["subClass1"] == "Personality"
    assert r["finalSubClass"] == "Perfectionism"


def test_var_depression():
    r = _var.classify("depression")
    assert r["CLASS"] == "Intrapersonal factor related to DEAB"
    assert r["subClass1"] == "Psychopathological symptoms"


def test_var_body_dissatisfaction():
    r = _var.classify("body dissatisfaction")
    assert r["CLASS"] == "Intrapersonal factor related to DEAB"
    assert r["subClass1"] == "Body image and self-esteem"


def test_var_miss_returns_none():
    assert _var.classify("blood lactate concentration") is None


def test_var_alcohol_use_two_level():
    r = _var.classify("alcohol use")
    assert r["CLASS"] == "Other behaviors"
    assert r["subClass1"] == "Alcohol use"
    assert r["subClass2"] is None
    assert r["finalSubClass"] == "Alcohol use"


def test_var_multiparent_deterministic():
    # 'depressed/sad' a deux skos:broader (Depression, Emotional states) ;
    # la remontée doit être stable (prefLabel le plus petit → Depression).
    a = _var.classify("depressed/sad")
    b = _var.classify("depressed/sad")
    assert a is not None and a == b
    assert a["subClass1"] == "Psychopathological symptoms"


def test_sport_soccer():
    assert _sport.classify("soccer") == {
        "sportPracticeType": "Team sport", "sportSubcategory": "Ball game"}


def test_sport_swimming():
    assert _sport.classify("swimming") == {
        "sportPracticeType": "Individual sport", "sportSubcategory": "Endurance"}


def test_sport_taekwondo():
    assert _sport.classify("taekwondo") == {
        "sportPracticeType": "Individual sport", "sportSubcategory": "Weight class"}


def test_sport_basketball():
    assert _sport.classify("basketball")["sportPracticeType"] == "Team sport"


def test_sport_dance():
    assert _sport.classify("dance") == {
        "sportPracticeType": "Individual sport", "sportSubcategory": "Aesthetic"}


def test_sport_miss_returns_none():
    assert _sport.classify("quidditch") is None


def test_split_sport_names():
    assert split_sport_names("Taekwondo; judo") == ["Taekwondo", "judo"]
    assert split_sport_names("Dance (e.g., ballet) and yoga") == ["Dance", "yoga"]
    assert split_sport_names("") == []


def test_split_variable_names():
    assert split_variable_names("anxiety\ndepression") == ["anxiety", "depression"]
    assert split_variable_names(None) == []


def test_is_generic_multisport():
    assert is_generic_multisport("Mixed sport") is True
    assert is_generic_multisport("soccer") is False


def test_apply_synonyms_is_passthrough():
    # sans entrée dans redirections.yaml, la valeur passe inchangée
    assert apply_synonyms("orthorexia", "variable") == "orthorexia"
    assert apply_synonyms(None, "sport") is None


def test_apply_synonyms_redirects_abox_convention():
    # variante orthographique redirigée vers le libellé canonique du thésaurus
    # (redirections.yaml, section variable) — apply_synonyms fait la redirection,
    # classify() doit ensuite résoudre le libellé canonique jusqu'au bout.
    assert apply_synonyms("emotional regulation", "variable") == "Emotion regulation"
    r = _var.classify("emotional regulation")
    assert r is not None and r["finalSubClass"] == "Emotion regulation"
    assert apply_synonyms("exercise addiction", "variable") == "Addiction to exercise"
    r = _var.classify("exercise addiction")
    assert r is not None and r["finalSubClass"] == "Addiction to exercise"


# ─── Résolution exacte casse comprise (labels homonymes à la casse près) ──────

def test_resolve_case_sensitive_disambiguates():
    # 'Weight Control' (catégorie, narrower non vide) et 'Weight control' (concept
    # feuille, branche distincte 'Controlled forms of motivation') coexistent :
    # la casse du nom annoté doit choisir le bon nœud.
    leaf = resolve_uri("Weight control")
    cat = resolve_uri("Weight Control")
    assert leaf is not None and cat is not None and leaf != cat
    assert _label(leaf) == "Weight control"
    assert _label(cat) == "Weight Control"


# ─── Étage 1c : label normalisé (tirets/ponctuation/espaces) ──────────────────

def test_resolve_normalized_hyphen():
    # 'Cross country' doit atteindre le concept 'Cross-country'.
    uri = resolve_uri("Cross country")
    assert uri is not None and _label(uri) == "Cross-country"


# ─── Étage 1d : sac de mots (ordre libre, pluriels, connecteurs) ──────────────

def test_resolve_token_word_order():
    # la hiérarchie nomme les danses 'Dance X', les articles écrivent 'X dance'
    uri = resolve_uri("Kathak dance")
    assert uri is not None and _label(uri) == "Dance Kathak"


def test_resolve_token_plural():
    uri = resolve_uri("Ultramarathons")
    assert uri is not None and _label(uri) == "Ultramarathon"


def test_resolve_token_plural_and_order():
    r = _var.classify("Pressures from teammates")
    assert r is not None and r["finalSubClass"] == "Pressure from teammates"
    r = _var.classify("Shape and weight concern")
    assert r is not None and r["finalSubClass"] == "Weight and shape concern"


def test_resolve_token_connectors_and_slash():
    # 'and' ignoré, '/' normalisé : 'Shame and guilt' -> 'Guilt/shame'
    uri = resolve_uri("Shame and guilt")
    assert uri is not None and _label(uri) == "Guilt/shame"


def test_resolve_exact_still_wins_over_token():
    # les matchs exacts (1a/1b) restent prioritaires sur le sac de mots
    assert _label(resolve_uri("Anxiety")) == "Anxiety"
    assert _label(resolve_uri("Gymnastics")) == "Gymnastics"


# ─── Agrégation multi-sport partagée (pipeline + éval) ────────────────────────

def test_aggregate_single_resolved():
    r = _sport.classify("swimming")
    assert aggregate_sport_results([r], 1) == (r["sportSubcategory"], r["sportPracticeType"])


def test_aggregate_divergent_is_multisport():
    rs = [_sport.classify("swimming"), _sport.classify("basketball")]
    assert aggregate_sport_results(rs, 2) == ("Multisport", "Mixed sport")


def test_aggregate_single_unresolved_is_none_not_multisport():
    # un mono-sport inconnu n'est PAS un multi-sport
    assert aggregate_sport_results([None], 1) == (None, None)


def test_aggregate_prose_unresolved_is_multisport():
    # plusieurs noms, aucun résolu (prose multi-sport) → convention GT
    assert aggregate_sport_results([None, None], 2) == ("Multisport", "Mixed sport")


def test_aggregate_convergent_category_is_still_multisport():
    # Régression eval_rangement (68.2% -> 78.5%) : 2+ sports nommés = Multisport
    # même quand ils tombent tous dans la même sous-catégorie (volleyball et
    # basketball sont tous deux 'Ball game') — sportSubcategory encode "un seul
    # sport dans le champ", pas "une famille de sports". sportPracticeType,
    # lui, garde bien le type partagé (Team sport) quand tous s'accordent.
    rs = [_sport.classify("volleyball"), _sport.classify("basketball")]
    assert aggregate_sport_results(rs, 2) == ("Multisport", "Team sport")


def test_classify_sport_field_generic():
    _, sub, typ = classify_sport_field(_sport, "Mixed sport")
    assert (sub, typ) == ("Multisport", "Mixed sport")


def test_classify_sport_field_full_before_split():
    # 'Kathak dance' contient un espace mais doit rester un seul sport
    names, sub, typ = classify_sport_field(_sport, "Kathak dance")
    assert names == ["Kathak dance"] and sub == "Aesthetic"


def test_classify_sport_field_unknown_single():
    names, sub, typ = classify_sport_field(_sport, "quidditch")
    assert names == ["quidditch"] and sub is None and typ is None
