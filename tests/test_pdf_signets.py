"""Tests de common/pdf_signets.py sur des PDF réels de articles/ couvrant
les profils du corpus : signets propres, signets poubelle (_Hlk…), et
absence de signets.

articles/ n'est pas versionné (droits éditeurs) : sur un clone sans corpus
local, TOUS les tests de ce module se skippent. Pour une couverture réelle,
placer au moins Baric.2024.pdf, AleksicVeljkovic.2020.pdf et Abras.2022.pdf
dans articles/ (cf. articles/README.md)."""
from pathlib import Path

import pytest

from ia_cad.common.pdf_signets import get_signets
from ia_cad.paths import ARTICLES_DIR as ARTICLES


def _pdf(name: str) -> Path:
    p = ARTICLES / name
    if not p.exists():
        pytest.skip(f"{name} absent de articles/")
    return p


def test_signets_niveau1_propres():
    # Baric.2024 : Introduction / Materials and Methods / Results / Discussion… au niveau 1
    signets = get_signets(_pdf("Baric.2024.pdf"))
    titles = [t for _, t, _ in signets]
    assert len(signets) >= 4
    assert any("Results" in t for t in titles)


def test_signets_poubelle_filtres():
    # AleksicVeljkovic.2020 : 22 signets niveau 1, tous des ancres Word _Hlk…/_GoBack
    signets = get_signets(_pdf("AleksicVeljkovic.2020.pdf"))
    assert all(not t.startswith("_") for _, t, _ in signets)


def test_sans_signets_renvoie_vide():
    # Abras.2022 : aucun signet → []
    assert get_signets(_pdf("Abras.2022.pdf")) == []
