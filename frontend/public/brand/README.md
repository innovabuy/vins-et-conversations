# Sources de marque — fichiers attendus

Ce dossier accueille les **fichiers sources fournis par Nicolas**. Il est volontairement
vide de tout visuel définitif : rien de ce lot ne fabrique d'image de marque.

## 1. `logo-full.svg` (ou `logo-full.png`)

Logo **complet** : le verre (auréole + bulle) **et** le texte « vins & conversations ».

- SVG haute résolution **de préférence**, sinon PNG **à fond transparent** ≥ 1600 px de haut.
- Sert à remplacer `app_settings.app_logo_url` (écran de connexion, en-têtes ERP, PDF).
- ⚠️ Le remplacement en base est **hors périmètre** tant que la source n'est pas tranchée.

## 2. `symbol.svg` (ou `symbol.png`)

**Symbole seul** : le verre avec auréole et bulle, **sans aucun texte**.

- SVG **de préférence** ; sinon PNG à fond transparent, carré ou quasi carré, ≥ 1024 px.
- Fond **transparent obligatoire** : le générateur pose lui-même le bordeaux `#7a1c3b`.
- Sert exclusivement à `scripts/generate-icons.js` (icônes PWA, favicons, apple-touch).

## Pourquoi on n'utilise pas le JPEG actuel

`app_settings.app_logo_url` pointe aujourd'hui sur `/uploads/logos/logo_1783604502053.jpeg` :
**479 × 850 px, fond blanc, JPEG**. L'encre du dessin n'occupe que **242 × 401 px** au centre.

Un détourage automatique depuis ce JPEG produirait des bords sales garantis sur l'auréole
(trait fin rouge) et sur la bulle (aplat blanc sur fond blanc, donc frontière indécidable),
plus les artefacts de compression JPEG en halo autour des traits. D'où la règle du lot :
**on attend la source propre, on ne détoure pas**.

## Une fois les fichiers déposés

```sh
docker run --rm -v /root/vins-conversations:/w -w /w \
  -e NODE_PATH=/app/node_modules vins-conversations-api \
  node scripts/generate-icons.js
```

Puis appliquer les trois patchs listés dans `scripts/ICONS.md`.

---

## ⚠️ Dette à solder au dépôt de `logo-full.svg`

`frontend/src/pages/LoginPage.jsx` contient un **cadrage provisoire câblé sur le JPEG actuel** :
l'image y est agrandie à **1,68× la taille « contain »** puis recalée
(`h-[215px] left-[-18px] top-[-55px]`, variantes `sm:`) pour que le cartouche cadre l'encre
(245 × 404 px, centrée en 54,07 % / 55,12 %) au lieu du blanc mort qui l'entoure.

Ces valeurs **ne sont valides que pour `logo_1783604502053.jpeg`**. Sur une source détourée
sans marges, le même cadrage **amputerait le logo**.

À faire dès que la source transparente est en place :

1. Remplacer `app_settings.app_logo_url` par le nouveau fichier.
2. Dans `LoginPage.jsx`, supprimer `h-[…]`, `left-[…]`, `top-[…]`, `max-w-none`,
   `overflow-hidden` et le bloc de commentaire « RÉGLAGE PROVISOIRE », puis revenir à
   `className="h-full w-auto object-contain"`.
3. Redimensionner le cartouche : sans blanc mort, un carré redevient adapté.
4. Bumper `CACHE_NAME` dans `frontend/public/sw.js`.
