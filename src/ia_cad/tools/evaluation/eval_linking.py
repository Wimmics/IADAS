"""
Évalue l'entity linking (variable + sport) contre le ground truth Type.

Pour chaque article des GT Type (ground_truth/*.json, dérivés de l'ABox par
abox_to_gt.py — la référence), on prend les NOMS annotés par l'humain
(variables V1/V2, noms de sport), on les passe dans l'entity linking (comme le
pipeline : apply_synonyms → classify → mapping/agrégation), et on compare les
chaînes ontologiques produites à celles du GT.

Ce n'est PAS circulaire : noms et classifications viennent de l'annotation
humaine, pas d'un run antérieur de l'entity linking.

Variable : compare hasCategory / subClass1..4 / finalClass.
Sport    : compare sportSubcategory / sportPracticeType (agrégés en multi-sport).

Lancer (le package est installé, `pip install -e .`) :
    iacad-eval-linking
    iacad-eval-linking --show-mismatches
    iacad-eval-linking --article Abras.2022 --show-mismatches
    iacad-eval-linking --no-file      (pas de rapport écrit)

Rapport écrit dans results/comparisons/<date>/eval_linking.txt (sauf --no-file).
Le fichier contient TOUJOURS tous les cas d'erreur (variables + sports).
"""

import argparse
import json
import sys
from datetime import date

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from ia_cad.common.linking.sparql_linking import (  # entity linking SPARQL (rdflib in-memory), comme le pipeline
    VariableLinker, SportLinker, apply_synonyms,
    classify_sport_field, split_variable_names,
)
from ia_cad.common.corpus import iter_gt  # GT répartis train/test
from ia_cad.paths import GROUND_TRUTH_DIR, REPO_ROOT, RESULTS_DIR

# GT Type dérivé du graphe de connaissances par SPARQL (abox_to_gt.py) — la référence.
_GT_DIR = GROUND_TRUTH_DIR
OUT_DIR = RESULTS_DIR / "comparisons"

# Prédicats de la chaîne ontologique produits par l'entity linking.
_CHAIN_PREDS = (
    "iadas:hasCategory",
    "iadas:subClass1",
    "iadas:subClass2",
    "iadas:subClass3",
    "iadas:subClass4",
    "iadas:finalClass",
)


def _norm(v) -> str:
    return str(v).strip().lower()


# ──────────────────────────────────────────────────────────────────────────────
# Variables
# ──────────────────────────────────────────────────────────────────────────────

def _gt_var_chain(triplets: list[dict]) -> dict:
    return {
        t["predicate"]: t["object"]
        for t in triplets
        if t.get("_source") == "classifier" and t["predicate"] in _CHAIN_PREDS
    }


def _var_name(triplets: list[dict], which: str) -> str | None:
    target = f"iadas:{which}"
    for t in triplets:
        if t["predicate"] == target:
            return t.get("object")
    return None


def _pred_var_chain(clf: VariableLinker, name: str | None) -> dict:
    """Reproduit _classify_variable() du pipeline : mapping entity linking → prédicats."""
    if not name:
        return {}
    # Champ regroupant plusieurs variables → catégorie 'Multiple' (sans sous-classe).
    if len(split_variable_names(name)) > 1:
        return {"iadas:hasCategory": "Multiple"}
    canonical = apply_synonyms(name, "variable") or name
    res = clf.classify(canonical)
    if not res:
        return {}
    chain = {}
    for key in ("subClass1", "subClass2", "subClass3", "subClass4"):
        if res.get(key):
            chain[f"iadas:{key}"] = res[key]
    if res.get("finalSubClass"):
        chain["iadas:finalClass"] = res["finalSubClass"]
    if res.get("CLASS"):
        chain["iadas:hasCategory"] = res["CLASS"]
    return chain


def _chain_equal(gt: dict, pred: dict) -> bool:
    if set(gt) != set(pred):
        return False
    return all(_norm(gt[k]) == _norm(pred[k]) for k in gt)


