#!/usr/bin/env python3
"""
build_vocab.py — Génère les fichiers de configuration depuis les TTL IADAS.

Sources : sport-hierarchy.ttl, variable-hierarchy.ttl, tools-vocab.ttl,
IADAS-Model.ttl (ontology/linking-tuned/).

  common/vocabs/ontology_sport.yaml    — vocabulaire sport (noms + sportLevel + ...)
  common/vocabs/ontology_variable.yaml — vocabulaire variables (noms + measures + ...)
  common/vocabs/type_schema.yaml       — classes/propriétés OWL pour le pipeline Type

sportLevel (canonical/definitions/aliases) n'existe pas. Ce n'est donc pas un vocabulaire ontologique mais une liste
contrôlée définie en dur ci-dessous (_SPORT_LEVELS); ajouter/éditer un niveau se
fait là puis en relançant ce script.

Usage:
    iacad-build-vocab
"""
import re
import sys
from pathlib import Path

import yaml
from rdflib import Graph, URIRef
from rdflib.namespace import RDFS, OWL

from ia_cad.paths import ONTOLOGY_DIR, REPO_ROOT, VOCABS_DIR

_ONTO       = ONTOLOGY_DIR / "linking-tuned"
_COMMUN     = VOCABS_DIR


def _show(p: Path) -> str:
    """Chemin lisible pour l'affichage : relatif à la racine du dépôt si possible.

    VOCABS_DIR suit le package ; avec un override $IA_CAD_ROOT pointant hors de
    l'arbre du package, relative_to() lèverait ValueError — on retombe sur le nom.
    """
    try:
        return str(p.relative_to(REPO_ROOT))
    except ValueError:
        return p.name


_IADAS_NS = "http://ia-das.org/onto#"
_XSD_NS   = "http://www.w3.org/2001/XMLSchema#"
_SKOS     = URIRef("http://www.w3.org/2004/02/skos/core#")
_NS       = {"skos": _SKOS, "owl": OWL, "rdfs": RDFS}


def _load(filename: str) -> Graph:
    """Charge un TTL de Onto/ dans un graphe rdflib (une source = un graphe).

    build_vocab interroge chaque fichier séparément (et non le graphe fusionné de
    l'entity linking) pour que les listes canoniques restent scopées à leur source :
    l'enrichissement altLabel ne doit pas gonfler la liste de variables, etc.
    """
    g = Graph()
    g.parse(str(_ONTO / filename), format="turtle")
    return g

# ─── Extraction du vocabulaire par requêtes SPARQL (Onto/ fait foi) ────────────

# Valeurs possibles par propriété = les valeurs DÉJÀ PRÉSENTES dans l'ABox
# (le graphe de connaissances peuplé). Le vocab, ce sont toutes les valeurs
# que l'on peut mettre dans l'onto pour les champs extraits de l'article —
# hors champs déduits par l'entity linking (sportPracticeType, refersToVariable).
# Les artefacts d'annotation se reconnaissent à leur FORME, pas à leur rareté
# (une valeur rare peut être légitime : 'India', 1 occurrence) : résidu de
# formule Excel ('=+BG675'), cellule multi-lignes ('...\nSobel test').
_ABOX_FILE = "ia-das-ontology-clean.ttl"
_ABOX_VALUE_PROPS = [
    "sportLevel", "gender", "studyType", "population", "numberOfSportStudied",
    "relationDirection", "complexityOfAnalysis", "groupStatisticalAnalysis",
    "continent", "country", "typeOfAnalysis",
]


def _is_artefact(val: str) -> bool:
    return val.startswith("=") or "\n" in val or "\\n" in val


