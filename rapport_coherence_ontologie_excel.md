# Rapport de cohérence ontologie / Excel — IA-DAS
**Date :** 24 juin 2026  
**Auteure :** Imane Amraoui  
**Fichiers sources :**
- Données analyses : `pipeline-ontologie/data-csv/IA-DAS-Data.csv`
- Hiérarchie des variables : `pipeline-ontologie/data-csv/Class-Hierarchy-V1.csv`
- Hiérarchie des sports : `pipeline-ontologie/data-csv/Sport-Hierarchy.csv`
- Ontologie générée : `pipeline-ontologie/resultats/ia-das-ontology-clean.ttl`
- Hiérarchie sport SKOS : `pipeline-ontologie/resultats/sport-hierarchy-simple-clean.ttl`
- Hiérarchie variables SKOS : `pipeline-ontologie/resultats/variable-hierarchy-clean.ttl`
- Endpoint SPARQL : `http://localhost:3030/ds/sparql` (Fuseki, namespace `http://ns.inria.fr/iadas/`)

---

## 1. Analyses des sports

### 1.1 Chiffres globaux

| Dimension | Excel (`Sport-Hierarchy.csv`) | Ontologie Fuseki | Statut |
|---|---|---|---|
| Sports distincts | 151 | 151 (dans la hiérarchie SKOS) | ✅ Écart expliqué (voir §1.5) |
| Catégories de sport | 9 | 8 | ✅ "Gymgoer weights" = catégorie sans sous-sport distinct |
| Sports référencés dans les analyses | — | 166 URI distinctes | ℹ️ Inclut formes composites et multi-sports |

**Requête SPARQL — sports dans la hiérarchie Fuseki :**
```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT (COUNT(DISTINCT ?s) AS ?cnt) WHERE {
  ?s skos:inScheme <http://ns.inria.fr/iadas/sport-category-vocab/Sport>
}
```

**Requête SPARQL — URI sport distinctes référencées dans les analyses :**
```sparql
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
SELECT (COUNT(DISTINCT ?s) AS ?cnt) WHERE {
  ?a a iadas:Analysis . ?a iadas:hasSport ?s
}
```

### 1.2 Répartition des sports par catégorie

| Catégorie | Sports (Sub class 2+3 uniquement) | Dans Fuseki (SKOS) | Statut |
|---|---|---|---|
| Aesthetic | 46 | 46 | ✅ |
| Technical | 26 | 26 | ✅ |
| Ball game | 25 | 25 | ✅ |
| Endurance | 22 | 22 | ✅ |
| Power | 15 | 15 | ✅ |
| Weight class | 11 | 11 | ✅ |
| Antigravitation | 5 | 5 | ✅ |
| Combined | 1 | 1 | ✅ |
| Gymgoer weights | 0 | 0 | ✅ (catégorie sans sous-sport) |
| **Total** | **151** | **151** | ✅ **Correspondance exacte** |

> **Note :** Les noms de catégories (Aesthetic, Ball game…) sont exclus du comptage — ce sont des catégories, pas des sports individuels. Seules les colonnes `Sub class 2` et `Sub class 3` de `Sport-Hierarchy.csv` sont comptées.

### 1.3 Répartition des analyses par type de pratique sportive

Source : `pipeline-ontologie/data-csv/IA-DAS-Data.csv`, colonne `Type of sport practice`.

| Type de pratique | Nombre d'analyses |
|---|---|
| Mixed sport | 1 572 |
| Individual sport | 900 |
| Team sport | 21 |
| **Total** | **2 373** |

**Requête SPARQL :**
```sparql
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
SELECT ?type (COUNT(DISTINCT ?a) AS ?cnt) WHERE {
  ?a a iadas:Analysis . ?a iadas:sportPracticeType ?type
} GROUP BY ?type ORDER BY DESC(?cnt)
```

### 1.4 Répartition des analyses par sous-catégorie de sport

Source : `pipeline-ontologie/data-csv/IA-DAS-Data.csv`, colonne `Subcategory of sport`.

| Sous-catégorie | Nombre d'analyses |
|---|---|
| Multisport | 1 690 |
| Aesthetic | 446 |
| Endurance | 117 |
| Power | 111 |
| Weight class | 92 |
| Ball game | 20 |
| Technical | 12 |
| Combined | 3 |
| Antigravitation | 2 |

### 1.5 Problèmes identifiés sur les sports

