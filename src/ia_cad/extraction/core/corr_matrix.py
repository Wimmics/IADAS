"""
corr_matrix.py — Reconstruction des matrices de corrélation triangulaires.

PyMuPDF linéarise les tableaux row-major : nom de variable, puis ses k
corrélations, variable suivante… La matrice triangulaire survit mais le LLM
n'aligne pas la grille (ligne i → colonnes 1..i-1). Ce module la reconstruit
DÉTERMINISTIQUEMENT et réémet des paires explicites VarA — VarB | r | signeP,
que l'on peut donner au LLM (recopie triviale) ou émettre directement.

Couvre pour l'instant LA matrice triangulaire (type Baric Table 3). Les
corrélations par sous-groupe (Table 4) et les régressions (Table 5) sont
détectées mais NON traitées ici (extension future, même mécanique).

Usage CLI (prototype) :
    python -m ia_cad.extraction.core.corr_matrix articles_sections/Baric.2024/tables.txt
"""
from __future__ import annotations

import re
import sys
from functools import lru_cache
from pathlib import Path

from ia_cad.paths import PROMPTS_DIR

# ─── Regex de base ────────────────────────────────────────────────────────────

# En-tête de table : "Table 3. ..." (capture le numéro + le reste de la ligne)
_TABLE_HEADER = re.compile(r"^\s*Table\s+(\d+)\b[.:]?\s*(.*)$", re.IGNORECASE)

# Ligne = en-tête de colonne seul : "1." / "2." (numéro + point, rien d'autre)
_COL_HEADER = re.compile(r"^\s*\d+\.\s*$")

# Ligne = libellé de variable : "1. EAT-26 (ED symptoms)"
_ROW_LABEL = re.compile(r"^\s*(\d+)\.\s+(\S.*?)\s*$")

# Ligne = cellule numérique : "-0.42", "0.16 **", ".27", avec étoiles de signif.
_CELL = re.compile(r"^\s*([−–-]?\d*\.\d+)\s*(\*{1,3})?\s*$")

# Légende de signif. : "** p < 0.01", "* p < .05", "*** p<0.001"
_SIG_LEGEND = re.compile(r"(\*{1,3})\s*p\s*[<≤=]\s*0?\.(\d+)")

_DEFAULT_SIG = {"*": 0.05, "**": 0.01, "***": 0.001}


def _norm_number(s: str) -> float:
    """Normalise le moins unicode (− U+2212, – U+2013) et parse en float."""
    return float(s.replace("−", "-").replace("–", "-"))


def _signe_p(threshold: float | None) -> str:
    """Mappe un seuil de p-value vers le vocabulaire IADAS contrôlé."""
    if threshold is None:
        return "N.S."
    if threshold <= 0.001:
        return "p<.001"
    if threshold <= 0.01:
        return "p<.01"
    if threshold <= 0.05:
        return "p<.05"
    return "N.S."


# ─── Détection de la variable focale (DEAB) ───────────────────────────────────
# Le ground-truth IADAS est focal-centré : il ne garde que les relations dont UN
# côté est un construit de trouble alimentaire (CLASS "DEAB"), l'autre étant le
# prédicteur. On filtre donc la matrice complète sur ce critère via le classifier.

# Préfixes d'instrument collés au nom de sous-échelle (ex. "EAT-Dieting" → "Dieting")
_SCALE_PREFIX = re.compile(r"^[A-Z][A-Za-z]{1,6}-?\d{0,3}\s*[-–]\s*(?=[A-Za-z])")


def _name_variants(name: str) -> list[str]:
    """Variantes à essayer pour le lookup du classifier : nom complet, partie
    avant '(', dans '()', et nom sans préfixe d'échelle (EAT-Dieting → Dieting)."""
    variants = [name]
    if "(" in name:
        before = name.split("(", 1)[0].strip()
        inside = name[name.find("(") + 1 : name.rfind(")")].strip() if ")" in name else ""
        for v in (before, inside):
            if v and v not in variants:
                variants.append(v)
    for base in list(variants):
        stripped = _SCALE_PREFIX.sub("", base).strip()
        if stripped and stripped not in variants:
            variants.append(stripped)
    return variants


