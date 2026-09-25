# Déploiement d'IADAS en production

## Contenu de ce dossier

- `docker-compose.yml` : configuration utilisée sur le serveur de production (zoomathia, i3S). Elle télécharge les images publiées et ne construit rien.
- `apache/virtuoso-iadas.conf` : copie de la configuration Apache du serveur pour IADAS.

Le `docker-compose.yml` à la racine du dépôt sert au **développement** : il construit les images à partir du code. Les deux fichiers sont différents, c'est normal.

**Important :** ces fichiers sont des copies. Toute modification faite sur le serveur doit être reportée ici, et inversement.

## Architecture en production

Adresse publique : http://iadas.i3s.unice.fr/iadas/index.html

| Service          | Port | Rôle                                                     |
|------------------|------|----------------------------------------------------------|
| gateway          | 8000 | Passerelle : pages, /stats, /api/auth, /rebuild-ontology |
| frontend         | 8002 | Fichiers de l'interface web                              |
| sparql-generator | 8003 | Requêtes SPARQL (reçoit tout /api/)                      |
| database-service | 8005 | Reconstruction de l'ontologie et statistiques            |
| fuseki           | 3030 | Base de données RDF                                      |
| fuseki-init      |  –   | Charge les données au démarrage puis s'arrête (normal)   |

Apache sert l'application sous le préfixe `/iadas/` et redirige :

- `/iadas` → gateway (8000)
- `/api/` → sparql-generator (8003)
- `/api/auth` et `/stats` → gateway (8000) — **règles provisoires**, ajoutées car le frontend appelle ces routes depuis la racine du site. La règle `/api/auth` doit rester placée avant la règle `/api/`.

## Mettre à jour l'application

Sur le serveur, depuis le dossier qui contient le docker-compose de production (actuellement le dossier personnel de l'administrateur, `~`) :

```bash
cd ~
sudo docker compose down
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

Les commandes `docker compose` doivent toujours être lancées depuis ce dossier : depuis un autre dossier, Docker ne retrouve pas les conteneurs en cours d'exécution.

## Vérifier après une mise à jour

- Ouvrir la page d'accueil et la page statistiques, cliquer sur « Calculer les statistiques ».
- Tester la connexion admin (« Mise à jour de l'ontologie »).
- Script de test automatique : à venir (`test-deploiement.sh`).

## Revenir en arrière

- **Apache** : des sauvegardes de la configuration sont conservées dans le dossier personnel de l'administrateur sur le serveur (`virtuoso-iadas.conf.bak-*`). Pour restaurer :

```bash
  sudo cp ~/<sauvegarde> /etc/apache2/sites-enabled/virtuoso-iadas.conf
  sudo apachectl configtest
  sudo systemctl reload apache2
```

- **Application** : à compléter quand les images seront versionnées (aujourd'hui, seul le tag `latest` existe).

## Secrets

Le mot de passe admin (`ADMIN_PASSWORD_HASH`, hash SHA-256) et la clé `JWT_SECRET` doivent être définis dans un fichier `.env` sur le serveur, à côté du docker-compose de production. Ce fichier n'est **jamais** mis dans Git.

## Problèmes connus

- Le frontend appelle certaines routes depuis la racine du site (`/stats`, `/api/auth`) au lieu de `/iadas/`. Chaque nouvelle route de ce type nécessite une règle Apache, tant que le frontend n'utilise pas de chemins relatifs.
- `/api/ontology/last-update` n'existe dans aucun service (erreur 405 sur la page d'accueil).
- `/rebuild-ontology` n'a pas de règle Apache et risque une erreur 404.
- Les images sont publiées sur un compte Docker Hub personnel (`imanemed`) : à migrer vers un compte de l'équipe.