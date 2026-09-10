"""pdf.py Lecture de PDF/TXT avec sanitisation Unicode."""
import re
import fitz
from pathlib import Path

_TYPO = str.maketrans({
    "‘": "'", "’": "'",
    "“": '"', "”": '"',
    "–": "-", "—": "-",
    "­": "",
    "�": "'",
    " ": " ", " ": " ", " ": " ", " ": " ",  # nbsp/thin/narrow/hair space -> espace normal
})

# Mêmes artefacts numériques que split_articles.py::_normalize() (repli sans cache de
# sections : un espace fine coincé entre signe et chiffre, virgule décimale européenne).
_SIGN_SPACE_GAP = re.compile(r"(?<=[-−–])\s(?=\d)")
_DECIMAL_COMMA  = re.compile(r"(?<=\d),(?=\d)")


def read_file(path: Path) -> str:
    """Lit un PDF (toutes les pages) ou un TXT, avec sanitisation des caractères typographiques."""
    if path.suffix.lower() == ".pdf":
        with fitz.open(path) as doc:
            text = "\n".join(p.get_text() for p in doc)
        text = text.translate(_TYPO)
        text = _SIGN_SPACE_GAP.sub("", text)
        text = _DECIMAL_COMMA.sub(".", text)
        return text
    return path.read_text(encoding="utf-8")