def _is_focal(name: str, clf) -> bool:
    """True si la variable est un construit DEAB (le côté focal du GT)."""
    if clf is None:
        return False
    for v in _name_variants(name):
        r = clf.classify(v)
        if r and r.get("CLASS") == "DEAB":
            return True
    return False


def _focal_map(names, clf) -> dict[str, bool] | None:
    """Cache nom→focal pour une matrice : chaque nom distinct n'est classé qu'une
    fois (le classifier fait du fuzzy coûteux). None si pas de filtre focal."""
    if clf is None:
        return None
    return {n: _is_focal(n, clf) for n in set(names)}


def _make_relation(a: str, b: str, r: float | None, signe: str, source: str,
                   focal: dict[str, bool] | None) -> dict | None:
    """Construit une relation plate (V1/V2/measure/stats) à partir d'une paire.

    focal : si fourni, ne garde que les paires dont EXACTEMENT un côté est DEAB
    (le côté focal devient V1) ; sinon (a, b) tels quels. Source unique de la
    règle focal-centrée et de l'assemblage des stats pour les deux chemins
    (déterministe et transcription LLM)."""
    if focal is not None:
        fa, fb = focal.get(a, False), focal.get(b, False)
        if not fa and not fb:
            return None  # ni A ni B focal (DEAB) : hors périmètre IADAS
        if fa and fb:
            # Deux côtés DEAB (ex. deux échelles de troubles alimentaires corrélées entre
            # elles) : présent dans 8.6% du GT (205/2373 relations, vérifié empiriquement
            # le 2026-08-05) — l'ancien filtre "fa == fb -> None" les excluait à tort en
            # supposant que le GT était strictement focal-centré à un seul côté DEAB.
            # Pas de signal prédicteur/résultat entre deux construits DEAB : ordre du
            # tableau (ligne=V1) en repli, comme pour l'ambiguïté dans relations.txt.
            v1, v2 = a, b
        else:
            v1, v2 = (a, b) if fa else (b, a)
    else:
        v1, v2 = a, b

    result = "non-significant" if (signe == "N.S." or r is None) else ("positive" if r > 0 else "negative")
    stats = [{"predicate": "iadas:signeP", "object": signe},
             {"predicate": "iadas:resultatRelation", "object": result}]
    if r is not None:
        stats.insert(0, {"predicate": "iadas:degreR", "object": round(r, 3)})
    return {"V1": v1, "V1_measure": None, "V2": v2, "V2_measure": None,
            "stats": stats, "_source": source}


# ─── Découpage en blocs de table ──────────────────────────────────────────────

def _split_tables(text: str) -> list[tuple[int, str, list[str]]]:
    """Retourne [(num_table, ligne_header, lignes_du_bloc), ...]."""
    lines = text.splitlines()
    starts = [i for i, ln in enumerate(lines) if _TABLE_HEADER.match(ln)]
    blocks = []
    for k, start in enumerate(starts):
        end = starts[k + 1] if k + 1 < len(starts) else len(lines)
        m = _TABLE_HEADER.match(lines[start])
        num = int(m.group(1))
        header = m.group(2)
        blocks.append((num, header, lines[start + 1 : end]))
    return blocks


def _parse_sig_map(block_lines: list[str]) -> dict[str, float]:
    """Lit la légende du bloc pour mapper étoiles → seuil p. Défaut si absente."""
    sig = {}
    for ln in block_lines:
        for stars, dec in _SIG_LEGEND.findall(ln):
            sig[stars] = float("0." + dec)
    return sig or dict(_DEFAULT_SIG)


# ─── Reconstruction d'une matrice triangulaire ────────────────────────────────
# Représentation commune d'une matrice parsée : un tuple
#   (row_names, col_names, cells)
# où cells[i] est la liste des (valeur, étoiles) de la ligne i (sous-diagonale).
# Pour le format numéroté (Baric), row_names == col_names.
# Pour le format nommé/diagonale (Aleksic), col_names = en-têtes, row_names =
# libellés de ligne (potentiellement différents).

# (row_names, col_names, cells) ; cells[i] = [(valeur, étoiles), …] sous-diagonale
Matrix = tuple[list[str], list[str], list[list[tuple[float, str]]]]


def _validate_triangular(cells: list[list]) -> bool:
    """Vrai si cells[i] contient exactement i valeurs (triangle strict)."""
    return all(len(c) == i for i, c in enumerate(cells)) and len(cells) >= 3


