"""validator.py — Double validation des triplets IADAS.

1. Validation structurelle : prédicat connu + range typé (decimal/integer/string).
2. Validation factuelle : LLM VRAI/FAUX par triplet contre le texte source.
"""
import json

from ia_cad.paths import PROMPTS_DIR

from .llm import call_llm

_SYSTEM_FACTCHECK = (
    "You are a strict fact-checker for scientific article extraction for the IADAS knowledge graph. "
    "You verify whether extracted predicate-object pairs are explicitly and literally supported "
    "by the source text. Do not allow inferences — only confirm what the text states directly."
)


# ─── Validation structurelle ──────────────────────────────────────────────────

def validate_structural(
    triplets: list[dict],
    class_name: str,
    schema: dict,
) -> tuple[list[dict], list[dict]]:
    """Vérifie que chaque triplet utilise un prédicat valide et un objet du bon type.

    Retourne : (triplets_valides, triplets_rejetés)
    Les triplets rejetés ont une clé "_rejected_reason" ajoutée.
    """
    class_props = schema.get(class_name, {})
    valid: list[dict]    = []
    rejected: list[dict] = []

    for t in triplets:
        pred_full = t.get("predicate", "")
        pred      = pred_full.replace("iadas:", "").strip()
        obj       = t.get("object")

        # Prédicat inconnu
        if pred not in class_props:
            rejected.append({**t, "_rejected_reason": f"prédicat '{pred}' absent de la classe {class_name}"})
            continue

        # Objet null → valide (absent dans le texte, mais triplet structure correcte)
        if obj is None:
            valid.append({**t, "_null": True})
            continue

        # Vérification du range
        expected = class_props[pred]["range"]
        if expected == "decimal":
            try:
                float(str(obj))
            except (TypeError, ValueError):
                rejected.append({**t, "_rejected_reason": f"'{obj}' n'est pas un decimal (attendu pour {pred})"})
                continue
        elif expected == "integer":
            try:
                int(str(obj))
                # Normalise en int si la valeur est un float sans décimale
                if isinstance(obj, float) and obj == int(obj):
                    t = {**t, "object": int(obj)}
            except (TypeError, ValueError):
                rejected.append({**t, "_rejected_reason": f"'{obj}' n'est pas un integer (attendu pour {pred})"})
                continue

        valid.append(t)

    return valid, rejected


# ─── Validation factuelle ─────────────────────────────────────────────────────

def validate_factual(
    triplets: list[dict],
    text: str,
    model_name: str,
    model_cfg: dict,
    label: str = "factcheck",
    debug: bool = False,
    prompt_name: str = "factcheck",
) -> tuple[list[dict], list[dict]]:
    """Vérifie chaque triplet contre le texte source via un prompt LLM VRAI/FAUX.

    Les triplets null (_null=True) ne sont pas envoyés au LLM (absence confirmée).
    Retourne : (triplets_vérifiés, triplets_rejetés)
    """
    if not triplets:
        return [], []

    # Sépare les null (pas besoin de vérification) des triplets à valider
    to_check = [t for t in triplets if not t.get("_null") and t.get("object") is not None]
    nulls    = [t for t in triplets if t.get("_null") or t.get("object") is None]

    if not to_check:
        return list(nulls), []

    # Construit la liste à envoyer (sans les clés internes _*)
    clean_list = [
        {"predicate": t["predicate"], "object": t["object"]}
        for t in to_check
    ]
    triplets_str = json.dumps(clean_list, ensure_ascii=False, indent=2)

    prompt_path = PROMPTS_DIR / f"{prompt_name}.txt"
    template    = prompt_path.read_text(encoding="utf-8")
    user        = template.replace("{TEXT}", text).replace("{TRIPLETS}", triplets_str)

    try:
        result = call_llm(model_name, model_cfg, _SYSTEM_FACTCHECK, user, label=label, debug=debug)
    except Exception as e:
        print(f"  [factcheck erreur: {e}] — triplets conservés sans vérification")
        return list(triplets), []

    verdicts = result.get("verdicts", []) if isinstance(result, dict) else []
    if not verdicts:
        print(f"  [factcheck] réponse inattendue ou vide — triplets conservés")
        return list(triplets), []

    verified: list[dict] = list(nulls)
    rejected: list[dict] = []

    for i, verdict_item in enumerate(verdicts):
        if i >= len(to_check):
            break
        original = to_check[i]
        verdict  = str(verdict_item.get("verdict", "")).strip().upper()
        if verdict == "VRAI":
            verified.append(original)
        else:
            rejected.append({**original, "_rejected_reason": "factcheck FAUX"})

    # Si le LLM a retourné moins d'éléments que prévu, conserve les non-évalués
    for i in range(len(verdicts), len(to_check)):
        verified.append(to_check[i])

    return verified, rejected


