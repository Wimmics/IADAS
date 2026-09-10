"""split_articles.py — Découpe les PDF d'articles (articles/) en sections IMRaD.

Découpe chaque article en sections et écrit un fichier par section dans
un sous-dossier par article :  articles_sections/<stem>/<section>.txt

Quatre sources de titres, combinées (réunion 6/7 : privilégier les signets) :
  1. les SIGNETS du PDF (common/pdf_signets.py), localisés au caractère près
     en retrouvant le titre sur sa page de destination ;
  2. les MÉTADONNÉES TYPOGRAPHIQUES (taille/graisse des polices, get_text
     "dict") : un titre est plus grand ou plus gras que le corps du texte —
     détection indépendante de la mise en page, gère les titres sur deux
     lignes ('CONCLUSION AND' / 'PERSPECTIVES') ;
  3. les titres sur ligne isolée (regex, numérotation et ':' optionnels) ;
  4. les titres en ligne suivis d'un point ('Participants and procedure. The…').

Sections produites :
  abstract      — titre + auteurs + abstract + keywords (début → Introduction)
  introduction  — Introduction → Method
  method         — Method/Materials & Methods + Participants + Measures + Procedure
                   + Data analysis (→ Results)
  results        — Results → Discussion
  tables         — tous les blocs "Table N ..." repérés sur le document entier
                   (les tableaux sont parfois placés après les références)
  discussion     — Discussion + Limitations + Conclusion (→ References)

Les références et le footer (ResearchGate, funding, etc.) sont jetés.
Si aucun titre n'est détecté, un seul fichier <stem>_full.txt est écrit.
Un PDF sans couche texte (scan, < 500 caractères extraits) n'est PAS découpé :
il est listé en fin d'exécution (OCR nécessaire).

Usage :
  iacad-split-articles
  iacad-split-articles articles/Abras.2022.pdf
  iacad-split-articles "articles/*.pdf" --summary
"""
import argparse
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

# Force UTF-8 sur stdout (Windows cp1252)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from ia_cad.common.pdf_signets import get_signets
from ia_cad.paths import ARTICLES_DIR, ARTICLES_SECTIONS_DIR

_ARTICLES = ARTICLES_DIR
_OUT_DIR  = ARTICLES_SECTIONS_DIR

# En dessous de ce volume de texte extrait, le PDF est considéré comme un scan
# sans couche texte : rien d'exploitable à découper (ni à extraire en aval).
# Un article réel fait ≥ 10k caractères ; sous 2k il ne reste que du bruit.
MIN_TEXT_CHARS = 2000

_TYPO = str.maketrans({
    "‘": "'", "’": "'",   # curly single quotes
    "“": '"', "”": '"',   # curly double quotes
    "–": "-", "—": "-",   # en/em dash
    "­": "",                     # soft hyphen
    "�": "'",                    # replacement char
    " ": " ", " ": " ", " ": " ", " ": " ",  # nbsp/thin/narrow/hair space -> espace normal
})

# Artefacts d'extraction PyMuPDF dans les valeurs numériques des tableaux (corrélations,
# p-values) : un espace fine coincé entre le signe et le chiffre ("− 0.047" -> "−0.047"),
# et la virgule décimale des revues en notation européenne ("0,04" -> "0.04", jamais un
# séparateur de milliers dans ce domaine — coefficients de corrélation et p-values, |x|<10).
_SIGN_SPACE_GAP = re.compile(r"(?<=[-−–])\s(?=\d)")
_DECIMAL_COMMA  = re.compile(r"(?<=\d),(?=\d)")

# Lignes parasites à supprimer (footer ResearchGate, mentions éditeur, n° de page seuls)
_JUNK = re.compile(
    r"(?im)^\s*("
    r"view publication stats|see discussions, stats|all content following|"
    r"downloaded from|this article is protected|see profile|"
    r"\d+\s+(citations|reads|publications)|citations\s+reads|"
    r"electronic copy available at|https?://\S+|"
    r"\d{1,4}"                       # ligne ne contenant qu'un numéro (page)
    r")\s*$"
)