def _parse_numbered(block_lines: list[str]) -> Matrix | None:
    """Format numéroté : lignes "N. Variable", en-têtes de colonnes "1." "2." …"""
    names: list[str] = []
    cells: list[list] = []
    for ln in block_lines:
        if _COL_HEADER.match(ln):
            continue  # en-tête de colonne numérique : ignorer
        mrow = _ROW_LABEL.match(ln)
        if mrow:
            names.append(mrow.group(2).strip())
            cells.append([])
            continue
        mcell = _CELL.match(ln)
        if mcell and cells:
            cells[-1].append((_norm_number(mcell.group(1)), mcell.group(2) or ""))
    if not _validate_triangular(cells):
        return None
    return names, names, cells


def _merge_headers(texts: list[str]) -> list[str]:
    """Fusionne les continuations de noms d'en-tête (ligne commençant en
    minuscule = suite du nom précédent, ex. 'Oral' + 'control')."""
    out: list[str] = []
    for s in texts:
        if out and s[:1].islower():
            out[-1] = f"{out[-1]} {s}".strip()
        else:
            out.append(s)
    return out


def _parse_named_diagonal(block_lines: list[str]) -> Matrix | None:
    """Format nommé avec diagonale en tirets (Aleksic). Lignes = noms nus,
    en-têtes = liste de noms, diagonale marquée '-'. Validation stricte."""
    toks: list[tuple] = []
    for ln in block_lines:
        s = ln.strip()
        if not s:
            continue
        if s in ("-", "–", "—"):
            toks.append(("dash",)); continue
        m = _CELL.match(ln)
        if m:
            toks.append(("val", _norm_number(m.group(1)), m.group(2) or "")); continue
        low = s.lower()
        if s.startswith("*") or "significant" in low or "correlation is" in low or low.startswith("note"):
            toks.append(("stop",)); continue
        toks.append(("text", s))

    if not any(t[0] == "dash" for t in toks):
        return None
    if any(t[0] == "stop" for t in toks):
        toks = toks[: next(i for i, t in enumerate(toks) if t[0] == "stop")]
    if toks and toks[0] == ("text", "Variables"):
        toks = toks[1:]

    # En-têtes = run initial de texte ; le dernier nom fusionné = libellé ligne 1.
    k = 0
    head_texts = []
    while k < len(toks) and toks[k][0] == "text":
        head_texts.append(toks[k][1]); k += 1
    head_names = _merge_headers(head_texts)
    if len(head_names) < 3 or k >= len(toks):
        return None
    col_names = head_names[:-1]
    row_names = [head_names[-1]]
    cells: list[list] = [[]]  # ligne 1 : aucune valeur (juste sa diagonale)

    # Corps : on parcourt en regroupant les textes consécutifs en un libellé.
    i = k
    while i < len(toks):
        t = toks[i]
        if t[0] == "text":
            parts = []
            while i < len(toks) and toks[i][0] == "text":
                parts.append(toks[i][1]); i += 1
            row_names.append(" ".join(parts).strip())
            cells.append([])
        elif t[0] == "val":
            cells[-1].append((t[1], t[2])); i += 1
        else:  # dash (diagonale) : ignorer
            i += 1

    if not _validate_triangular(cells):
        return None
    if len(col_names) != len(row_names) - 1:
        return None
    return row_names, col_names, cells


# ─── Grille rectangulaire nommée, sans diagonale ───────────────────────────────
# Forme distincte de la diagonale : pas de matrice symétrique, K en-têtes de colonne
# suivis d'un premier libellé de ligne SANS valeur (référence, comme la diagonale mais
# sans marqueur '-' puisqu'il n'y a pas de diagonale), puis (libellé, K valeurs) répété
# à largeur CONSTANTE (rectangulaire, pas croissante comme le triangle).
#
# Piège vérifié empiriquement sur le corpus (Baric.2024 Table 4, Francisco.2013b) :
# les en-têtes de colonne peuvent être des SOUS-GROUPES démographiques (Male/Female,
# Athletes/Controls) plutôt que des variables distinctes — dans ce cas la ligne de
# référence est la vraie V2 et les colonnes sont sousGroupeAnalyse, pas V2. Une regex
# ne peut pas trancher cette ambiguïté sémantique de façon fiable : on REFUSE de
# parser (repli LLM) plutôt que de risquer une relation fausse (traiter 'Female'
# comme une variable corrélée). Voir _looks_like_subgroup_header().

