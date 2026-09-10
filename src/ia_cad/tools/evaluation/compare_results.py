"""
compare_results.py — Compare results/Type/{date}/{stem}_type.json avec le
ground truth ground_truth/{stem}.json (dérivé de l'ABox par abox_to_gt.py
— la référence).

Usage :
  iacad-compare                        # article le plus récent
  iacad-compare --article Abras.2022   # un seul article
  iacad-compare --all-dates            # toutes les dates disponibles
  iacad-compare --summary              # agrégats uniquement, pas de détail
"""
import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date as _date
from pathlib import Path

from ia_cad.paths import ARTICLES_SECTIONS_DIR, GROUND_TRUTH_DIR, RESULTS_DIR
from ia_cad.common.corpus import find_gt
from ia_cad.extraction.core.corr_matrix import _split_tables

_RESULTATS_TYPE    = RESULTS_DIR / "Type"
_GT_TYPE           = GROUND_TRUTH_DIR
_COMPARISONS       = RESULTS_DIR / "comparisons"
_ARTICLES_SECTIONS = ARTICLES_SECTIONS_DIR


# ─── Articles à tableaux (corrélation/régression) ─────────────────────────────

def table_bearing_stems() -> list[str]:
    """Stems du corpus GT (test) dont articles_sections/<stem>/tables.txt contient
    au moins un tableau dont l'en-tête matche 'correl' ou 'regress'.

    Réutilise _split_tables() de corr_matrix.py — même définition que ce que le
    pipeline tente réellement de parser (pas une heuristique séparée qui pourrait
    diverger). Élargi à 'regress' au-delà du seul filtre 'correl' d'extract_table_
    relations() : les tableaux de régression, non parsés déterministiquement
    aujourd'hui, sont justement le signal qu'on veut voir dans cette vue, pas un
    angle mort.
    """
    stems = []
    for gt_file in sorted((_GT_TYPE / "test").glob("*.json")):
        stem = gt_file.stem
        f = _ARTICLES_SECTIONS / stem / "tables.txt"
        if not f.exists():
            continue
        text = f.read_text(encoding="utf-8")
        if any("correl" in h.lower() or "regress" in h.lower() for _, h, _ in _split_tables(text)):
            stems.append(stem)
    return stems


# ─── Comparaison de texte tolérante (typographie, accents, mots de liaison) ───

try:
    from rapidfuzz.fuzz import ratio as _rf_ratio

    def _ratio(a: str, b: str) -> float:
        return _rf_ratio(a, b) / 100.0
except ImportError:  # pragma: no cover
    from difflib import SequenceMatcher

    def _ratio(a: str, b: str) -> float:
        return SequenceMatcher(None, a, b).ratio()


_LIAISON = {"and", "et", "&", "or", "the", "of", "a", "an", "to", "with", "in"}
_TYPO = str.maketrans({
    "’": "'", "‘": "'", "‛": "'", "´": "'", "`": "'",
    "“": '"', "”": '"', "„": '"',
    "–": "-", "—": "-", "‐": "-", "−": "-",
    " ": " ", " ": " ", " ": " ",
})


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def normalize_text(v) -> str:
    """Normalisation tolérante : typographie ASCII, sans accents, minuscules, espaces compactés."""
    if v is None:
        return ""
    s = str(v).translate(_TYPO)
    s = _strip_accents(s).lower()
    return re.sub(r"\s+", " ", s).strip()


def _tokens(s: str) -> set[str]:
    """Ensemble de tokens significatifs (ponctuation et mots de liaison retirés)."""
    s = re.sub(r"[^\w\s]", " ", s)
    return {t for t in s.split() if t and t not in _LIAISON}