def eval_variables(files, clf: VariableLinker):
    total = exact = cat_ok = final_ok = miss = no_gt = 0
    mismatches = []
    for f in files:
        j = json.loads(f.read_text(encoding="utf-8"))
        for rel in j.get("Relations", []):
            for which in ("V1", "V2"):
                triplets = (rel.get(which) or {}).get("triplets") or []
                gt = _gt_var_chain(triplets)
                if not gt:
                    no_gt += 1
                    continue
                total += 1
                name = _var_name(triplets, which)
                pred = _pred_var_chain(clf, name)
                if not pred:
                    miss += 1
                if pred.get("iadas:hasCategory") and \
                        _norm(pred["iadas:hasCategory"]) == _norm(gt.get("iadas:hasCategory", "\0")):
                    cat_ok += 1
                if pred.get("iadas:finalClass") and \
                        _norm(pred["iadas:finalClass"]) == _norm(gt.get("iadas:finalClass", "\0")):
                    final_ok += 1
                if _chain_equal(gt, pred):
                    exact += 1
                else:
                    mismatches.append((f.stem, name, gt, pred))

    def pct(n):
        return f"{100 * n / total:5.1f}%" if total else "  n/a"

    summary = [
        "#" * 70,
        "VARIABLES — VariableLinker vs GT Type",
        "#" * 70,
        f"Variables classées (GT)      : {total}",
        f"Variables sans classif. GT   : {no_gt}  (ignorées)",
        "-" * 70,
        f"Chaîne complète identique    : {exact:4d}  ({pct(exact)})",
        f"hasCategory (CLASS) correct  : {cat_ok:4d}  ({pct(cat_ok)})",
        f"finalClass correct           : {final_ok:4d}  ({pct(final_ok)})",
        f"Non trouvées (→ None)        : {miss:4d}  ({pct(miss)})",
    ]
    detail = []
    if mismatches:
        detail.append("")
        detail.append(f"VARIABLES — {len(mismatches)} cas d'erreur (chaîne différente ou non trouvée) :")
        detail.append("")
        for stem, name, gt, pred in mismatches:
            detail.append(f"[{stem}] V {name!r}")
            detail.append(f"    GT   : {gt}")
            detail.append(f"    pred : {pred or '∅ (non trouvée)'}")
    return summary, detail


# ──────────────────────────────────────────────────────────────────────────────
# Sports
# ──────────────────────────────────────────────────────────────────────────────

def _gt_sport(sport_block: list[dict]) -> tuple[str | None, dict]:
    """Retourne (nom(s) de sport, {sportSubcategory, sportPracticeType}) du GT."""
    names, gt = [], {}
    for t in sport_block:
        p = t["predicate"]
        if p == "iadas:sportName":
            names.append(t["object"])
        elif p in ("iadas:sportSubcategory", "iadas:sportPracticeType"):
            gt[p] = t["object"]
    name = ", ".join(n for n in names if n) if names else None
    return name, gt


def _pred_sport(clf: SportLinker, name: str | None) -> dict:
    """Agrégation multi-sport partagée avec le pipeline (classify_sport_field).
    Retourne {sportSubcategory, sportPracticeType} ou {}."""
    _, subcat, ptype = classify_sport_field(clf, name)
    out = {}
    if subcat is not None:
        out["iadas:sportSubcategory"] = subcat
    if ptype is not None:
        out["iadas:sportPracticeType"] = ptype
    return out