_SUBGROUP_WORDS = {
    "male", "female", "men", "women", "boy", "boys", "girl", "girls",
    "athlete", "athletes", "control", "controls", "elite", "non-elite",
    "cadet", "junior", "seniors", "senior", "total",
}


def _looks_like_subgroup_header(name: str) -> bool:
    """True si un en-tête de colonne ressemble à un sous-groupe démographique/de
    stratification plutôt qu'à une variable — 'Male', 'Athletes (n=85)'..."""
    low = name.strip().lower()
    if any(w in re.split(r"[\s(]", low) for w in _SUBGROUP_WORDS):
        return True
    return bool(re.search(r"\(\s*n\s*=", low))


# Mots d'échafaudage de tableau générique (nom de statistique, pas une variable) : une
# liste à 2 colonnes "Item | r" n'a pas de dimension colonne réelle, juste une valeur
# par ligne — un en-tête qui EST un de ces mots signale ce faux positif, pas une grille.
_SCAFFOLD_WORDS = {"item", "variable", "variables", "r", "rho", "p", "value", "n", "sig", "significance"}

# En-tête/libellé plausible : les vraies variables/instruments de ce domaine font au
# plus une poignée de mots (ex. "Insensitivity to athletes' well-being" = 5). Un texte
# plus long est presque toujours une légende de tableau ou une phrase captée par erreur
# dans la tête (vérifié empiriquement : la légende de Costarelli.2009 fait 20+ mots).
_MAX_LABEL_WORDS = 9


def _looks_like_label(name: str) -> bool:
    """False si le texte est trop long pour être un en-tête/libellé réel (légende de
    tableau happée par erreur), ou si c'est un mot d'échafaudage générique."""
    words = name.strip().split()
    if not words or len(words) > _MAX_LABEL_WORDS:
        return False
    return name.strip().lower() not in _SCAFFOLD_WORDS


def _validate_rectangular(cells: list[list], k: int) -> bool:
    """Vrai si cells[1:] ont tous exactement k valeurs, et cells[0] soit 0 (ligne
    de référence, forme A) soit k (pas de ligne de référence, forme B) — jamais
    une largeur intermédiaire ou variable, grille rectangulaire stricte."""
    return (len(cells) >= 2
            and len(cells[0]) in (0, k)
            and all(len(c) == k for c in cells[1:]))