# ─── Détection des titres de section ────────────────────────────────────────────
# Variantes → section canonique. Détecté en début de ligne, numérotation et ':' optionnels.
_HEADING_VARIANTS: dict[str, list[str]] = {
    "abstract":     ["abstract"],
    "introduction": ["introduction", "background"],
    "method":       ["materials and methods", "material and methods", "methods and materials",
                     "method and materials", "subjects and methods", "patients and methods",
                     "subjects, materials and methods", "methodological procedures",
                     "methodology", "methods", "method",
                     "participants and procedure", "participants", "procedures", "procedure",
                     "study design", "the present study", "the current study", "current study"],
    "results":      ["results and discussion", "quantitative results", "qualitative results",
                     "quantitative findings", "qualitative findings", "research results",
                     "results", "findings"],
    "discussion":   ["general discussion", "discussion and conclusion", "discussion",
                     "conclusions", "conclusion", "limitations and future", "limitations"],
    "references":   ["references", "reference list", "bibliography"],
    # Rubriques administratives de fin d'article : jamais des sections de
    # contenu, mais des BORNES DE FIN (même traitement que references) — sans
    # elles, la discussion traîne acknowledgments/funding jusqu'aux références.
    "backmatter":   ["acknowledgments", "acknowledgements", "funding",
                     "author contributions", "credit authorship contribution statement",
                     "conflict of interest", "conflicts of interest",
                     "declaration of competing interest", "declarations",
                     "data availability statement", "data availability",
                     "ethics statement", "publisher's note", "contributors",
                     "supplementary information"],
}

# Numérotation en tête de titre : '3.', '2.1', '2.1.1', 'IV.', '2)' …
_NUMBERING = re.compile(r"^\s*(?:\d{1,2}(?:\.\d{1,2}){0,2}|[IVXivx]{1,4})?[.\)]?\s*")

# Numérotation n'importe où dans le titre (pas seulement en tête) : la détection
# police recolle parfois deux lignes de titre numérotées séparément
# ('2 METHOD' + '2.1 Participants' -> '2 METHOD 2.1 Participants'). Le look-ahead
# sur la branche romaine évite de manger un vrai mot commençant par I/V/X
# ('Vitamin' ne doit pas perdre son 'Vi').
_TITLE_NUMBERING = re.compile(
    r"\b(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVXivx]{1,4}(?=[.\)\s]))[.\)]?\s*"
)


def _clean_title_for_display(raw: str) -> str:
    """Normalise un titre brut (signet, police, regex) pour affichage/traçabilité :
    numérotation retirée (en tête ou recollée par la détection police), casse
    ramenée à une forme phrase unique, ':' final et espaces multiples retirés.

    Purement cosmétique — n'affecte ni la reconnaissance de section
    (_canon_heading, déjà insensible à la casse et à la numérotation en tête)
    ni le contenu des fichiers de section (calculé par offset, pas par ce titre)."""
    t = _TITLE_NUMBERING.sub("", raw)
    t = re.sub(r"\s+", " ", t).strip().rstrip(":").strip()
    return t.capitalize() if t else t

_HEAD_LINE = re.compile(
    r"^\s*(\d{1,2}(?:\.\d{1,2}){0,2}[.\)]?\s*|[IVXivx]{1,4}[.\)]\s*)?"
    r"([A-Za-z][A-Za-z &/\-,]{2,45})\s*:?\s*$")


def _canon_heading(label: str) -> str | None:
    """Titre libre (signet ou ligne) → section canonique, ou None.

    Retire la numérotation et le ':' final ; matche les variantes les plus
    longues d'abord ('materials and methods' avant 'method'), en égalité
    stricte ou en préfixe suivi d'un séparateur de mot.

    Tolère la LETTRINE (drop cap) : les journaux composent la première lettre
    du titre dans un bloc à part, PyMuPDF lit alors 'ntroduction' — on matche
    aussi chaque variante amputée de sa première lettre (égalité stricte
    seulement, variantes de 6+ caractères)."""
    t = _NUMBERING.sub("", label.strip().lower()).rstrip(":").strip()
    for kw, canon in _LOOKUP:
        if t == kw or t.startswith(kw + " ") or t.startswith(kw + ":"):
            return canon
    for kw, canon in _LOOKUP:
        if len(kw) >= 6 and t == kw[1:]:
            return canon
    return None


