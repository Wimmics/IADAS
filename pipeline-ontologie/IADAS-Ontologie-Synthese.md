# Synthèse de l'enrichissement de l'ontologie IA-DAS
**Auteure :** Imane Amraoui — Stage IA-DAS, LAMHESS / Wimmics, Inria
**Date :** Mai 2026
**Méthode de référence :** Wright et al. (2020) — *SELAR3: A 7-step method for ontology development*
DOI : 10.12688/wellcomeopenres.15908.3

---

## Introduction

L'ontologie IA-DAS modélise les connaissances issues de la littérature scientifique en psychologie du sport, centrée sur les comportements alimentaires dysfonctionnels (ACAD) chez les athlètes. L'enrichissement décrit ici suit la méthode SELAR3 en 7 étapes (Scope, Entities, Literature Annotation, Review, Reliability, Relationships, Dissemination).

---

## Étape 1 — Scope (Portée)

**Domaine couvert :** Relations statistiques entre des facteurs psychologiques (variables indépendantes, VI) et des comportements alimentaires dysfonctionnels (variables dépendantes, VD) chez des populations sportives.

**Sources de référence :**
- Vocabulaire ACAD (Athletes and Coaches with Dysfunctional eating behaviors) — taxonomie SKOS hiérarchique à 3 niveaux
- Données : 2373 articles de psychologie du sport (fichier `Supplementary 4_Data Extraction.xlsx`, 63 colonnes)

**Ce que l'ontologie NE couvre PAS :**
- Les interventions thérapeutiques
- Les études non empiriques
- Les populations non sportives

---

## Étape 2 — Entities (Entités)

### Classes principales identifiées

| Classe OWL | Description |
|---|---|
| `iadas:SportPsychologyArticle` | Article académique source |
| `iadas:Analysis` | Analyse statistique reliant une VI à une VD |
| `iadas:Relations` | Relation statistique (direction, coefficients) |
| `iadas:VariableIndependante` | Facteur psychologique étudié (sous-classe de Variable) |
| `iadas:VariableDependante` | Comportement alimentaire mesuré (sous-classe de Variable) |
| `iadas:Population` | Groupe de participants (genre, taille, âge) |
| `iadas:Sport` | Sport ou activité physique pratiqué |
| `iadas:AgeStatistics` | Statistiques descriptives d'âge |
| `iadas:BMIStatistics` | Statistiques d'IMC |

### Vocabulaires réutilisés

| Vocabulaire | Usage |
|---|---|
| SKOS (W3C) | Taxonomie ACAD-vocab (hiérarchie VI et VD) |
| BIBO | `bibo:doi`, `bibo:journal` (métadonnées article) |
| Dublin Core | `dcterms:title`, `dcterms:date`, `dcterms:creator` |
| OWL 2 | Modélisation des classes et propriétés |

---

## Étape 3 — Literature Annotation (Annotation de la littérature)

### Exemple d'annotation — Article 1 du dataset

**Référence :**
*Exercise addiction and disordered eating in young Lebanese regular sport practitioners: the indirect role of body appreciation and body dysmorphic concerns*
DOI : 10.1186/s40337-025-01269-z — Année : 2025 — Pays : Liban

**Représentation RDF avec l'ontologie IA-DAS :**

```turtle
# Article
<data:Article_1> a iadas:SportPsychologyArticle ;
    bibo:doi "10.1186/s40337-025-01269-z" ;
    dcterms:date "2025" ;
    iadas:country "Lebanon" ;
    iadas:hasAnalysis <data:Analysis_1> .

# Analyse
<data:Analysis_1> a iadas:Analysis ;
    iadas:relationDirection "-" ;
    iadas:typeOfAnalysis "Pearson correlation" ;
    iadas:hasPopulation <data:Population_1> ;
    iadas:hasRelation <data:Relations_1> ;
    iadas:hasSport <sport-vocab:Range_of_sports> ;
    iadas:authorConclusion "This study highlights a positive association between
        exercise addiction and disordered eating, with body dysmorphic concerns
        and body appreciation acting as key mediating factors." .

# Population
<data:Population_1> a iadas:Population ;
    iadas:gender "Mixed" ;
    iadas:sampleSize 321 ;
    iadas:hasStatistics <data:AgeStats_1> .

# Relation statistique
<data:Relations_1> a iadas:Relations ;
    iadas:hasIndependentVariable <data:Variable_VI_1> ;
    iadas:hasDependentVariable <data:Variable_VD_1> .

# Variable indépendante
<data:Variable_VI_1> a iadas:VariableIndependante ;
    iadas:variableName "Body appreciation" ;
    iadas:refersToVariable <ACAD-vocab/Body_appreciation> .

# Variable dépendante
<data:Variable_VD_1> a iadas:VariableDependante ;
    iadas:variableName "Disordered eating" ;
    iadas:refersToVariable <ACAD-vocab/Disordered_eating> .
```

