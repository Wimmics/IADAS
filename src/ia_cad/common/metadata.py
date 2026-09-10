# -*- coding: utf-8 -*-
"""Récupération de métadonnées bibliographiques par DOI (CrossRef + OpenAlex).

Ré-implémentation, intégrée au pipeline, du prototype de début de stage
(`crossRefAPI.py`, jamais branché à l'extraction). Utilisée par
`extraction/extract.py` pour compléter le bloc `bibliographic` : titre,
auteurs, année, revue (dcterms:title/creator/date, bibo:journal), le DOI
lui-même (bibo:doi), et en repli iadas:country / iadas:continent quand le
LLM n'a rien trouvé dans le texte.

Aucune dépendance HTTP tierce : uniquement la bibliothèque standard
(`urllib.request`). Toute erreur réseau, timeout ou DOI introuvable renvoie
`None`, sans jamais interrompre l'extraction (voir `fetch_metadata`).
"""
from __future__ import annotations

import html
import json
import re
import urllib.error
import urllib.parse
import urllib.request

_USER_AGENT = "ia-cad-pipeline/1.0 (LAMHESS IADAS ; mailto:contact@example.org)"
_TIMEOUT = 10

# DOI : préfixe "10." + 4-9 chiffres, "/", puis le suffixe (RFC pratique, pas le
# grammaire ANSI/NISO complète). S'arrête avant la ponctuation de fin de phrase
# ou une parenthèse/chevron fermante qui ne fait pas partie du DOI lui-même.
_DOI_RE = re.compile(r"\b10\.\d{4,9}/[^\s\"'<>()\[\]{},;]+")


def find_doi_in_text(text: str) -> str | None:
    """Premier DOI présent dans un texte brut (regex, aucun appel réseau).

    Repère aussi bien "https://doi.org/10.xxx", "doi: 10.xxx" que la forme
    nue "10.xxx/yyy". Retourne le DOI en minuscules, sans le préfixe URL.
    """
    if not text:
        return None
    m = _DOI_RE.search(text)
    if not m:
        return None
    return m.group(0).rstrip(".,;:").lower()


def _http_get_json(url: str, params: dict | None = None) -> dict | None:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url, headers={"User-Agent": _USER_AGENT, "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
            ValueError, OSError):
        # ValueError couvre json.JSONDecodeError ; OSError couvre les échecs
        # réseau bas niveau qui ne passent pas par URLError sur certains OS.
        return None


# ─── CrossRef : identité bibliographique (pas de pays) ─────────────────────

def _crossref_by_doi(doi: str) -> dict | None:
    data = _http_get_json(f"https://api.crossref.org/works/{urllib.parse.quote(doi, safe='')}")
    if not data:
        return None
    d = data.get("message") or {}
    title = _unescape((d.get("title") or [None])[0])
    authors = [
        f"{a.get('given', '')} {a.get('family', '')}".strip()
        for a in d.get("author", []) if a.get("family")
    ]
    year = ((d.get("published") or d.get("published-print") or d.get("published-online") or {})
            .get("date-parts") or [[None]])[0][0]
    journal = _unescape((d.get("container-title") or [None])[0])
    if not any((title, authors, year, journal)):
        return None
    return {"title": title, "authors": authors, "year": year, "journal": journal}


def _unescape(s: str | None) -> str | None:
    """CrossRef renvoie parfois des entités HTML dans title/container-title
    (ex. "Psychiatry &amp; Psychology")."""
    return html.unescape(s) if s else s


# ─── OpenAlex : identité + pays d'affiliation des auteurs ───────────────────

def _openalex_by_doi(doi: str) -> dict | None:
    data = _http_get_json(f"https://api.openalex.org/works/doi:{urllib.parse.quote(doi, safe='')}")
    if not data:
        return None
    authorships = data.get("authorships") or []
    authors = [a.get("author", {}).get("display_name") for a in authorships
               if a.get("author", {}).get("display_name")]
    country_codes: list[str] = []
    for a in authorships:
        for inst in (a.get("institutions") or []):
            cc = inst.get("country_code")
            if cc and cc not in country_codes:
                country_codes.append(cc)
    primary = data.get("primary_location") or {}
    journal = _unescape((primary.get("source") or {}).get("display_name"))
    result = {
        "title": _unescape(data.get("title")),
        "authors": authors,
        "year": data.get("publication_year"),
        "journal": journal,
        "country_codes": country_codes,
    }
    if not any((result["title"], authors, result["year"], journal, country_codes)):
        return None
    return result