_LOOKUP: list[tuple[str, str]] = sorted(
    ((v, c) for c, vs in _HEADING_VARIANTS.items() for v in vs),
    key=lambda kv: -len(kv[0]))

# Titres en ligne : le titre ouvre la ligne et est suivi d'un point puis du texte
# ('Participants and procedure. The permission…'). Alternation bornée aux
# variantes connues pour éviter les faux positifs ; 'references' exclu (une
# ligne 'references. Scores range…' n'est jamais un titre de bibliographie).
_INLINE_HEAD = re.compile(
    r"(?im)^[ \t]*("
    + "|".join(re.escape(v) for v, c in _LOOKUP if c not in ("references", "backmatter"))
    + r")\.\s+[A-Z\"']"
)


def _normalize(text: str) -> str:
    text = text.translate(_TYPO)
    text = _SIGN_SPACE_GAP.sub("", text)
    text = _DECIMAL_COMMA.sub(".", text)
    return text


def _strip_junk(text: str) -> str:
    return _JUNK.sub("", text)


def _find_heading_offsets(text: str) -> list[tuple[int, str, str, str]]:
    """Retourne [(offset, section_canonique, source, titre_brut)], trié, pour
    chaque titre reconnu : lignes isolées (regex) + titres en ligne suivis
    d'un point."""
    offsets: list[tuple[int, str, str, str]] = []
    pos = 0
    for line in text.splitlines(keepends=True):
        m = _HEAD_LINE.match(line)
        if m:
            label = m.group(2).strip().lower()
            for kw, canon in _LOOKUP:
                # égalité stricte, ou lettrine (première lettre composée à part)
                if label == kw or (len(kw) >= 6 and label == kw[1:]):
                    offsets.append((pos, canon, "regex", _clean_title_for_display(line)))
                    break
        pos += len(line)

    # titres en ligne ('Participants and procedure. The permission…')
    for m in _INLINE_HEAD.finditer(text):
        canon = _canon_heading(m.group(1))
        if canon:
            offsets.append((m.start(), canon, "regex", _clean_title_for_display(m.group(1))))

    return sorted(offsets)


def _signet_offsets(path: str | Path, pages: list[str]) -> list[tuple[int, str, str, str]]:
    """Titres issus des signets du PDF, localisés au caractère près dans le texte.

    TOUS les niveaux de signets sont considérés (les articles multi-études
    mettent Method/Results au niveau 2 sous '2 Study 1') ; seuls ceux reconnus
    comme section canonique sont gardés. EXCEPTION : les DESCENDANTS d'un
    signet 'Abstract' sont ignorés — les revues à abstract structuré (BMC…)
    mettent Background/Methods/Results/Conclusions de l'abstract dans la table
    des matières, et les prendre pour les vraies sections découperait tout
    l'article dans l'abstract. Le titre est recherché sur sa page de
    destination (offset précis) ; à défaut, l'offset de début de page est
    utilisé (granularité page). PDF sans signets → []."""
    try:
        signets = get_signets(path)
    except Exception:
        return []
    if not signets:
        return []
    # offset de début de chaque page dans le texte joint par '\n'
    page_starts, pos = [], 0
    for pg in pages:
        page_starts.append(pos)
        pos += len(pg) + 1
    n_pages = len(pages)

    out: list[tuple[int, str, str, str]] = []
    stack: list[tuple[int, str | None]] = []   # ancêtres : (niveau, section canonique)
    for level, title, page in signets:
        while stack and stack[-1][0] >= level:
            stack.pop()
        canon = _canon_heading(title)
        inside_abstract = any(c == "abstract" for _, c in stack)
        stack.append((level, canon))
        if canon is None or inside_abstract:
            continue
        p = min(max(page, 1), n_pages) - 1
        off = page_starts[p] + _locate_heading(pages[p], title.strip())
        out.append((off, canon, "signet", _clean_title_for_display(title)))
    return sorted(out)


