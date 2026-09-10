"""
extract.py — Pipeline d'extraction BAEO-style vers le format Type IADAS.

Reproduction de l'approche du rapport aéronautique BAEO adaptée au domaine IADAS :
  1. Extraction LLM directement en triplets predicate/object contraints par l'ontologie IADAS-Model.ttl
  2. Validation structurelle (domain/range via le schéma TTL)
  3. Validation factuelle (prompt VRAI/FAUX par triplet contre le texte source)
  4. Entity linking SPARQL pour les sous-classes variables (subClass1..4, finalClass, hasCategory)

Écrit dans results/Type/<date>/ avec un suffixe _type.json (dossier lu par iacad-compare).

Usage :
  iacad-extract articles/Arbinaga.2024.pdf
  iacad-extract articles/*.pdf --model qwen2.5:14b
  iacad-extract articles/Arbinaga.2024.pdf --chunks sport relations
  iacad-extract articles/Arbinaga.2024.pdf --no-factcheck --debug
"""
import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

# Force UTF-8 sur stdout pour éviter les erreurs cp1252 sur Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import yaml
from rapidfuzz import fuzz

from ia_cad.paths import (
    ARTICLE_INDEX, ARTICLES_DIR, ARTICLES_SECTIONS_DIR, MODELS_YAML, PROMPTS_DIR, RESULTS_DIR,
    VOCABS_DIR,
)
from ia_cad.extraction.core.readfile import read_file
from ia_cad.extraction.core.llm import call_llm
from ia_cad.extraction.core.ontology import load_schema, build_property_block
from ia_cad.extraction.core.validator import (
    validate_structural, validate_factual, find_missed_relations, refine_rejected_stats,
)
from ia_cad.common import metadata as metadata_mod
from ia_cad.common.corpus import mode_for, route
from ia_cad.common.linking.sparql_linking import (
    VariableLinker, SportLinker, apply_synonyms,
    split_sport_names, is_generic_multisport, split_variable_names,
    aggregate_sport_results,
)
from ia_cad.extraction.core.corr_matrix import (
    extract_table_relations, scan_statistical_candidates, scan_keyword_candidates,
)

# ─── Chemins ──────────────────────────────────────────────────────────────────

_PROMPTS  = PROMPTS_DIR
_ARTICLES = ARTICLES_DIR
_SECTIONS = ARTICLES_SECTIONS_DIR
_OUT_DIR  = RESULTS_DIR / "Type"
_CONFIG   = MODELS_YAML

CHUNKS = ["sport", "relations", "analysis", "population", "bibliographic"]

# Sections privilégiées pour le bloc sport. La description des participants
# (sports pratiqués + niveau de recrutement) vit dans Méthode/Abstract/Tables.
# Restreindre le texte à ces sections retire le bruit des affiliations
# universitaires des auteurs (page 1) qui biaisait sportLevel vers "Student".
_SPORT_SECTIONS         = ["abstract", "method", "tables", "results"]
_RELATIONS_SECTIONS     = ["abstract", "results", "tables"]
_ANALYSIS_SECTIONS      = ["method", "discussion", "results"]
# "method" ajouté : typeOfAnalysis et sampleSizeMobilized sont presque toujours
# annoncés dans le paragraphe "Statistical Analysis" qui clôt la section Method,
# jamais dans discussion/results seuls (vérifié sur Ahlich.2019 : les deux
# champs vides ; sur 81 articles : typeOfAnalysis 21%, sampleSizeMobilized 35%).
_POPULATION_SECTIONS    = ["method"]
_BIBLIOGRAPHIC_SECTIONS = ["abstract", "method"]


def _section_text(path: Path, full_text: str, sections: list[str]) -> str:
    """Concatène les sections demandées depuis articles_sections/<stem>/<sec>.txt.

    Retourne le texte complet si aucune section trouvée (fallback robuste).
    Si certaines sections manquent mais pas toutes, le fallback ne se déclenche
    PAS — on continue avec ce qui existe, mais un avertissement est affiché
    pour éviter un trou silencieux (ex. "results" manquant pour un article
    donné alors que "abstract"/"tables" existent).
    """
    stem    = path.stem
    parts   = []
    missing = []
    for sec in sections:
        f = _SECTIONS / stem / f"{sec}.txt"
        if f.exists():
            txt = f.read_text(encoding="utf-8").strip()
            if txt:
                parts.append(f"--- {sec.upper()} ---\n{txt}")
                continue
        missing.append(sec)
    if not parts:
        return full_text
    if missing:
        print(f"  [warn] {stem} : section(s) manquante(s) {missing} — "
              f"bloc exécuté avec seulement {[s for s in sections if s not in missing]}")
    return "\n\n".join(parts)


def _sport_text(path: Path, full_text: str) -> str:
    return _section_text(path, full_text, _SPORT_SECTIONS)

def _relations_text(path: Path, full_text: str) -> str:
    return _section_text(path, full_text, _RELATIONS_SECTIONS)

def _analysis_text(path: Path, full_text: str) -> str:
    return _section_text(path, full_text, _ANALYSIS_SECTIONS)

def _population_text(path: Path, full_text: str) -> str:
    return _section_text(path, full_text, _POPULATION_SECTIONS)

