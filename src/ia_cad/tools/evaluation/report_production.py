"""
report_production.py — Contrôle qualité de la base extraite SANS ground truth
(réunion 6/7 : « nouveau rapport pour tester la base extraite »).

Pour les articles de production (hors corpus annoté), aucun GT n'existe : on ne
peut pas comparer, mais on peut CONTRÔLER. Ce rapport vérifie :
  - complétude : blocs présents, nb de triplets extraits, objets null ;
  - conformité au thésaurus : sportLevel dans le vocabulaire canonique ;
  - résolvabilité ontologique : sportName et variables V1/V2 résolus par le
    l'entity linking SPARQL (un nom non résolu = triplet non rattachable au graphe).

Audite results/Type[/production] ; rapport écrit dans
results/comparisons/.

Usage :
    iacad-report
    iacad-report --dir results/Type
                                                             # auditer un autre dossier (ex. test)
    iacad-report --no-file
"""
import argparse
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import yaml

from ia_cad.common.corpus import PRODUCTION_SUBDIR
from ia_cad.common.linking.sparql_linking import (
    SportLinker, VariableLinker, resolve_uri,
    split_sport_names, split_variable_names, is_generic_multisport,
)
from ia_cad.paths import REPO_ROOT, RESULTS_DIR, VOCABS_DIR

_RESULTATS   = RESULTS_DIR / "Type"
_COMPARISONS = RESULTS_DIR / "comparisons"
_PATTERN     = "*_type.json"

_sport = SportLinker()
_var = VariableLinker()


def _sport_levels() -> set[str]:
    v = yaml.safe_load((VOCABS_DIR / "ontology_sport.yaml").read_text(encoding="utf-8"))
    return set(v.get("sportLevel", {}).get("canonical", []))


# ─── Vérifications communes (indépendantes du format de fichier) ──────────────

def check_sport_name(name: str | None, stats: dict) -> None:
    """Résout le(s) sport(s) d'un champ sportName libre via l'entity linking."""
    if not name:
        stats["sport_absent"] += 1
        return
    if is_generic_multisport(name):
        stats["sport_ok"] += 1
        return
    parts = split_sport_names(name)
    resolved = sum(1 for s in parts if _sport.classify(s) is not None)
    if parts and resolved == len(parts):
        stats["sport_ok"] += 1
    elif resolved:
        stats["sport_partiel"] += 1
    else:
        stats["sport_non_resolu"] += 1
        stats["_sports_nr"][name[:60]] += 1


def check_variable(name: str | None, stats: dict) -> None:
    if not name:
        return
    stats["var_total"] += 1
    if len(split_variable_names(name)) > 1:
        stats["var_multiple"] += 1  # champ multi-variables → catégorie 'Multiple'
        return
    if resolve_uri(name) is not None:
        stats["var_ok"] += 1
    else:
        stats["var_non_resolue"] += 1
        stats["_vars_nr"][name[:60]] += 1


# ─── Lecteurs par pipeline (formats distincts, jamais mélangés) ────────────────

def audit_type_file(path: Path, stats: dict, levels: set[str]) -> None:
    """Format TYPE (JSON-LD predicate/object) : Sport[], Relations[{V1,V2,stats}]."""
    d = json.loads(path.read_text(encoding="utf-8"))
    stats["articles"] += 1

    sport_block = d.get("Sport") or []
    if sport_block and isinstance(sport_block[0], list):  # blocs par sport
        sport_block = [t for bloc in sport_block for t in bloc]
    by_pred = {}
    for t in sport_block:
        by_pred.setdefault(t.get("predicate", "").replace("iadas:", ""), t.get("object"))
    check_sport_name(by_pred.get("sportName"), stats)
    lvl = by_pred.get("sportLevel")
    if lvl is not None and str(lvl) not in levels:
        stats["level_hors_vocab"] += 1
        stats["_levels_hv"][str(lvl)[:40]] += 1
    stats["null_objects"] += sum(1 for t in sport_block if t.get("object") is None)

    rels = d.get("Relations") or []
    stats["relations"] += len(rels)
    if not rels:
        stats["articles_sans_relation"] += 1
    for rel in rels:
        for which in ("V1", "V2"):
            triplets = (rel.get(which) or {}).get("triplets") or []
            name = next((t.get("object") for t in triplets
                         if t.get("predicate") == f"iadas:{which}"), None)
            check_variable(name, stats)
            stats["null_objects"] += sum(1 for t in triplets if t.get("object") is None)
        if not rel.get("stats"):
            stats["relations_sans_stats"] += 1


