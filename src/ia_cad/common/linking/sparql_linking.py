"""
sparql_linking.py — Entity linking (assignation ontologique) sport et variable
par requêtes SPARQL 1.1 sur le graphe IADAS chargé en mémoire
(ia_cad.common.onto_graph).

Classes VariableLinker / SportLinker, méthode .classify() ; renvoie des dicts
de la chaîne ontologique complète (hasCategory / subClass1..4 / finalClass pour
les variables ; sportSubcategory / sportPracticeType pour le sport).

Toutes les résolutions passent par g.query() (aucun g.triples()/g.value()), en
SPARQL 1.1 **standard** — pas de fonction Python enregistrée dans rdflib — pour
rester portable vers un endpoint distant (Corese/Fuseki). Conséquence : la
comparaison de labels se fait par égalité stricte puis LCASE() (les accents sont
significatifs). En pratique les prefLabel des TTL IADAS sont ASCII, donc aucun impact.

Résolution nom→URI sans fuzzy : exact prefLabel/altLabel (insensible à la casse)
puis CONTAINS borné aux mots, déterministe (ORDER BY … LIMIT 1 côté SPARQL).
classify() retourne None si rien n'est résolu (le caller déclenche le fallback LLM).
"""
import re
from pathlib import Path

import yaml
from rdflib import Literal, URIRef
from rdflib.plugins.sparql import prepareQuery

from ia_cad.common.onto_graph import get_graph

_SKOS = "http://www.w3.org/2004/02/skos/core#"
_IADAS_SPORTCAT = URIRef("http://ns.inria.fr/iadas/ontology/sportCategory")
_NS = {"skos": URIRef(_SKOS)}


def _lc(s: str) -> str:
    """Normalisation portable côté requête : trim + minuscules (LCASE SPARQL).
    Pas de suppression d'accents : symétrique avec LCASE(STR(?label)) côté graphe."""
    return s.strip().lower() if isinstance(s, str) else ""


# Requêtes préparées (parsées une fois). ?q / ?pattern / ?node liés à l'exécution.
_Q_CASE_PREF = prepareQuery(
    "SELECT ?subj ?obj WHERE { ?subj skos:prefLabel ?obj . "
    "FILTER(STR(?obj) = ?q) } ORDER BY STR(?obj) STR(?subj) LIMIT 1", initNs=_NS)
_Q_CASE_ALT = prepareQuery(
    "SELECT ?subj ?obj WHERE { ?subj skos:altLabel ?obj . "
    "FILTER(STR(?obj) = ?q) } ORDER BY STR(?obj) STR(?subj) LIMIT 1", initNs=_NS)
_Q_EXACT_PREF = prepareQuery(
    "SELECT ?subj ?obj WHERE { ?subj skos:prefLabel ?obj . "
    "FILTER(LCASE(STR(?obj)) = ?q) } ORDER BY STR(?obj) STR(?subj) LIMIT 1", initNs=_NS)
_Q_EXACT_ALT = prepareQuery(
    "SELECT ?subj ?obj WHERE { ?subj skos:altLabel ?obj . "
    "FILTER(LCASE(STR(?obj)) = ?q) } ORDER BY STR(?obj) STR(?subj) LIMIT 1", initNs=_NS)
_Q_CONTAINS = prepareQuery(
    "SELECT ?subj ?obj WHERE { ?subj skos:prefLabel ?obj . "
    "FILTER(REGEX(LCASE(STR(?obj)), ?pattern)) } "
    "ORDER BY STRLEN(STR(?obj)) STR(?obj) STR(?subj) LIMIT 1", initNs=_NS)
_Q_LABEL = prepareQuery(
    "SELECT ?l WHERE { ?node skos:prefLabel ?l } ORDER BY STR(?l) LIMIT 1", initNs=_NS)
_Q_PARENT = prepareQuery(
    "SELECT ?parent WHERE { ?node skos:broader ?parent . "
    "OPTIONAL { ?parent skos:prefLabel ?plabel } } "
    "ORDER BY ?plabel STR(?parent) LIMIT 1", initNs=_NS)
_Q_CATEGORY = prepareQuery(
    "SELECT ?cat WHERE { ?node <%s> ?cat } LIMIT 1" % _IADAS_SPORTCAT, initNs=_NS)

# Racines de variable-hierarchy = valeurs possibles de CLASS.
_VARIABLE_ROOTS = {
    "DEAB",
    "Intrapersonal factor related to DEAB",
    "Interpersonal factor related to DEAB",
    "Sociocultural factor related to DEAB",
    "Other behaviors",
}