def _bibliographic_text(path: Path, full_text: str) -> str:
    return _section_text(path, full_text, _BIBLIOGRAPHIC_SECTIONS)

# ─── Config modèle ────────────────────────────────────────────────────────────

def load_model_cfg(model_arg: str | None) -> tuple[str, dict]:
    with open(_CONFIG, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    name = model_arg or cfg.get("default_model", "qwen2.5:7b")
    model_cfg = cfg.get("models", {}).get(name, {})
    return name, model_cfg

# ─── Vocabulaires contrôlés injectés dans les prompts ─────────────────────────
# Lus depuis common/vocabs/ontology_sport.yaml (construit une fois pour toutes par
# build_vocab.py) — même source que le pipeline JSON.
# Ne pas coder ces listes en dur ici : relancer build_vocab.py pour les mettre à jour.

_sport_vocab_cache: dict[str, list[str]] | None = None


def _sport_vocab() -> dict[str, list[str]]:
    global _sport_vocab_cache
    if _sport_vocab_cache is None:
        yaml_path = VOCABS_DIR / "ontology_sport.yaml"
        with open(yaml_path, encoding="utf-8") as f:
            vocab = yaml.safe_load(f)
        _sport_vocab_cache = {
            "sportLevel": vocab.get("sportLevel", {}).get("canonical", []),
            "sportPracticeType": vocab.get("sportPracticeType", {}).get("canonical", []),
            "sportName": vocab.get("sportName", {}).get("canonical", []),
        }
    return _sport_vocab_cache


_variable_ref_cache: str | None = None


def _variable_reference_block() -> str:
    """Lit common/vocabs/ontology_variable.yaml et retourne le bloc de référence IADAS
    injecté dans le prompt relation : les 5 catégories hasCategory (guidage
    conceptuel V1/V2) PLUS la liste complète des 620 noms de variables et 451
    instruments de mesure connus de l'ontologie — pour contraindre le LLM à
    piocher dans un vocabulaire fermé pendant l'extraction et limiter les
    hallucinations de noms. L'entity linking (post-extraction) reste nécessaire
    pour le mapping hiérarchique, mais ne protège pas contre un nom halluciné :
    ce bloc agit en amont, sur la génération elle-même.
    """
    global _variable_ref_cache
    if _variable_ref_cache is not None:
        return _variable_ref_cache

    yaml_path = VOCABS_DIR / "ontology_variable.yaml"
    with open(yaml_path, encoding="utf-8") as f:
        vocab = yaml.safe_load(f)

    hc          = vocab.get("hasCategory", {})
    canonical   = hc.get("canonical", [])
    definitions = hc.get("definitions", {})

    lines = [
        "══════════════════════════════════════════════════",
        "IADAS ONTOLOGY — VARIABLE NAMING REFERENCE",
        "══════════════════════════════════════════════════",
        "COPY THE EXACT WORDING of a matching name below into V1/V2 -- do not paraphrase,",
        "add qualifiers (symptoms, level, behavior...), or reorder words. Only deviate when",
        "the article's construct truly matches none of these names.",
        "",
    ]
    for cat in canonical:
        defn = definitions.get(cat, "")
        lines.append(f"{cat}:")
        for line in str(defn).strip().splitlines():
            stripped = line.strip()
            if stripped:
                lines.append(f"  {stripped}")
        lines.append("")

    def _term_chunks(terms: list[str], header: str) -> None:
        if not terms:
            return
        lines.append(header)
        chunk_size = 15
        for i in range(0, len(terms), chunk_size):
            lines.append("  " + " | ".join(terms[i:i + chunk_size]))
        lines.append("")

    _term_chunks(vocab.get("variable", {}).get("canonical", []),
                 "KNOWN VARIABLE NAMES — prefer these exact names (or close variants) for V1/V2:")
    _term_chunks(vocab.get("measure", {}).get("canonical", []),
                 "KNOWN MEASUREMENT INSTRUMENTS — prefer these exact names for V1_measure/V2_measure:")

    lines.append("══════════════════════════════════════════════════")

    _variable_ref_cache = "\n".join(lines)
    return _variable_ref_cache

_SYSTEM = (
    "You are a scientific information extraction expert for the IADAS knowledge graph "
    "on sport psychology and eating disorders (DEAB). "
    "Extract information strictly from the provided text. "
    "Never invent or hallucinate values. Output valid JSON only."
)

# ─── Rangements (chargés une fois) ────────────────────────────────────────────

_var_clf:   VariableLinker | None = None
_sport_clf: SportLinker    | None = None

def _get_var_clf() -> VariableLinker:
    global _var_clf
    if _var_clf is None:
        _var_clf = VariableLinker()
    return _var_clf

def _get_sport_clf() -> SportLinker:
    global _sport_clf
    if _sport_clf is None:
        _sport_clf = SportLinker()
    return _sport_clf

# ─── Classifier helpers ────────────────────────────────────────────────────────

def _classify_variable(var_name: str | None) -> list[dict]:
    """Retourne les triplets classifier pour une variable (subClass1..4, finalClass, hasCategory)."""
    if not var_name:
        return []
    # Champ regroupant plusieurs variables → catégorie 'Multiple' (sans sous-classe).
    if len(split_variable_names(var_name)) > 1:
        return [{"predicate": "iadas:hasCategory", "object": "Multiple", "_source": "classifier"}]
    canonical = apply_synonyms(var_name, "variable") or var_name
    result = _get_var_clf().classify(canonical)
    if not result:
        return []

    triplets = []
    for key in ("subClass1", "subClass2", "subClass3", "subClass4"):
        val = result.get(key)
        if val:
            triplets.append({"predicate": f"iadas:{key}", "object": val, "_source": "classifier"})
    final = result.get("finalSubClass")
    if final:
        triplets.append({"predicate": "iadas:finalClass", "object": final, "_source": "classifier"})
    cls = result.get("CLASS")
    if cls:
        triplets.append({"predicate": "iadas:hasCategory", "object": cls, "_source": "classifier"})
    return triplets


# ─── Constructeurs de prompts ─────────────────────────────────────────────────

_FEW_SHOTS_DIR = _PROMPTS / "few_shots"
_few_shots_cache: dict[str, str] = {}

def _load_prompt(name: str) -> str:
    return (_PROMPTS / f"{name}.txt").read_text(encoding="utf-8")


def _load_few_shots(name: str) -> str:
    """Charge le fichier few_shots/<name>.json et le formate en texte pour injection."""
    if name in _few_shots_cache:
        return _few_shots_cache[name]
    path = _FEW_SHOTS_DIR / f"{name}.json"
    if not path.exists():
        return ""
    examples = json.loads(path.read_text(encoding="utf-8"))
    lines = []
    for ex in examples:
        note   = ex.get("_note", ex.get("_article", ""))
        output = ex.get("output")
        lines.append(f"# {note}")
        lines.append(json.dumps(output, ensure_ascii=False, indent=2))
    result = "\n\n".join(lines)
    _few_shots_cache[name] = result
    return result


# Sélection dynamique des few-shots relation : chaque exemple du pool déclare les
# motifs qu'il illustre (_signals) ; on détecte ces motifs dans le texte de l'article
# et on ne montre que les exemples pertinents, plutôt que tout le pool à chaque fois.
# Ciblage sur des motifs d'erreur connus (régression/beta, renversement V1/V2 par
# langage prédictif, sous-échelles), pas une similarité sémantique générique.
_SIGNAL_PATTERNS: dict[str, re.Pattern] = {
    "regression":      re.compile(r"\bregression\b|β\s*=|\bbeta\s*=|standardi[sz]ed coefficient", re.IGNORECASE),
    "reversal":        re.compile(r"\bpredicted by\b|\bpredictor of\b|\boutcome variable\b|\bcriterion variable\b", re.IGNORECASE),
    "subscales":       re.compile(r"\bsubscale", re.IGNORECASE),
    "non_significant": re.compile(r"\bn\.?s\.?\b|not significant|p\s*[>≥]\s*\.?05", re.IGNORECASE),
}
_RELATIONS_DEFAULT_SIGNALS = ["reversal", "subscales"]  # repli si aucun signal détecté


def _load_relations_few_shots(text: str, k: int = 2) -> str:
    """Sélectionne les few-shots relation pertinents pour cet article.

    Les exemples 'baseline' sont toujours inclus comme ancre (variable dépendante
    DEAB, format de référence, et le contre-exemple hors-périmètre). Les autres
    exemples du pool sont notés par le nombre de
    leurs _signals détectés dans le texte, et les k meilleurs sont ajoutés. Si aucun
    signal ne matche, repli sur un sous-ensemble fixe pour ne jamais descendre sous
    la couverture d'avant (renversement + sous-échelles, les deux motifs les plus
    fréquemment mal gérés).
    """
    path = _FEW_SHOTS_DIR / "relations.json"
    if not path.exists():
        return ""
    examples = json.loads(path.read_text(encoding="utf-8"))

    baseline = [ex for ex in examples if "baseline" in ex.get("_signals", [])]
    pool     = [ex for ex in examples if "baseline" not in ex.get("_signals", [])]

    scored = [
        (sum(1 for sig in ex.get("_signals", [])
             if sig in _SIGNAL_PATTERNS and _SIGNAL_PATTERNS[sig].search(text)), ex)
        for ex in pool
    ]

    if any(score > 0 for score, _ in scored):
        scored.sort(key=lambda pair: pair[0], reverse=True)
        chosen = [ex for score, ex in scored if score > 0][:k]
    else:
        chosen = [ex for ex in pool if any(s in _RELATIONS_DEFAULT_SIGNALS for s in ex.get("_signals", []))][:k]

    lines = []
    for ex in baseline + chosen:
        note   = ex.get("_note", ex.get("_article", ""))
        output = ex.get("output")
        lines.append(f"# {note}")
        lines.append(json.dumps(output, ensure_ascii=False, indent=2))
    return "\n\n".join(lines)


def _build_sport_prompt(text: str, schema: dict) -> str:
    block = build_property_block("Sport", schema, _sport_vocab())
    return (
        _load_prompt("sport")
        .replace("{ONTOLOGY_BLOCK}", block)
        .replace("{FEW_SHOTS}", _load_few_shots("sport"))
        .replace("{TEXT}", text)
    )


def _detected_stats_block(text: str, include_keywords: bool = False) -> str:
    """Ancrage de rappel : phrases de prose contenant une valeur statistique
    (r/R²/β/p), repérées par regex (aucun appel LLM) — voir
    corr_matrix.scan_statistical_candidates(). Vide si rien détecté (--no-split,
    texte déjà couvert par les tableaux, etc.).

    include_keywords : EXPÉRIMENTAL (24/08/2026, désactivé par défaut) — ajoute les
    candidats de corr_matrix.scan_keyword_candidates() (correlate/related/associated/
    mediated/moderated/positively/negatively, sans valeur chiffrée). Risque de bruit
    documenté dans corr_matrix.py — à activer seulement via le harnais de test
    (tools/relations_variants.py --keywords), jamais par défaut tant que l'impact
    n'est pas validé empiriquement."""
    candidates = scan_statistical_candidates(text)
    keyword_candidates = scan_keyword_candidates(text) if include_keywords else []
    if not candidates and not keyword_candidates:
        return ""
    lines = []
    if candidates:
        lines += [
            f"RECALL CHECK — {len(candidates)} sentence(s) below contain a statistical "
            "value (r, R², β, or p) found by a mechanical scan of the text. Before "
            "finishing, check each one: either it already produced a relation in your "
            "output, or it genuinely does not report a correlation/regression between "
            "two variables (e.g. a sample-size, reliability, or group-comparison "
            "statistic, not a V1/V2 relation). Some of these may be duplicates of "
            "table rows already covered elsewhere — do not double-count them.",
            "",
        ]
        lines.extend(f"  - {c}" for c in candidates)
    if keyword_candidates:
        lines += [
            "",
            f"RECALL CHECK (qualitative) — {len(keyword_candidates)} sentence(s) below "
            "describe a correlation/relationship in words (correlated, related, "
            "associated, mediated, moderated, positively/negatively) without a number "
            "in the same sentence — the value may be in a table or elsewhere in the "
            "text. Check each one the same way: already covered, or genuinely out of "
            "scope.",
            "",
        ]
        lines.extend(f"  - {c}" for c in keyword_candidates)
    return "\n".join(lines)


def _build_relations_prompt(text: str, schema: dict, include_keywords: bool = False) -> str:
    rel_props = schema.get("Relations", {})
    stats_lines = []
    for pred, info in rel_props.items():
        stats_lines.append(f"  iadas:{pred}  ({info['range']})  — {info['comment']}")
    stats_block = "\n".join(stats_lines)
    return (
        _load_prompt("relations")
        .replace("{VARIABLE_BLOCK}", _variable_reference_block())
        .replace("{STATS_BLOCK}", stats_block)
        .replace("{FEW_SHOTS}", _load_relations_few_shots(text))
        .replace("{DETECTED_STATS}", _detected_stats_block(text, include_keywords))
        .replace("{TEXT}", text)
    )


_ontology_values_cache: dict[str, list[str]] | None = None


def _ontology_values() -> dict[str, list[str]]:
    """Lit common/vocabs/ontology_values.yaml (valeurs contrôlées par propriété), mis en cache."""
    global _ontology_values_cache
    if _ontology_values_cache is None:
        yaml_path = VOCABS_DIR / "ontology_values.yaml"
        with open(yaml_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        _ontology_values_cache = data.get("values", {})
    return _ontology_values_cache


def _controlled_values(preds: list[str]) -> dict[str, list[str]]:
    """{predicat: [valeurs]} restreint aux prédicats demandés (pour ALLOWED VALUES dans les prompts)."""
    values = _ontology_values()
    return {p: values[p] for p in preds if p in values}


# Blocs "scalaires" (pas d'entity linking, juste extraction + validation) :
# chunk_name -> (classe du schéma, nom du fichier prompt, prédicats autorisés).
_SCALAR_BLOCKS: dict[str, tuple[str, str, list[str]]] = {
    "analysis": ("Analysis", "analysis", [
        "typeOfAnalysis", "authorConclusion", "limites", "perspectives",
        "hasMediator", "mediatorMeasure", "hasModerator", "moderatorMeasure",
        "sampleSizeMobilized",
    ]),
    "population": ("Population", "population", [
        "gender", "sampleSize", "inclusionCriteria", "population",
        "hasSubgroup", "sportingPopulation",
    ]),
    "bibliographic": ("SportPsychologyArticle", "bibliographic", [
        "country", "studyType",
    ]),
}


def _build_scalar_prompt(chunk_name: str, text: str, schema: dict) -> str:
    class_name, prompt_name, preds = _SCALAR_BLOCKS[chunk_name]
    filtered = {class_name: {k: v for k, v in schema.get(class_name, {}).items() if k in preds}}
    block = build_property_block(class_name, filtered, controlled=_controlled_values(preds))
    return (
        _load_prompt(prompt_name)
        .replace("{ONTOLOGY_BLOCK}", block)
        .replace("{FEW_SHOTS}", _load_few_shots(prompt_name))
        .replace("{TEXT}", text)
    )


# ─── Métadonnées bibliographiques par DOI (CrossRef / OpenAlex) ───────────────

_article_index_cache: dict | None = None


def _stem_to_doi_from_index(stem: str) -> str | None:
    """Repli pour les 208 stems du corpus d'origine dont le DOI est figé dans
    article_index.json (extrait une fois de l'ancien GT, pas un appel réseau)."""
    global _article_index_cache
    if _article_index_cache is None:
        try:
            _article_index_cache = json.loads(ARTICLE_INDEX.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            _article_index_cache = {}
    by_doi = _article_index_cache.get("by_doi", {})
    return next((doi for doi, s in by_doi.items() if s == stem), None)


def _find_doi(text: str, stem: str) -> str | None:
    """DOI de l'article : d'abord repéré dans le texte du PDF (regex, fiable pour
    un nouvel article), sinon repli sur le DOI figé du corpus annoté d'origine."""
    return metadata_mod.find_doi_in_text(text) or _stem_to_doi_from_index(stem)


def _enrich_bibliographic(triplets: list[dict], text: str, stem: str) -> list[dict]:
    """Complète le bloc bibliographic avec les métadonnées CrossRef/OpenAlex du
    DOI de l'article : dcterms:title/creator/date, bibo:doi/journal (toujours,
    marqués _source="metadata"), et iadas:country/continent en repli seulement
    (le LLM reste prioritaire pour country : voir prompts/bibliographic.txt,
    règle 3, le pays de la POPULATION étudiée, pas de l'affiliation des
    auteurs que donne l'API). N'échoue jamais : hors ligne ou DOI introuvable
    -> triplets renvoyés inchangés.
    """
    try:
        doi = _find_doi(text, stem)
        if not doi:
            return triplets
        meta = metadata_mod.fetch_metadata(doi)
        if not meta:
            return triplets

        out = list(triplets)
        have = {t["predicate"] for t in out}

        def _add(pred: str, value):
            if value and pred not in have:
                out.append({"predicate": pred, "object": value, "_source": "metadata"})
                have.add(pred)

        _add("dcterms:title", meta.get("title"))
        _add("dcterms:creator", meta.get("creator"))
        _add("dcterms:date", meta.get("date"))
        _add("bibo:journal", meta.get("journal"))
        if "bibo:doi" not in have:
            out.append({"predicate": "bibo:doi", "object": doi, "_source": "metadata"})

        # country : priorité au LLM (texte de l'article) ; l'API ne comble que
        # si le LLM n'a rien trouvé, avec le premier pays d'affiliation connu
        # du vocabulaire contrôlé.
        country = next((t["object"] for t in out if t["predicate"] == "iadas:country"), None)
        if not country:
            for cc in meta.get("country_codes", []):
                name = metadata_mod.cc_to_country_name(cc)
                if name:
                    _add("iadas:country", name)
                    country = name
                    break

        # continent : toujours dérivé du pays retenu (le LLM ne l'extrait pas) ;
        # "Multiple countries" si les affiliations couvrent plusieurs continents
        # et qu'aucun country textuel n'a permis de trancher.
        if "iadas:continent" not in have:
            continent = metadata_mod.country_to_continent(country) if country else None
            if not continent and meta.get("country_codes"):
                continents = {metadata_mod.cc_to_continent(cc) for cc in meta["country_codes"]}
                continents.discard(None)
                if len(continents) > 1:
                    continent = "Multiple countries"
                elif len(continents) == 1:
                    continent = next(iter(continents))
            _add("iadas:continent", continent)

        return out
    except Exception as e:
        print(f"  [bibliographic] métadonnées DOI non appliquées ({e})")
        return triplets


# ─── Processors par bloc de données ────────────────────────────────────────────

def _process_sport(text, model_name, model_cfg, schema, no_factcheck, debug):
    print("  [sport] extraction LLM...")
    user = _build_sport_prompt(text, schema)
    try:
        raw = call_llm(model_name, model_cfg, _SYSTEM, user, label="sport", debug=debug)
        triplets = raw.get("sport", [])
    except Exception as e:
        print(f"  [sport] erreur LLM: {e}")
        return [], []

    valid, rejected = validate_structural(triplets, "Sport", schema)
    print(f"  [sport] structurel: {len(valid)} valides, {len(rejected)} rejetés")

    # sportLevel et le placeholder générique "Mixed sport" sont exemptés du factcheck :
    # sportLevel n'a pas de fallback classifier et tolère l'inférence sémantique ;
    # "Mixed sport" est une valeur de vocabulaire contrôlé, pas une phrase littérale du texte.
    sport_level    = next((t["object"] for t in valid if t["predicate"] == "iadas:sportLevel"), None)
    sport_name_raw = next((t["object"] for t in valid if t["predicate"] == "iadas:sportName"), None)

    sport_names = split_sport_names(sport_name_raw)
    is_generic  = len(sport_names) == 1 and is_generic_multisport(sport_names[0])

    # Nom composé : si le champ COMPLET se résout dans la hiérarchie, ne pas le
    # découper ('track and field' serait déchiqueté par le split sur ' and ').
    if len(sport_names) > 1 and _get_sport_clf().classify(sport_name_raw) is not None:
        sport_names = [re.sub(r"\s+", " ", str(sport_name_raw)).strip()]

    # Factcheck nom par nom : on ne perd plus toute la liste si un seul sport n'est pas
    # littéralement cité. Le placeholder générique n'est pas envoyé au factcheck.
    if not no_factcheck and sport_names and not is_generic:
        name_triplets = [{"predicate": "iadas:sportName", "object": s} for s in sport_names]
        kept, fact_rej = validate_factual(
            name_triplets, text, model_name, model_cfg,
            label="sport-fc", debug=debug, prompt_name="factcheck_sport",
        )
        rejected.extend(fact_rej)
        sport_names = [t["object"] for t in kept if t["predicate"] == "iadas:sportName"]
        print(f"  [sport] factuel: {len(sport_names)} sport(s) retenu(s), {len(fact_rej)} rejeté(s)")

    # Cas générique, ou tous les noms rejetés : on émet "Mixed sport" + défauts multi-sport.
    if is_generic or not sport_names:
        all_triplets = []
        if is_generic or sport_name_raw:
            all_triplets.append({"predicate": "iadas:sportName", "object": "Mixed sport"})
        if sport_level is not None:
            all_triplets.append({"predicate": "iadas:sportLevel", "object": sport_level})
        all_triplets.append({"predicate": "iadas:sportSubcategory",  "object": "Multisport", "_source": "classifier"})
        all_triplets.append({"predicate": "iadas:sportPracticeType", "object": "Mixed sport",  "_source": "classifier"})
        print(f"  [sport] sportName générique/absent — valeurs par défaut multi-sport émises")
        return all_triplets, rejected

    # Classifie chaque sport retenu indépendamment, puis agrégation partagée
    # (convention GT) : même classe pour tous → cette classe ; divergence →
    # Multisport ; AUCUN résolu → Multisport seulement si plusieurs noms,
    # None pour un mono-sport inconnu (un sport non résolu n'est pas un multi-sport).
    clf = _get_sport_clf()
    clf_results = [clf.classify(sport) for sport in sport_names]
    final_subcat, final_type = aggregate_sport_results(clf_results, len(sport_names))

    # Construit un bloc de 4 triplets par sport
    all_triplets = []
    for sport in sport_names:
        all_triplets.append({"predicate": "iadas:sportName", "object": sport})
        if sport_level is not None:
            all_triplets.append({"predicate": "iadas:sportLevel", "object": sport_level})
        all_triplets.append({"predicate": "iadas:sportSubcategory",  "object": final_subcat, "_source": "classifier"})
        all_triplets.append({"predicate": "iadas:sportPracticeType", "object": final_type,   "_source": "classifier"})

    print(f"  [sport] {len(sport_names)} sport(s) → subcategory={final_subcat!r}, practiceType={final_type!r}")
    return all_triplets, rejected


_EVIDENCE_MATCH_THRESHOLD = 70  # rapidfuzz partial_ratio (0-100)


def _check_evidence(evidence: str | None, source_text: str) -> bool | None:
    """Vérifie qu'une citation-preuve existe (approximativement) dans le texte source.

    Contrôle programmatique bon marché, complémentaire du factcheck LLM : une citation
    qui ne matche presque rien dans le texte est un signal fort de fabrication. Ne rejette
    PAS la relation (pour ne pas dégrader le recall sur un faux négatif de fuzzy-match) —
    se contente de marquer _evidence_verified pour permettre l'inspection/le reporting.
    None si aucune citation n'a été fournie par le LLM (rien à vérifier).
    """
    if not evidence or not evidence.strip():
        return None
    return fuzz.partial_ratio(evidence.strip(), source_text) >= _EVIDENCE_MATCH_THRESHOLD


def _process_relations(text, model_name, model_cfg, schema, no_factcheck, debug, include_keywords=False):
    print("  [relations] extraction LLM...")
    user = _build_relations_prompt(text, schema, include_keywords)
    try:
        raw = call_llm(model_name, model_cfg, _SYSTEM, user, label="relations", debug=debug)
        rel_list = raw.get("relations", []) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])
    except Exception as e:
        print(f"  [relations] erreur LLM: {e}")
        rel_list = []

    # Reconstruction des tableaux de corrélation : déterministe (valeurs exactes)
    # avec repli LLM par région pour les formats non reconnus. Fusionné au flux LLM.
    def _matrix_llm(system, usr):
        return call_llm(model_name, model_cfg, system, usr, label="rel-matrix", debug=debug)
    try:
        table_rels = extract_table_relations(text, classifier=_get_var_clf(), llm_fn=_matrix_llm)
        if table_rels:
            print(f"  [relations] +{len(table_rels)} via tableaux de corrélation")
        rel_list = list(rel_list) + table_rels
    except Exception as e:
        print(f"  [relations] corr-matrix erreur: {e}")

    # Relance de rappel (style ChatExtract) : redemande explicitement si des corrélations
    # chiffrées ont été manquées, avant de clore l'extraction — motivée par le recall mesuré
    # à 20.7% (666/3219, compare_type du 29/07/2026). Les relations retrouvées repassent par
    # le même traitement (validation, factcheck, classifier) que les relations ci-dessous.
    if not no_factcheck:
        missed = find_missed_relations(rel_list, text, model_name, model_cfg, debug=debug)
        rel_list = list(rel_list) + missed

    if not rel_list:
        return [], []

    all_rejected     = []
    processed_rels   = []

    for i, rel in enumerate(rel_list):
        v1_name    = rel.get("V1") or rel.get("v1")
        v2_name    = rel.get("V2") or rel.get("v2")
        v1_measure = rel.get("V1_measure") or rel.get("measureV1")
        v2_measure = rel.get("V2_measure") or rel.get("measureV2")
        stats_raw  = rel.get("stats", [])
        evidence   = rel.get("evidence")
        evidence_ok = _check_evidence(evidence, text)

        # Validation structurelle des stats
        valid_stats, rej_stats = validate_structural(stats_raw, "Relations", schema)
        all_rejected.extend(rej_stats)

        # Validation factuelle des stats — sautée pour les relations issues du
        # reconstructeur déterministe (valeurs lues directement dans le tableau).
        src = rel.get("_source", "")
        if not no_factcheck and valid_stats and src != "corr_matrix":
            valid_stats, fact_rej = validate_factual(
                valid_stats, text, model_name, model_cfg,
                label=f"rel{i+1}-fc", debug=debug, prompt_name="factcheck_relations",
            )
            if fact_rej:
                # Self-Refine (Madaan et al. 2023) : correction plutôt que rejet sec —
                # un triplet FAUX passe une dernière fois par le LLM avec le texte source
                # pour retrouver la bonne valeur, au lieu d'être perdu directement.
                corrected, fact_rej = refine_rejected_stats(
                    fact_rej, text, model_name, model_cfg,
                    label=f"rel{i+1}-refine", debug=debug,
                )
                if corrected:
                    valid_corrected, invalid_corrected = validate_structural(corrected, "Relations", schema)
                    valid_stats.extend(valid_corrected)
                    fact_rej.extend(invalid_corrected)
            all_rejected.extend(fact_rej)

        # Résolution des synonymes → noms canoniques pour V1/V2
        v1_canonical = apply_synonyms(v1_name, "variable") or v1_name
        v2_canonical = apply_synonyms(v2_name, "variable") or v2_name

        # Classifier hiérarchique pour V1 et V2 (utilise les noms canoniques)
        v1_clf = _classify_variable(v1_canonical)
        v2_clf = _classify_variable(v2_canonical)

        processed_rels.append({
            "V1": {
                "triplets": [
                    {"predicate": "iadas:V1",      "object": v1_canonical},
                    {"predicate": "iadas:measure",  "object": v1_measure},
                ] + v1_clf,
            },
            "V2": {
                "triplets": [
                    {"predicate": "iadas:V2",      "object": v2_canonical},
                    {"predicate": "iadas:measure",  "object": v2_measure},
                ] + v2_clf,
            },
            "stats": valid_stats,
            "_evidence": evidence,
            "_evidence_verified": evidence_ok,
            "_pair_key": frozenset([
                (v1_canonical or "").strip().lower(),
                (v2_canonical or "").strip().lower(),
            ]),
        })

    # Déduplication : r(A,B) == r(B,A) pour une corrélation, on garde la première occurrence
    seen_pairs: set[frozenset] = set()
    deduped: list[dict] = []
    for rel in processed_rels:
        key = rel.pop("_pair_key")
        if key not in seen_pairs:
            seen_pairs.add(key)
            deduped.append(rel)

    n_dup = len(processed_rels) - len(deduped)
    if n_dup:
        print(f"  [relations] {n_dup} doublons V1/V2 supprimés")

    print(f"  [relations] {len(deduped)} relations extraites, {len(all_rejected)} triplets rejetés")
    return deduped, all_rejected


def _process_scalar_block(chunk_name, text, model_name, model_cfg, schema, no_factcheck, debug):
    class_name, prompt_name, _preds = _SCALAR_BLOCKS[chunk_name]
    print(f"  [{chunk_name}] extraction LLM...")
    user = _build_scalar_prompt(chunk_name, text, schema)
    try:
        raw = call_llm(model_name, model_cfg, _SYSTEM, user, label=chunk_name, debug=debug)
        triplets = raw.get(prompt_name, [])
    except Exception as e:
        print(f"  [{chunk_name}] erreur LLM: {e}")
        return [], []

    valid, rejected = validate_structural(triplets, class_name, schema)
    print(f"  [{chunk_name}] structurel: {len(valid)} valides, {len(rejected)} rejetés")

    # studyType tolère l'inférence par défaut ("Cross-sectional studies" quand le texte ne
    # décrit aucune mesure répétée, même sans le mot littéral — voir prompts/bibliographic.txt) :
    # exempté du factcheck littéral, même raison que sportLevel dans _process_sport().
    to_check = [t for t in valid if t["predicate"] != "iadas:studyType"]
    exempt   = [t for t in valid if t["predicate"] == "iadas:studyType"]

    if not no_factcheck and to_check:
        to_check, fact_rej = validate_factual(
            to_check, text, model_name, model_cfg, label=f"{chunk_name}-fc", debug=debug,
        )
        rejected.extend(fact_rej)
        print(f"  [{chunk_name}] factuel: {len(to_check)} vérifiés, {len(fact_rej)} rejetés")

    return to_check + exempt, rejected


# ─── Extraction d'un article ──────────────────────────────────────────────────

def extract_article(
    path: Path,
    model_name: str,
    model_cfg: dict,
    chunks: list[str],
    no_factcheck: bool,
    debug: bool,
    split: bool = True,
    no_metadata: bool = False,
) -> dict:
    stem = path.stem
    print(f"\n{'=' * 60}")
    print(f"Article : {stem}")
    print(f"Blocs   : {', '.join(chunks)}  |  split: {'oui' if split else 'non (texte entier)'}")
    print(f"{'=' * 60}")

    text   = read_file(path)
    schema = load_schema()

    # A/B : si split désactivé, chaque prompt reçoit le texte entier
    sport_text        = _sport_text(path, text)        if split else text
    relations_text     = _relations_text(path, text)    if split else text
    analysis_text       = _analysis_text(path, text)     if split else text
    population_text     = _population_text(path, text)   if split else text
    bibliographic_text  = _bibliographic_text(path, text) if split else text

    output: dict = {
        "_article":      stem,
        "_model":        model_name,
        "_date":         str(date.today()),
        "_pipeline":     "type-baeo",
        "_rejected":     [],
        "Sport":         [],
        "Relations":     [],
        "Analysis":      [],
        "Population":    [],
        "Bibliographic": [],
    }

    if "sport" in chunks:
        v, r = _process_sport(sport_text, model_name, model_cfg, schema, no_factcheck, debug)
        output["Sport"] = v
        output["_rejected"].extend(r)

    if "relations" in chunks:
        v, r = _process_relations(relations_text, model_name, model_cfg, schema, no_factcheck, debug)
        output["Relations"] = v
        output["_rejected"].extend(r)

    if "analysis" in chunks:
        v, r = _process_scalar_block("analysis", analysis_text, model_name, model_cfg, schema, no_factcheck, debug)
        output["Analysis"] = v
        output["_rejected"].extend(r)

    if "population" in chunks:
        v, r = _process_scalar_block("population", population_text, model_name, model_cfg, schema, no_factcheck, debug)
        output["Population"] = v
        output["_rejected"].extend(r)

    if "bibliographic" in chunks:
        v, r = _process_scalar_block("bibliographic", bibliographic_text, model_name, model_cfg, schema, no_factcheck, debug)
        if not no_metadata:
            print("  [bibliographic] recherche de métadonnées par DOI (CrossRef/OpenAlex)...")
            v = _enrich_bibliographic(v, text, stem)
        output["Bibliographic"] = v
        output["_rejected"].extend(r)

    return output

# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Pipeline BAEO-style IADAS — extraction directe en triplets ontologiques"
    )
    parser.add_argument("articles", nargs="+", help="Fichiers PDF ou TXT à traiter (glob accepté)")
    parser.add_argument("--model",        default=None,   help="Modèle Ollama")
    parser.add_argument("--chunks",       nargs="+", choices=CHUNKS, default=CHUNKS,
                        help="Chunks à extraire (défaut : tous)")
    parser.add_argument("--no-factcheck", action="store_true", help="Désactive la validation factuelle")
    parser.add_argument("--debug",        action="store_true", help="Affiche la sortie LLM brute")
    parser.add_argument("--no-split",     action="store_true",
                        help="Envoie le texte entier à chaque prompt (désactive le routage par section, pour A/B)")
    parser.add_argument("--no-metadata",  action="store_true",
                        help="Désactive la recherche de métadonnées par DOI (CrossRef/OpenAlex), pour une exécution hors ligne")
    args = parser.parse_args()

    model_name, model_cfg = load_model_cfg(args.model)
    print(f"Modèle : {model_name}")
    print(f"Sortie : {_OUT_DIR}")

    _OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Résolution des chemins (supporte les globs et les noms relatifs à articles/)
    paths: list[Path] = []
    for pattern in args.articles:
        expanded = list(Path(".").glob(pattern)) if "*" in pattern else [Path(pattern)]
        for p in expanded:
            if not p.exists():
                candidate = _ARTICLES / p.name
                if candidate.exists():
                    p = candidate
                else:
                    print(f"[skip] {p} introuvable")
                    continue
            paths.append(p)

    if not paths:
        print("Aucun fichier à traiter.")
        sys.exit(1)

    for path in paths:
        try:
            result   = extract_article(path, model_name, model_cfg, args.chunks,
                                        args.no_factcheck, args.debug, split=not args.no_split,
                                        no_metadata=args.no_metadata)
            out_name = f"{path.stem}_type.json"
            # test (corpus annoté) → _OUT_DIR ; production (article nouveau) → _OUT_DIR/production/
            out_path = route(_OUT_DIR / str(date.today()), path.stem) / out_name
            out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

            n_rel = len(result.get("Relations", []))
            n_rej = len(result.get("_rejected", []))
            print(f"\n  -> [{mode_for(path.stem)}] {out_path.name}")
            print(f"     {n_rel} relations | {n_rej} triplets rejetés")
        except Exception as e:
            print(f"\n  [ERREUR] {path.name}: {e}")
            if args.debug:
                import traceback
                traceback.print_exc()


if __name__ == "__main__":
    main()