def sparql_abox_values(g: Graph) -> dict[str, list[str]]:
    """{propriété: [valeurs canoniques]} — SELECT DISTINCT sur l'ABox, par SPARQL.

    Les artefacts d'annotation (_is_artefact : formules Excel, multi-lignes)
    sont écartés et signalés. Les doublons de casse sont fusionnés sur la
    variante la plus fréquente ('simple analyses' → 'Simple analyses')."""
    onto_ns = "http://ns.inria.fr/iadas/ontology/"
    out: dict[str, list[str]] = {}
    for prop in _ABOX_VALUE_PROPS:
        rows = g.query(
            "SELECT ?v (COUNT(?s) AS ?n) WHERE { ?s <%s%s> ?v } GROUP BY ?v"
            % (onto_ns, prop))
        counts: dict[str, int] = {}
        for v, n in rows:
            val = str(v).strip()
            if val:
                counts[val] = counts.get(val, 0) + int(n)
        # fusion des doublons de casse sur la variante majoritaire
        by_lower: dict[str, str] = {}
        for val in sorted(counts, key=lambda x: -counts[x]):
            key = val.lower()
            if key in by_lower:
                counts[by_lower[key]] += counts.pop(val)
                print(f"  [abox] {prop}: variante de casse fusionnée {val!r} -> {by_lower[key]!r}")
            else:
                by_lower[key] = val
        kept = []
        for val in counts:
            if _is_artefact(val):
                print(f"  [abox] {prop}: artefact écarté ({counts[val]} occ.) : {val!r}")
            else:
                kept.append(val)
        out[prop] = sorted(kept)
    return out


def sparql_pref_labels(g: Graph, en_only: bool = True) -> list[str]:
    """
    Certains prefLabel de tools-vocab collent plusieurs noms distincts via un
    "\\n" (artefact d'une cellule Excel multi-lignes) : on les resépare ici en
    labels indépendants plutôt que de garder un seul terme illisible.
    """
    lang_filter = "FILTER(lang(?l) = '' || langMatches(lang(?l), 'en'))" if en_only else ""
    rows = g.query(f"SELECT DISTINCT ?l WHERE {{ ?s skos:prefLabel ?l . {lang_filter} }}",
                   initNs=_NS)
    labels: set[str] = set()
    for (lit,) in rows:
        for part in str(lit).replace("\\n", "\n").split("\n"):
            label = part.strip()
            if label:
                labels.add(label)
    return sorted(labels)


def clean_measure_labels(raw: list[str]) -> list[str]:
    """Filtre les noms d'instruments psychométriques depuis tools-vocab.ttl."""
    cleaned = []
    for label in raw:
        if len(label) > 150:
            continue
        if re.match(r"^\d+[.\)]\s", label):
            continue
        if "?" in label:
            continue
        if len(label) < 4:
            continue
        if re.match(r"^(I |My |The |This |When |How |Please |On )", label):
            continue
        cleaned.append(label)
    return sorted(set(cleaned))


# ─── Schéma de classes/propriétés OWL (pour le pipeline Type) ─────────────────

def build_type_schema(g: Graph) -> dict[str, dict[str, dict]]:
    """Propriétés OWL groupées par classe de domaine, extraites par SPARQL.

    {ClassName: {predicate: {range, comment}}} — même extraction que l'ancien
    TYPE/core/ontology.py:load_schema(), exécutée au build seulement.
    """
    rows = g.query(
        """
        SELECT ?prop ?domain ?range ?comment WHERE {
          ?prop a owl:DatatypeProperty ; rdfs:domain ?domain .
          OPTIONAL { ?prop rdfs:range ?range }
          OPTIONAL { ?prop rdfs:comment ?comment . FILTER(langMatches(lang(?comment), 'en')) }
        }
        ORDER BY ?domain ?prop
        """, initNs=_NS)

    schema: dict[str, dict[str, dict]] = {}
    for prop, domain, range_uri, comment in rows:
        local_name = str(prop).replace(_IADAS_NS, "")
        if not local_name or "/" in local_name or local_name.startswith("http"):
            continue
        domain_local = str(domain).replace(_IADAS_NS, "")
        if not domain_local or domain_local.startswith("http") or domain_local[0] == "N":
            continue  # BNode ou URI externe

        range_local = "string"
        if range_uri is not None:
            r = str(range_uri).replace(_XSD_NS, "")
            if r in ("decimal", "float", "double"):
                range_local = "decimal"
            elif r == "integer":
                range_local = "integer"

        entry = schema.setdefault(domain_local, {})
        if local_name in entry:
            continue  # 1re ligne gagne (équivalent du break sur le 1er commentaire en)
        entry[local_name] = {
            "range": range_local,
            "comment": str(comment) if comment else local_name,
        }
    return schema