def _extract_tables(text: str) -> str:
    """Récupère tous les blocs commençant par 'Table N' sur le document entier."""
    starts = [m.start() for m in re.finditer(r"(?im)^\s*table\s+\d+", text)]
    if not starts:
        return ""
    blocks = []
    for i, s in enumerate(starts):
        # fin du bloc : prochain 'Table N' ou +2000 caractères
        nxt = starts[i + 1] if i + 1 < len(starts) else len(text)
        end = min(nxt, s + 2000)
        blocks.append(text[s:end].strip())
    return "\n\n".join(blocks)


def _locate_heading(page_text: str, heading: str) -> int:
    """Offset d'un titre dans le texte (nettoyé) de sa page.

    Cherche le titre sur sa propre ligne (numérotation tolérée) — un find()
    naïf attraperait le mot en plein texte ('results. For example…') ;
    replis : casse exacte n'importe où, puis début de page (0)."""
    m = re.search(
        r"(?im)^\s*(?:\d{1,2}(?:\.\d{1,2}){0,2}|[IVXivx]{1,4})?[.\)]?\s*"
        + re.escape(heading) + r"\s*:?\s*$", page_text)
    if m:
        return m.start()
    idx = page_text.find(heading)
    return idx if idx >= 0 else 0


def _font_offsets(path: str | Path, pages: list[str]) -> list[tuple[int, str, str, str]]:
    """Titres par MÉTADONNÉES TYPOGRAPHIQUES : une ligne courte, plus grande
    (ou aussi grande et grasse) que le corps du texte, dont le libellé mappe
    vers une section canonique. Les lignes de titre consécutives de même style
    sont recollées ('CONCLUSION AND' + 'PERSPECTIVES')."""
    # (page 1-based, texte, taille, gras) pour chaque ligne du PDF
    lines: list[tuple[int, str, float, bool]] = []
    with fitz.open(str(path)) as doc:
        for pno, page in enumerate(doc, 1):
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    spans = line.get("spans", [])
                    txt = "".join(s["text"] for s in spans).strip()
                    if not txt or not spans:
                        continue
                    lines.append((pno, txt, round(spans[0]["size"], 1),
                                  bool(spans[0]["flags"] & 16)))
    if not lines:
        return []
    # taille du corps de texte = taille la plus fréquente, pondérée par la
    # longueur (les articles à deux colonnes ont beaucoup de lignes courtes)
    weights: dict[float, int] = {}
    for _, txt, size, _ in lines:
        weights[size] = weights.get(size, 0) + len(txt)
    body = max(weights, key=weights.get)

    def is_heading(txt: str, size: float, bold: bool) -> bool:
        return len(txt) <= 60 and (size >= body + 1.5 or (bold and size >= body + 0.5))

    out: list[tuple[int, str, str, str]] = []
    i = 0
    while i < len(lines):
        pno, txt, size, bold = lines[i]
        if not is_heading(txt, size, bold):
            i += 1
            continue
        # recolle les lignes de titre consécutives de même page et même style
        joined = [txt]
        j = i + 1
        while j < len(lines) and lines[j][0] == pno and lines[j][2] == size \
                and lines[j][3] == bold and is_heading(lines[j][1], size, bold):
            joined.append(lines[j][1])
            j += 1
        canon = _canon_heading(" ".join(joined))
        if canon is not None:
            p = pno - 1
            if 0 <= p < len(pages):
                page_starts = sum(len(pg) + 1 for pg in pages[:p])
                off = page_starts + _locate_heading(pages[p], joined[0])
                out.append((off, canon, "police", _clean_title_for_display(" ".join(joined))))
        i = j
    return sorted(out)