def fetch_metadata(doi: str | None) -> dict | None:
    """Métadonnées d'un DOI via CrossRef (identité) + OpenAlex (pays).

    Retourne None si le DOI est vide, si aucune des deux API ne répond, ou en
    cas d'erreur réseau (jamais d'exception propagée). Sinon :
        {doi, title, creator, date, journal, country_codes, source}
    - `creator` : auteurs joints par "; " (chaîne unique, comme dcterms:creator
      dans l'ABox ; voir tools/ontology/data_excel_to_ttl.py).
    - `country_codes` : codes ISO-3166-1 alpha-2 des institutions des auteurs
      (ordre d'apparition, dédupliqués) : un indice du pays des AUTEURS, pas
      forcément du pays de la POPULATION étudiée (voir extract.py).
    """
    if not doi:
        return None
    cr = _crossref_by_doi(doi)
    oa = _openalex_by_doi(doi)
    if not cr and not oa:
        return None

    title = (cr or {}).get("title") or (oa or {}).get("title")
    authors = (cr or {}).get("authors") or (oa or {}).get("authors") or []
    year = (cr or {}).get("year") or (oa or {}).get("year")
    journal = (cr or {}).get("journal") or (oa or {}).get("journal")
    country_codes = (oa or {}).get("country_codes") or []

    source = "crossref+openalex" if (cr and oa) else ("crossref" if cr else "openalex")
    return {
        "doi": doi,
        "title": title,
        "creator": "; ".join(authors) if authors else None,
        "date": str(year) if year else None,
        "journal": journal,
        "country_codes": country_codes,
        "source": source,
    }


# ─── Pays / continent ───────────────────────────────────────────────────────
# Vocabulaire contrôlé cible (common/vocabs/ontology_values.yaml, clé
# "continent") : America, Asia, Europe, Multiple countries, Oceania.
# Pas d'entrée "Africa" dans le corpus actuel ; mappée quand même (plus juste
# qu'une valeur fausse), à valider par l'équipe si un article africain arrive.

_CONTINENT_BY_CC: dict[str, str] = {}
for _cc in ("US", "CA", "MX", "BR", "AR", "CL", "CO", "PE", "VE", "UY", "EC",
            "BO", "PY", "CR", "PA", "GT", "HN", "SV", "NI", "DO", "CU", "JM",
            "TT", "BS", "BB", "PR"):
    _CONTINENT_BY_CC[_cc] = "America"
for _cc in ("GB", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "LU", "CH", "AT",
            "SE", "NO", "DK", "FI", "IS", "IE", "PL", "CZ", "SK", "HU", "RO",
            "BG", "GR", "HR", "SI", "RS", "BA", "MK", "ME", "AL", "XK", "LT",
            "LV", "EE", "UA", "BY", "MD", "MT", "CY", "AD", "MC", "LI", "SM",
            "VA", "RU"):
    _CONTINENT_BY_CC[_cc] = "Europe"
for _cc in ("CN", "JP", "KR", "KP", "IN", "PK", "BD", "LK", "NP", "BT", "MV",
            "ID", "MY", "SG", "TH", "VN", "PH", "MM", "KH", "LA", "BN", "TL",
            "TR", "IL", "PS", "LB", "JO", "SY", "IQ", "IR", "SA", "AE", "QA",
            "KW", "BH", "OM", "YE", "AF", "TW", "HK", "MO", "KZ", "UZ", "TM",
            "TJ", "KG", "MN", "GE", "AM", "AZ"):
    _CONTINENT_BY_CC[_cc] = "Asia"
for _cc in ("AU", "NZ", "FJ", "PG", "WS", "TO", "VU", "SB", "KI", "FM", "PW",
            "MH", "NR", "TV", "CK", "NC", "PF", "GU"):
    _CONTINENT_BY_CC[_cc] = "Oceania"
for _cc in ("ZA", "NG", "EG", "KE", "ET", "GH", "TZ", "UG", "DZ", "MA", "TN",
            "LY", "SD", "CM", "CI", "SN", "ZW", "ZM", "MZ", "AO", "BW", "NA",
            "RW", "ML", "BF", "NE", "MW", "MG", "MU", "SC", "TD", "SO", "LR",
            "SL", "GN", "BJ", "TG", "GA", "CG", "CD", "BI", "DJ", "ER", "GM",
            "GW", "MR", "SS", "SZ", "LS", "CV", "KM", "ST", "GQ"):
    _CONTINENT_BY_CC[_cc] = "Africa"