# ─── Rapport ──────────────────────────────────────────────────────────────────

def _new_stats() -> dict:
    s = Counter()
    s["_sports_nr"] = Counter()
    s["_vars_nr"] = Counter()
    s["_levels_hv"] = Counter()
    return s


def _pct(n: int, d: int) -> str:
    return f"{100 * n / d:5.1f}%" if d else "  n/a"


def report_lines(folder: Path, stats: dict) -> list[str]:
    a, r = stats["articles"], stats["relations"]
    vt = stats["var_total"]
    L = [
        "=" * 70,
        f"RAPPORT PRODUCTION — pipeline TYPE — {date.today()}",
        f"Dossier audité : {folder}",
        "=" * 70,
        f"Articles audités             : {a}",
        f"Relations (triplets) totales : {r}" + (f"  ({r / a:.1f}/article)" if a else ""),
        f"Articles sans relation       : {stats['articles_sans_relation']}",
        f"Relations sans stats         : {stats['relations_sans_stats']}",
        f"Objets null (predicates vides): {stats['null_objects']}",
        "-" * 70,
        "Conformité thésaurus / entity linking (sans GT) :",
        f"  sport résolu               : {stats['sport_ok']:4d}  ({_pct(stats['sport_ok'], a)})",
        f"  sport partiellement résolu : {stats['sport_partiel']:4d}",
        f"  sport non résolu           : {stats['sport_non_resolu']:4d}",
        f"  sport absent               : {stats['sport_absent']:4d}",
        f"  sportLevel hors vocabulaire: {stats['level_hors_vocab']:4d}",
        f"  variables résolues         : {stats['var_ok']:4d} / {vt}  ({_pct(stats['var_ok'], vt)})",
        f"  variables 'Multiple'       : {stats['var_multiple']:4d}",
        f"  variables non résolues     : {stats['var_non_resolue']:4d}  ({_pct(stats['var_non_resolue'], vt)})",
    ]
    if stats["_levels_hv"]:
        L += ["", "sportLevel hors vocabulaire :"]
        L += [f"   [{n:3}] {v}" for v, n in stats["_levels_hv"].most_common()]
    if stats["_sports_nr"]:
        L += ["", f"Sports non résolus les plus fréquents ({len(stats['_sports_nr'])} distincts) :"]
        L += [f"   [{n:3}] {v}" for v, n in stats["_sports_nr"].most_common(20)]
    if stats["_vars_nr"]:
        L += ["", f"Variables non résolues les plus fréquentes ({len(stats['_vars_nr'])} distinctes) :"]
        L += [f"   [{n:3}] {v}" for v, n in stats["_vars_nr"].most_common(30)]
    return L


def audit_production(folder: Path | None, write_file: bool) -> None:
    # Défaut : les fichiers production de TOUS les dossiers datés.
    if folder is None:
        folder = _RESULTATS
        files = sorted(folder.glob(f"*/{PRODUCTION_SUBDIR}/{_PATTERN}")) if folder.is_dir() else []
    else:
        files = sorted(folder.glob(_PATTERN)) if folder.is_dir() else []
    if not files:
        print(f"aucun fichier dans {folder} — rien à auditer.")
        return

    levels = _sport_levels()
    stats = _new_stats()
    for f in files:
        try:
            audit_type_file(f, stats, levels)
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            stats["fichiers_illisibles"] += 1
            print(f"  [warn] {f.name}: {e}")

    lines = report_lines(folder, stats)
    print("\n".join(lines))
    if write_file:
        out_dir = _COMPARISONS / f"{date.today():%Y-%m-%d}"
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / "report_production_type.txt"
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"\nRapport écrit : {out.relative_to(REPO_ROOT)}\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="Contrôle qualité de la base extraite (sans GT).")
    ap.add_argument("--dir", type=Path, default=None,
                    help="Dossier à auditer (défaut : results/Type/…/production/). "
                         "Utile pour auditer aussi les résultats de test.")
    ap.add_argument("--no-file", action="store_true", help="Pas de rapport écrit")
    args = ap.parse_args()

    audit_production(args.dir, not args.no_file)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