**Problème 1 — 15 URI sport dans les analyses sans équivalent dans la hiérarchie SKOS**  
166 URI distinctes sont utilisées dans les analyses via `iadas:hasSport`, mais la hiérarchie SKOS ne contient que 151 sports. Les 15 URI non appariées incluent des valeurs comme `"Mixed sport"`, `"N.A."`, ou des listes de sports multiples.

**Requête SPARQL pour identifier les URI non appariées :**
```sparql
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?sportURI WHERE {
  ?a a iadas:Analysis . ?a iadas:hasSport ?sportURI .
  FILTER NOT EXISTS { ?sportURI skos:inScheme <http://ns.inria.fr/iadas/sport-category-vocab/Sport> }
}
```

**Problème 2 — Cas "Mixed sport" (traité le 18/06/2026)**  
20 analyses avaient dans `IA-DAS-Data.csv` le nom de sport `"Mixed sport (e.g., soccer, basketball, track and field, softball, swimming, diving, gymnastics)."` — cette forme longue causait un bug de chargement dans Fuseki. Elle a été remplacée par le nom simplifié 'soccer, basketball, track and field, softball, swimming, diving, gymnastics' — 1 seule ligne par analyse, décision validée par Amandine Daubresse et Meggy Hayotte. Total : **2 373 analyses** (inchangé).  
Script utilisé : `pipeline-ontologie/fix_mixed_sport_split.py`

19 analyses supplémentaires ont encore `"Mixed sport"` dans la colonne `Sport_name` — investigation du 24/06 : ces 19 analyses proviennent d'un **unique article** (DOI : `10.1037/male0000168`) qui étudie plusieurs sports sans les nommer individuellement (`Type of sport practice = Mixed sport`, `Subcategory = Multisport`, `Number of sport studied = Multiple`). Ce n'est pas un oubli de saisie mais la nature de l'étude. Aucune action requise.

---

## 2. Analyses des variables

### 2.1 Chiffres globaux

| Dimension | Excel (`Class-Hierarchy-V1.csv`) | Ontologie Fuseki | Statut |
|---|---|---|---|
| Concepts ACAD définis | 622 | 639 (scheme Variable) | ⚠️ 7 nouveaux + 1 orphelin → décision encadrantes |
| Concepts mobilisés comme VI | — | 2 019 (hors N.A.) | ✅ taux 97% |
| Concepts mobilisés comme VD | — | 2 336 (hors N.A.) | ✅ taux 100% |

> **Explication de l'écart (639 − 622 = 17) :** Après intégration du nouveau fichier d'extraction (17/06/2026) et synchronisation depuis l'Excel original, Fuseki contient 639 concepts. Il reste **7 concepts** absents de tout Excel :
> *Coach leadership style negative feedback, Compulsive spending, Negative reaction to imperfection, Physical competence evaluation, Psychotic disorder, Self-regulation of eating attitude, Extrinsic regulation for sport*
>
> **1 concept orphelin** (sans catégorie parente) : *Extrinsic regulation for sport* — déjà dans les 7 ci-dessus → **1 seule décision encadrantes** (intégrer + placer dans hiérarchie).
> Note : *Exercise for social* avait un parent manquant mais est maintenant correctement rattaché à *Controlled forms of motivation* ✅

**Requête SPARQL — concepts ACAD dans Fuseki :**
```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT (COUNT(DISTINCT ?c) AS ?cnt) WHERE {
  ?c skos:inScheme <http://ns.inria.fr/iadas/ACAD-vocab/ACAD-Vocabulary>
}
```

**Requête SPARQL — concepts mobilisés dans les analyses :**
```sparql
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
SELECT (COUNT(DISTINCT ?c) AS ?cnt) WHERE {
  ?v iadas:refersToVariable ?c
}
```

**Requête SPARQL — concepts utilisés comme VI :**
```sparql
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
SELECT (COUNT(DISTINCT ?c) AS ?cnt) WHERE {
  ?v a iadas:VariableIndependante . ?v iadas:refersToVariable ?c
}
```

**Requête SPARQL — concepts utilisés comme VD :**
```sparql
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
SELECT (COUNT(DISTINCT ?c) AS ?cnt) WHERE {
  ?v a iadas:VariableDependante . ?v iadas:refersToVariable ?c
}
```

### 2.2 Problèmes identifiés sur les variables

**Problème 1 — 73 concepts dans l'ontologie absents de l'Excel (analyse 24/06/2026)**

