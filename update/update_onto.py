
import argparse
import base64
import getpass
import json
import shutil
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from rdflib import Graph, Namespace, RDF

IADAS = Namespace('http://ns.inria.fr/iadas/ontology/')
FILES = {
    'analyses.ttl': 'ia-das-ontology-clean.ttl',
    'variables.ttl': 'variable-hierarchy-clean.ttl',
    'sport.ttl': 'sport-hierarchy-simple-clean.ttl',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--projet', type=Path,
                        default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--url', default='http://localhost:3030/ds')
    parser.add_argument('--utilisateur', default='admin')
    parser.add_argument('--sans-auth', action='store_true')
    args = parser.parse_args()
    project = args.projet.resolve()
    source = project / 'update' / 'generation_rdf_IACADv1' / 'rdf'
    target = project/'pipeline-ontologie'/'resultats'
    combined = Graph()
    expected = None
    for name in FILES:
        graph = Graph().parse(source/name, format='turtle')
        if not graph:
            raise ValueError(f'RDF vide : {name}')
        if name == 'analyses.ttl':
            expected = set(graph.subjects(RDF.type, IADAS.Analysis))
            if not expected:
                raise ValueError('Aucune analyse dans le nouveau RDF.')
        combined += graph
    for path in [project/'IADAS-Model.ttl',
                 project/'pipeline-ontologie'/'skos-acad-enrichment.ttl',
                 project/'pipeline-ontologie'/'output'/'sport-category.ttl']:
        combined += Graph().parse(path, format='turtle')
    payload = combined.serialize(format='turtle', encoding='utf-8')
    # Verifier les donnees exactes qui seront envoyees.
    Graph().parse(data=payload, format='turtle')
    print(f'Nouveau graphe : {len(combined)} triplets, {len(expected)} analyses.')
    print('Remplacement du graphe par defaut ; sauvegarde automatique avant envoi.')
    headers = {}
    if not args.sans_auth:
        password = getpass.getpass(f'Mot de passe Fuseki ({args.utilisateur}) : ')
        token = base64.b64encode(f'{args.utilisateur}:{password}'.encode()).decode()
        headers['Authorization'] = 'Basic ' + token
    endpoint = args.url.rstrip('/')

    def http(method, url, body=None, content_type=None, accept=None):
        h = dict(headers)
        if content_type:
            h['Content-Type'] = content_type
        if accept:
            h['Accept'] = accept
        with urlopen(Request(url, data=body, headers=h, method=method), timeout=180) as response:
            return response.read()

    # Echec de connexion ou d'authentification : aucune modification des fichiers.
    previous = http('GET', endpoint+'/data?default', accept='text/turtle')
    previous_graph = Graph().parse(data=previous, format='turtle')
    backup = project/'update'/'sauvegardes'/datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    backup.mkdir(parents=True)
    (backup/'fuseki-default-avant.ttl').write_bytes(previous)
    (backup/'nouveau-graphe.ttl').write_bytes(payload)
    present = {}
    for dest in FILES.values():
        path = target/dest
        present[dest] = path.exists()
        if path.exists():
            shutil.copy2(path, backup/dest)
    (backup/'manifest.json').write_text(json.dumps({
        'endpoint': endpoint, 'anciens_fichiers_presents': present,
        'anciens_triplets': len(previous_graph),
        'nouveaux_triplets': len(combined), 'analyses_attendues': len(expected),
    }, indent=2), encoding='utf-8')
    print(f'Sauvegarde : {backup}')
    # Le PUT Graph Store remplace le graphe par defaut au lieu d'ajouter aux anciens RDF.
    try:
        http('PUT', endpoint+'/data?default', payload, 'text/turtle')
        loaded = Graph().parse(data=http('GET', endpoint+'/data?default', accept='text/turtle'),
                               format='turtle')
        actual = set(loaded.subjects(RDF.type, IADAS.Analysis))
        if actual != expected or len(loaded) != len(combined):
            raise ValueError(f'Controle apres chargement echoue : {len(actual)} analyses, {len(loaded)} triplets.')
        # Installer aussi les fichiers attendus par docker-compose pour les futurs chargements.
        target.mkdir(parents=True, exist_ok=True)
        for name, dest in FILES.items():
            shutil.copy2(source/name, target/dest)
    except Exception:
        print('Echec : tentative de restauration du graphe precedent.')
        try:
            http('PUT', endpoint+'/data?default', previous, 'text/turtle')
            print('Graphe precedent renvoye a Fuseki.')
        except Exception as rollback_error:
            print(f'Restauration automatique echouee : {rollback_error}')
            print(f'Sauvegarde a recharger : {backup / "fuseki-default-avant.ttl"}')
        for dest, existed in present.items():
            path = target/dest
            if existed:
                shutil.copy2(backup/dest, path)
            elif path.exists():
                path.unlink()
        raise
    print(f'Mise a jour terminee : {len(actual)} analyses distinctes, {len(loaded)} triplets.')
    print('Les trois fichiers du dossier pipeline-ontologie/resultats ont aussi ete actualises.')


if __name__ == '__main__':
    main()
