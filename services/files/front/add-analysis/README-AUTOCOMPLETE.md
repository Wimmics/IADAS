# Système d'Autocomplétion pour le Formulaire d'Ajout d'Analyses

## Vue d'ensemble

Le système d'autocomplétion intelligent permet aux utilisateurs de :
- ✨ **Saisir librement** ou **choisir parmi les suggestions** existantes
- 🔍 **Rechercher** dans l'ontologie en temps réel
- 📋 **Éviter les doublons** en réutilisant les données existantes
- 🚀 **Accélérer la saisie** grâce aux suggestions intelligentes

## Champs avec Autocomplétion

### 📄 Section Article
- `journal` - Journaux scientifiques existants
- `country` - Pays des études
- `studyType` - Types d'études (longitudinal, transversal, etc.)

### 🔬 Section Analyse  
- `typeOfAnalysis` - Types d'analyses statistiques
- `acads` - Concepts ACADS existants

### 👥 Section Population
- `gender` - Genres (Homme, Femme, Mixte, etc.)
- `sportingPopulation` - Types de populations sportives

### 🏃‍♂️ Section Sport
- `sportName` - Noms des sports (Football, Basketball, etc.)
- `sportLevel` - Niveaux de pratique (Amateur, Elite, etc.)
- `sportPracticeType` - Types de pratique (Individual, Team, etc.)
- `sportSubcategory` - Sous-catégories de sports

### 📊 Section Variables
- `vdName` / `viName` - Noms des variables dépendantes/indépendantes
- `vdCategory` / `viCategory` - Catégories des variables
- `vdMeasure` / `viMeasure` - Méthodes de mesure

### 🔗 Section Relations
- `resultatRelation` - Résultats de relation (Positive, Negative, etc.)
- `mediator` / `moderator` - Médiateurs et modérateurs
- `mediatorMeasure` / `moderatorMeasure` - Mesures des médiateurs/modérateurs

## Comment ça marche

### 🎯 Utilisation
1. **Cliquez** dans un champ de texte
2. **Tapez** quelques lettres pour filtrer les suggestions
3. **Sélectionnez** une suggestion ou **continuez la saisie libre**
4. **Naviguez** avec ↑/↓ et validez avec Entrée

### 🔧 Fonctionnalités
- **Recherche en temps réel** (300ms de délai)
- **Cache intelligent** (10 min de rétention)
- **Navigation clavier** (↑↓ Entrée Échap)
- **Saisie libre** toujours possible
- **Indicateurs visuels** (🔍 icône, chargement)

## Tests et Debug

### 🧪 Console de développement
```javascript
// Voir les stats globales
debugAutocompleteForm()

// Tester un champ spécifique
testFieldAutocomplete('sportName', 'foot')

// Voir les suggestions d'un champ
debugAutocomplete('journal', 'nature')

// Stats du cache
window.ontologyAutocomplete.getCacheStats()
```

### 📋 Vérifications
- [ ] Les suggestions apparaissent au focus/saisie
- [ ] La navigation clavier fonctionne
- [ ] Les données sont bien récupérées de l'ontologie
- [ ] Le cache fonctionne (pas de requête répétitive)
- [ ] La saisie libre reste possible

## Architecture Technique

### 📁 Fichiers
```
add-analysis/
├── autocomplete-component.js      # Composant d'autocomplétion
├── autocomplete-styles.css        # Styles CSS
└── README-AUTOCOMPLETE.md         # Cette documentation

js/
└── ontology-autocomplete.js       # Service de données

add-analysis.html                   # Intégration dans le formulaire
add-analysis.js                     # Initialisation
```

### 🏗️ Classes principales
- `OntologyAutocompleteService` - Récupération des données
- `AutocompleteComponent` - Interface utilisateur
- `AutocompleteManager` - Gestion globale

### 🔌 Intégration
```html
<!-- CSS -->
<link rel="stylesheet" href="./add-analysis/autocomplete-styles.css">

<!-- JavaScript -->
<script src="./js/ontology-autocomplete.js"></script>
<script src="./add-analysis/autocomplete-component.js"></script>
```

### 🚀 Initialisation
```javascript
// Auto-initialisation au chargement
setTimeout(async () => {
    await window.autocompleteManager.init();
    window.enableFormAutocomplete('#addAnalysisForm');
}, 1000);
```

## Personnalisation

### ⚙️ Options par champ
```javascript
window.autocompleteManager.enableAutocomplete(inputElement, fieldName, {
    minChars: 2,           // Caractères min pour déclencher
    maxSuggestions: 15,    // Nombre max de suggestions
    delay: 500,            // Délai en ms
    allowFreeInput: true   // Autoriser saisie libre
});
```

### 🎨 Styles CSS personnalisés
```css
.autocomplete-dropdown {
    max-height: 250px;     /* Hauteur max du dropdown */
    font-size: 15px;       /* Taille de police */
}

.autocomplete-suggestion.selected {
    background-color: #your-color;  /* Couleur sélection */
}
```

## Performances

### 📊 Optimisations
- **Cache** : 10 minutes de rétention des données
- **Debounce** : 300ms de délai pour éviter les requêtes excessives
- **Limitation** : Maximum 20 suggestions affichées
- **Préchargement** : Données récupérées au démarrage

### 🔧 Monitoring
```javascript
// Vider le cache si nécessaire
window.ontologyAutocomplete.clearCache()

// Stats détaillées
window.ontologyAutocomplete.getCacheStats()
```

## Dépannage

### ❌ Problèmes courants

**Aucune suggestion ne s'affiche :**
- Vérifier que le serveur Fuseki est démarré
- Vérifier la console pour les erreurs réseau
- Tester avec `testFieldAutocomplete('fieldName')`

**Suggestions incorrectes :**
- Vérifier les requêtes SPARQL dans `ontology-autocomplete.js`
- Contrôler les données dans Fuseki
- Vider le cache avec `clearCache()`

**Performance lente :**
- Réduire `maxSuggestions`
- Augmenter `delay` et `minChars`
- Vérifier les performances du serveur Fuseki

### 🔍 Debug étapes
1. Console → `debugAutocompleteForm()`
2. Réseau → Vérifier les requêtes SPARQL
3. Fuseki → Tester les requêtes manuellement
4. Cache → `getCacheStats()` pour voir les données

## Migration et Maintenance

### 🔄 Ajout d'un nouveau champ
1. Ajouter la configuration dans `fieldConfigs` de `ontology-autocomplete.js`
2. Vérifier que le champ est détecté par `getSupportedFields()`
3. Tester avec `testFieldAutocomplete('nouveauChamp')`

### 🛠️ Modification des requêtes SPARQL
1. Éditer les requêtes dans `fieldConfigs`
2. Vider le cache : `clearCache()`
3. Tester les nouvelles données

### 📱 Responsive/Mobile
Les styles CSS incluent des adaptations mobiles automatiques pour une expérience optimale sur tous les écrans.