def _parse_named_grid(block_lines: list[str]) -> Matrix | None:
    """Grille nommée rectangulaire sans diagonale (ex. Baric.2024 Table 4 — mais rejetée
    là par le filtre sous-groupe, voir plus bas) : K en-têtes de colonne (variables),
    PUIS deux formes possibles selon que la première variable sert de référence à 0
    valeur (comme la diagonale, mais sans marqueur '-') ou porte déjà ses K valeurs :

      A) col1..colK, ref_label, row2_label, K valeurs, row3_label, K valeurs, ...
         (ref_label n'a AUCUNE valeur : ses K "colonnes" sont contre lui-même)
      B) col1..colK, row1_label, K valeurs, row2_label, K valeurs, ...
         (pas de ligne de référence, toutes les lignes ont K valeurs)

    Le nombre de textes consécutifs avant la première valeur ne suffit PAS à
    distinguer les deux (aucun token ne marque la frontière) : on déduit K du
    premier groupe de valeurs rencontré, puis le nombre total de textes de tête
    (K+2 pour A, K+1 pour B) dit directement laquelle des deux formes on a — sans
    chercher, puisque la tête entière (tout texte avant la 1re valeur) a une
    longueur fixe. Rejette (repli LLM) si les en-têtes ressemblent à des
    sous-groupes démographiques ou si la structure reste ambiguë — jamais de
    reconstruction approximative pour cette forme."""
    toks: list[tuple] = []
    for ln in block_lines:
        s = ln.strip()
        if not s:
            continue
        if s in ("-", "–", "—"):
            return None  # marqueur de diagonale : c'est _parse_named_diagonal, pas nous
        m = _CELL.match(ln)
        if m:
            toks.append(("val", _norm_number(m.group(1)), m.group(2) or "")); continue
        low = s.lower()
        if s.startswith("*") or "significant" in low or "correlation is" in low or low.startswith("note"):
            toks.append(("stop",)); continue
        toks.append(("text", s))

    if any(t[0] == "stop" for t in toks):
        toks = toks[: next(i for i, t in enumerate(toks) if t[0] == "stop")]

    # Texte de tête complet (tout ce qui précède la 1re valeur), longueur fixe.
    k0 = 0
    while k0 < len(toks) and toks[k0][0] == "text":
        k0 += 1
    if k0 == 0 or k0 >= len(toks):
        return None
    leading = _merge_headers([t[1] for t in toks[:k0]])

    # Groupe de valeurs suivant immédiatement la tête — sa taille donne K.
    first_vals: list[tuple[float, str]] = []
    i = k0
    while i < len(toks) and toks[i][0] == "val":
        first_vals.append((toks[i][1], toks[i][2])); i += 1
    if not first_vals:
        return None
    k = len(first_vals)

    if len(leading) == k + 2:
        col_names = leading[:k]
        row_names = [leading[k], leading[k + 1]]
        cells: list[list] = [[], first_vals]
    elif len(leading) == k + 1:
        col_names = leading[:k]
        row_names = [leading[k]]
        cells = [first_vals]
    else:
        return None  # longueur de tête incompatible avec les deux formes connues

    if not all(_looks_like_label(c) for c in col_names):
        return None  # en-tête trop long (légende happée) ou mot d'échafaudage générique
    if any(_looks_like_subgroup_header(c) for c in col_names):
        return None  # sous-groupe probable, pas des variables : repli LLM
    if not all(_looks_like_label(r) for r in row_names):
        return None  # idem côté libellés de ligne déjà connus (ref_label / row1_label)

    # Reste du tableau : alterne (run de texte = 1 libellé de ligne) / (run de valeurs).
    while i < len(toks):
        if toks[i][0] != "text":
            return None  # valeur sans libellé de ligne avant : structure inattendue
        parts = []
        while i < len(toks) and toks[i][0] == "text":
            parts.append(toks[i][1]); i += 1
        label = " ".join(parts).strip()
        if not _looks_like_label(label):
            return None  # libellé de ligne implausible (légende, note de bas de page…)
        row_names.append(label)
        vals: list[tuple[float, str]] = []
        while i < len(toks) and toks[i][0] == "val":
            vals.append((toks[i][1], toks[i][2])); i += 1
        cells.append(vals)

    if not _validate_rectangular(cells, k):
        return None
    return row_names, col_names, cells


def _matrix_to_relations(
    matrix: Matrix,
    sig_map: dict[str, float],
    clf=None,
    focal_only: bool = True,
) -> list[dict]:
    """Transforme une matrice (row_names, col_names, cells) en paires explicites.

    focal_only : ne garder que les paires dont EXACTEMENT un côté est DEAB
    (réplique l'annotation GT focal-centrée) ; le côté DEAB devient V1."""
    row_names, col_names, cells = matrix
    focal = _focal_map(row_names + col_names, clf) if focal_only else None
    relations = []
    for i, row in enumerate(cells):
        for j, (val, stars) in enumerate(row):
            signe = _signe_p(sig_map.get(stars) if stars else None)
            rel = _make_relation(row_names[i], col_names[j], val, signe, "corr_matrix", focal)
            if rel is not None:
                relations.append(rel)
    return relations


# ─── API publique ─────────────────────────────────────────────────────────────

def parse_correlation_matrices(text: str, classifier=None, focal_only: bool = True) -> list[dict]:
    """Déterministe seul (valeurs exactes) : équivaut à extract_table_relations
    sans repli LLM. Les formats non reconnus sont simplement ignorés."""
    return extract_table_relations(text, classifier=classifier, llm_fn=None, focal_only=focal_only)


# ─── Repli LLM : transcription d'une région de tableau non reconnue ────────────

_SYSTEM_MATRIX = (
    "You transcribe correlation tables from scientific articles into explicit "
    "variable pairs. You never invent values. Output valid JSON only."
)