# ─── Aides au prompt pour le niveau sportif ───────────────────────────────────
# La liste CANONIQUE des niveaux est extraite de l'ABox (sparql_abox_values,
# propriété iadas:sportLevel) — ce dict ne fournit plus que les définitions et
# aliases injectés dans les prompts pour guider le LLM (matière de prompt
# engineering, absente de l'onto par nature).
_SPORT_LEVELS: dict[str, dict] = {
    "Student": {
        "definition": (
            "Participants enrolled in an academic program (university, college, "
            "conservatory, sport school, dance academy) as their primary status. "
            "Key signal: 'students', 'university', 'college', 'collegiate', "
            "'enrolled', 'school', 'conservatory'."
        ),
        "aliases": [
            "student athlete", "student athletes", "university student",
            "university students", "university athlete", "university athletes",
            "collegiate", "college student", "college athlete",
            "conservatory student", "dance student", "dance students",
            "school student", "university-level",
        ],
    },
    "Amateur": {
        "definition": (
            "Non-professional practitioners not in an academic program. Includes "
            "club athletes, gym members, recreational or fitness participants. "
            "Key signal: 'amateur', 'club', 'gym', 'recreational', 'fitness', "
            "'non-professional'."
        ),
        "aliases": [
            "gym member", "gym members", "recreational athlete",
            "recreational athletes", "leisure", "non-competitive", "fitness",
            "amateur athlete", "amateur athletes", "competitive athlete",
            "competitive athletes", "sub-elite", "national-level",
        ],
    },
    "Professional": {
        "definition": (
            "Athletes for whom sport is a primary occupation, or competing at "
            "elite/Olympic level with compensation. Key signal: 'professional', "
            "'elite', 'national team', 'Olympic', 'paid'."
        ),
        "aliases": [
            "international-level", "elite athlete", "elite athletes",
            "high-level", "high level", "high performance", "top-level",
            "professional athlete", "professional athletes", "pro",
        ],
    },
}


# ─── Constructeurs YAML ────────────────────────────────────────────────────────

def build_sport_yaml(sport_labels: list[str], level_concepts: dict[str, dict],
                     level_canonical: list[str]) -> dict:
    # sportLevel : liste canonique extraite de l'ABox par SPARQL ; _SPORT_LEVELS
    # ne fournit plus que les définitions/aliases d'aide au prompt.
    level_definitions: dict[str, str] = {}
    level_aliases: dict[str, str] = {}
    for label in level_canonical:
        data = level_concepts.get(label, {})
        if data.get("definition"):
            level_definitions[label] = data["definition"]
        for alias in data.get("aliases", []):
            level_aliases[alias] = label

    return {
        "version": "2.0.0",
        "source": "Onto/sport-hierarchy-simple-clean.ttl",
        "sportName": {
            "description": (
                "Canonical sport names from IADAS sport-hierarchy.ttl. "
                "Use the exact name listed here for sportName."
            ),
            "canonical": sport_labels,
        },
        "sportPracticeType": {
            "description": (
                "Individual or collective character of the sport. "
                "Assigned by sport_practice.yaml lookup — the LLM extracts the sport name; "
                "sportPracticeType is inferred algorithmically."
            ),
            "canonical": [
                "Individual sport",
                "Team sport",
                "Mixed sport",
                "Dual sport",
            ],
        },
        "sportLevel": {
            "description": (
                "Level of the study participants. Controlled vocabulary "
                "(values present in the IADAS knowledge graph) — choose the single best match."
            ),
            "canonical": level_canonical,
            "definitions": level_definitions,
            "aliases": level_aliases,
        },
        "nbrSport": {
            "description": "Whether the study focuses on one or multiple distinct sports.",
            "canonical": ["One", "Multiple"],
        },
    }


