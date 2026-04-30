# IA-DAS - Guide utilisateur

**Auteur :** Sara  
**Public :** Toutes personnes souhaitant utiliser l'interface du projet IA-DAS  

## 🚀 Installation et déploiement

### Version hébergée (Recommandée)
Une version hébergée en AWS est présente via le lien suivant : [URL à compléter]

### Version locale avec Docker

**Prérequis :**
- Docker et Docker Compose installés ([Guide d'installation Docker](https://docs.docker.com/get-docker/))
- Ports 8000, 8002, 8003, 3030 disponibles

> 💡 **Pas Docker ?** Si vous n'avez pas Docker installé, consultez la section "Installation alternative" plus bas.

**Étapes d'installation :**

### Option 1 : Avec Git (recommandée)
1. Cloner le projet :
   ```bash
   git clone [URL_DU_DEPOT]
   cd IA-DAS
   ```

2. Lancer l'application :
   ```bash
   docker-compose up -d
   ```

### Option 2 : Sans Git (téléchargement direct)
1. **Télécharger le projet :**
   - Aller sur la page GitHub du projet : [URL_DU_DEPOT]
   - Cliquer sur le bouton vert **"Code"** 
   - Sélectionner **"Download ZIP"**
   - Extraire le fichier ZIP dans le dossier de votre choix

2. **Lancer l'application :**
   ```bash
   # Naviguer dans le dossier extrait
   cd IA-DAS-main  # (ou nom du dossier extrait)
   
   # Lancer les services
   docker-compose up -d
   ```

3. Accéder à l'interface :
   - Application principale : http://localhost:8000
   - Base de données Fuseki : http://localhost:3030

**Services déployés :**
- Frontend : Interface utilisateur (port 8002)
- Gateway : Serveur proxy et authentification (port 8000)  
- SPARQL Generator : Génération de requêtes (port 8003)
- Fuseki : Base de données RDF (port 3030)

### Installation alternative (sans Docker)

> ⚠️ **Plus complexe** - Cette méthode nécessite des connaissances techniques

**Prérequis :**
- Node.js (version 16 ou supérieure)
- Java 11 ou supérieure (pour Fuseki)

**Étapes :**
1. **Télécharger le projet** (même méthode que l'Option 2 ci-dessus)

2. **Installer Apache Jena Fuseki** :
   - Télécharger depuis : https://jena.apache.org/download/
   - Extraire et configurer avec les fichiers du dossier `fuseki/`

3. **Installer les dépendances pour chaque service** :
   ```bash
   # Service frontend
   cd services/files
   npm install
   node index.js
   
   # Service gateway (nouveau terminal)
   cd services/gateway  
   npm install
   node index.js
   
   # Service SPARQL Generator (nouveau terminal)
   cd services/SPARQL-Generator
   npm install
   node index.js
   ```

4. **Démarrer Fuseki** avec la configuration du projet

> 📝 **Recommandation** : L'installation Docker est plus simple et évite les problèmes de dépendances.  

## 🎯 Scénarios d'utilisation

Après avoir lu ce document, je vous invite à suivre les 3 scénarios ci-dessous :

## 📋 Navigation simple et présentation globale du site

En arrivant sur la page d'accueil, vous avez 5 boutons à disposition :  

### 1. 🎨 **Interaction personnalisée**
Vous permet de naviguer vers la page où vous pouvez composer vos propres requêtes SPARQL selon :
- Les variables indépendantes (VI) / variables dépendantes (VD)
- Le résultat de relation
- L'âge, le sexe
- Et autres critères personnalisés

### 2. 📋 **Interaction prédéfinie** 
Vous permet de naviguer vers la page avec des requêtes SPARQL déjà prêtes pour répondre aux questions de compétences.

**Exemple de question :**
"Quels sont les ACADS dont le résultat de relation est ambigu ?"

### 3. 🔧 **Modifier l'ontologie**
Destiné à l'équipe de recherche et permet de modifier/ajouter/supprimer des analyses de l'ontologie. Un mot de passe est néanmoins requis. Si vous ne faites pas partie de l'équipe, vous pouvez trouver le contact dans la page contact.

### 4. 📞 **Contact**
Permet d'accéder aux informations de contact de l'équipe de recherche.

### 5. 📚 **En savoir plus**
Contient les nouveautés et des informations complémentaires à savoir du projet IA-DAS. 
 
 
 
---

## 🔍 Page d'interaction personnalisée

Sur cette page, vous avez deux sections principales :
- **Le desk (encadré en vert)** : Zone de paramètres et filtres
- **Le résultat (encadré en rouge)** : Zone d'affichage des résultats

### Interface de paramétrage
Le desk contient les inputs qui vous permettent de concevoir vos requêtes SPARQL :

- **Section Variables Indépendantes (VI)** : Permet de sélectionner les causes/facteurs d'entrée
- **Section Variables Dépendantes (VD)** : Permet de sélectionner les effets/résultats
- **Section Critères démographiques** : Filtres par âge, sexe, population
- **Section Résultats de relation** : Type de corrélation (positive, négative, ambiguë, etc.)

**Exemple d'utilisation :**
Si vous sélectionnez "Femme" + "Dépression", la requête retournera toutes les analyses concernant la dépression chez les femmes.  
 
### 📊 Modes de visualisation des résultats

Pour les résultats, vous avez 3 boutons de visualisation :

#### 1. 📋 **En tableau**
- Affichage structuré sous forme de tableau
- En cliquant sur le lien d'ID analyse, un panneau s'ouvre avec l'analyse en question
- Il vous suffit de cliquer dessus pour avoir toutes les informations de cette analyse

#### 2. 🔗 **En graphe**
- **Double-clic sur un nœud** : Permet d'ouvrir un panneau avec toutes les analyses liées à ce nœud
- Les analyses récupérées peuvent être exportées en PDF avec leurs références APA  
- Si vous cliquez sur une analyse, vous avez toutes les informations de cette analyse qui s'affichent
- **Clic droit prolongé sur un nœud** : Permet d'afficher la hiérarchie de la variable sélectionnée

#### 3. 💾 **En SPARQL**
- Permet de voir la requête générée que vous pouvez utiliser dans un autre serveur
- Compatible avec GraphDB, Protégé et autres outils SPARQL  
 
### 📤 Options d'export supplémentaires

Vous avez 3 autres boutons d'export :

| 📁 Format | 📝 Description |
|-----------|----------------|
| **Export PNG** | Récupère une photo/capture du résultat visuel |
| **Export Excel** | Exporte le résultat dans un fichier Excel pour analyse |
| **Export Turtle** | Récupère la partie de l'ontologie utilisable dans un autre outil |  

---

## 🎓 Page de compétences (Interaction prédéfinie)

### Interface accordéon
En arrivant, vous avez un desk accordéon qui vous permet de :
- Composer la question que vous souhaitez
- Sélectionner le début et la suite de la question via des menus déroulants
- Construire des requêtes guidées sans connaître SPARQL

### Résultats
Le résultat est identique à celui de la page personnalisée :
- Même options de visualisation (tableau, graphe, SPARQL)
- Mêmes fonctionnalités d'export (PNG, Excel, Turtle)
- Même interactivité sur les graphiques  
 

---

## 🔧 Page de modification (Administration)

> ⚠️ **Accès restreint** - Cette page nécessite un mot de passe administrateur

### Fonctionnalités disponibles

#### 🖊️ **Bouton Modifier**
- Permet d'éditer les analyses existantes dans l'ontologie
- Modification des métadonnées, relations, et propriétés
- Sauvegarde automatique dans la base de données Fuseki

#### ➕ **Bouton Ajouter/Supprimer**
- **Ajouter** : Intégration de nouvelles analyses à l'ontologie
- **Supprimer** : Retrait d'analyses obsolètes ou erronées
- Gestion des références bibliographiques et métadonnées

### Sécurité
- Authentification obligatoire pour accéder aux fonctions d'administration
- Historique des modifications conservé
- Sauvegarde automatique des données

---

## 📞 Support et assistance

- **Contact équipe** : Utilisez le bouton "Contact" de l'application
- **Documentation** : Consultez "En savoir plus" pour les détails techniques
- **Problèmes techniques** : L'équipe de recherche fournit le support

---

*Guide utilisateur IA-DAS - Version mise à jour*
 

 

 

 

 

 