def eval_sports(files, clf: SportLinker):
    total = exact = sub_ok = type_ok = miss = no_input = 0
    mismatches = []
    for f in files:
        j = json.loads(f.read_text(encoding="utf-8"))
        name, gt = _gt_sport(j.get("Sport") or [])
        if not gt:
            continue
        if not name:
            no_input += 1
            continue
        total += 1
        pred = _pred_sport(clf, name)
        if not pred:
            miss += 1
        gt_sub, gt_type = gt.get("iadas:sportSubcategory"), gt.get("iadas:sportPracticeType")
        pr_sub, pr_type = pred.get("iadas:sportSubcategory"), pred.get("iadas:sportPracticeType")
        sub_match = gt_sub is not None and pr_sub is not None and _norm(pr_sub) == _norm(gt_sub)
        type_match = gt_type is not None and pr_type is not None and _norm(pr_type) == _norm(gt_type)
        if sub_match:
            sub_ok += 1
        if type_match:
            type_ok += 1
        if sub_match and type_match:
            exact += 1
        else:
            mismatches.append((f.stem, name, gt, pred))

    def pct(n):
        return f"{100 * n / total:5.1f}%" if total else "  n/a"

    summary = [
        "#" * 70,
        "SPORTS — SportLinker vs GT Type",
        "#" * 70,
        f"Articles avec sport (GT)     : {total}",
        f"Articles sans sportName (GT) : {no_input}  (ignorés)",
        "-" * 70,
        f"subcategory + type corrects  : {exact:4d}  ({pct(exact)})",
        f"sportSubcategory correct     : {sub_ok:4d}  ({pct(sub_ok)})",
        f"sportPracticeType correct    : {type_ok:4d}  ({pct(type_ok)})",
        f"Non trouvés (→ None)         : {miss:4d}  ({pct(miss)})",
    ]
    detail = []
    if mismatches:
        detail.append("")
        detail.append(f"SPORTS — {len(mismatches)} cas d'erreur :")
        detail.append("")
        for stem, name, gt, pred in mismatches:
            detail.append(f"[{stem}] S {name!r}")
            detail.append(f"    GT   : {gt}")
            detail.append(f"    pred : {pred or '∅ (non trouvé)'}")
    return summary, detail


# ──────────────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Évalue VariableLinker + SportLinker vs GT Type.")
    ap.add_argument("--article", help="Restreindre à un stem (ex: Abras.2022)")
    ap.add_argument("--show-mismatches", action="store_true",
                    help="Afficher aussi tous les cas d'erreur en console")
    ap.add_argument("--no-file", action="store_true",
                    help="Ne pas écrire de rapport dans results/comparisons/")
    args = ap.parse_args()

    gt_dir = _GT_DIR
    files = iter_gt(gt_dir)
    if not files:
        print(f"Aucun GT Type dans {gt_dir} — générer d'abord (abox_to_gt.py).")
        return 1
    if args.article:
        stem = args.article.removesuffix(".json")
        files = [f for f in files if f.stem == stem]
        if not files:
            print(f"Aucun GT Type pour {stem!r} dans {gt_dir}")
            return 1

    var_clf, sport_clf = VariableLinker(), SportLinker()
    var_sum, var_det = eval_variables(files, var_clf)
    sport_sum, sport_det = eval_sports(files, sport_clf)

    header = [
        "=" * 70,
        f"Évaluation des rangements vs GT Type  ({len(files)} article(s))",
        "=" * 70,
        "",
    ]
    summary = header + var_sum + [""] + sport_sum + ["", "=" * 70]
    detail = var_det + sport_det

    # Console : résumé toujours ; détail seulement si --show-mismatches.
    print("\n".join(summary + (detail if args.show_mismatches else [])))

    # Fichier : résumé + TOUS les cas d'erreur (variables + sports).
    if not args.no_file:
        out_dir = OUT_DIR / f"{date.today():%Y-%m-%d}"
        out_dir.mkdir(parents=True, exist_ok=True)
        suffix = f"_{args.article}" if args.article else ""
        out_path = out_dir / f"eval_linking{suffix}.txt"
        out_path.write_text("\n".join(summary + detail) + "\n", encoding="utf-8")
        print(f"\nRapport écrit : {out_path.relative_to(REPO_ROOT)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