def _first(query, **bindings):
    """Exécute une requête préparée avec initBindings et retourne la 1re ligne, ou None."""
    binds = {k: (v if isinstance(v, (URIRef, Literal)) else Literal(v))
             for k, v in bindings.items()}
    for row in get_graph().query(query, initBindings=binds):
        return row
    return None


# ─── Index de labels normalisés (repli après les matchs exacts) ───────────────
# Construit UNE fois par UNE requête SPARQL par prédicat (portable : la même
# requête fonctionne sur un endpoint distant) ; la normalisation se fait ensuite
# en Python, identiquement des deux côtés (nom requêté et labels du graphe).

_CONNECTORS = {"and", "or", "of", "the", "a", "an"}


def _norm_text(s: str) -> str:
    """Normalisation légère : minuscules, tirets/underscores/slashs → espace,
    ponctuation retirée, espaces réduits. 'Cross country' == 'Cross-country'."""
    s = re.sub(r"[-–—_/]", " ", s.lower())
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _singular(tok: str) -> str:
    """Neutralise le pluriel trivial ('ultramarathons' → 'ultramarathon').
    Conserve les mots courts et les finales en -ss ('stress')."""
    if len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
        return tok[:-1]
    return tok


def _token_key(s: str) -> frozenset | None:
    """Sac de mots insensible à l'ordre : 'Kathak dance' == 'Dance Kathak',
    'Shape and weight concern' == 'Weight and shape concern'. None si vide
    ou trop court pour être discriminant."""
    toks = [_singular(t) for t in _norm_text(s).split() if t not in _CONNECTORS]
    if not toks or max(len(t) for t in toks) < 2:
        return None
    return frozenset(toks)


_label_index_cache: tuple[dict, dict] | None = None


def _label_index() -> tuple[dict, dict]:
    """(norm_map, token_map) : label normalisé → URI et sac de mots → URI.

    Départage déterministe en cas de collision : prefLabel avant altLabel,
    puis label alphabétique, puis URI (setdefault sur liste triée)."""
    global _label_index_cache
    if _label_index_cache is None:
        rows = []
        for pred, prio in (("prefLabel", 0), ("altLabel", 1)):
            q = "SELECT ?s ?l WHERE { ?s skos:%s ?l }" % pred
            for s, l in get_graph().query(q, initNs=_NS):
                rows.append((prio, str(l), str(s), s))
        norm_map: dict = {}
        token_map: dict = {}
        for _, label, _, subj in sorted(rows, key=lambda r: (r[0], r[1], r[2])):
            n = _norm_text(label)
            if n:
                norm_map.setdefault(n, subj)
            k = _token_key(label)
            if k is not None:
                token_map.setdefault(k, subj)
        _label_index_cache = (norm_map, token_map)
    return _label_index_cache


def resolve_uri(name: str):
    """Nom libre → URIRef du concept, ou None.

    1a. Exact casse comprise sur prefLabel puis altLabel : certains labels ne
        diffèrent que par la casse (ex. 'Muscle Dysmorphia' catégorie vs
        'Muscle dysmorphia' concept feuille) — respecter la casse du nom annoté
        choisit le bon nœud.
    1b. Sinon exact insensible à la casse (FILTER LCASE = ?q). Plusieurs concepts
        peuvent alors partager le label : ORDER BY STR(?obj) STR(?subj) LIMIT 1
        départage de façon déterministe (label d'origine puis URI).
    1c. Sinon label normalisé (tirets/ponctuation/espaces) via l'index :
        'Cross country' → 'Cross-country'.
    1d. Sinon sac de mots (ordre libre, connecteurs ignorés, pluriels
        neutralisés) : 'Kathak dance' → 'Dance Kathak', 'Pressures from
        teammates' → 'Pressure from teammates'.
    2.  Sinon CONTAINS borné aux mots sur prefLabel (REGEX avec limites de mots) : la
        requête doit apparaître comme séquence de mots entière (évite 'art' ⊂ 'martial
        arts'). ORDER BY STRLEN … : le label le plus court puis l'ordre alpha.
    """
    q = _lc(name)
    if not q:
        return None

    # 1a. exact casse comprise : départage les labels homonymes à la casse près
    raw = name.strip()
    for query in (_Q_CASE_PREF, _Q_CASE_ALT):
        row = _first(query, q=raw)
        if row is not None:
            return row.subj

    # 1b. exact insensible à la casse, départage déterministe côté SPARQL
    for query in (_Q_EXACT_PREF, _Q_EXACT_ALT):
        row = _first(query, q=q)
        if row is not None:
            return row.subj

    # 1c/1d. index normalisé puis sac de mots
    norm_map, token_map = _label_index()
    uri = norm_map.get(_norm_text(name))
    if uri is not None:
        return uri
    key = _token_key(name)
    if key is not None:
        uri = token_map.get(key)
        if uri is not None:
            return uri

    # 2. CONTAINS borné aux mots, déterministe
    pattern = r"(?<![a-z0-9])" + re.escape(q) + r"(?![a-z0-9])"
    row = _first(_Q_CONTAINS, pattern=pattern)
    return row.subj if row is not None else None


