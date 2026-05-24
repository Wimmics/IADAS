# Comparaison mapping RML — version 2025 (Sara) vs version 2026 (Molka)

Branche : `feat/molka-2026-mapping`  
Date : 24 mai 2026  
Données : Supplementary 4_Data Extraction.xlsx — 2 373 lignes, 63 colonnes

---

## 1. Nouvelles propriétés ajoutées

| Propriété | Classe | Colonne source |
|---|---|---|
| `iadas:continent` | `SportPsychologyArticle` | `Continent` |
| `iadas:numberOfSportStudied` | `Analysis` | `Number of sport studied` |
| `iadas:complexityOfAnalysis` | `Analysis` | `Complexity of Analysis` |
| `iadas:groupStatisticalAnalysis` | `Analysis` | `Group of statistical analysis` |
| `iadas:relationDirection` | `Analysis` | `Direction of the relationship` |
| `iadas:variableName` | `VariableDependante` | `VD` |

---

## 2. Propriété supprimée

| Propriété | Raison |
|---|---|
| `iadas:analysisMultiplicity` | Colonne absente du fichier de données 2026 |

---

## 3. Renommage de colonnes (FR/underscores → EN/espaces)

| Propriété RDF | Ancienne colonne | Nouvelle colonne |
|---|---|---|
| `dcterms:title` | `Référence` | `Title` |
| `iadas:relationDegree` | `Degre_de_relation` | `Degree of relationship` |
| `iadas:typeOfAnalysis` | `Type_of_analysis` | `Type of analysis` |
| `iadas:authorConclusion` | `Authors_conclusions` | `Authors' conclusions` |
| `iadas:limites` | `Limites` | `Limits` |
| `iadas:moderatorMeasure` | `Measure_Moderator` | `Measure Moderator` |
| `iadas:mediatorMeasure` | `Measure_Mediator` | `Measure Mediator` |
| `iadas:sportPracticeType` | `Type_of_sport_practice` | `Type of sport practice` |
| `iadas:sampleSizeMobilized` | `N_mobilise_dans_les analyse` | `N mobilized in analyses` |
| `iadas:refersToVariable` (VD) | `sub-class_Final_VD` | `VD_final_sub-class` |

---

## 4. Simplification des statistiques

Les 4 blocs de statistiques (Age, BMI, Fréquence d'exercice, Années d'expérience) ont été simplifiés :

| | Ancien mapping (2025) | Nouveau mapping (2026) |
|---|---|---|
| Propriétés | `hasMeanValue` + `hasSdValue` + `hasMinValue` + `hasMaxValue` + `hasStatUnit` + `hasStatBase` | `hasMeanValue` + `hasRange` |
| Format | 6 valeurs séparées | 2 valeurs agrégées (ex : `"M=28.33, SD=8.38"` et `"[18-62]"`) |

Propriétés **disparues** des données 2026 : `hasSdValue`, `hasMinValue`, `hasMaxValue`, `hasStatUnit`, `hasStatBase`.

---

## 5. Impact sur les requêtes SPARQL

### Requêtes non affectées (toujours fonctionnelles)

Toutes les 8 questions de compétence testées après rechargement Fuseki :

| Question | Résultats |
|---|---|
| Q1 — Tous les articles ACAD | 2 373 |
| Q2 — Facteurs protecteur/risque/ambigu | 200 (paginé) |
| Q3 — VI intrapersonnels | 300 |
| Q3 — VI interpersonnels | 300 |
| Q4 — Population masculine | 448 |
| Q5 — Sport individuel | 900 |
| Q7 — Volleyball hommes | 200 |

### Requêtes à adapter si on veut exploiter les nouvelles données

| Cas d'usage | Propriété à utiliser |
|---|---|
| Filtrer par continent | `iadas:continent` (nouveau) |
| Filtrer par complexité d'analyse | `iadas:complexityOfAnalysis` (nouveau) |
| Filtrer par groupe d'analyse statistique | `iadas:groupStatisticalAnalysis` (nouveau) |
| Filtrer par nom de VD textuel | `iadas:variableName` (nouveau) |
| Statistiques d'âge min/max/sd | Extraire depuis `iadas:hasRange` et `iadas:hasMeanValue` via REGEX |

---

## 6. État Fuseki après rechargement

- Triples totaux : **167 911**
- `SportPsychologyArticle` : **2 373**
- `Analysis` : **2 373**
- `iadas:continent` peuplé : **2 373 valeurs**
