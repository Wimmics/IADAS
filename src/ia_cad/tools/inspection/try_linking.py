"""
try_linking.py — Testeur manuel de l'entity linking SPARQL
(ia_cad.common.linking.sparql_linking).

Donne un nom de sport ou de variable, voit l'URI résolue et TOUTES les classes
récupérées (catégorie/type de sport, CLASS/subClass/finalSubClass de variable),
plus la chaîne skos:broader remontée. Sert à vérifier manuellement que le graphe
renvoie les bonnes classes avant de lancer une extraction complète.

Lancer (le package est installé, `pip install -e .`) :

    # noms passés en argument (sport ET variable testés pour chacun)
    iacad-try-linking soccer anorexia "fat talk"

    # mode interactif : tape un nom, Entrée ; 'q' pour quitter
    iacad-try-linking

    # requête SPARQL brute contre le graphe de hiérarchie
    iacad-try-linking --sparql "SELECT ?l WHERE { ?s skos:prefLabel ?l } LIMIT 5"
"""
import argparse
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from ia_cad.common.onto_graph import get_graph
from ia_cad.common.linking.sparql_linking import (
    SportLinker, VariableLinker, resolve_uri,
    _broader_chain, _label, _NS,
)

_sport = SportLinker()
_var = VariableLinker()


def _fmt(d: dict | None) -> str:
    if d is None:
        return "None  (→ aucun match dans le graphe, fallback LLM)"
    return "\n".join(f"      {k:20} = {v!r}" for k, v in d.items())


def report(name: str) -> None:
    """Affiche URI résolue + entity linking sport + entity linking variable pour un nom."""
    print(f"\n{'=' * 64}\n  NOM : {name!r}\n{'=' * 64}")

    uri = resolve_uri(name)
    if uri is None:
        print("  resolve_uri  : None  (nom introuvable dans le graphe)")
        print("  → sport et variable renverront None, le pipeline appelle le LLM.")
        return
    print(f"  resolve_uri  : {uri}")
    print(f"  prefLabel    : {_label(uri)!r}")

    # chaîne broader (utile pour comprendre l'entity linking variable)
    chain = _broader_chain(uri)
    if len(chain) > 1:
        print("  chaîne broader (racine → concept) :")
        print("      " + "  →  ".join(str(_label(u)) for u in chain))

    print("\n  SportLinker.classify :")
    print(_fmt(_sport.classify(name)))

    print("\n  VariableLinker.classify :")
    print(_fmt(_var.classify(name)))


def run_sparql(query: str) -> None:
    """Exécute une requête SPARQL brute contre le graphe (préfixe skos: fourni)."""
    g = get_graph()
    rows = list(g.query(query, initNs=_NS))
    print(f"\n{len(rows)} ligne(s) :")
    for row in rows:
        print("   ", tuple(str(x) if x is not None else None for x in row))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("names", nargs="*", help="noms de sport/variable à tester")
    ap.add_argument("--sparql", metavar="QUERY",
                    help="lance une requête SPARQL brute (préfixe skos: dispo) et sort")
    args = ap.parse_args()

    if args.sparql:
        run_sparql(args.sparql)
        return

    if args.names:
        for name in args.names:
            report(name)
        return

    # mode interactif
    print("Testeur d'entity linking SPARQL. Tape un nom de sport/variable (q pour quitter).")
    while True:
        try:
            name = input("\nnom> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if name.lower() in {"q", "quit", "exit"}:
            break
        if name:
            report(name)


if __name__ == "__main__":
    main()