def _label(uri) -> str | None:
    row = _first(_Q_LABEL, node=uri)
    return str(row.l) if row is not None else None


def _broader_parent(uri):
    """Parent skos:broader déterministe. L'ontologie est poly-hiérarchique
    (≈121 concepts ont plusieurs broader) et n'encode pas de parent canonique :
    ORDER BY ?plabel (prefLabel alphabétiquement le plus petit, non lié en premier)
    puis STR(?parent). Choix arbitraire mais STABLE."""
    row = _first(_Q_PARENT, node=uri)
    return row.parent if row is not None else None


def _broader_chain(uri):
    """Chaîne racine → concept en URIRef (remontée déterministe, garde anti-cycle)."""
    chain = [uri]
    seen = {uri}
    cur = uri
    while True:
        parent = _broader_parent(cur)
        if parent is None or parent in seen:
            break
        chain.append(parent)
        seen.add(parent)
        cur = parent
    chain.reverse()
    return chain


class VariableLinker:
    """Entity linking d'une variable (acad) par remontée skos:broader dans le graphe IADAS."""

    def classify(self, variable_name: str, threshold: int = 85) -> dict | None:
        """Retourne {CLASS, subClass1..5, finalSubClass} ou None.

        threshold est ignoré (plus de fuzzy) ; gardé pour compat de signature.
        """
        variable_name = apply_synonyms(variable_name, "variable") or variable_name
        uri = resolve_uri(variable_name)
        if uri is None:
            return None
        chain = _broader_chain(uri)
        labels = [_label(u) for u in chain]
        if any(x is None for x in labels) or labels[0] not in _VARIABLE_ROOTS:
            return None  # noeud sans label ou racine inconnue → fallback LLM
        subs = (labels[1:] + [None] * 5)[:5]
        return {
            "CLASS": labels[0],
            "subClass1": subs[0],
            "subClass2": subs[1],
            "subClass3": subs[2],
            "subClass4": subs[3],
            "subClass5": subs[4],
            "finalSubClass": labels[-1] if len(labels) > 1 else None,
        }


_PRACTICE_FILE = Path(__file__).parent / "sport_practice.yaml"
_practice_cache: dict | None = None


def _practice_map() -> dict:
    global _practice_cache
    if _practice_cache is None:
        with open(_PRACTICE_FILE, encoding="utf-8") as f:
            _practice_cache = yaml.safe_load(f) or {}
    return _practice_cache


def _category_label(uri) -> str | None:
    """Label lisible de la catégorie depuis le localname de l'URI sportCategory.

    On dérive du localname ('Ball_game' -> 'Ball game') plutôt que de joindre avec
    sport-category.ttl : les URIs y sont encodées différemment ('Ball%20game').
    """
    row = _first(_Q_CATEGORY, node=uri)
    if row is None:
        return None
    local = str(row.cat).rsplit("/", 1)[-1]
    return local.replace("%20", " ").replace("_", " ")


class SportLinker:
    """Entity linking d'un sport : sportSubcategory = catégorie ; sportPracticeType = table."""

    def classify(self, sport_name: str, threshold: int = 85) -> dict | None:
        """Retourne {sportPracticeType, sportSubcategory} ou None."""
        sport_name = apply_synonyms(sport_name, "sport") or sport_name
        uri = resolve_uri(sport_name)
        if uri is None:
            return None
        subcat = _category_label(uri)
        if subcat is None:
            return None
        pm = _practice_map()
        practice = pm.get("map", {}).get(subcat, pm.get("default"))
        return {"sportPracticeType": practice, "sportSubcategory": subcat}