def fuzzy_equal(a, b, threshold: float = 0.92) -> bool:
    """Égalité tolérante : typographie, accents, mots de liaison, ordre, fautes mineures."""
    na, nb = normalize_text(a), normalize_text(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    ta, tb = _tokens(na), _tokens(nb)
    if ta and ta == tb:                      # mêmes mots (ignore "and"/Oxford, ordre, casse)
        return True
    # Ontology labels: the shorter is sometimes a verbatim prefix of the longer (Excel truncation).
    # Accept if the shorter is ≥ 4 words AND is a verbatim prefix of the longer.
    short, long = (na, nb) if len(na) <= len(nb) else (nb, na)
    if len(short.split()) >= 4 and long.startswith(short):
        return True
    return _ratio(na, nb) >= threshold


class _Tee:
    """Écrit simultanément sur plusieurs flux (stdout + fichier)."""

    def __init__(self, *streams):
        self.streams = streams

    def write(self, data):
        for s in self.streams:
            s.write(data)
        return len(data)

    def flush(self):
        for s in self.streams:
            s.flush()

# <resultats>/2026-06-15/Abras.2022_sport.json → date = nom du dossier parent.
_DATE_DIR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_FILENAME_RE = re.compile(r"^(.+?)(?:_sport|_type)?\.json$")


# ─── Collecte des fichiers résultats ──────────────────────────────────────────

def collect_results(directory: Path) -> dict[str, list[tuple[str, Path]]]:
    """Retourne {stem: [(date, path), ...]} trié par date croissante."""
    groups: dict[str, list] = defaultdict(list)
    for f in directory.glob("*/*.json"):
        if not _DATE_DIR_RE.match(f.parent.name):
            continue
        m = _FILENAME_RE.match(f.name)
        if m:
            groups[m.group(1)].append((f.parent.name, f))
    for stem in groups:
        groups[stem].sort(key=lambda x: x[0])
    return dict(groups)


# ─── Comparaison Type ─────────────────────────────────────────────────────────
# Format réel des fichiers (result et GT) :
#   Sport     : liste plate de {predicate, object}
#   Relations : liste de {V1: {triplets: [...]}, V2: {triplets: [...]}, stats: [...]}
#   Analysis  : liste plate de {predicate, object}

_SPORT_SPLIT_RE = re.compile(r",|\band\b|&|/")


def _norm(obj) -> str:
    return str(obj).lower().strip() if obj is not None else ""


def _triplets_to_dict(triplets: list) -> dict[str, str]:
    """{predicate_court: valeur_normalisée} depuis une liste de {predicate, object}."""
    out: dict[str, str] = {}
    for t in triplets:
        pred = t.get("predicate", "")
        pred_short = pred.split(":")[-1] if ":" in pred else pred
        if pred_short:
            out[pred_short] = _norm(t.get("object"))
    return out


_NUMERIC_PREDS = {"degreR", "degreBeta", "degreR2", "degreP"}
_NUMERIC_TOL   = 0.005

# Champs texte libre "long" (description en une phrase, pas un libellé contrôlé) : le
# phrasé varie légitimement (ordre, connecteurs, détails secondaires en plus ou en moins)
# — jugés sur le RECOUVREMENT de mots (overlap ≥ 50%) plutôt que sur la similarité
# caractère-à-caractère de fuzzy_equal (seuil 0.92, calibré pour des libellés courts).
_LONG_TEXT_PREDS  = {"inclusionCriteria", "hasSubgroup", "sportingPopulation",
                     "authorConclusion", "limites", "perspectives"}
_LONG_TEXT_OVERLAP = 0.5


def _to_float(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _value_match(pred: str, res_val: str, gt_val: str) -> bool:
    """Égalité tolérante : typographie, accents, mots de liaison.

    sportName — GT au nom combiné "a, b, and c" : un sport extrait est validé
                s'il figure parmi les tokens du GT (matching 1-vers-N).
    measure   — abréviation vs nom complet : "orto-11" ≡ "...(ORTO-11)".
    degreR/degreBeta/degreR2/degreP — tolérance ±0.005 sur les flottants.
    inclusionCriteria/hasSubgroup/sportingPopulation — texte libre reformulé : validé
                si ≥50% des mots du GT se retrouvent dans l'extraction (_LONG_TEXT_PREDS).
    """
    if not res_val and not gt_val:
        return True
    if not res_val or not gt_val:
        return res_val == gt_val
    if fuzzy_equal(str(res_val), str(gt_val)):
        return True
    if pred in _NUMERIC_PREDS:
        r, g = _to_float(res_val), _to_float(gt_val)
        if r is not None and g is not None:
            return abs(r - g) <= _NUMERIC_TOL
    if pred == "sportName":
        gt_n = normalize_text(str(gt_val))
        tokens = {t.strip() for t in _SPORT_SPLIT_RE.split(gt_n) if t.strip()}
        res_n = normalize_text(str(res_val))
        return res_n in tokens or res_n in gt_n
    if pred == "measure" or pred.endswith("measure"):
        res_n, gt_n = normalize_text(str(res_val)), normalize_text(str(gt_val))
        return len(res_n) >= 3 and (res_n in gt_n or gt_n in res_n)
    if pred in _LONG_TEXT_PREDS:
        gt_words = _tokens(normalize_text(str(gt_val)))
        if not gt_words:
            return False
        res_words = _tokens(normalize_text(str(res_val)))
        return len(res_words & gt_words) / len(gt_words) >= _LONG_TEXT_OVERLAP
    return False


def _compare_section(res_triplets: list, gt_triplets: list,
                     prefix: str = "") -> tuple[list, dict, dict]:
    """Compare deux listes de triplets prédic/objet.

    Retourne (fields, counts, pred_stats) où fields = [(pred, status, rv, gv), ...].
    """
    res_d = _triplets_to_dict(res_triplets)
    gt_d  = _triplets_to_dict(gt_triplets)
    counts: dict[str, int] = defaultdict(int)
    pred_stats: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    fields = []

    for pred in list(gt_d.keys()) + [k for k in res_d if k not in gt_d]:
        gv = gt_d.get(pred, "")
        rv = res_d.get(pred, "")
        if pred not in gt_d:
            status = "extra"
        elif not gv:
            # GT vide : "na" si le pipeline n'a rien sorti non plus (rien à évaluer),
            # "hallucination" s'il a sorti une valeur alors que rien n'était attendu
            # (faux positif pour le calcul de précision, voir _prf1()).
            status = "hallucination" if rv else "na"
        elif rv and _value_match(pred, rv, gv):
            status = "success"
        elif rv:
            # Une valeur est sortie mais elle est fausse (substitution) : à la fois un
            # rappel manqué (FN) et une précision entachée (FP), voir _prf1().
            status = "failure_wrong"
        else:
            status = "failure_absent"
        fields.append((pred, status, rv, gv))
        if status in ("success", "failure_wrong", "failure_absent", "hallucination"):
            counts[status] += 1
        if status != "extra":
            key = f"{prefix}{pred}" if prefix else pred
            pred_stats[key][status] += 1

    return fields, dict(counts), pred_stats


def _get_vname(triplets: list, key: str) -> str:
    """Valeur de iadas:V1 ou iadas:V2 depuis une liste de triplets."""
    for t in triplets:
        if t.get("predicate", "").split(":")[-1] == key:
            return _norm(t.get("object"))
    return ""


def _compare_relations(res_rels: list, gt_rels: list) -> tuple[dict, dict, list]:
    """Apparie et compare les relations V1/V2 par meilleur score de nom."""
    counts: dict[str, int] = defaultdict(int)
    pred_stats: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    pair_reports: list[dict] = []
    used: set[int] = set()

    for gr in gt_rels:
        gt_v1 = _get_vname(gr.get("V1", {}).get("triplets", []), "V1")
        gt_v2 = _get_vname(gr.get("V2", {}).get("triplets", []), "V2")
        label = f"({gt_v1}, {gt_v2})"

        best_ri, best_score = None, 0
        for ri, rr in enumerate(res_rels):
            if ri in used:
                continue
            sc = 0
            res_v1 = _get_vname(rr.get("V1", {}).get("triplets", []), "V1")
            res_v2 = _get_vname(rr.get("V2", {}).get("triplets", []), "V2")
            if gt_v1 and _value_match("V1", res_v1, gt_v1):
                sc += 2
            if gt_v2 and _value_match("V2", res_v2, gt_v2):
                sc += 2
            if sc > best_score:
                best_ri, best_score = ri, sc

        if best_ri is not None and best_score >= 2:
            used.add(best_ri)
            rr = res_rels[best_ri]
            all_fields = []
            for sect, vkey in [("V1", "V1"), ("V2", "V2"), ("stats", None)]:
                gt_trip = gr.get(sect, {}).get("triplets", []) if vkey else gr.get(sect, [])
                res_trip = rr.get(sect, {}).get("triplets", []) if vkey else rr.get(sect, [])
                flds, c, ps = _compare_section(res_trip, gt_trip, prefix=f"{sect}.")
                all_fields.extend(flds)
                for k, v in c.items():
                    counts[k] += v
                for p, s in ps.items():
                    for st, n in s.items():
                        pred_stats[p][st] += n
            pair_reports.append({"kind": "matched", "label": label, "fields": all_fields})
        else:
            for sect, vkey in [("V1", "V1"), ("V2", "V2"), ("stats", None)]:
                gt_trip = gr.get(sect, {}).get("triplets", []) if vkey else gr.get(sect, [])
                gt_d = _triplets_to_dict(gt_trip)
                for pred, gv in gt_d.items():
                    # Relation non appariée : rien n'a été extrait pour aucun de ses
                    # champs, donc chaque champ attendu est un FN pur (pas de FP,
                    # aucune valeur n'existe à comparer) -- voir _compare_section().
                    status = "na" if not gv else "failure_absent"
                    if status != "na":
                        counts["failure_absent"] += 1
                    pred_stats[f"{sect}.{pred}"][status] += 1
            pair_reports.append({"kind": "missing", "label": label, "fields": []})

    for ri, rr in enumerate(res_rels):
        if ri not in used:
            rv1 = _get_vname(rr.get("V1", {}).get("triplets", []), "V1")
            rv2 = _get_vname(rr.get("V2", {}).get("triplets", []), "V2")
            # Relation extraite sans correspondance GT : chacun de ses champs renseignés
            # est une hallucination (faux positif), pour que la précision reflète aussi
            # les relations inventées de toutes pièces, pas seulement les champs faux
            # au sein des relations correctement appariées.
            for sect, vkey in [("V1", "V1"), ("V2", "V2"), ("stats", None)]:
                res_trip = rr.get(sect, {}).get("triplets", []) if vkey else rr.get(sect, [])
                for pred, rv in _triplets_to_dict(res_trip).items():
                    if rv:
                        counts["hallucination"] += 1
                        pred_stats[f"{sect}.{pred}"]["hallucination"] += 1
            pair_reports.append({"kind": "extra", "label": f"({rv1}, {rv2})", "fields": []})

    return dict(counts), pred_stats, pair_reports


def compare_type(result: dict, gt: dict) -> dict:
    """Compare deux Type JSON (format Sport/Relations/Analysis).

    Retourne :
      sport_fields, sport_counts,
      relation_reports, rel_counts, n_matched,
      analysis_fields, analysis_counts,
      pred_stats,
      n_gt_rels, n_res_rels.
    """
    pred_stats: dict[str, dict] = defaultdict(lambda: defaultdict(int))

    # ── Sport ──────────────────────────────────────────────────────────────────
    sport_fields, sport_counts, sps = _compare_section(
        result.get("Sport", []), gt.get("Sport", []), prefix="Sport."
    )
    for p, s in sps.items():
        for st, n in s.items():
            pred_stats[p][st] += n

    # ── Relations ──────────────────────────────────────────────────────────────
    rel_counts, rel_ps, rel_reports = _compare_relations(
        result.get("Relations", []), gt.get("Relations", [])
    )
    for p, s in rel_ps.items():
        for st, n in s.items():
            pred_stats[p][st] += n

    # ── Analysis ───────────────────────────────────────────────────────────────
    analysis_fields, analysis_counts, aps = _compare_section(
        result.get("Analysis", []), gt.get("Analysis", []), prefix="Analysis."
    )
    for p, s in aps.items():
        for st, n in s.items():
            pred_stats[p][st] += n

    # ── Population ─────────────────────────────────────────────────────────────
    population_fields, population_counts, pops = _compare_section(
        result.get("Population", []), gt.get("Population", []), prefix="Population."
    )
    for p, s in pops.items():
        for st, n in s.items():
            pred_stats[p][st] += n

    # ── Bibliographic ──────────────────────────────────────────────────────────
    bibliographic_fields, bibliographic_counts, bps = _compare_section(
        result.get("Bibliographic", []), gt.get("Bibliographic", []), prefix="Bibliographic."
    )
    for p, s in bps.items():
        for st, n in s.items():
            pred_stats[p][st] += n

    n_matched = sum(1 for r in rel_reports if r["kind"] == "matched")

    return {
        "sport_fields":         sport_fields,
        "sport_counts":         dict(sport_counts),
        "relation_reports":     rel_reports,
        "rel_counts":           dict(rel_counts),
        "n_matched":            n_matched,
        "analysis_fields":      analysis_fields,
        "analysis_counts":      dict(analysis_counts),
        "population_fields":    population_fields,
        "population_counts":    dict(population_counts),
        "bibliographic_fields": bibliographic_fields,
        "bibliographic_counts": dict(bibliographic_counts),
        "pred_stats":           pred_stats,
        "n_gt_rels":            len(gt.get("Relations", [])),
        "n_res_rels":           len(result.get("Relations", [])),
    }


def _section_rate(counts: dict) -> tuple[float, int]:
    """Retourne (taux_success, n_evals) depuis un dict {success, failure_wrong,
    failure_absent, ...}.

    Ce taux est un RAPPEL (vrais positifs / (vrais positifs + faux négatifs)) : les
    champs vides côté GT sont exclus ("na"), donc une valeur inventée par le pipeline
    quand le GT est vide ("hallucination") n'est jamais pénalisée ici. Voir _prf1()
    pour la précision, qui la prend en compte.
    """
    ok   = counts.get("success", 0)
    fail = counts.get("failure_wrong", 0) + counts.get("failure_absent", 0)
    n    = ok + fail
    return (ok / n * 100 if n else 0.0), n


def _prf1(counts: dict) -> tuple[float, float, float]:
    """Précision / Rappel / F1 (%) depuis un dict {success, failure_wrong,
    failure_absent, hallucination} -- convention TP/FP/FN standard.

    Rappel    = VP / (VP + FN)  — VP=success, FN=failure_wrong+failure_absent (champ
                GT non retrouvé, qu'une valeur fausse ait été sortie ou rien du tout).
    Précision = VP / (VP + FP)  — FP=hallucination (valeur sortie alors que le GT est
                vide pour ce champ) + failure_wrong (une substitution : une valeur est
                sortie mais elle est fausse, donc c'est aussi un faux positif, pas
                seulement un rappel manqué).
    F1        = moyenne harmonique de Précision et Rappel.
    """
    tp = counts.get("success", 0)
    fn = counts.get("failure_wrong", 0) + counts.get("failure_absent", 0)
    fp = counts.get("hallucination", 0) + counts.get("failure_wrong", 0)
    recall    = tp / (tp + fn) * 100 if (tp + fn) else 0.0
    precision = tp / (tp + fp) * 100 if (tp + fp) else 0.0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return precision, recall, f1


def run_type_mode(
    article_filter: list[str] | None,
    all_dates: bool,
    verbose: bool,
    date_filter: str | None = None,
) -> dict:
    groups = collect_results(_RESULTATS_TYPE)
    pred_stats: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    article_scores: list[dict] = []

    for stem, runs in sorted(groups.items()):
        if article_filter and stem not in article_filter:
            continue

        gt_path = find_gt(_GT_TYPE, stem)
        if gt_path is None:
            continue

        gt = json.loads(gt_path.read_text(encoding="utf-8"))
        if date_filter:
            candidates = [(d, p) for d, p in runs if d == date_filter]
        else:
            candidates = runs if all_dates else [runs[-1]]
        if not candidates:
            continue

        for date, path in candidates:
            result = json.loads(path.read_text(encoding="utf-8"))
            report = compare_type(result, gt)

            sport_rate,    _  = _section_rate(report["sport_counts"])
            rel_fields_rate, _ = _section_rate(report["rel_counts"])
            analysis_rate, _  = _section_rate(report["analysis_counts"])
            population_rate, _ = _section_rate(report["population_counts"])
            bibliographic_rate, _ = _section_rate(report["bibliographic_counts"])
            # Précision/F1 par article (même granularité que les *_rate ci-dessus, qui sont
            # un rappel) : moyennées macro plus bas, pour rester cohérent avec le rappel
            # plutôt que de mélanger un rappel macro et une précision micro dans le même
            # tableau (cf. section 5.3.2 du rapport : le score global d'un bloc est une
            # moyenne macro par article).
            sport_p,    _, sport_f1    = _prf1(report["sport_counts"])
            rel_fields_p, _, rel_fields_f1 = _prf1(report["rel_counts"])
            analysis_p, _, analysis_f1 = _prf1(report["analysis_counts"])
            population_p, _, population_f1 = _prf1(report["population_counts"])
            bibliographic_p, _, bibliographic_f1 = _prf1(report["bibliographic_counts"])
            reps   = report["relation_reports"]
            n_miss  = sum(1 for r in reps if r["kind"] == "missing")
            n_extra = sum(1 for r in reps if r["kind"] == "extra")
            n_gt    = report["n_gt_rels"]
            n_res   = report["n_res_rels"]
            rel_match_rate = report["n_matched"] / n_gt * 100 if n_gt else 0.0
            rel_match_precision = report["n_matched"] / n_res * 100 if n_res else 0.0
            rel_match_f1 = (2 * rel_match_precision * rel_match_rate / (rel_match_precision + rel_match_rate)
                            if (rel_match_precision + rel_match_rate) else 0.0)

            article_scores.append({
                "stem":                stem,
                "date":                date,
                "sport_rate":          sport_rate,
                "sport_precision":     sport_p,
                "sport_f1":            sport_f1,
                "rel_match_rate":      rel_match_rate,
                "rel_match_precision": rel_match_precision,
                "rel_match_f1":        rel_match_f1,
                "rel_fields_rate":     rel_fields_rate,
                "rel_fields_precision": rel_fields_p,
                "rel_fields_f1":       rel_fields_f1,
                "analysis_rate":       analysis_rate,
                "analysis_precision":  analysis_p,
                "analysis_f1":         analysis_f1,
                "population_rate":     population_rate,
                "population_precision": population_p,
                "population_f1":       population_f1,
                "bibliographic_rate":  bibliographic_rate,
                "bibliographic_precision": bibliographic_p,
                "bibliographic_f1":    bibliographic_f1,
                "n_matched":           report["n_matched"],
                "n_miss":              n_miss,
                "n_extra":             n_extra,
                "n_gt_rels":           n_gt,
                "n_res_rels":          report["n_res_rels"],
                "sport_counts":        report["sport_counts"],
                "rel_counts":          report["rel_counts"],
                "analysis_counts":     report["analysis_counts"],
                "population_counts":   report["population_counts"],
                "bibliographic_counts": report["bibliographic_counts"],
            })

            for p, statuses in report["pred_stats"].items():
                for st, n in statuses.items():
                    pred_stats[p][st] += n

            if verbose:
                _print_type_detail(report, article=f"{stem}  [{date}]")

    return {"pred_stats": pred_stats, "article_scores": article_scores}


def _fmt_rate(ok: int, fail: int) -> str:
    n = ok + fail
    return f"{ok / n * 100:.0f}%  ({ok}/{n})" if n else "—"


def _n_fail(counts: dict) -> int:
    """Faux négatifs d'un dict counts -- somme des deux variantes (valeur fausse
    sortie ou rien sorti du tout), voir _compare_section()."""
    return counts.get("failure_wrong", 0) + counts.get("failure_absent", 0)


def _print_type_detail(report: dict, article: str) -> None:
    sport_rate, _  = _section_rate(report["sport_counts"])
    rel_fields_rate, _ = _section_rate(report["rel_counts"])
    analysis_rate, _  = _section_rate(report["analysis_counts"])
    reps    = report["relation_reports"]
    n_match = report["n_matched"]
    n_miss  = sum(1 for r in reps if r["kind"] == "missing")
    n_extra = sum(1 for r in reps if r["kind"] == "extra")
    n_gt    = report["n_gt_rels"]
    rel_match_rate = n_match / n_gt * 100 if n_gt else 0.0

    W = 72
    print(f"\n{'='*W}")
    print(f"  TYPE -- {article}")
    sc = report["sport_counts"]
    rc = report["rel_counts"]
    print(f"  Sport       : {_fmt_rate(sc.get('success',0), _n_fail(sc))}"
          f"   ({_n_fail(sc)} erreurs)")
    print(f"  Rels match  : {n_match}/{n_gt}  ({rel_match_rate:.0f}%)"
          f"   manquantes={n_miss}  en-trop={n_extra}")
    print(f"  Rels champs : {_fmt_rate(rc.get('success',0), _n_fail(rc))}"
          f"   (sur relations appariées)")
    if report["analysis_counts"]:
        ac = report["analysis_counts"]
        print(f"  Analysis    : {_fmt_rate(ac.get('success',0), _n_fail(ac))}")
    if report["population_counts"]:
        pc = report["population_counts"]
        print(f"  Population  : {_fmt_rate(pc.get('success',0), _n_fail(pc))}")
    if report["bibliographic_counts"]:
        bc = report["bibliographic_counts"]
        print(f"  Biblio      : {_fmt_rate(bc.get('success',0), _n_fail(bc))}")
    print(f"{'='*W}")

    # Sport detail
    print(f"\n  -- SPORT --")
    for pred, status, rv, gv in report["sport_fields"]:
        if status == "success":
            print(f"    V  {pred:<22} {rv!r}")
        elif status in ("failure_wrong", "failure_absent"):
            print(f"    X  {pred:<22} got:      {rv!r}")
            print(f"       {'':22} expected: {gv!r}")
        elif status == "na":
            print(f"    -  {pred:<22} (vide dans GT)")
        else:
            print(f"    +  {pred:<22} {rv!r}  (absent du GT)")

    # Relations detail
    if reps:
        print(f"\n  -- RELATIONS ({report['n_res_rels']}/{n_gt}) --")
        for rp in reps[:20]:
            tag = {"matched": "V", "missing": "X", "extra": "+"}[rp["kind"]]
            print(f"    {tag}  {rp['label']}")
            for pred, status, rv, gv in rp.get("fields", []):
                if status in ("failure_wrong", "failure_absent"):
                    print(f"         X  {pred:<20} got: {rv!r}")
                    print(f"            {'':20} exp: {gv!r}")
        if len(reps) > 20:
            print(f"    ... ({len(reps) - 20} autres)")

    # Analysis detail (if any)
    if report["analysis_fields"]:
        print(f"\n  -- ANALYSIS --")
        for pred, status, rv, gv in report["analysis_fields"]:
            if status == "success":
                print(f"    V  {pred:<28} {str(rv)[:50]!r}")
            elif status in ("failure_wrong", "failure_absent"):
                print(f"    X  {pred:<28} got:      {str(rv)[:50]!r}")
                print(f"       {'':28} expected: {str(gv)[:50]!r}")
            elif status == "na":
                print(f"    -  {pred:<28} (vide dans GT)")

    # Population detail (if any)
    if report["population_fields"]:
        print(f"\n  -- POPULATION --")
        for pred, status, rv, gv in report["population_fields"]:
            if status == "success":
                print(f"    V  {pred:<28} {str(rv)[:50]!r}")
            elif status in ("failure_wrong", "failure_absent"):
                print(f"    X  {pred:<28} got:      {str(rv)[:50]!r}")
                print(f"       {'':28} expected: {str(gv)[:50]!r}")
            elif status == "na":
                print(f"    -  {pred:<28} (vide dans GT)")

    # Bibliographic detail (if any)
    if report["bibliographic_fields"]:
        print(f"\n  -- BIBLIOGRAPHIC --")
        for pred, status, rv, gv in report["bibliographic_fields"]:
            if status == "success":
                print(f"    V  {pred:<28} {str(rv)[:50]!r}")
            elif status in ("failure_wrong", "failure_absent"):
                print(f"    X  {pred:<28} got:      {str(rv)[:50]!r}")
                print(f"       {'':28} expected: {str(gv)[:50]!r}")
            elif status == "na":
                print(f"    -  {pred:<28} (vide dans GT)")


def _pred_rate_line(pred_stats: dict, key: str, label: str, indent: str = "    ") -> str:
    cnt = pred_stats.get(key, {})
    ok   = cnt.get("success", 0)
    fail = _n_fail(cnt)
    n    = ok + fail
    na   = cnt.get("na", 0)
    rate = ok / n * 100 if n else 0.0
    bar  = "#" * int(rate / 10)
    na_s = f"  {na} NA" if na else ""
    return f"{indent}{label:<28} {rate:>5.0f}%  ({n:>4} evals){na_s}"


def print_summary_type(data: dict) -> None:
    scores = data["article_scores"]
    if not scores:
        print("\n  Aucun article Type compare (pas de GT correspondant).")
        return

    W = 78
    sep = "=" * W

    # ── Tableau par article ────────────────────────────────────────────────────
    print(f"\n{sep}")
    print(f"  RESUME TYPE — {len(scores)} article(s)")
    print(f"{sep}")
    print(f"  {'Article':<26} {'Date':<12} {'Sport':>7}  {'Rels match':>10}  {'Rels champs':>11}  {'Analysis':>8}  {'Population':>10}  {'Biblio':>7}")
    print(f"  {'-'*(W-2)}")

    s_sum = r_sum = rf_sum = a_sum = a_cnt = p_sum = p_cnt = b_sum = b_cnt = 0
    for s in scores:
        a_s = f"{s['analysis_rate']:>6.0f}%" if s["analysis_counts"] else "     —"
        p_s = f"{s['population_rate']:>8.0f}%" if s["population_counts"] else "       —"
        b_s = f"{s['bibliographic_rate']:>5.0f}%" if s["bibliographic_counts"] else "    —"
        print(f"  {s['stem']:<26} {s['date']:<12}"
              f" {s['sport_rate']:>6.0f}%"
              f"  {s['n_matched']:>3}/{s['n_gt_rels']:<3} {s['rel_match_rate']:>5.0f}%"
              f"  {s['rel_fields_rate']:>10.0f}%"
              f"  {a_s}"
              f"  {p_s}"
              f"  {b_s}")
        s_sum  += s["sport_rate"]
        r_sum  += s["rel_match_rate"]
        rf_sum += s["rel_fields_rate"]
        if s["analysis_counts"]:
            a_sum += s["analysis_rate"]
            a_cnt += 1
        if s["population_counts"]:
            p_sum += s["population_rate"]
            p_cnt += 1
        if s["bibliographic_counts"]:
            b_sum += s["bibliographic_rate"]
            b_cnt += 1

    n = len(scores)
    a_avg = f"{a_sum / a_cnt:.1f}%" if a_cnt else "—"
    p_avg = f"{p_sum / p_cnt:.1f}%" if p_cnt else "—"
    b_avg = f"{b_sum / b_cnt:.1f}%" if b_cnt else "—"
    print(f"\n  Moyennes  Sport: {s_sum/n:.1f}%   "
          f"Rels-match: {r_sum/n:.1f}%   "
          f"Rels-champs: {rf_sum/n:.1f}%   "
          f"Analysis: {a_avg}   "
          f"Population: {p_avg}   "
          f"Biblio: {b_avg}")

    # ── Précision / Rappel / F1 — moyenne MACRO par article, comme le Rappel
    #    ci-dessus (section 5.3.2 du rapport : le score global d'un bloc est une
    #    moyenne macro, chaque article compte pour un point). Ne pas agréger les
    #    compteurs d'abord puis diviser (micro) : ça mélangerait deux méthodes de
    #    calcul différentes dans la même ligne de tableau pour rappel vs précision.
    #
    #    Rappel et précision n'ont pas le même dénominateur valide par article :
    #    un article sans aucun VP ni FP pour un bloc (que des FN, ex. tout manqué
    #    mais rien halluciné) a une précision NON DÉFINIE (0/0), pas 0 % — il faut
    #    l'exclure de la moyenne de précision (comme un article sans aucun champ
    #    GT rempli est déjà exclu du rappel), sinon la moyenne macro de précision
    #    est artificiellement tirée vers le bas par des articles qui n'ont tout
    #    simplement rien affirmé de faux.
    def _macro_prf1(counts_key: str, rate_key: str, prec_key: str, f1_key: str):
        recall_rows    = [s for s in scores if (s[counts_key].get("success", 0) + s[counts_key].get("failure_wrong", 0) + s[counts_key].get("failure_absent", 0)) > 0]
        precision_rows = [s for s in scores if (s[counts_key].get("success", 0) + s[counts_key].get("hallucination", 0) + s[counts_key].get("failure_wrong", 0)) > 0]
        f1_rows        = [s for s in recall_rows if s in precision_rows]
        r  = sum(s[rate_key] for s in recall_rows) / len(recall_rows) if recall_rows else None
        p  = sum(s[prec_key] for s in precision_rows) / len(precision_rows) if precision_rows else None
        f1 = sum(s[f1_key]   for s in f1_rows) / len(f1_rows) if f1_rows else None
        return p, r, f1, len(precision_rows), len(recall_rows)

    print(f"\n{sep}")
    print(f"  PRECISION / RAPPEL / F1 — moyenne macro par article (meme methode que le Rappel)")
    print(f"{sep}")
    for label, counts_key, rate_key, prec_key, f1_key in [
            ("Sport",          "sport_counts",         "sport_rate",          "sport_precision",          "sport_f1"),
            ("Relations (champs, sur relations appariees)", "rel_counts", "rel_fields_rate", "rel_fields_precision", "rel_fields_f1"),
            ("Analysis",       "analysis_counts",      "analysis_rate",       "analysis_precision",       "analysis_f1"),
            ("Population",     "population_counts",    "population_rate",     "population_precision",     "population_f1"),
            ("Bibliographic",  "bibliographic_counts", "bibliographic_rate",  "bibliographic_precision",  "bibliographic_f1")]:
        p, r, f1, n_p, n_r = _macro_prf1(counts_key, rate_key, prec_key, f1_key)
        if r is None and p is None:
            continue
        p_s  = f"{p:5.1f}%(n={n_p})" if p is not None else "   —"
        r_s  = f"{r:5.1f}%(n={n_r})" if r is not None else "   —"
        f1_s = f"{f1:5.1f}%" if f1 is not None else "  —"
        print(f"    {label:<45} precision={p_s}  rappel={r_s}  F1={f1_s}")

    # Relations — détection (pas de dict counts success/failure/hallucination classique,
    # les taux sont déjà calculés par article ci-dessus via n_matched/n_gt_rels/n_res_rels)
    rel_det_rows = [s for s in scores if s["n_gt_rels"] or s["n_res_rels"]]
    if rel_det_rows:
        rel_r_rows = [s for s in rel_det_rows if s["n_gt_rels"]]
        rel_p_rows = [s for s in rel_det_rows if s["n_res_rels"]]
        rel_f1_rows = [s for s in rel_r_rows if s in rel_p_rows]
        r  = sum(s["rel_match_rate"]      for s in rel_r_rows) / len(rel_r_rows) if rel_r_rows else None
        p  = sum(s["rel_match_precision"] for s in rel_p_rows) / len(rel_p_rows) if rel_p_rows else None
        f1 = sum(s["rel_match_f1"]        for s in rel_f1_rows) / len(rel_f1_rows) if rel_f1_rows else None
        p_s  = f"{p:5.1f}%(n={len(rel_p_rows)})" if p is not None else "   —"
        r_s  = f"{r:5.1f}%(n={len(rel_r_rows)})" if r is not None else "   —"
        f1_s = f"{f1:5.1f}%" if f1 is not None else "  —"
        print(f"    {'Relations (detection)':<45} precision={p_s}  rappel={r_s}  F1={f1_s}")

    pred_stats = data["pred_stats"]

    # ── SPORT ──────────────────────────────────────────────────────────────────
    sport_keys = [k for k in pred_stats if k.startswith("Sport.")]
    if sport_keys:
        print(f"\n{sep}")
        print(f"  SPORT — détail par prédicat")
        print(f"{sep}")
        for key in sorted(sport_keys):
            label = key.split(".")[-1]
            print(_pred_rate_line(pred_stats, key, label))

    # ── RELATIONS — appariement global ─────────────────────────────────────────
    total_gt   = sum(s["n_gt_rels"]  for s in scores)
    total_res  = sum(s["n_res_rels"] for s in scores)
    total_match = sum(s["n_matched"]  for s in scores)
    total_miss  = sum(s["n_miss"]     for s in scores)
    total_extra = sum(s["n_extra"]    for s in scores)

    print(f"\n{sep}")
    print(f"  RELATIONS — appariement")
    print(f"{sep}")
    match_pct = total_match / total_gt * 100 if total_gt else 0.0
    print(f"    Appariées   : {total_match}/{total_gt}  ({match_pct:.1f}%)")
    print(f"    Manquantes  : {total_miss}  (dans GT, non extraites)")
    print(f"    En trop     : {total_extra}  (extraites hors GT)")
    print(f"    (Precision/Rappel/F1 de détection en moyenne macro : voir le bloc "
          f"PRECISION / RAPPEL / F1 ci-dessus)")

    # ── RELATIONS — champs (toutes GT = appariées + manquantes) ───────────────
    # Note : les relations manquantes comptent comme 0% sur tous leurs champs.
    rel_keys = [k for k in pred_stats
                if not k.startswith(("Sport.", "Analysis.", "Population.", "Bibliographic."))]
    if rel_keys:
        print(f"\n{sep}")
        print(f"  RELATIONS — champs (toutes relations GT : appariées + manquantes)")
        print(f"{sep}")

        sections = [
            ("V1", [k for k in rel_keys if k.startswith("V1.")]),
            ("V2", [k for k in rel_keys if k.startswith("V2.")]),
            ("stats", [k for k in rel_keys if k.startswith("stats.")]),
        ]
        for section_name, keys in sections:
            if not keys:
                continue
            print(f"\n    {section_name}")
            for key in sorted(keys):
                label = key.split(".")[-1]
                print(_pred_rate_line(pred_stats, key, label, indent="      "))

    # ── ANALYSIS ───────────────────────────────────────────────────────────────
    analysis_keys = [k for k in pred_stats if k.startswith("Analysis.")]
    has_analysis_results = any(
        pred_stats[k].get("success", 0) > 0 for k in analysis_keys
    )
    if analysis_keys and has_analysis_results:
        print(f"\n{sep}")
        print(f"  ANALYSIS — détail par prédicat")
        print(f"{sep}")
        for key in sorted(analysis_keys):
            label = key.split(".")[-1]
            print(_pred_rate_line(pred_stats, key, label))

    # ── POPULATION ─────────────────────────────────────────────────────────────
    population_keys = [k for k in pred_stats if k.startswith("Population.")]
    has_population_results = any(
        pred_stats[k].get("success", 0) > 0 for k in population_keys
    )
    if population_keys and has_population_results:
        print(f"\n{sep}")
        print(f"  POPULATION — détail par prédicat")
        print(f"{sep}")
        for key in sorted(population_keys):
            label = key.split(".")[-1]
            print(_pred_rate_line(pred_stats, key, label))

    # ── BIBLIOGRAPHIC ──────────────────────────────────────────────────────────
    bibliographic_keys = [k for k in pred_stats if k.startswith("Bibliographic.")]
    has_bibliographic_results = any(
        pred_stats[k].get("success", 0) > 0 for k in bibliographic_keys
    )
    if bibliographic_keys and has_bibliographic_results:
        print(f"\n{sep}")
        print(f"  BIBLIOGRAPHIC — détail par prédicat")
        print(f"{sep}")
        for key in sorted(bibliographic_keys):
            label = key.split(".")[-1]
            print(_pred_rate_line(pred_stats, key, label))


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        description="Compare results/Type/ vs ground_truth/",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
exemples :
  iacad-compare
  iacad-compare --summary
  iacad-compare --article Abras.2022
  iacad-compare --only-tables --summary
  iacad-compare --all-dates
  iacad-compare --date 2026-08-06
  iacad-compare --out rapport.txt
  iacad-compare --no-file        # stdout uniquement
        """,
    )
    parser.add_argument("--article", default=None, metavar="STEM", action="append",
                        help="Filtrer sur un article (répétable : --article A --article B)")
    parser.add_argument("--only-tables", action="store_true",
                        help="Restreint aux articles GT ayant un tableau de corrélation/régression "
                             "(même détection que corr_matrix.py) — incompatible avec --article")
    parser.add_argument("--all-dates", action="store_true",
                        help="Comparer toutes les dates (défaut: plus récente seulement)")
    parser.add_argument("--date", default=None, metavar="AAAA-MM-JJ",
                        help="Comparer uniquement ce dossier daté (ex: 2026-08-06) — "
                             "un article absent de cette date est ignoré, pas de repli sur "
                             "une date antérieure. Incompatible avec --all-dates.")
    parser.add_argument("--summary", action="store_true",
                        help="Agrégats uniquement, sans détail par article")
    parser.add_argument("--out", default=None, metavar="FICHIER",
                        help="Chemin du rapport (défaut: results/comparisons/<date>/compare_type.txt)")
    parser.add_argument("--no-file", action="store_true",
                        help="Ne pas écrire de fichier, afficher uniquement sur stdout")
    args = parser.parse_args()

    if args.date:
        if args.all_dates:
            parser.error("--date et --all-dates sont incompatibles")
        if not _DATE_DIR_RE.match(args.date):
            parser.error(f"--date doit être au format AAAA-MM-JJ (reçu : {args.date})")

    if args.only_tables:
        if args.article:
            parser.error("--only-tables et --article sont incompatibles")
        args.article = table_bearing_stems()
        print(f"--only-tables : {len(args.article)} article(s) à tableau corrélation/régression\n")

    verbose = not args.summary

    # ── Sortie fichier (Tee stdout + fichier) ──
    fh = None
    out_path = None
    real_stdout = sys.stdout
    if not args.no_file:
        out_path = Path(args.out) if args.out else (
            _COMPARISONS / _date.today().isoformat() / "compare_type.txt"
        )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        fh = open(out_path, "w", encoding="utf-8")
        sys.stdout = _Tee(real_stdout, fh)

    try:
        data = run_type_mode(args.article, args.all_dates, verbose, args.date)
        print_summary_type(data)
    finally:
        if fh is not None:
            sys.stdout = real_stdout
            fh.close()

    if out_path is not None:
        print(f"\n  Rapport écrit dans : {out_path}")


if __name__ == "__main__":
    main()
