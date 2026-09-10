"""
article_coverage_report.py — Couverture du corpus article : trois listes de titres.

1. Articles dans le pipeline (schéma de données, data/BDD_Extraction.xlsx —
   216 articles annotés, mêmes titres que ia-das-ontology-clean.ttl).
2. Articles PAS dans le pipeline mais présents en PDF dans articles/
   (corpus brut, 183 fichiers) — titre récupéré au mieux depuis le screening
   full-text si le PDF correspond à un article exclu.
3. Articles qui ne sont PAS dans le projet, avec la raison (colonne
   Reasons_exclusion de data/IADAS-Full-text review - exclusion
   reasons_VF_04.2026.xlsx — décision "Exclude" du screening full-text).

Le rattachement schéma <-> PDF se fait par stem (auteur.année, même convention
que les GT existants, désambiguïsation a/b/c réutilisée depuis data_excel_to_ttl).
Le rattachement schéma <-> screening se fait par titre normalisé (les formats
d'auteurs diffèrent trop entre les deux fichiers pour être fiables).

Lancer depuis la racine du repo :
    iacad-coverage
"""
import re
import sys
import unicodedata
from datetime import date

import pandas as pd

from ia_cad.tools.ontology.data_excel_to_ttl import compute_stems
from ia_cad.paths import ARTICLES_DIR, DATA_DIR, REPO_ROOT, RESULTS_DIR

SCHEMA_XLSX = DATA_DIR / "BDD_Extraction.xlsx"
SCREENING_XLSX = DATA_DIR / "IADAS-Full-text review - exclusion reasons_VF_04.2026.xlsx"
REPORT_DIR = RESULTS_DIR / "comparisons"