def classify_sport_field(clf: "SportLinker", raw: str | None) -> tuple[list[str], str | None, str | None]:
    """Entity linking d'un champ sportName complet (mono ou multi-sport).

    Retourne (noms individuels, sportSubcategory agrégée, sportPracticeType agrégé).

    1. Marqueur générique ('Mixed sport'…) → Multisport / Mixed sport.
    2. Le champ COMPLET est tenté d'abord : protège les noms composés que le
       découpage sur ' and ' déchiquetterait ('track and field').
    3. Sinon découpage + entity linking sport par sport, puis agrégation GT :
       même sous-catégorie pour tous → on la garde ; divergence → Multisport ;
       AUCUN résolu → Multisport seulement si plusieurs noms (prose multi-sport),
       (None, None) pour un nom seul non résolu — un mono-sport inconnu n'est
       pas un multi-sport.
    """
    if not raw:
        return [], None, None
    if is_generic_multisport(raw):
        return [raw.strip()], "Multisport", "Mixed sport"
    full = clf.classify(raw)
    if full is not None:
        name = re.sub(r"\s+", " ", str(raw)).strip()
        return [name], full["sportSubcategory"], full["sportPracticeType"]
    names = split_sport_names(raw)
    results = [clf.classify(n) for n in names]
    subcat, ptype = aggregate_sport_results(results, len(names))
    return names, subcat, ptype


def aggregate_sport_results(results: list[dict | None], n_names: int) -> tuple[str | None, str | None]:
    """Agrège des résultats de SportLinker.classify (convention GT).

    Les sports non résolus (None) ne votent pas — même règle que la dérivation
    des GT depuis l'ABox (abox_to_gt.build_sport_block). sportSubcategory encode
    "un seul sport nommé dans le champ" vs "plusieurs" : 2+ noms -> Multisport
    MÊME si tous tombent dans la même sous-catégorie (volleyball + basketball ->
    Multisport, pas 'Ball game' ; vérifié contre eval_rangement, 68.2% -> 78.5%
    sans régression sur sportPracticeType). sportPracticeType, lui, garde le
    type partagé quand tous les sports résolus s'accordent."""
    subcats = {r["sportSubcategory"] for r in results if r and r.get("sportSubcategory")}
    types = {r["sportPracticeType"] for r in results if r and r.get("sportPracticeType")}
    if not subcats:
        return ("Multisport", "Mixed sport") if n_names > 1 else (None, None)
    subcat = "Multisport" if n_names > 1 else subcats.pop()
    ptype = types.pop() if len(types) == 1 else "Mixed sport"
    return subcat, ptype


_SPORT_CONNECTORS = {"and", "e.g", "i.e", "including", "etc", "the", "of", "or"}
_GENERIC_MULTISPORT = {
    "mixed sport", "mixed sports", "multi-sport", "multi-sports",
    "multisport", "multisports", "multiple sports", "multiple sport",
}


def split_sport_names(raw: str | None) -> list[str]:
    """Découpe un champ sportName libre en noms individuels (';', ',', retours-ligne,
    ' and '), retire les parenthèses et les mots de liaison. '' / None → []."""
    if not raw:
        return []
    text = re.sub(r"\([^)]*\)", " ", str(raw))
    out = []
    for part in re.split(r"[;,\n]| and ", text):
        p = part.strip().strip(".").strip()
        if not p or p.lower() in _SPORT_CONNECTORS:
            continue
        out.append(p)
    return out


def split_variable_names(raw: str | None) -> list[str]:
    """Découpe un champ variable (V1/V2) en composants (retours-ligne ou ';'). '' / None → []."""
    if not raw:
        return []
    return [p.strip() for p in re.split(r"[\n;]", str(raw)) if p.strip()]


def is_generic_multisport(name: str | None) -> bool:
    """True si `name` est un marqueur multi-sport générique (ex. 'Mixed sport')."""
    if not name:
        return False
    return str(name).strip().lower() in _GENERIC_MULTISPORT


_REDIRECTIONS_FILE = Path(__file__).parent / "redirections.yaml"
_redirections_cache: dict | None = None


def _redirections() -> dict:
    global _redirections_cache
    if _redirections_cache is None:
        if _REDIRECTIONS_FILE.exists():
            with open(_REDIRECTIONS_FILE, encoding="utf-8") as f:
                _redirections_cache = yaml.safe_load(f) or {}
        else:
            _redirections_cache = {}
    return _redirections_cache


def apply_synonyms(value: str | None, section: str) -> str | None:
    """Redirige un nom vers son label canonique via common/linking/redirections.yaml.

    Chaque entrée encode une convention d'annotation vérifiée dans l'ABox
    (refersToVariable), là où la résolution lexicale partirait sur un autre
    concept (doublons de skos-acad-enrichment.ttl, altLabels dupliqués) —
    pansements en attendant la correction des TTL. Passthrough si aucune entrée."""
    if not value:
        return value
    redirected = _redirections().get(section, {}).get(str(value).strip().lower())
    return redirected if redirected else value
