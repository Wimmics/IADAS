import pytest

from ia_cad.tools.corpus.split_articles import _clean_title_for_display


@pytest.mark.parametrize("raw, expected", [
    ("Introduction", "Introduction"),
    ("INTRODUCTION", "Introduction"),
    ("1. Introduction", "Introduction"),
    ("1 Introduction", "Introduction"),
    ("1 INTRODUCTION", "Introduction"),
    ("2. Materials and Methods", "Materials and methods"),
    ("MATERIALS AND METHODS", "Materials and methods"),
    ("2 METHOD 2.1 Participants", "Method participants"),
    ("3 RESULTS", "Results"),
    ("ReSults", "Results"),
    ("DiSCUSSiOn", "Discussion"),
    ("4. Discussion", "Discussion"),
    ("1.1. The present study", "The present study"),
    ("Abstract:", "Abstract"),
    ("IV. Discussion", "Discussion"),
])
def test_clean_title_for_display(raw, expected):
    assert _clean_title_for_display(raw) == expected


def test_clean_title_for_display_empty_stays_empty():
    assert _clean_title_for_display("") == ""
