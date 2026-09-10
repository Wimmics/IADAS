"""llm.py — Appel Ollama avec retry et extraction JSON robuste."""
import json
import re
import sys

from ollama import chat


def _extract_complete_items(raw: str, array_key: str) -> dict | None:
    """Récupère les objets complets d'un tableau JSON partiellement tronqué.

    Gère le cas où num_predict interrompt la génération avant la fermeture du JSON.
    """
    key_pattern = f'"{array_key}"'
    key_pos = raw.find(key_pattern)
    if key_pos == -1:
        return None

    arr_start = raw.find("[", key_pos)
    if arr_start == -1:
        return None

    items = []
    pos = arr_start + 1

    while pos < len(raw):
        # Ignore les espaces et virgules entre éléments
        while pos < len(raw) and raw[pos] in " \t\n\r,":
            pos += 1

        if pos >= len(raw) or raw[pos] != "{":
            break

        # Cherche la fin de cet objet en suivant la profondeur des accolades
        depth = 0
        in_string = False
        escape_next = False
        end_pos = -1

        for i in range(pos, len(raw)):
            c = raw[i]
            if escape_next:
                escape_next = False
                continue
            if c == "\\" and in_string:
                escape_next = True
                continue
            if c == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    end_pos = i
                    break

        if end_pos == -1:
            break  # Objet incomplet — tronqué ici

        try:
            item = json.loads(raw[pos : end_pos + 1])
            items.append(item)
            pos = end_pos + 1
        except json.JSONDecodeError:
            break

    if items:
        return {array_key: items}
    return None


def extract_json(raw: str) -> dict | list:
    """Extrait le premier objet ou tableau JSON depuis une réponse LLM brute."""
    raw = raw.strip()

    # 1. Parse direct
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # 2. Retire les balises markdown ```json ... ```
    fenced = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    fenced = re.sub(r"```\s*$", "", fenced, flags=re.MULTILINE).strip()
    try:
        return json.loads(fenced)
    except json.JSONDecodeError:
        pass

    # 3. Extrait le premier { } ou [ ] complet
    for open_c, close_c in (("{", "}"), ("[", "]")):
        start = raw.find(open_c)
        if start == -1:
            continue
        depth = 0
        for i, c in enumerate(raw[start:], start):
            if c == open_c:
                depth += 1
            elif c == close_c:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(raw[start : i + 1])
                    except json.JSONDecodeError:
                        break

    # 4. Récupération partielle — JSON tronqué par num_predict
    # Tente d'extraire les objets complets avant la coupure
    for key in ("relations", "sport", "analysis", "population", "bibliographic", "verdicts"):
        result = _extract_complete_items(raw, key)
        if result:
            n = len(result[key])
            print(f"\n  [warn] JSON tronqué — {n} {key} récupérés (sortie incomplète)")
            return result

    raise ValueError(f"Aucun JSON valide trouvé dans : {raw[:300]}")


def call_llm(
    model_name: str,
    model_cfg: dict,
    system: str,
    user: str,
    label: str = "",
    debug: bool = False,
) -> dict | list:
    """Appelle Ollama en streaming, retourne le dict/list parsé. Retries sur échec."""
    max_retries = model_cfg.get("max_retries", 3)
    num_ctx     = model_cfg.get("num_ctx", 131072)
    num_predict = model_cfg.get("num_predict", 16384)
    temperature = model_cfg.get("temperature", 0.0)
    keep_alive  = model_cfg.get("keep_alive", "10m")

    # Ajuste num_ctx à la taille réelle du prompt pour économiser la RAM
    # OUTPUT_RESERVE élevé car certains chunks (relations) génèrent de longs JSON
    prompt_chars = len(system) + len(user)
    OUTPUT_RESERVE = 32768
    dynamic_ctx = max(4096, min(num_ctx, prompt_chars // 3 + OUTPUT_RESERVE))

    for attempt in range(1, max_retries + 1):
        tag = f"[{label} {attempt}/{max_retries}]" if label else f"[{attempt}/{max_retries}]"
        sys.stdout.write(f"  {tag} ")
        sys.stdout.flush()

        raw = ""
        first_token = True
        try:
            for chunk in chat(
                model=model_name,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                stream=True,
                format="json",
                options={
                    "num_ctx":     dynamic_ctx,
                    "num_predict": num_predict,
                    "temperature": temperature,
                },
                keep_alive=keep_alive,
            ):
                token = chunk.message.content or ""
                raw += token
                if first_token and token.strip():
                    sys.stdout.write("-> streaming")
                    sys.stdout.flush()
                    first_token = False
            print()

            if debug:
                print(f"\n[DEBUG raw ({len(raw)} chars)]\n{raw}\n")

            return extract_json(raw)

        except Exception as e:
            print(f"\n  [erreur LLM: {e}]")
            if attempt == max_retries:
                raise

    raise RuntimeError("Appel LLM échoué après tous les essais")