_PROMPT_MATRIX_PATH = PROMPTS_DIR / "relations_matrix.txt"


@lru_cache(maxsize=1)
def _matrix_prompt() -> str:
    """Template du prompt de transcription, lu une seule fois."""
    return _PROMPT_MATRIX_PATH.read_text(encoding="utf-8")


def _parse_llm_item(d: dict) -> tuple[str, str, float | None, str] | None:
    """Normalise un item LLM {V1,V2,r,signeP} → (v1, v2, r, signe) ou None."""
    v1 = (d.get("V1") or d.get("v1") or "").strip()
    v2 = (d.get("V2") or d.get("v2") or "").strip()
    if not v1 or not v2:
        return None
    raw_r = d.get("r", d.get("degreR"))
    try:
        r = float(raw_r) if raw_r is not None else None
    except (TypeError, ValueError):
        r = None
    signe = d.get("signeP") or "N.S."
    if signe not in ("p<.001", "p<.01", "p<.05", "N.S."):
        signe = "N.S."
    return v1, v2, r, signe


def transcribe_region_llm(region_text: str, llm_fn, classifier=None, focal_only: bool = True) -> list[dict]:
    """Transcrit une région de tableau de corrélation via le LLM (repli pour les
    formats que le parser déterministe ne reconnaît pas).

    llm_fn : callable (system, user) -> dict|list (typiquement un wrapper de
    core.llm.call_llm injecté par l'appelant)."""
    prompt = _matrix_prompt().replace("{TEXT}", region_text)
    try:
        raw = llm_fn(_SYSTEM_MATRIX, prompt)
    except Exception as e:  # pragma: no cover
        print(f"  [corr-matrix-llm] erreur LLM: {e}")
        return []
    items = raw.get("relations", []) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])
    out = []
    for d in items:
        parsed = _parse_llm_item(d) if isinstance(d, dict) else None
        if parsed is None:
            continue
        v1, v2, r, signe = parsed
        # Même règle focale et même assemblage de stats que le chemin déterministe.
        focal = _focal_map([v1, v2], classifier) if focal_only else None
        rel = _make_relation(v1, v2, r, signe, "corr_matrix_llm", focal)
        if rel is not None:
            out.append(rel)
    return out


# ─── Vue structurée best-effort (repli LLM uniquement) ─────────────────────────

def _loose_structure(block_lines: list[str]) -> str:
    """Regroupe le bloc en lignes "Label: v1, v2, ..." SANS validation triangulaire
    stricte (contrairement à _parse_numbered/_parse_named_diagonal, qui rejettent tout
    ce qui n'est pas un triangle propre). Source PRINCIPALE donnée au LLM pour le
    repli sur les formats non reconnus (voir extract_table_relations et
    relations_matrix.txt) — le texte brut linéarisé n'est plus qu'un repli pour les
    libellés tronqués ou une valeur manquée. Vérifié manuellement fiable sur
    plusieurs formes de repli réelles du corpus (Baric.2024 Table 4, Blackmer.2011
    Table 1, Al-Amouri.2025 Table 6) malgré l'absence de validation triangulaire."""
    rows: list[tuple[str, list[str]]] = []
    for ln in block_lines:
        s = ln.strip()
        if not s or _COL_HEADER.match(ln) or s in ("-", "–", "—"):
            continue
        mcell = _CELL.match(ln)
        if mcell:
            if rows:
                rows[-1][1].append(mcell.group(1) + (mcell.group(2) or ""))
            continue
        mrow = _ROW_LABEL.match(ln)
        rows.append((mrow.group(2).strip() if mrow else s, []))
    return "\n".join(f"{label}: {', '.join(vals)}" for label, vals in rows if vals)


# ─── API hybride ──────────────────────────────────────────────────────────────