def split_article(text: str, extra_offsets: list[tuple[int, str, str, str]] | None = None,
                 *, clean: bool = True, cuts: list[dict] | None = None) -> dict[str, str]:
    """Découpe le texte d'un article en sections canoniques. Retourne {section: contenu}.

    extra_offsets : titres issus des MÉTADONNÉES du PDF, (offset, section,
    source, titre_brut) déjà localisés dans le texte NETTOYÉ — signets
    (_signet_offsets) et typographie (_font_offsets). Ils sont PRIORITAIRES :
    la détection regex ne complète que les sections que les métadonnées n'ont
    pas trouvées. clean=False si le texte est déjà passé par
    _strip_junk(_normalize()) ; obligatoire quand extra_offsets est fourni
    (les offsets doivent être calculés sur le même texte).

    cuts : si fourni (liste), reçoit un dict par titre de découpe retenu :
    {"section", "source", "titre", "offset"} — traçabilité du découpage.
    """
    if clean:
        text = _strip_junk(_normalize(text))
    n = len(text)
    # PRIORITÉ AUX MÉTADONNÉES : signets/typographie d'abord, la regex ne
    # complète que si aucune métadonnée ne couvre la même section à moins de
    # 200 caractères.
    offsets: list[tuple[int, str, str, str]] = sorted(extra_offsets) if extra_offsets else []
    for off, sec, src, title in _find_heading_offsets(text):
        if not any(s == sec and abs(o - off) < 200 for o, s, _, _ in offsets):
            offsets.append((off, sec, src, title))
    offsets.sort()

    # Première occurrence de chaque section, dans l'ORDRE DU DOCUMENT — pas
    # l'ordre IMRaD : certains journaux placent Methods après Discussion
    # (ex. Cerea.2018 : Results p.2, Discussion p.4, Methods p.5).
    # Garde-fou abstracts structurés ('Research results.', 'Conclusions.' en
    # sous-titres d'abstract) : avant le titre INTRODUCTION, seules les sections
    # abstract/introduction sont crédibles.
    intro_off = min((o for o, s, _, _ in offsets if s == "introduction"), default=None)
    firsts: dict[str, tuple[int, str, str]] = {}   # sec -> (offset, source, titre)
    for off, sec, src, title in offsets:
        if sec in ("references", "backmatter"):
            continue
        if (intro_off is not None and off < intro_off
                and sec not in ("abstract", "introduction")):
            continue
        if sec not in firsts:
            firsts[sec] = (off, src, title)
    # Fin du contenu : références OU première rubrique administrative
    # (acknowledgments, funding…), seulement dans la 2e moitié pour éviter les
    # faux positifs en début d'article.
    refs = None
    for off, sec, src, title in offsets:
        if sec in ("references", "backmatter") and off > 0.4 * n:
            refs = off
            if cuts is not None:
                cuts.append({"section": sec, "source": src,
                             "titre": title, "offset": off})
            break
    if cuts is not None:
        for sec, (off, src, title) in sorted(firsts.items(), key=lambda kv: kv[1][0]):
            cuts.append({"section": sec, "source": src, "titre": title, "offset": off})
        cuts.sort(key=lambda c: c["offset"])

    tables = _extract_tables(text)

    # Aucun titre majeur détecté → fichier unique _full (aucune découpe faite)
    if not ({"method", "results", "discussion"} & set(firsts)):
        if cuts is not None:
            cuts.clear()
        out = {"full": text.strip()}
        if tables:
            out["tables"] = tables
        return out

    # Chaque section s'étend jusqu'au prochain début de section (quel qu'il
    # soit), aux références, ou à la fin du texte.
    bounds = sorted(off for off, _, _ in firsts.values()) + ([refs] if refs is not None else [n])

    def _end(start: int) -> int:
        nxt = [b for b in bounds if b > start]
        return min(nxt) if nxt else n

    sections: dict[str, str] = {}

    # abstract = début du document (ou marqueur abstract) → première section
    abs_start = firsts["abstract"][0] if "abstract" in firsts else 0
    if refs is None or abs_start < refs:
        sections["abstract"] = text[abs_start:_end(abs_start)].strip()

    for sec in ("introduction", "method", "results", "discussion"):
        if sec in firsts:
            start = firsts[sec][0]
            if refs is None or start < refs:
                sections[sec] = text[start:_end(start)].strip()

    if tables:
        sections["tables"] = tables

    return {k: v for k, v in sections.items() if v}