# ─── Self-Refine (correction plutôt que rejet sec) ─────────────────────────────

def refine_rejected_stats(
    fact_rej: list[dict],
    text: str,
    model_name: str,
    model_cfg: dict,
    label: str = "refine",
    debug: bool = False,
) -> tuple[list[dict], list[dict]]:
    """Self-Refine (Madaan et al. 2023) : au lieu de jeter sec un triplet jugé FAUX par
    validate_factual, redemande une valeur corrigée au LLM à partir du texte source,
    la critique implicite étant "ce n'est pas ce que dit le texte, retrouve la bonne
    valeur". Une seule passe de correction (pas de boucle itérative) et PAS de
    re-factcheck sur le résultat, pour éviter un aller-retour sans fin — si le LLM ne
    trouve toujours pas la bonne valeur, le triplet reste simplement absent du résultat
    final plutôt que de bloquer le pipeline. Les triplets corrigés portent
    _source="self_refine" (métadonnée pipeline, traçable, non exportée en TTL).

    fact_rej : triplets rejetés par validate_factual (tous "_rejected_reason": "factcheck FAUX").
    Retourne (corrigés, toujours_rejetés) — corrigés n'a PAS encore repassé la validation
    structurelle (l'appelant doit le faire, le LLM peut renvoyer un type invalide).
    """
    if not fact_rej:
        return [], []

    clean_list = [{"predicate": t["predicate"], "object": t["object"]} for t in fact_rej]
    prompt_path = PROMPTS_DIR / "factcheck_relations_refine.txt"
    template    = prompt_path.read_text(encoding="utf-8")
    user = (
        template
        .replace("{REJECTED}", json.dumps(clean_list, ensure_ascii=False, indent=2))
        .replace("{TEXT}", text)
    )

    try:
        result = call_llm(model_name, model_cfg, _SYSTEM_FACTCHECK, user, label=label, debug=debug)
    except Exception as e:
        print(f"  [refine erreur: {e}] — triplets rejetés conservés tels quels")
        return [], list(fact_rej)

    corrections = result.get("corrections", []) if isinstance(result, dict) else []

    corrected:      list[dict] = []
    still_rejected: list[dict] = []
    for i, orig in enumerate(fact_rej):
        corr = corrections[i] if i < len(corrections) else None
        new_obj = corr.get("object") if corr else None
        found   = bool(corr) and corr.get("found", new_obj is not None) and new_obj is not None
        if found:
            corrected.append({"predicate": orig["predicate"], "object": new_obj, "_source": "self_refine"})
        else:
            still_rejected.append(orig)

    if corrected:
        print(f"  [refine] {len(corrected)} triplet(s) corrigé(s), {len(still_rejected)} toujours rejeté(s)")
    return corrected, still_rejected


# ─── Relance de rappel (style ChatExtract) ─────────────────────────────────────

def find_missed_relations(
    rel_list: list[dict],
    text: str,
    model_name: str,
    model_cfg: dict,
    label: str = "rel-relance",
    debug: bool = False,
) -> list[dict]:
    """Redemande explicitement au LLM s'il a manqué des corrélations chiffrées.

    Question de relance séparée (pas fusionnée avec le VRAI/FAUX de validate_factual) :
    vérifier une liste et en générer une nouvelle sont deux tâches cognitives différentes,
    les mélanger dans un seul prompt dilue les deux. Motivée par le recall mesuré à 20.7%
    sur compare_type (29/07/2026) — la majorité des erreurs de ce pipeline sont des
    omissions, pas des inventions. Retourne une liste brute au même format que le bloc
    relation principal ; l'appelant la fusionne dans rel_list pour repasser par le même
    traitement (validation structurelle, factcheck des stats, classifier)."""
    if not text.strip():
        return []

    already = [
        {"V1": r.get("V1") or r.get("v1"), "V2": r.get("V2") or r.get("v2")}
        for r in rel_list
    ]
    prompt_path = PROMPTS_DIR / "factcheck_relations_relance.txt"
    template    = prompt_path.read_text(encoding="utf-8")
    user = (
        template
        .replace("{ALREADY_FOUND}", json.dumps(already, ensure_ascii=False, indent=2))
        .replace("{TEXT}", text)
    )

    try:
        result = call_llm(model_name, model_cfg, _SYSTEM_FACTCHECK, user, label=label, debug=debug)
    except Exception as e:
        print(f"  [relance erreur: {e}] — ignorée")
        return []

    missed = result.get("missed_relations", []) if isinstance(result, dict) else []
    if missed:
        print(f"  [relance] +{len(missed)} relation(s) trouvée(s) après relance")
    return missed