- **71 concepts** ont leur parent (`skos:broader`) déjà dans l'Excel → intégration à `Class-Hierarchy-V1.csv` planifiée sans décision encadrantes. Exemples : *Appearance comparison* (sous *External comments*), *Body checking* (sous *Body checking and avoidance*), *Mental health* (sous *Psychological symptoms*).
- **2 concepts orphelins** (aucun parent défini) : *Exercise for social*, *Extrinsic regulation for sport* → décision encadrantes requise.
- **1 concept** : *Body dysmorphic concerns* → décision encadrantes.

Corrections effectuées dans `skos-acad-enrichment.ttl` (24/06/2026) :
- 4 URIs avec apostrophe manquante corrigées : `Coach's focus on results`, `Coach's negative feedback`, `Coach's pressure in relation to nutrition`, `Perception of one's own body and self`
- 2 typos corrigées : `Supportive friendships` (double s supprimé), `Uniform influences` (double s supprimé)

**Problème 2 — 3 concepts dans l'Excel absents de l'ontologie (corrigé le 24/06/2026)**  
Causés par des caractères parasites dans `Class-Hierarchy-V1.csv` : *Overeating* (espace), *Autocratic* (espace), *Societal pressure from the media to be thin* (tabulation). Corrigé : 72 cellules nettoyées dans `Class-Hierarchy-V1.csv` (espaces de fin, tabulations, retours à la ligne).

---

## 3. Grand tableau récapitulatif

| Dimension | Source Excel | Source Ontologie (Fuseki) | Statut |
|---|---|---|---|
| **Analyses totales** | 2 373 lignes (`IA-DAS-Data.csv`) | 2 373 instances `iadas:Analysis` | ✅ OK |
| **Analyses simples** | — | 1 975 (mediator = N.A. ET moderator = N.A.) | ✅ |
| **Analyses complexes** | — | 398 (avec médiateur ou modérateur) | ✅ |
| **Sports distincts (hiérarchie)** | 151 (`Sport-Hierarchy.csv`) | 151 (SKOS inScheme) | ✅ Identique |
| **Catégories de sport** | 9 | 8 | ✅ Gymgoer weights = catégorie sans sous-sport |
| **Concepts ACAD (variables)** | 622 (`Class-Hierarchy-V1.csv`) | 639 (scheme Variable) | ⚠️ 7 nouveaux + 1 orphelin → décision |
| **Taux catégorisation VI** | — | 97% (2 019/2 073 hors N.A.) | ✅ |
| **Taux catégorisation VD** | — | 100% (2 336/2 336 hors N.A.) | ✅ |
| **Doublons de concepts** | 0 | 0 | ✅ Corrigés le 16/06/2026 |
| **Blank nodes (bug b0)** | — | 0 | ✅ Résolu |
| **effectSize renseigné** | 1 940/1 975 analyses simples | 98% couverture | ✅ OK |
| **Cycles skos:broader** | — | 0 | ✅ Corrigé le 25/06/2026 |

**Légende :** ✅ OK — ⚠️ Écart noté / décision attendue

---

## 3b. EffectSize par catégorie de VI — résultats (25/06/2026)

Demande des encadrantes (réunion 08/06/2026). Mis à jour avec le nouveau fichier d'extraction (17/06/2026). Script : `stats_bdd.py`.

### Par catégorie principale (1 975 analyses simples)

| Catégorie VI | Strong | Moderate | Weak | Negligible | **Total** |
|---|---|---|---|---|---|
| Intrapersonal factor related to DEAB | 161 | 287 | 425 | 154 | **1 027** |
| Interpersonal factor related to DEAB | 29 | 106 | 136 | 57 | **328** |
| DEAB | 89 | 44 | 45 | 17 | **195** |
| Other behaviors | 3 | 19 | 58 | 19 | **99** |
| Sociocultural factor related to DEAB | 6 | 16 | 25 | 3 | **50** |

### Par sous-classe niveau 2 — Intrapersonal (1 027 analyses)

| Sous-classe | Strong | Moderate | Weak | Negligible | Total |
|---|---|---|---|---|---|
| Body image and self-esteem | 107 | 136 | 155 | 55 | **453** |
| Personality | 24 | 51 | 100 | 53 | **228** |
| Emotions | 15 | 67 | 105 | 21 | **208** |
| Psychopathological symptoms | 10 | 23 | 35 | 4 | **72** |
| Perception of health and well-being | 0 | 4 | 10 | 10 | **24** |
| Motivation | 5 | 3 | 8 | 5 | **21** |
| *(autres sous-classes)* | — | — | — | — | **21** |

