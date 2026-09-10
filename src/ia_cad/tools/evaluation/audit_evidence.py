"""
audit_evidence.py — Agrège le signal _evidence_verified (déjà calculé par
extract.py::_check_evidence, jamais filtré ni lu par aucun outil jusqu'ici)
sur un lot d'extractions TYPE, pour prioriser où une relance ou une révision
manuelle serait la plus utile — sans toucher au comportement d'extraction.

_check_evidence() vérifie par similarité floue (rapidfuzz) que la citation-preuve
fournie par le LLM pour chaque relation existe bien dans le texte source, mais ne
filtre RIEN volontairement (protection du rappel) : le résultat dort dans
_evidence_verified sans être consulté. Cet outil le rend enfin exploitable.

Usage (depuis la racine du repo) :
    iacad-audit-evidence
    iacad-audit-evidence --dir results/Type/2026-08-18
    iacad-audit-evidence --show-mismatches
    iacad-audit-evidence --no-file
"""
import argparse
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from ia_cad.paths import REPO_ROOT, RESULTS_DIR

_RESULTATS   = RESULTS_DIR / "Type"
_COMPARISONS = RESULTS_DIR / "comparisons"
_DATE_DIR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def collect_latest(folder: Path) -> dict[str, Path]:
    """{stem: chemin du fichier le plus récent} sur tous les dossiers datés."""
    best: dict[str, tuple[str, Path]] = {}
    for f in folder.glob("*/*_type.json"):
        if not _DATE_DIR_RE.match(f.parent.name):
            continue
        stem = f.name[: -len("_type.json")]
        d = f.parent.name
        if stem not in best or d > best[stem][0]:
            best[stem] = (d, f)
    return {stem: path for stem, (_, path) in best.items()}


def _var_name(triplets: list[dict], which: str) -> str:
    return next((t.get("object") for t in triplets if t.get("predicate") == f"iadas:{which}"), "?")


def compute_audit(folder: Path | None) -> dict:
    """Calcule l'audit _evidence_verified sur un lot de résultats — aucune sortie
    (ni print ni fichier), pour être appelable aussi bien par la CLI (audit(), qui
    formate et affiche) que par le webapp (api_evidence_audit(), qui renvoie du JSON).

    Retourne {"n_articles", "counts": {verified,unverified,no_evidence},
    "per_article": [{stem,verified,unverified,no_evidence}, ...],
    "flagged": [{stem,pair,evidence}, ...]} — flagged ne contient que les
    citations NON vérifiées (le cas qui justifie une relecture)."""
    if folder is None:
        files = collect_latest(_RESULTATS)
    else:
        files = {f.name[: -len("_type.json")]: f for f in folder.glob("*_type.json")}

    counts: Counter = Counter()
    per_article: list[dict] = []
    flagged: list[dict] = []

    for stem, path in sorted(files.items()):
        d = json.loads(path.read_text(encoding="utf-8"))
        ok = ko = none = 0
        for rel in d.get("Relations", []):
            v = rel.get("_evidence_verified")
            if v is True:
                ok += 1
                counts["verified"] += 1
            elif v is False:
                ko += 1
                counts["unverified"] += 1
                v1 = _var_name(rel.get("V1", {}).get("triplets", []), "V1")
                v2 = _var_name(rel.get("V2", {}).get("triplets", []), "V2")
                flagged.append({"stem": stem, "pair": f"{v1} -- {v2}", "evidence": rel.get("_evidence") or ""})
            else:
                none += 1
                counts["no_evidence"] += 1
        per_article.append({"stem": stem, "verified": ok, "unverified": ko, "no_evidence": none})

    return {
        "n_articles": len(files),
        "counts": dict(counts),
        "per_article": per_article,
        "flagged": flagged,
    }


def audit(folder: Path | None, show_mismatches: bool, write_file: bool) -> None:
    result = compute_audit(folder)
    if not result["n_articles"]:
        print("Aucun fichier _type.json trouvé — rien à auditer.")
        return

    counts = result["counts"]
    per_article: list[tuple[str, int, int, int]] = [
        (a["stem"], a["verified"], a["unverified"], a["no_evidence"]) for a in result["per_article"]
    ]
    flagged: list[tuple[str, str, str]] = [(f["stem"], f["pair"], f["evidence"]) for f in result["flagged"]]

    total_checked = counts.get("verified", 0) + counts.get("unverified", 0)
    rate = counts.get("verified", 0) / total_checked * 100 if total_checked else 0.0

    lines = [
        "=" * 70,
        f"AUDIT _evidence_verified — {date.today()}",
        "=" * 70,
        f"Articles audités                             : {result['n_articles']}",
        f"Relations avec citation-preuve                : {total_checked}",
        f"  correspondance confirmée (fuzzy >= seuil)   : {counts.get('verified', 0):4d}  ({rate:5.1f}%)",
        f"  correspondance ABSENTE du texte source      : {counts.get('unverified', 0):4d}  ({100 - rate:5.1f}%)" if total_checked else f"  correspondance ABSENTE du texte source      : {counts.get('unverified', 0):4d}",
        f"Relations sans citation (rien à vérifier)     : {counts.get('no_evidence', 0):4d}",
        "-" * 70,
        "Articles avec le plus de citations NON vérifiées :",
    ]
    per_article.sort(key=lambda t: -t[2])
    shown = [t for t in per_article if t[2] > 0][:20]
    if shown:
        for stem, ok, ko, none in shown:
            lines.append(f"  {stem:<28} vérifiées={ok:3d}  NON vérifiées={ko:3d}  sans citation={none:3d}")
    else:
        lines.append("  (aucune)")

    detail = []
    if flagged:
        detail.append("")
        detail.append(f"Détail — {len(flagged)} relation(s) à citation NON retrouvée dans le texte :")
        detail.append("")
        for stem, pair, ev in flagged:
            detail.append(f"[{stem}] {pair}")
            detail.append(f"    citation : {ev!r}")

    print("\n".join(lines + (detail if show_mismatches else [])))

    if write_file:
        out_dir = _COMPARISONS / f"{date.today():%Y-%m-%d}"
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / "evidence_audit.txt"
        out.write_text("\n".join(lines + detail) + "\n", encoding="utf-8")
        print(f"\nRapport écrit : {out.relative_to(REPO_ROOT)}")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Audit du signal _evidence_verified (calculé mais jamais lu jusqu'ici)."
    )
    ap.add_argument("--dir", type=Path, default=None,
                     help="Dossier daté à auditer (défaut : fichier le plus récent par article)")
    ap.add_argument("--show-mismatches", action="store_true",
                     help="Afficher aussi le détail des citations non vérifiées")
    ap.add_argument("--no-file", action="store_true", help="Ne pas écrire de rapport")
    args = ap.parse_args()
    audit(args.dir, args.show_mismatches, not args.no_file)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
