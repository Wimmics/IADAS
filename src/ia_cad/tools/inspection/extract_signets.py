"""
extract_signets.py — Inspecte les signets (bookmarks) bruts des PDF de articles/.

Usage (depuis la racine du repo) :
    python -m ia_cad.tools.inspection.extract_signets articles/Baric.2024.pdf   # détail d'un PDF
    python -m ia_cad.tools.inspection.extract_signets --summary                 # bilan sur tout articles/

Le découpage effectif en sections (signets + police + regex, avec repli)
est fait par tools/split_articles.py --summary — ce script-ci n'affiche que
la table des matières brute du PDF, avant tout mapping vers une section.
"""
import argparse
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from ia_cad.common.pdf_signets import get_signets
from ia_cad.paths import ARTICLES_DIR

ARTICLES = ARTICLES_DIR


def show_detail(pdf: Path) -> None:
    print(f"\n{'=' * 60}\n{pdf.name}\n{'=' * 60}")
    signets = get_signets(pdf)
    if not signets:
        print("  (aucun signet)")
        return
    for level, title, page in signets:
        print(f"  {'  ' * (level - 1)}[{level}] p.{page:<3} {title[:70]}")


def show_summary() -> None:
    pdfs = sorted(ARTICLES.glob("*.pdf"))
    n_with = sum(1 for pdf in pdfs if get_signets(pdf))
    print(f"{len(pdfs)} PDF dans {ARTICLES.name}/")
    print(f"  avec signets    : {n_with}")
    print(f"  sans signets    : {len(pdfs) - n_with}  (repli police/regex dans split_articles.py)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("pdfs", nargs="*", help="PDF à inspecter")
    ap.add_argument("--summary", action="store_true", help="bilan sur tout articles/")
    args = ap.parse_args()

    if args.summary:
        show_summary()
        return
    if not args.pdfs:
        ap.error("donner des PDF, ou --summary")
    for p in args.pdfs:
        show_detail(Path(p))


if __name__ == "__main__":
    main()
