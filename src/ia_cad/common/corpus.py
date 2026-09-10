"""
corpus.py — Séparation test / production (réunion 6/7).

Un article est en mode « test » s'il appartient au corpus annoté (un ground
truth existe pour son stem) : ses extractions sont comparables au GT et vont
dans les dossiers de résultats habituels. Sinon il est en mode « production » :
c'est un article nouveau destiné à peupler la base ; ses extractions vont dans
un sous-dossier production/ et se contrôlent SANS GT via
tools/report_production.py.

Ce module ne fait que répondre à « ce stem fait-il partie du corpus annoté ? ».
"""
from functools import lru_cache
from pathlib import Path

from ia_cad.paths import GROUND_TRUTH_DIR

# ground_truth/ (LA RÉFÉRENCE, dérivée de l'ABox) fait foi pour le corpus annoté.
_GT_DIRS = (GROUND_TRUTH_DIR,)

PRODUCTION_SUBDIR = "production"

# Les GT sont répartis en sous-dossiers train/ (exemples annotés pour les
# prompts) et test/ (évaluation de l'extraction). Un layout à plat reste accepté.
GT_SPLITS = ("train", "test")


def iter_gt(gt_dir: Path) -> list[Path]:
    """Tous les GT d'un dossier, à plat ou répartis en train/ et test/."""
    files = list(gt_dir.glob("*.json"))
    for sub in GT_SPLITS:
        files += (gt_dir / sub).glob("*.json")
    return sorted(files, key=lambda p: p.name)


def find_gt(gt_dir: Path, stem: str) -> Path | None:
    """Chemin du GT d'un stem (à plat, train/ ou test/), None s'il n'existe pas."""
    for d in (gt_dir, *(gt_dir / sub for sub in GT_SPLITS)):
        p = d / f"{stem}.json"
        if p.exists():
            return p
    return None


@lru_cache(maxsize=1)
def annotated_stems() -> frozenset[str]:
    """Stems du corpus annoté (216 attendus)."""
    stems: set[str] = set()
    for d in _GT_DIRS:
        if d.is_dir():
            stems.update(f.stem for f in iter_gt(d))
    return frozenset(stems)


def mode_for(stem: str) -> str:
    """'test' si le stem a un ground truth, sinon 'production'."""
    return "test" if stem in annotated_stems() else PRODUCTION_SUBDIR


def route(out_dir: Path, stem: str) -> Path:
    """Dossier de sortie effectif : out_dir (test) ou out_dir/production/.

    Crée le dossier au besoin. Chaque pipeline passe SON out_dir : la
    séparation test/production ne mélange jamais les pipelines.
    """
    d = out_dir if mode_for(stem) == "test" else out_dir / PRODUCTION_SUBDIR
    d.mkdir(parents=True, exist_ok=True)
    return d