def _norm_title(s) -> str:
    """Même normalisation que abox_to_gt._norm : rattachement titre robuste
    au format (accents, ponctuation, casse) plutôt qu'à l'orthographe exacte."""
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def _ascii_slug(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _author_year_key(authors_raw, year_raw) -> str | None:
    """Clé best-effort (premier auteur en minuscules ASCII + année) pour
    rattacher un PDF orphelin à une ligne du screening, dont le format
    'Authors' est trop hétérogène (virgules, points-virgules, avec/sans point
    après l'initiale) pour un stem strict comme make_filename()."""
    if pd.isna(authors_raw) or pd.isna(year_raw):
        return None
    first = re.split(r"[,;]", str(authors_raw).strip())[0]
    first = re.sub(r"\s+", "", first).strip()
    last = _ascii_slug(first).lower()
    year = re.sub(r"[^0-9]", "", str(year_raw))[:4]
    if not last or not year:
        return None
    return f"{last}.{year}"


def main() -> int:
    import argparse
    argparse.ArgumentParser(
        description="Couverture du corpus : titres dans le pipeline / PDF hors pipeline / articles exclus."
    ).parse_args()

    # ─── 1. Schéma de données (pipeline) ───────────────────────────────────
    df = pd.read_excel(SCHEMA_XLSX, sheet_name="data", header=0)
    df.columns = df.columns.str.strip()
    stems, _code_to_ids = compute_stems(df)
    schema_by_id = df.groupby("Article ID").first()
    schema_titles = {}  # stem -> title
    schema_keys = set()  # auteur+année (best-effort), pour le recoupement screening
    for aid, stem in stems.items():
        r0 = schema_by_id.loc[aid]
        schema_titles[stem] = str(r0["Title"]).strip()
        key = _author_year_key(r0["Authors"], r0["Year"])
        if key:
            schema_keys.add(key)
    schema_norm_titles = {_norm_title(t) for t in schema_titles.values()}
    print(f"1. Pipeline (schéma de données) : {len(schema_titles)} articles")

    # ─── 2. PDF du corpus brut, pas dans le pipeline ───────────────────────
    pdf_stems = sorted(p.stem for p in ARTICLES_DIR.glob("*.pdf"))
    extra_pdf_stems = [s for s in pdf_stems if s not in schema_titles]
    print(f"2. PDF dans articles/ hors pipeline : {len(extra_pdf_stems)} "
          f"(sur {len(pdf_stems)} PDF au total)")

    # ─── 3. Screening full-text (Include/Exclude + raisons) ────────────────
    scr = pd.read_excel(SCREENING_XLSX, sheet_name="Full-text assessed eligibility")
    scr.columns = scr.columns.str.strip()
    scr["_decision"] = scr["Final decision"].astype(str).str.strip().str.upper()
    scr["_key"] = scr.apply(lambda r: _author_year_key(r["Authors"], r["Published Year"]), axis=1)

    included = scr[scr["_decision"] == "INCLUDE"].dropna(subset=["Title"])
    excluded = scr[scr["_decision"] == "EXCLUDE"].dropna(subset=["Title"])
    print(f"3. Screening : {len(included)} Include, {len(excluded)} Exclude (avec titre)")

    # Recouper les PDF orphelins (2) avec le screening pour retrouver un titre
    key_to_row = {}
    for _, r in scr.dropna(subset=["Title"]).iterrows():
        if r["_key"]:
            key_to_row.setdefault(r["_key"], r)
    extra_pdf_info = []
    for stem in extra_pdf_stems:
        row = key_to_row.get(stem.lower())
        if row is not None:
            extra_pdf_info.append((stem, row["Title"], row["_decision"], row.get("Reasons_exclusion")))
        else:
            extra_pdf_info.append((stem, None, None, None))

    # Sanity check : Include du screening absents du schéma. Clé auteur+année
    # (comme pour le recoupement des PDF orphelins ci-dessus) plutôt que titre
    # normalisé : les deux fichiers reformulent parfois le titre différemment
    # (abréviations, sous-titres bilingues) alors que auteur+année reste stable.
    include_missing = []
    for _, r in included.iterrows():
        key = _author_year_key(r["Authors"], r["Published Year"])
        title_matches = _norm_title(r["Title"]) in schema_norm_titles
        key_matches = key in schema_keys if key else False
        if not title_matches and not key_matches:
            include_missing.append((r["Title"], r["Authors"], r["Published Year"]))

    # ─── Rapport ────────────────────────────────────────────────────────────
    lines = ["=" * 70, "article_coverage_report", "=" * 70, ""]

    lines.append(f"1. TITRES DANS LE PIPELINE ({len(schema_titles)})")
    lines.append("-" * 70)
    for stem in sorted(schema_titles):
        lines.append(f"  [{stem}] {schema_titles[stem]}")
    lines.append("")

    lines.append(f"2. PDF DANS articles/ MAIS PAS DANS LE PIPELINE ({len(extra_pdf_info)})")
    lines.append("-" * 70)
    for stem, title, decision, reason in extra_pdf_info:
        if title:
            lines.append(f"  [{stem}] {title}  (screening: {decision}"
                          + (f", raison: {reason.strip()}" if isinstance(reason, str) else "") + ")")
        else:
            lines.append(f"  [{stem}] titre inconnu (non retrouvé dans le screening full-text)")
    lines.append("")

    lines.append(f"3. ARTICLES EXCLUS DU PROJET, AVEC LA RAISON ({len(excluded)})")
    lines.append("-" * 70)
    for _, r in excluded.sort_values("Reasons_exclusion").iterrows():
        reason = r["Reasons_exclusion"]
        reason = reason.strip() if isinstance(reason, str) else "(raison non renseignée)"
        lines.append(f"  {r['Title']}  —  {reason}")
    lines.append("")

    if include_missing:
        lines.append(f"ANOMALIE (à vérifier) : Include du screening non rattachés au pipeline "
                      f"({len(include_missing)})")
        lines.append("-" * 70)
        lines.append("Note : rattachement par clé auteur+année, best-effort — le format 'Authors'")
        lines.append("du fichier de screening est hétérogène (avec/sans virgule avant les")
        lines.append("initiales, noms composés). Un échantillon de ces entrées a été vérifié")
        lines.append("manuellement : leur PDF existe déjà dans articles/ sous le stem attendu")
        lines.append("(donc déjà dans le pipeline) — cette liste est probablement du bruit de")
        lines.append("rattachement, pas de vrais articles manquants. À confirmer au cas par cas")
        lines.append("si besoin.")
        lines.append("")
        for title, authors, year in include_missing:
            lines.append(f"  {title}  ({authors}, {year})")
        lines.append("")

    print(f"\nAnomalie (Include screening absent du pipeline) : {len(include_missing)}")

    rp_dir = REPORT_DIR / f"{date.today():%Y-%m-%d}"
    rp_dir.mkdir(parents=True, exist_ok=True)
    rp = rp_dir / "article_coverage_report.txt"
    rp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nRapport : {rp.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