def extract_table_relations(text: str, classifier=None, llm_fn=None, focal_only: bool = True) -> list[dict]:
    """Extrait les relations de TOUS les tableaux de corrélation du texte.

    Pour chaque région : parser déterministe d'abord (valeurs exactes) ; si le
    format n'est pas reconnu et qu'un llm_fn est fourni, repli sur transcription
    LLM de la seule région du tableau (texte brut + vue structurée best-effort en
    indice). Retourne des dicts au format plat du chunk relations (V1/V2/measure/stats)."""
    relations = []
    for num, header, block_lines in _split_tables(text):
        if "correl" not in header.lower():
            continue
        matrix = (_parse_numbered(block_lines)
                  or _parse_named_diagonal(block_lines)
                  or _parse_named_grid(block_lines))
        if matrix is not None:
            sig_map = _parse_sig_map(block_lines)
            relations.extend(_matrix_to_relations(matrix, sig_map, classifier, focal_only))
        elif llm_fn is not None:
            # Vue structurée D'ABORD (source principale pour le LLM, cf. relations_matrix.txt) ;
            # texte brut en repli pour les libellés tronqués ou une valeur manquée par le
            # regroupement. Vérifié empiriquement fiable sur plusieurs formes de repli réelles
            # (Baric.2024 Table 4, Blackmer.2011 Table 1, Al-Amouri.2025 Table 6).
            structured = _loose_structure(block_lines)
            region = f"{header}\n"
            if structured:
                region += f"\n--- STRUCTURED VIEW (row: values, in table order) ---\n{structured}\n"
            region += f"\n--- RAW TABLE TEXT ---\n" + "\n".join(block_lines)
            relations.extend(transcribe_region_llm(region, llm_fn, classifier, focal_only))
    return relations


# ─── Candidats statistiques en texte libre (hors tableaux) ────────────────────
# Même principe que la vue structurée des tableaux ci-dessus (_loose_structure),
# étendu à la prose : un balayage déterministe (regex, coût nul, aucun appel LLM)
# qui repère chaque phrase contenant une valeur statistique (r/R²/β/p), donnée au
# LLM comme ancre de rappel — "voici ce que le texte contient, vérifie que chaque
# valeur est couverte". Ne construit AUCUNE relation (contrairement à
# extract_table_relations) : juste un indice de complétude pour le bloc relations
# en texte libre, le LLM reste seul juge de l'appariement V1/V2 et du périmètre
# DEAB. Motivé par le même constat que la relance de rappel (recall mesuré à
# 20.7% le 29/07/2026) : la majorité des erreurs sont des omissions.

_STAT_CANDIDATE = re.compile(
    r"(?:"
    r"\br\s*\(?\d*\)?\s*=\s*-?\.?\d"     # r = -.42 / r(120) = .31
    r"|R\s*2?\s*=\s*\.?\d"               # R = .41 / R2 = .17
    r"|β\s*=\s*-?\.?\d"                  # β = .28
    r"|\bbeta\s*=\s*-?\.?\d"             # beta = .28
    r"|p\s*[<>=]\s*\.?0?\.?\d"           # p < .001 / p=.04
    r")", re.IGNORECASE)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")

# Filtres anti-bruit tableau : une phrase de prose a une densité de chiffres basse
# et des mots de longueur normale ; un fragment de tableau aspiré par erreur
# (lignes de valeurs, légendes) a une densité de chiffres élevée ou des "mots"
# très courts (labels de colonnes tronqués, nombres isolés). Filtre imparfait
# (pur heuristique, jamais garanti) mais sans risque : ce module ne construit
# aucune relation, seulement un indice — un faux positif coûte de la place dans
# le prompt, jamais une donnée fausse dans le graphe.
_MIN_CANDIDATE_LEN = 40
_MAX_DIGIT_DENSITY = 0.30
_MIN_AVG_WORD_LEN = 3.2


def _digit_density(s: str) -> float:
    letters = sum(c.isalpha() for c in s)
    digits = sum(c.isdigit() for c in s)
    return digits / max(1, letters + digits)


def _avg_word_len(s: str) -> float:
    words = [w for w in s.split() if w]
    return sum(len(w) for w in words) / max(1, len(words))


def scan_statistical_candidates(text: str, max_items: int = 40) -> list[str]:
    """Repère les phrases de prose contenant une valeur statistique (r/R²/β/p),
    sans tenter de les apparier à des variables — un indice de complétude pour le
    LLM, pas une extraction. Voir l'en-tête de section pour la justification."""
    out: list[str] = []
    for sent in _SENTENCE_SPLIT.split(text):
        s = re.sub(r"\s+", " ", sent.strip())
        if len(s) < _MIN_CANDIDATE_LEN or not _STAT_CANDIDATE.search(s):
            continue
        if _digit_density(s) > _MAX_DIGIT_DENSITY or _avg_word_len(s) < _MIN_AVG_WORD_LEN:
            continue
        out.append(s[:220])
        if len(out) >= max_items:
            break
    return out