def build_variable_yaml(variable_labels: list[str], measure_labels: list[str]) -> dict:
    return {
        "version": "2.0.0",
        "source": "Onto/variable-hierarchy-clean.ttl + Onto/tools-vocab.ttl",
        "variable": {
            "description": (
                "Canonical variable names from IADAS variable-hierarchy.ttl. "
                "Use these exact names (or close variants) for V1 and V2."
            ),
            "canonical": variable_labels,
        },
        "measure": {
            "description": (
                "Psychometric instrument names from IADAS tools-vocab.ttl. "
                "Use the exact name or abbreviation for measureV1 / measureV2."
            ),
            "canonical": measure_labels,
        },
        "variableType": {
            "description": (
                "Type of statistical relationship between V1 and V2. Controlled vocabulary."
            ),
            "canonical": [
                "direct",
                "mediated",
                "moderated",
                "mediated-moderated",
            ],
        },
        "hasCategory": {
            "description": (
                "Top-level IADAS ontological category for the dependent variable (V1_CLASS). "
                "Use the exact string — these map to the IADAS VD taxonomy root nodes."
            ),
            "canonical": [
                "DEAB",
                "Intrapersonal factor related to DEAB",
                "Interpersonal factor related to DEAB",
                "Sociocultural factor related to DEAB",
                "Other behaviors",
            ],
            "definitions": {
                "DEAB": (
                    "Primary outcome domain — disordered eating and associated behaviors. "
                    "Typical V1 concepts: eating disorders, disordered eating, body image, "
                    "body dissatisfaction, body appreciation, dietary restraint, drive for "
                    "thinness, orthorexia nervosa, anorexia nervosa, bulimia nervosa, binge "
                    "eating, eating attitudes, weight/shape concerns, muscle dysmorphia, body "
                    "checking, weight control behaviors, restrained eating, emotional eating."
                ),
                "Intrapersonal factor related to DEAB": (
                    "Psychological characteristics internal to the individual. "
                    "Typical V2 concepts: self-esteem, perfectionism, anxiety, depression, "
                    "affect, mood, motivation, athletic identity, self-compassion, psychological "
                    "flexibility, mindfulness, self-efficacy, coping strategies, ego orientation."
                ),
                "Interpersonal factor related to DEAB": (
                    "Social interactions and relational dynamics influencing DEAB. "
                    "Typical V2 concepts: fat talk, muscle talk, body talk, peer pressure, "
                    "coach pressure, social comparison, appearance teasing, weight commentary, "
                    "social support, appearance-related feedback."
                ),
                "Sociocultural factor related to DEAB": (
                    "Cultural, media, and sport-environment influences on DEAB. "
                    "Typical V2 concepts: thin ideal internalization, muscularity ideal "
                    "internalization, media exposure, sport-specific weight norms, appearance "
                    "norms, sociocultural pressures, aesthetic sport demands."
                ),
                "Other behaviors": (
                    "Behavioral correlates not classified elsewhere. "
                    "Typical concepts: physical activity level, exercise frequency, dietary "
                    "habits, supplement use, weight management, training load, exercise "
                    "dependence, alcohol use."
                ),
            },
        },
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    # Onto/ fait foi ; toute donnée d'ontologie est récupérée par requête SPARQL.
    sources = {
        "sport":    "sport-hierarchy-simple-clean.ttl",
        "variable": "variable-hierarchy-clean.ttl",
        "tools":    "tools-vocab.ttl",
        "model":    "IADAS-Model.ttl",
    }
    for filename in sources.values():
        if not (_ONTO / filename).exists():
            print(f"[ERR] File not found: {_ONTO / filename}", file=sys.stderr)
            sys.exit(1)

    print("Extracting sport names (SPARQL) ...")
    sport_labels = sparql_pref_labels(_load(sources["sport"]))
    print(f"  {len(sport_labels)} sport names")

    print("Extracting variable names (SPARQL) ...")
    variable_graph  = _load(sources["variable"])
    variable_labels = sparql_pref_labels(variable_graph)
    print(f"  {len(variable_labels)} variable names")

    print("Extracting measure names (SPARQL) ...")
    raw_measures   = sparql_pref_labels(_load(sources["tools"]), en_only=False)
    measure_labels = clean_measure_labels(raw_measures)
    print(f"  {len(raw_measures)} raw, {len(measure_labels)} cleaned measure names")

    print("Extracting per-property value lists (SPARQL, ABox) ...")
    abox_graph = _load(_ABOX_FILE)
    abox_values = sparql_abox_values(abox_graph)
    print(f"  {len(abox_values)} properties: "
          + ", ".join(f"{p}({len(v)})" for p, v in abox_values.items()))

    level_canonical = abox_values.get("sportLevel", [])
    level_concepts = _SPORT_LEVELS
    n_aliases = sum(len(d["aliases"]) for d in level_concepts.values())
    print(f"  sportLevel: {level_canonical} (+ {n_aliases} aliases de prompt)")

    print("Extracting Type schema (SPARQL, IADAS-Model.ttl) ...")
    type_schema = build_type_schema(_load(sources["model"]))
    n_props = sum(len(p) for p in type_schema.values())
    print(f"  {len(type_schema)} classes, {n_props} properties")

    _COMMUN.mkdir(parents=True, exist_ok=True)

    # common/vocabs/ontology_sport.yaml
    sport_path = _COMMUN / "ontology_sport.yaml"
    print(f"\nWriting {_show(sport_path)} ...")
    with open(sport_path, "w", encoding="utf-8") as f:
        yaml.dump(build_sport_yaml(sport_labels, level_concepts, level_canonical), f,
                  allow_unicode=True, default_flow_style=False, sort_keys=False, width=120)

    # common/vocabs/ontology_values.yaml  (valeurs possibles par propriété, tirées de l'ABox)
    values_path = _COMMUN / "ontology_values.yaml"
    print(f"Writing {_show(values_path)} ...")
    with open(values_path, "w", encoding="utf-8") as f:
        yaml.dump({"version": "2.0.0", "source": f"Onto/{_ABOX_FILE} (SELECT DISTINCT par propriété)",
                   "values": abox_values}, f,
                  allow_unicode=True, default_flow_style=False, sort_keys=False, width=120)

    # common/vocabs/ontology_variable.yaml
    var_path = _COMMUN / "ontology_variable.yaml"
    print(f"Writing {_show(var_path)} ...")
    with open(var_path, "w", encoding="utf-8") as f:
        yaml.dump(build_variable_yaml(variable_labels, measure_labels), f,
                  allow_unicode=True, default_flow_style=False, sort_keys=False, width=120)

    # common/vocabs/type_schema.yaml  (classes/propriétés OWL pour le pipeline)
    schema_path = _COMMUN / "type_schema.yaml"
    print(f"Writing {_show(schema_path)} ...")
    with open(schema_path, "w", encoding="utf-8") as f:
        yaml.dump({"version": "2.0.0", "source": "Onto/IADAS-Model.ttl", "classes": type_schema}, f,
                  allow_unicode=True, default_flow_style=False, sort_keys=False, width=120)

    # Stats
    print(f"\nBuild complete.")
    print(f"  ontology_sport.yaml    : {len(sport_labels)} sport names")
    print(f"  ontology_variable.yaml : {len(variable_labels)} variables, {len(measure_labels)} measures")
    print(f"  type_schema.yaml       : {len(type_schema)} classes, {n_props} properties")


if __name__ == "__main__":
    main()