### Observations issues de l'annotation

L'annotation de cet article a mis en évidence deux lacunes dans l'ontologie :

1. **Médiateurs** : la propriété `iadas:hasMediator` existe mais son type reste `xsd:string`. Pour une modélisation plus riche, une classe `iadas:MediatingVariable` serait nécessaire.
2. **Force du lien** : la direction (+/-/NS) est capturée, mais la magnitude (faible, modéré, fort) ne l'était pas → ajout de `iadas:effectSize` (conventions Cohen).

---

## Étape 4 — Expert Stakeholder Review (Validation par les experts)

**Experts consultés :**
- Dr. Molka Modhouib (encadrante principale, LAMHESS) — review via Pull Request GitHub #1
- Dr. Stéphanie Mader (encadrante Inria/Wimmics) — guidance méthodologique (méthode SELAR3)

**Points de validation en cours :**
- Pertinence des nouvelles propriétés ajoutées
- Cohérence du namespace (`http://ns.inria.fr/iadas/ontology/`)
- Adéquation entre le modèle OWL et le mapping RML

---

## Étape 5 — Reliability (Fiabilité)

**Ce qui a été fait :**
- Validation via les shapes SHACL (`pipeline-ontologie/mapping/shacl-iadas.ttl`) — 8 shapes couvrant toutes les classes principales
- Tests automatisés de toutes les requêtes SPARQL de l'interface (16/16 questions fonctionnelles)

**À faire :**
- Test inter-annotateur : deux personnes annotent le même article indépendamment et comparent les résultats

---

## Étape 6 — Relationships (Relations sémantiques)

### Propriétés OWL ajoutées lors de l'enrichissement

**Nouvelles classes (hiérarchies `rdfs:subClassOf`) :**

| Classe | Superclasse | Justification |
|---|---|---|
| `VariableIndependante` | `Variable` | Distinction sémantique VI/VD nécessaire pour le raisonnement |
| `VariableDependante` | `Variable` | Ciblée sur les comportements DEAB |

**Nouvelles ObjectProperties :**

| Propriété | Domaine → Range | Description |
|---|---|---|
| `isAnalysisOf` | Analysis → Article | Inverse de `hasAnalysis` |
| `isPopulationOf` | Population → Analysis | Inverse de `hasPopulation` |
| `refersToVariable` | Variable → skos:Concept | Lien vers la taxonomie ACAD-vocab |
| `hasStatistics` | Population → AgeStatistics | Généralisation de ageStats/bmiStats |

**Nouvelles DatatypeProperties :**

| Propriété | Domaine | Description |
|---|---|---|
| `effectSize` | Relations | Force du lien : small / medium / large (Cohen) |
| `continent` | SportPsychologyArticle | Continent de l'étude (données 2026) |
| `numberOfSportStudied` | Analysis | Nombre de sports étudiés (données 2026) |
| `complexityOfAnalysis` | Analysis | Complexité de l'analyse (données 2026) |
| `groupStatisticalAnalysis` | Analysis | Groupe de la méthode statistique (données 2026) |

---

## Étape 7 — Dissemination (Diffusion)

| Élément | Statut |
|---|---|
| Repo GitHub public | `https://github.com/Wimmics/IADAS` |
| Versionnement | Git — branche `fix/sparql-skos-enrichment-imane` |
| Pull Request | #1 — en attente de review |
| Format OWL | `IADAS-Model.ttl` (Turtle) |
| Validation SHACL | `pipeline-ontologie/mapping/shacl-iadas.ttl` |
| Triplestore | Apache Jena Fuseki (TDB2) — 167 911 triples |

---

## Résumé des enrichissements

| Type | Avant | Après |
|---|---|---|
| Classes OWL | 10 | 12 (+VariableIndependante, +VariableDependante) |
| ObjectProperties | 11 | 15 (+isAnalysisOf, +isPopulationOf, +refersToVariable, +hasStatistics) |
| DatatypeProperties | ~40 | ~45 (+effectSize, +continent, +numberOfSportStudied, +complexityOfAnalysis, +groupStatisticalAnalysis) |
| Concepts SKOS (VI) | ~baseline | +145 concepts |
| Concepts SKOS (VD) | ~baseline | +17 concepts (couverture 100%) |
| Questions interface | 0/16 fonctionnelles | 16/16 fonctionnelles |
