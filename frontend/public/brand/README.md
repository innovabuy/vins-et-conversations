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

## ✅ Dette soldée le 28/08/2026

`logo-full.svg` et `symbol.svg` ont été déposés, et le cadrage provisoire de
`frontend/src/pages/LoginPage.jsx` — qui agrandissait l'image à 1,68× puis la recalait
pour cadrer l'encre du JPEG à fond blanc — a été **supprimé**. Sur une source détourée
sans marges, ce cadrage aurait amputé le logo.

État à ce jour :

1. `app_settings.app_logo_url` = `/uploads/logos/logo-full.svg` (écriture en base, non versionnée).
2. `LoginPage.jsx` est revenu à `className="h-full w-auto object-contain"` ; `h-[…]`,
   `left-[…]`, `top-[…]`, `max-w-none`, `overflow-hidden` et le bloc « RÉGLAGE PROVISOIRE »
   ont disparu.
3. Le cartouche est redevenu carré (`w-32 h-32`, `sm:w-36 sm:h-36`) avec un padding interne,
   puisqu'il n'y a plus de blanc mort à compenser.
4. `CACHE_NAME` bumpé à `vc-cache-v12` dans `frontend/public/sw.js` (bump commun avec le lot
   d'icônes PWA, cf. `scripts/ICONS.md`).

⚠️ Réserve sur la source : `logo-full.svg` et `symbol.svg` sont une **vectorisation
automatique du JPEG** (fond opaque aplati, 3 couleurs), pas des originaux. Le fichier natif
reste à demander à Nicolas, en même temps qu'une **variante simplifiée du symbole** pour les
petites tailles (favicon 16–48 px), où le tracé actuel reste confus.
