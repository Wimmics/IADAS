from ia_cad.tools.evaluation.compare_results import _compare_relations

_GT = [{
    "V1": {"triplets": [
        {"predicate": "iadas:V1", "object": "Body Image"},
        {"predicate": "iadas:measureV1", "object": "BSQ"},
    ]},
    "V2": {"triplets": [{"predicate": "iadas:V2", "object": "Exercise Frequency"}]},
    "stats": [],
}]

_RES = [{
    "V1": {"triplets": [
        {"predicate": "iadas:V1", "object": "Body Image"},
        {"predicate": "iadas:measureV1", "object": "WRONG_MEASURE"},
    ]},
    "V2": {"triplets": [{"predicate": "iadas:V2", "object": "Exercise Frequency"}]},
    "stats": [],
}]


def test_compare_relations_reports_got_expected_in_correct_order():
    # Régression : _compare_relations() appelait _compare_section(gt, res) au lieu de
    # (res, gt), inversant "got"/"expected" pour le détail par champ d'une relation appariée.
    _, _, pair_reports = _compare_relations(_RES, _GT)
    fields = {pred: (status, rv, gv) for pred, status, rv, gv in pair_reports[0]["fields"]}
    status, rv, gv = fields["measureV1"]
    assert status == "failure_wrong"  # valeur produite mais fausse (taxonomie à 4 statuts)
    assert rv == "wrong_measure"       # "got" = valeur du résultat
    assert gv == "bsq"                 # "expected" = valeur du GT (ordre non inversé)
