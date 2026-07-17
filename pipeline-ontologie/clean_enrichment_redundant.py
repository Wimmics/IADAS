# -*- coding: utf-8 -*-
"""
Retire de skos-acad-enrichment.ttl les concepts dont l'URI exacte est desormais
generee independamment par le pipeline RML (source VF), pour eviter la double
declaration avec des categories skos:broader contradictoires (categorie IA de mai
2026 vs categorie officielle VF actuelle).

Ne retire QUE les concepts dont l'URI EXACTE correspond a une URI deja presente
dans resultats/variable-hierarchy-clean.ttl (genere par le pipeline). Les concepts
qui existent dans VF seulement comme synonyme (URI differente) ou pas du tout,
restent dans le fichier - retirer ceux-la casserait des liens RDF existants.
"""
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
ENRICHMENT = BASE / "skos-acad-enrichment.ttl"
PIPELINE_OUTPUT = BASE / "resultats" / "variable-hierarchy-clean.ttl"

pipeline_content = PIPELINE_OUTPUT.read_text(encoding="utf-8")
pipeline_uris = set(re.findall(
    r"^<(http://ns\.inria\.fr/iadas/ACAD-vocab/[^>]+)> <http://www\.w3\.org/1999/02/22-rdf-syntax-ns#type> "
    r"<http://www\.w3\.org/2004/02/skos/core#Concept>",
    pipeline_content, re.M
))
print(f"URIs generees par le pipeline (VF) : {len(pipeline_uris)}")

content = ENRICHMENT.read_text(encoding="utf-8")

# Split en blocs : chaque bloc de declaration de concept se termine par " .\n" en debut de ligne suivante
# On capture chaque bloc "<sujet> a skos:Concept ; ... ." (sujet = iadas-vocab:X ou <http://...>)
block_pattern = re.compile(
    r"(?:iadas-vocab:(\S+)|<(http://[^>]+)>)\s+a\s+skos:Concept\s*;.*?\.\n",
    re.S
)

kept_blocks = []
removed_blocks = []
removed_uris = []

last_end = 0
header_and_prefixes = None

for m in block_pattern.finditer(content):
    local, full = m.group(1), m.group(2)
    uri = ("http://ns.inria.fr/iadas/ACAD-vocab/" + local) if local else full
    block_text = m.group(0)
    if uri in pipeline_uris:
        removed_blocks.append(block_text)
        removed_uris.append(uri)
    else:
        kept_blocks.append((m.start(), block_text))

print(f"Blocs retires (URI deja generee par le pipeline) : {len(removed_blocks)}")
print(f"Blocs conserves : {len(kept_blocks)}")

# Reconstruire le fichier : tout ce qui n'est PAS un bloc de concept (prefixes, en-tete,
# declarations topConcept) reste tel quel ; seuls les blocs de concepts retires disparaissent.
new_content = block_pattern.sub(
    lambda m: "" if (
        ("http://ns.inria.fr/iadas/ACAD-vocab/" + m.group(1) if m.group(1) else m.group(2)) in pipeline_uris
    ) else m.group(0),
    content
)

# Nettoyer les lignes vides multiples laissees par la suppression
new_content = re.sub(r"\n{3,}", "\n\n", new_content)

# Mettre a jour le commentaire d'en-tete avec le nouveau compte
new_content = re.sub(
    r"# {6,}\(145 variables ind[^\n]*\n",
    "",
    new_content
)
new_content = re.sub(
    r"# {6,}Ces concepts s'ajoutent aux \d+ concepts g[^\n]*\n",
    "",
    new_content
)

ENRICHMENT.write_text(new_content, encoding="utf-8")
print(f"\nEcrit : {ENRICHMENT}")
print(f"Concepts retires : {len(removed_uris)}")
print(f"Concepts restants dans le fichier : {154 - len(removed_uris)} (attendu : 15)")