### Observations clés (nouveau fichier 17/06/2026)
- **"Weak" domine globalement** (40%) — effets forts rares
- **VD : 100% DEAB** — 1 975/1 975 analyses simples ont un DEAB comme variable dépendante
- **Intrapersonal = 52%** des analyses simples — Body image and self-esteem, Personality, Emotions = 3 sous-classes principales
- **Sociocultural** très réduit (131 → 50) : les coquilles corrigées ont reclassifié certaines VI

> **Note :** le détail par sous-classe niveau 2 est disponible pour les 5 catégories. Voir résultats complets via `python stats_bdd.py`.

---

## 4. Points en attente de décision des encadrantes

### Tâches techniques effectuées ✅

- **CSV resynchronisé** depuis l'Excel original (`Class_Hierarchy_VF_09avr26xlsx.xlsx`) — 25/06/2026
- **Nouveau fichier d'extraction** intégré (`Supplementary 4_Data Extraction_17.06.2026.xlsx`) — 25/06/2026
- **Cycles SKOS corrigés** (Self-efficacy, Global self-worth) — 25/06/2026
- **Labels apostrophe** résolus — 25/06/2026

### Décisions requises (1 point)

| # | Problème | Décision à prendre |
|---|---|---|
| 1 | **7 concepts** présents dans la base mais absents de tout Excel : *Coach leadership style negative feedback*, *Compulsive spending*, *Extrinsic regulation for sport*, *Negative reaction to imperfection*, *Physical competence evaluation*, *Psychotic disorder*, *Self-regulation of eating attitude*. Parmi eux, *Extrinsic regulation for sport* est aussi **orphelin** (sans catégorie parente). | Ces 7 concepts doivent-ils être intégrés à votre Excel ? Et sous quelle catégorie placer *Extrinsic regulation for sport* ? |

> Note : *Body dysmorphic concerns* est présent dans l'Excel original des encadrantes — pas une décision requise.

### Points résolus ou sans action requise

| # | Point | Statut |
|---|---|---|
| A | Écart sports CSV/Fuseki (151 vs 151) | ✅ Expliqué : 151 sports — correspondance exacte |
| B | 19 analyses `Mixed sport` sans détail | ✅ Expliqué : 1 seul article (DOI 10.1037/male0000168), nature multisport de l'étude |
| C | 3 concepts Excel absents de Fuseki | ✅ Fix CSV du 24/06 — résolu à la prochaine régénération |
| D | Labels avec apostrophes (`Inadequate parents' relationships`, `Perception of one's own body`) | 🔧 Bug technique — session dédiée planifiée |

---

## 5. État de préparation pour la mise à jour de l'ontologie

Question posée par les encadrantes : *"Sommes-nous proches de pouvoir faire une mise à jour de l'ontologie ?"*

### Ce qui est déjà opérationnel ✅

| Composant | État |
|---|---|
| Pipeline complet (CSV → TTL → Fuseki) | ✅ Fonctionnel — testé le 24/06/2026 |
| Bouton "Reconstruire l'ontologie" dans l'application | ✅ Upload CSV + régénération automatique |
| Qualité des données (doublons, cycles, blank nodes) | ✅ 0 problème détecté |
| Statistiques consultables en temps réel | ✅ Page intégrée dans l'application |
| Versioning complet | ✅ GitHub — `github.com/Wimmics/IADAS` |

### Ce qu'il reste à finaliser ⚠️

| Point | Bloquant ? | Délai estimé |
|---|---|---|
| Intégrer 71 concepts dans l'Excel (décision §4.1) | Oui — cohérence vocabulaire | 1–2 jours après validation |
| Placer 3 concepts orphelins (décision §4.2) | Oui — hiérarchie incomplète | 1 jour après réponse |
| Corriger 2 labels apostrophe (bug technique) | Non — impact limité (2 labels) | Session dédiée ~2h |
| Analyses complexes (médiateurs/modérateurs) | Non — fonctionnalité future | En cours |

### Conclusion

> **L'infrastructure de mise à jour est fonctionnelle dès aujourd'hui.** Une fois les décisions §4.1 et §4.2 reçues, la finalisation de la cohérence du vocabulaire prend environ 1 semaine. La mise à jour de l'ontologie avec de nouvelles données sera alors pleinement opérationnelle.
