"""
pdf_signets.py — Extraction des signets (bookmarks) bruts des PDF.

État du corpus (sondage 2026-07-14, 183 PDF de articles/) : 79 PDF ont des
signets, 104 n'en ont aucun. get_signets() ne fait que lire et nettoyer la
table des matières du PDF (titres poubelle Word _Hlk…/_GoBack, BOM, adresses
filtrés) ; le mapping "quel titre correspond à quelle section" et la
combinaison avec d'autres sources (police, regex) sont la responsabilité de
l'appelant — voir tools/split_articles.py, seul consommateur de ce module.
"""
import re
from pathlib import Path

import fitz  # PyMuPDF

# Ancres techniques qui polluent les signets de certains PDF : ancres Word
# (_Hlk…, _GoBack), et identifiants Google Docs (gibberish alphanumérique
# minuscule sans espace : '30j0zll', '1fob9te'…).
_JUNK = re.compile(r"^_|^[0-9a-z]*\d[0-9a-z]*$")


def _clean_title(title: str) -> str:
    """Nettoie un titre de signet : BOM, espaces insécables, espaces multiples."""
    t = title.replace("﻿", "").replace("\xa0", " ")
    return re.sub(r"\s+", " ", t).strip()


def get_signets(path: str | Path) -> list[tuple[int, str, int]]:
    """Signets bruts d'un PDF : [(niveau, titre nettoyé, page 1-based), ...].

    Sont écartés : titres vides, ancres techniques (Word _Hlk…/_GoBack,
    identifiants Google Docs), et signets à destination invalide (page < 1).
    PDF sans signets → [].
    """
    with fitz.open(str(path)) as doc:
        toc = doc.get_toc()
    out = []
    for level, title, page in toc:
        t = _clean_title(title)
        if not t or page < 1 or _JUNK.match(t):
            continue
        out.append((level, t, page))
    return out