def main():
    ap = argparse.ArgumentParser(description="Découpe les articles PDF en sections IMRaD.")
    ap.add_argument("articles", nargs="*", help="PDF (glob ok). Défaut : articles/*.pdf")
    ap.add_argument("--out", default=str(_OUT_DIR), help="Dossier de sortie")
    ap.add_argument("--summary", action="store_true", help="Affiche un tableau récapitulatif")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    import glob as _glob
    patterns = args.articles or [str(_ARTICLES / "*.pdf")]
    paths: list[Path] = []
    for pat in patterns:
        if "*" in pat:
            paths.extend(Path(p) for p in sorted(_glob.glob(pat)))
        else:
            p = Path(pat)
            paths.append(p if p.exists() else _ARTICLES / p.name)

    all_secs = ["abstract", "introduction", "method", "results", "tables", "discussion", "full"]
    rows = []
    scanned: list[str] = []
    all_cuts: list[tuple[str, list[dict]]] = []   # (stem, découpes) pour la traçabilité
    for p in paths:
        if not p.exists():
            print(f"[skip] {p} introuvable")
            continue
        with fitz.open(p) as doc:
            pages = [_strip_junk(_normalize(pg.get_text())) for pg in doc]
        text = "\n".join(pages)
        if len(text.strip()) < MIN_TEXT_CHARS:
            scanned.append(p.stem)
            continue
        # métadonnées PRIORITAIRES : signets d'abord, typographie ensuite
        extra = _signet_offsets(p, pages) + _font_offsets(p, pages)
        cuts: list[dict] = []
        sections = split_article(text, extra, clean=False, cuts=cuts)
        article_dir = out_dir / p.stem
        article_dir.mkdir(parents=True, exist_ok=True)
        for sec, body in sections.items():
            (article_dir / f"{sec}.txt").write_text(body, encoding="utf-8")
        rows.append((p.stem, {s: len(sections.get(s, "")) for s in all_secs}))
        all_cuts.append((p.stem, cuts))

    # ── Traçabilité : chaque titre sur lequel une découpe a été faite ──────────
    lines = [
        "TITRES DE DÉCOUPE PAR ARTICLE — généré par tools/split_articles.py",
        "source : signet (métadonnées PDF) | police (métadonnées typographiques) | regex (texte)",
        "=" * 78,
    ]
    n_by_src: dict[str, int] = {}
    for stem, cuts in all_cuts:
        lines.append(f"\n== {stem}")
        if not cuts:
            lines.append("   (aucun titre détecté — fichier full)")
            continue
        for c in cuts:
            lines.append(f"   {c['section']:<13} <- {c['titre']!r}  [{c['source']}, offset {c['offset']}]")
            n_by_src[c["source"]] = n_by_src.get(c["source"], 0) + 1
    total = sum(n_by_src.values())
    lines.insert(3, "Découpes : " + ", ".join(f"{k} {v}" for k, v in sorted(n_by_src.items()))
                 + f" — total {total}")
    (out_dir / "_titres_decoupe.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\n{len(rows)} article(s) découpé(s) → {out_dir}")
    print(f"Titres de découpe : {out_dir / '_titres_decoupe.txt'} "
          f"({', '.join(f'{k} {v}' for k, v in sorted(n_by_src.items()))})")
    if scanned:
        print(f"\n[!] {len(scanned)} PDF sans couche texte (scan, OCR nécessaire) — NON découpés :")
        for s in scanned:
            print(f"    {s}")
    if args.summary:
        hdr = f"{'article':<26}" + "".join(f"{s[:5]:>8}" for s in all_secs)
        print(hdr)
        for stem, sizes in rows:
            line = f"{stem:<26}" + "".join(
                (f"{sizes[s]//1000:>6}k " if sizes[s] else f"{'.':>7} ") for s in all_secs
            )
            print(line)


if __name__ == "__main__":
    main()