# Noms de pays (anglais, tels qu'utilisés par CrossRef/OpenAlex ou par les 34
# valeurs contrôlées de ontology_values.yaml) -> code ISO-3166-1 alpha-2.
# Couvre au minimum les 34 valeurs du vocabulaire contrôlé + variantes usuelles
# (les articles sont en anglais ; le LLM extrait des noms anglais).
_NAME_TO_CC: dict[str, str] = {
    "australia": "AU", "brazil": "BR", "canada": "CA", "china": "CN",
    "chypre": "CY", "cyprus": "CY", "croatia": "HR", "england": "GB",
    "united kingdom": "GB", "uk": "GB", "great britain": "GB",
    "france": "FR", "germany": "DE", "greece": "GR", "hungary": "HU",
    "india": "IN", "israel": "IL", "italy": "IT", "lebanon": "LB",
    "lithuania": "LT", "malaysia": "MY", "mexico": "MX",
    "netherlands": "NL", "new zealand": "NZ", "norway": "NO",
    "pakistan": "PK", "palestine": "PS", "philippines": "PH",
    "poland": "PL", "portugal": "PT", "serbia": "RS", "slovenia": "SI",
    "spain": "ES", "sweden": "SE", "switzerland": "CH", "turkey": "TR",
    "turkiye": "TR", "united states of america": "US",
    "united states": "US", "usa": "US", "us": "US",
    # variantes fréquentes hors vocabulaire contrôlé actuel
    "belgium": "BE", "austria": "AT", "denmark": "DK", "finland": "FI",
    "ireland": "IE", "romania": "RO", "bulgaria": "BG", "japan": "JP",
    "south korea": "KR", "korea": "KR", "indonesia": "ID",
    "south africa": "ZA", "nigeria": "NG", "egypt": "EG", "morocco": "MA",
    "tunisia": "TN", "kenya": "KE", "argentina": "AR", "chile": "CL",
    "colombia": "CO", "peru": "PE",
}
# Codes multi-pays : "New Zealand Australia" (valeur contrôlée composite).
_NAME_TO_CC["new zealand australia"] = None  # traité à part (2 pays)

# Sens inverse : code ISO -> libellé anglais du vocabulaire contrôlé (les 34
# valeurs de ontology_values.yaml, clé "country"). Dict explicite plutôt que
# dérivé de _NAME_TO_CC par recherche inverse : plusieurs alias (ex. "UK",
# "United Kingdom", "England") partagent le même code GB, et seul un mapping
# explicite garantit qu'on renvoie la forme canonique du vocabulaire contrôlé.
_CC_TO_COUNTRY_NAME: dict[str, str] = {
    "AU": "Australia", "BR": "Brazil", "CA": "Canada", "CN": "China",
    "CY": "Chypre", "HR": "Croatia", "GB": "United Kingdom", "FR": "France",
    "DE": "Germany", "GR": "Greece", "HU": "Hungary", "IN": "India",
    "IL": "Israel", "IT": "Italy", "LB": "Lebanon", "LT": "Lithuania",
    "MY": "Malaysia", "MX": "Mexico", "NL": "Netherlands", "NZ": "New Zealand",
    "NO": "Norway", "PK": "Pakistan", "PS": "Palestine", "PH": "Philippines",
    "PL": "Poland", "PT": "Portugal", "RS": "Serbia", "SI": "Slovenia",
    "ES": "Spain", "SE": "Sweden", "CH": "Switzerland", "TR": "Turkey",
    "US": "United States of America",
}


def cc_to_continent(country_code: str | None) -> str | None:
    """Code ISO-3166-1 alpha-2 -> continent (vocabulaire contrôlé, ou 'Africa')."""
    if not country_code:
        return None
    return _CONTINENT_BY_CC.get(country_code.strip().upper())


def cc_to_country_name(country_code: str | None) -> str | None:
    """Code ISO-3166-1 alpha-2 -> nom de pays anglais du vocabulaire contrôlé
    (`ontology_values.yaml`, clé "country"), ou None si le pays n'y figure pas
    (nouveau pays pour le corpus : à valider par l'équipe avant de l'ajouter
    au vocabulaire contrôlé, plutôt que de l'y injecter automatiquement)."""
    if not country_code:
        return None
    return _CC_TO_COUNTRY_NAME.get(country_code.strip().upper())


def country_to_continent(country_name: str | None) -> str | None:
    """Nom de pays (tel qu'extrait par le LLM ou renvoyé par cc_to_country_name)
    -> continent (vocabulaire contrôlé), ou None si non reconnu."""
    if not country_name:
        return None
    key = country_name.strip().lower()
    if key == "new zealand australia":
        return "Oceania"  # les deux pays du composite sont en Océanie
    cc = _NAME_TO_CC.get(key)
    return cc_to_continent(cc) if cc else None
