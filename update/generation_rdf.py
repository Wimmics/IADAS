import argparse
import csv
import json
import re
import shutil
import subprocess
from pathlib import Path
from rdflib import Graph, Namespace, Literal, URIRef, BNode, RDF

RR = Namespace('http://www.w3.org/ns/r2rml#')
RML = Namespace('http://semweb.mmlab.be/ns/rml#')
SKOS = Namespace('http://www.w3.org/2004/02/skos/core#')
IADAS = Namespace('http://ns.inria.fr/iadas/ontology/')
MISSING = {'', 'na', 'n.a.', 'n.a', 'n/a', 'nan', 'none'}


def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f, delimiter=';')
        return reader.fieldnames, list(reader)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    base = Path(__file__).resolve().parent
    parser.add_argument('--dossier', type=Path, default=base)
    parser.add_argument('--projet', type=Path, default=None)
    parser.add_argument('--sortie', type=Path, default=None)
    parser.add_argument('--jar', type=Path, help='JAR RMLMapper (defaut : rmlmapper.jar dans le dossier des donnees)')
    parser.add_argument('--preparer-seulement', action='store_true')
    args = parser.parse_args()
    folder = args.dossier.resolve()
    project = (args.projet or folder.parent).resolve()
    destination = (args.sortie or folder / 'generation_rdf').resolve()
    if destination.exists():
        raise FileExistsError('Dossier deja present ; choisir un autre --sortie.')
    jar = (args.jar or folder / 'rmlmapper.jar').resolve()
    if not args.preparer_seulement:
        if not jar.is_file():
            parser.error(f'JAR introuvable : {jar}. Indiquer --jar ou utiliser --preparer-seulement.')
        if not shutil.which('java'):
            parser.error('Java est introuvable dans PATH.')
    csv_folder = folder / 'csv_iadas'
    sport_csv = csv_folder / 'Sport_Hierarchy.csv'
    if not sport_csv.is_file():
        sport_csv = csv_folder / 'Sport-Hierarchy.csv'
    variables_csv = csv_folder / 'Class_Hierarchy.csv'
    if not variables_csv.is_file():
        variables_csv = csv_folder / 'Class-Hierarchy-V1.csv'
    sources = [
        ('sport', sport_csv, 'mapping-sport.ttl'),
        ('variables', variables_csv, 'mapping-hierarchy.ttl'),
        ('analyses', folder/'csv_iadas_normalized'/'IA-DAS-Data-simple-par-sport.csv', 'mapping-ontology.ttl'),
    ]
    prepared = []
    report = {}
    for kind, csv_path, mapping_name in sources:
        headers, rows = read_csv(csv_path)
        graph = Graph().parse(project/'pipeline-ontologie'/'mapping'/mapping_name, format='turtle')
        # Conserver les identifiants d'analyse : plusieurs lignes deviennent
        # plusieurs liens vers les sports de la meme analyse RDF.
        if kind == 'analyses':
            if any(r['Complexity of Analysis'].strip().casefold() != 'simple analyses' for r in rows):
                raise ValueError('Le CSV contient des analyses non simples.')
            if any(not r['Analysis_ID'].strip() for r in rows):
                raise ValueError('Identifiant analyse vide.')
        # Les marqueurs d'absence ne doivent pas devenir des concepts RDF N.A.
        entity_columns = [h for h in headers if h in ('Sport_name','Mediator','Moderator','CLASS','Class 1')
                          or 'sub-class' in h.lower() or h.startswith('Sub class ')]
        for row in rows:
            for h in entity_columns:
                row[h] = '' if row[h].strip().casefold() in MISSING else row[h].strip()
        csv_relative = f'csv/{kind}.csv'
        for node, _, _ in list(graph.triples((None, RML.source, None))):
            graph.set((node, RML.source, Literal(csv_relative)))
        # Un nouveau TriplesMap pour le quatrieme niveau des sports.
        if kind == 'sport' and 'Sub class 4' in headers:
            tm = URIRef('http://ns.inria.fr/iadas/sport-vocab/#SportClass4Update')
            graph.add((tm, RDF.type, RR.TriplesMap))
            logical = next(graph.objects(None, RML.logicalSource))
            graph.add((tm, RML.logicalSource, logical))
            sm = BNode()
            graph.add((tm, RR.subjectMap, sm))
            graph.add((sm, RR.template, Literal('http://ns.inria.fr/iadas/sport-vocab/{Sub class 4}')))
            for cls in (SKOS.Concept, IADAS.Sport):
                graph.add((sm, RR['class'], cls))
            for predicate, key, val in [
                (SKOS.prefLabel, RML.reference, Literal('Sub class 4')),
                (SKOS.broader, RR.template, Literal('http://ns.inria.fr/iadas/sport-vocab/{Sub class 3}')),
                (SKOS.inScheme, RR.constant, URIRef('http://ns.inria.fr/iadas/sport-category-vocab/Sport')),
                (IADAS.sportCategory, RR.template, Literal('http://ns.inria.fr/iadas/sport-category-vocab/{Class 1}')),
            ]:
                pom, om = BNode(), BNode()
                graph.add((tm, RR.predicateObjectMap, pom))
                graph.add((pom, RR.predicate, predicate))
                graph.add((pom, RR.objectMap, om))
                graph.add((om, key, val))
        # Retirer des copies les proprietes dont les colonnes n'existent pas.
        # Ne pas inventer effectSize, resultatRelation ou les coefficients.
        absent = set()
        for om, _, ref in list(graph.triples((None, RML.reference, None))):
            if str(ref) not in headers:
                absent.add(str(ref))
                parents = list(graph.subjects(RR.objectMap, om))
                if not parents:
                    raise ValueError(f'Reference manquante non optionnelle : {ref}')
                for pom in parents:
                    for tm in list(graph.subjects(RR.predicateObjectMap, pom)):
                        graph.remove((tm, RR.predicateObjectMap, pom))
                    graph.remove((pom, None, None))
                graph.remove((om, None, None))
        for template in graph.objects(None, RR.template):
            missing = set(re.findall(r'\{([^{}]+)\}', str(template))) - set(headers)
            if missing:
                raise ValueError(f'Colonnes requises par un template absentes : {missing}')
        report[kind] = {'source': str(csv_path), 'lignes': len(rows),
                        'proprietes_non_disponibles': sorted(absent)}
        if kind == 'analyses':
            report[kind]['analyses_distinctes_attendues'] = len({r['Analysis_ID'] for r in rows})
        prepared.append((kind, headers, rows, graph))
    (destination/'csv').mkdir(parents=True)
    (destination/'rml').mkdir()
    (destination/'rdf').mkdir()
    for kind, headers, rows, graph in prepared:
        with (destination/'csv'/f'{kind}.csv').open('w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=headers)  # virgule : defaut RMLMapper
            writer.writeheader()
            writer.writerows(rows)
        mapping = destination/'rml'/f'{kind}.ttl'
        graph.serialize(mapping, format='turtle')
        Graph().parse(mapping, format='turtle')
        if not args.preparer_seulement:
            output = destination/'rdf'/f'{kind}.ttl'
            command = ['java', '-Xmx4g', '-jar', str(jar), '-m', str(mapping),
                       '-o', str(output), '-s', 'turtle']
            with (destination/f'{kind}.log').open('w', encoding='utf-8') as log:
                subprocess.run(command, cwd=destination, stdout=log,
                               stderr=subprocess.STDOUT, check=True)
            result = Graph().parse(output, format='turtle')
            if not result:
                raise ValueError(f'RDF vide : {kind}')
            report[kind]['triplets'] = len(result)
            if kind == 'analyses':
                count = len(set(result.subjects(RDF.type, IADAS.Analysis)))
                expected = report[kind]['analyses_distinctes_attendues']
                if count != expected:
                    raise ValueError(f'Analyses RDF : {count}, attendu : {expected}')
                report[kind]['analyses_rdf'] = count
            print(f'{kind} : {len(result)} triplets valides syntaxiquement')
    (destination/'rapport.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Resultats : {destination}')
    print('Preparation terminee.' if args.preparer_seulement else 'Generation RDF terminee et relue avec RDFLib.')
    print('Aucun chargement dans Fuseki. Aucun raisonnement OWL ou validation SHACL effectue.')


if __name__ == '__main__':
    main()
