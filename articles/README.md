# articles/

Corpus de PDF d'articles scientifiques — **non versionné** (droits éditeurs, cf.
`.gitignore`).

## Ce qu'il faut mettre ici

Un PDF par article, nommé `<Stem>.pdf` où `<Stem>` est l'identifiant court de
l'article (premier auteur + année, sans espace), par exemple :

```
articles/Abras.2022.pdf
articles/Ferrand.2004.pdf
articles/DeSousaFortes.2020a.pdf
```

Les stems attendus sont exactement ceux du corpus annoté de référence : voir les
noms de fichiers dans `ground_truth/train/` et `ground_truth/test/` (216 au total,
18 + 198).

## Découpage IMRaD

`articles_sections/` (également non versionné) contient le découpage par section
de chaque PDF, régénéré à partir des signets + police + regex par :

```bash
iacad-split-articles
```

## Rappel

Ces PDF ne doivent pas être ajoutés au dépôt ni redistribués. Le pipeline lit
`articles/` en local uniquement (chemin résolu par `ia_cad.paths.ARTICLES_DIR`,
surchargeable via la variable d'environnement `IA_CAD_ROOT`).
