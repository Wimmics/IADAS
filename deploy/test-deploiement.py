import argparse
import getpass
import json
import sys
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


parser = argparse.ArgumentParser()
parser.add_argument("base_url")
parser.add_argument("--verifier-refus-rebuild", action="store_true")
args = parser.parse_args()

base_url = args.base_url.rstrip("/") + "/"
client = build_opener(NoRedirect())
failures = []


def request(path, method="GET", payload=None, headers=None):
    request_headers = dict(headers or {})
    body = None

    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    elif method == "POST":
        body = b""

    req = Request(
        base_url + path,
        data=body,
        headers=request_headers,
        method=method
    )

    try:
        with client.open(req, timeout=90) as response:
            return response.status, response.headers, response.read()
    except HTTPError as error:
        return error.code, error.headers, error.read()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def check(name, action):
    try:
        action()
        print("[OK] " + name)
    except Exception as error:
        failures.append(name)
        detail = (
            str(error)
            if isinstance(error, AssertionError)
            else type(error).__name__
        )
        print("[ECHEC] " + name + " : " + detail)


def check_page(path):
    status, headers, body = request(path)
    require(status == 200, "HTTP " + str(status))
    require(
        "text/html" in headers.get("Content-Type", "").lower(),
        "Une page HTML est attendue"
    )
    require(bool(body.strip()), "Page vide")


def get_json(path, method="GET", payload=None):
    status, headers, body = request(path, method, payload)
    require(status == 200, "HTTP " + str(status))
    require(
        "application/json" in headers.get("Content-Type", "").lower(),
        "Une reponse JSON est attendue"
    )
    data = json.loads(body)
    require(isinstance(data, dict), "Objet JSON attendu")
    require(not data.get("error"), "Erreur signalee par le service")
    return data


def check_stats():
    data = get_json("stats")
    require(bool(data), "Statistiques vides")


def check_sparql():
    data = get_json("api/query", "POST", {
        "queryType": "raw_sparql",
        "rawSparqlQuery": "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1"
    })

    bindings = data.get("results", {}).get("bindings")
    require(isinstance(bindings, list), "Resultats SPARQL absents")
    require(len(bindings) == 1, "Un triplet est attendu")
    require(
        all(key in bindings[0] for key in ("s", "p", "o")),
        "Triplet incomplet"
    )
    require(
        not data.get("performance", {}).get("usedFallback"),
        "Le service a utilise une reponse de secours"
    )


def check_auth():
    password = getpass.getpass("Mot de passe admin (non affiche) : ")
    require(bool(password), "Mot de passe vide")
    data = get_json("api/auth", "POST", {"password": password})
    require(
        data.get("success") is True
        and isinstance(data.get("token"), str)
        and bool(data["token"]),
        "Connexion non confirmee"
    )


def check_rebuild_refused(headers):
    status, _, _ = request(
        "rebuild-ontology",
        method="POST",
        headers=headers
    )
    require(status == 401, "HTTP " + str(status) + " au lieu de 401")


check("Page d'accueil", lambda: check_page(""))
check("Page statistiques", lambda: check_page("stats-page.html"))
check("API statistiques", check_stats)
check("Requete SPARQL de lecture", check_sparql)
check("Connexion admin", check_auth)

if args.verifier_refus_rebuild:
    check(
        "Reconstruction refusee sans jeton",
        lambda: check_rebuild_refused({})
    )
    check(
        "Reconstruction refusee avec faux jeton",
        lambda: check_rebuild_refused({
            "Authorization": "Bearer jeton-invalide"
        })
    )
else:
    print("[NON TESTE] Protection de la reconstruction")

print()
print("Bilan : " + str(len(failures)) + " echec(s).")
print("Ces tests HTTP ne remplacent pas les tests dans le navigateur.")
sys.exit(1 if failures else 0)