# ─── Candidats par mots-clés qualitatifs (expérimental, 24/08/2026) ───────────
# Extension de scan_statistical_candidates() à des marqueurs de corrélation SANS
# valeur chiffrée explicite dans la même phrase : correlate/related/associated/
# mediated/moderated/positively/negatively. Motivation : une relation peut être
# annoncée en prose ("X was significantly related to Y") avec sa valeur chiffrée
# ailleurs (tableau référencé séparément) — le scan numérique seul la manque.
#
# Risque assumé, documenté avant toute activation par défaut : ces mots sont
# extrêmement fréquents dans ce corpus (méthode, discussion, résultats les
# emploient tous), donc le rapport signal/bruit est a priori moins bon que le
# scan numérique — plus de phrases signalées, mais une proportion plus faible
# qui correspond réellement à une relation V1/V2 non couverte. À valider
# empiriquement (tools/relations_variants.py, --keywords) avant d'envisager une
# activation par défaut dans _detected_stats_block() -- voir aussi la mémoire
# projet là-dessus, notée "dangereux, potentiellement pas utile" dès la conception.
_KEYWORD_CANDIDATE = re.compile(
    r"\b("
    r"correlat(?:e[sd]?|ion\w*)"          # correlate(s/d), correlation(s/al)
    r"|relat(?:ed|ionship\w*|es|ing)"     # related, relationship(s), relates, relating
    r"|associat(?:e[sd]?|ion\w*)"         # associate(s/d), association(s)
    r"|mediat(?:e[sd]?|ion\w*|or\w*)"     # mediate(s/d), mediation, mediator(s)
    r"|moderat(?:e[sd]?|ion\w*|or\w*)"    # moderate(s/d), moderation, moderator(s)
    r"|positively|negatively"
    r")\b", re.IGNORECASE)


def scan_keyword_candidates(text: str, max_items: int = 40) -> list[str]:
    """Repère les phrases de prose contenant un marqueur qualitatif de corrélation
    (voir _KEYWORD_CANDIDATE) sans valeur chiffrée explicite -- complémentaire de
    scan_statistical_candidates(), jamais un doublon (exclut les phrases déjà
    couvertes par le scan numérique). Même filtre anti-bruit, même contrat : un
    indice de complétude, aucune relation construite. EXPÉRIMENTAL -- voir la
    note de risque ci-dessus, à activer seulement après validation par le
    harnais de test (tools/relations_variants.py)."""
    out: list[str] = []
    for sent in _SENTENCE_SPLIT.split(text):
        s = re.sub(r"\s+", " ", sent.strip())
        if len(s) < _MIN_CANDIDATE_LEN or not _KEYWORD_CANDIDATE.search(s):
            continue
        if _STAT_CANDIDATE.search(s):
            continue  # déjà couvert par scan_statistical_candidates
        if _digit_density(s) > _MAX_DIGIT_DENSITY or _avg_word_len(s) < _MIN_AVG_WORD_LEN:
            continue
        out.append(s[:220])
        if len(out) >= max_items:
            break
    return out


# ─── CLI prototype ────────────────────────────────────────────────────────────

def _demo(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    try:
        from ia_cad.common.linking.sparql_linking import VariableLinker
        clf = VariableLinker()
    except Exception as e:  # pragma: no cover
        print(f"[warn] entity linking indisponible ({e}) — filtre focal désactivé")
        clf = None
    rels = parse_correlation_matrices(text, classifier=clf, focal_only=clf is not None)
    print(f"Fichier : {path.name}")
    print(f"Paires focales (DEAB) reconstruites : {len(rels)}\n")
    for r in rels:
        st = {s["predicate"].split(":")[-1]: s["object"] for s in r["stats"]}
        print(f"  {r['V1'][:38]:38} -- {r['V2'][:38]:38} | "
              f"r={st['degreR']:>7} | {st['signeP']:>7} | {st['resultatRelation']}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python TYPE/core/corr_matrix.py <fichier_sections.txt>")
        sys.exit(1)
    _demo(Path(sys.argv[1]))
