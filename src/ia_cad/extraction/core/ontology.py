"""ontology.py — Schéma de classes/propriétés IADAS pour le pipeline Type.

Fournit :
  - load_schema() → dict {ClassName: {predicate: {range, comment}}}
  - build_property_block() → bloc texte injecté dans les prompts

Le schéma est lu depuis common/vocabs/type_schema.yaml, construit une fois pour
toutes par build_vocab.py à partir de IADAS-Model.ttl (rdflib). Ce module ne
parse plus le TTL au runtime — après une modification de l'ontologie,
relancer `iacad-build-vocab` pour régénérer type_schema.yaml.
"""
import yaml

from ia_cad.paths import VOCABS_DIR

_SCHEMA_YAML = VOCABS_DIR / "type_schema.yaml"

_schema_cache: dict | None = None


def load_schema() -> dict:
    """Lit common/vocabs/type_schema.yaml (mis en cache après le premier appel).

    Retourne :
        {
          "Sport": {
            "sportName":  {"range": "string",  "comment": "Name of the sport activity"},
            "sportLevel": {"range": "string",  "comment": "Level of sport practice"},
            ...
          },
          "Relations": {
            "degreR": {"range": "decimal", "comment": "Correlation coefficient"},
            ...
          },
          ...
        }
    """
    global _schema_cache
    if _schema_cache is not None:
        return _schema_cache

    with open(_SCHEMA_YAML, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    _schema_cache = data["classes"]
    return _schema_cache


def build_property_block(
    class_name: str,
    schema: dict,
    controlled: dict[str, list[str]] | None = None,
) -> str:
    """Construit le bloc texte ontologique à injecter dans les prompts.

    controlled : dict optionnel {nom_predicat: [valeur1, valeur2, ...]} pour les champs enum.
    """
    props = schema.get(class_name, {})
    if not props:
        return f"[AVERTISSEMENT : classe '{class_name}' introuvable dans le schéma]"

    lines = [
        f"IADAS ONTOLOGY — {class_name.upper()} PROPERTIES",
        "Use ONLY these predicates (exact names required) :",
        "─" * 64,
    ]
    for pred, info in props.items():
        line = f"  iadas:{pred}  ({info['range']})  — {info['comment']}"
        if controlled and pred in controlled:
            values = controlled[pred]
            if len(values) <= 10:
                line += f"\n    → ALLOWED VALUES: {' | '.join(values)}"
            else:
                # Longue liste (ex. noms de sport) : découpée en blocs de 15 pour rester lisible.
                line += "\n    → ALLOWED VALUES:"
                for i in range(0, len(values), 15):
                    line += "\n      " + " | ".join(values[i:i + 15])
        lines.append(line)
    lines.append("─" * 64)
    return "\n".join(lines)
