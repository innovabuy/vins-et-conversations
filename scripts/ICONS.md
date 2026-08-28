# Icônes PWA & favicon — spécification et patchs à appliquer

Statut : **appliqué le 28/08/2026**. Les 17 fichiers sont générés depuis
`frontend/public/brand/symbol.svg`, et les patchs 3, 4 et 5 ci-dessous sont en place
dans `manifest.json`, `sw.js` (`vc-cache-v12`) et `index.html`.

Le document reste la spécification de référence : toute régénération d'icônes doit
reproduire ces tailles et ces deux jeux `any` / `maskable` distincts. Rappel de la
contrainte qui a dicté l'ordre des opérations : `cache.addAll()` rejette en entier si
une seule entrée de `STATIC_ASSETS` manque — on ne déclare jamais une icône avant de
l'avoir écrite sur disque.

Réserves connues sur le rendu (constatées à la recette du 28/08) : le symbole tracé est
lisible **à partir de 128 px** ; en 16/32/48 px il reste confus, comme le placeholder
qu'il remplace (aucune régression, mais aucun gain non plus). La vraie réponse est une
**variante simplifiée du symbole** à demander à Nicolas (verre épaissi, ou symbole blanc
plein sur bordeaux), à régénérer ensuite avec le même script.

`frontend/public/favicon.svg` a été **régénéré depuis `brand/symbol.svg`** avec le même
cadrage que les icônes `any` (motif à 88 %, coins arrondis r = 80/512) : c'est lui l'icône
d'onglet effective sur Chrome et Firefox, qui préfèrent le SVG quand il est déclaré — laisser
le placeholder « V&C » y aurait annulé tout le bénéfice du lot. Le nettoyage du § 6 est fait.

---

## 1. Défaut constaté sur l'existant (état AVANT ce lot)

Les icônes d'origine étaient générées depuis `frontend/public/icon-512.svg`, un
**placeholder générique** (verre stylisé + texte « V&C » en Arial), pas le logo de la marque.

Surtout, `manifest.json` déclarait :

```json
{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" }
```

`purpose: "any maskable"` sur une icône **qui n'a pas de zone de sécurité** est incorrect :
le texte « V&C » du placeholder est posé à y = 440/512, soit **86 % de la hauteur**. Sous le
masque circulaire d'Android (rayon 40 % du côté), il est **tronqué**. Une icône `maskable`
doit avoir tout son contenu signifiant dans les **80 % centraux** — d'où deux jeux de fichiers
distincts ci-dessous, jamais un fichier partagé entre les deux `purpose`.

## 2. Tailles à générer

| Fichier | Taille | Fond | Motif | Rôle |
|---|---|---|---|---|
| `icons/icon-72.png` | 72 | `#7a1c3b`, coins arrondis | 88 % | manifest `any` |
| `icons/icon-96.png` | 96 | idem | 88 % | manifest `any` |
| `icons/icon-128.png` | 128 | idem | 88 % | manifest `any` |
| `icons/icon-144.png` | 144 | idem | 88 % | manifest `any` |
| `icons/icon-152.png` | 152 | idem | 88 % | iPad |
| `icons/icon-180.png` | 180 | idem | 88 % | manifest `any` |
| `icons/icon-192.png` | 192 | idem | 88 % | manifest `any` (taille pivot Android) |
| `icons/icon-256.png` | 256 | idem | 88 % | manifest `any` |
| `icons/icon-384.png` | 384 | idem | 88 % | manifest `any` |
| `icons/icon-512.png` | 512 | idem | 88 % | manifest `any` (splash screen) |
| `icons/icon-maskable-192.png` | 192 | `#7a1c3b` **pleine page** | **80 %** | manifest `maskable` |
| `icons/icon-maskable-384.png` | 384 | idem | **80 %** | manifest `maskable` |
| `icons/icon-maskable-512.png` | 512 | idem | **80 %** | manifest `maskable` |
| `icons/favicon-16.png` | 16 | `#7a1c3b`, coins arrondis | 88 % | onglet |
| `icons/favicon-32.png` | 32 | idem | 88 % | onglet / raccourci |
| `icons/favicon-48.png` | 48 | idem | 88 % | onglet HiDPI |
| `apple-touch-icon.png` | 180 | `#7a1c3b` **opaque, sans arrondi** | 88 % | iOS (pas de transparence, masque système) |

Le bordeaux `#7a1c3b` est repris **tel quel** de `theme_color` / `background_color` du manifeste
et de `wine.900` de `tailwind.config.js` — un seul bordeaux dans tout le produit.

Non généré : `favicon.ico`. sharp ne sait pas écrire le format ICO, et plus aucun navigateur
supporté n'en a besoin (SVG + PNG suffisent). À produire à la main si un jour c'est demandé.

## 3. Patch `frontend/public/manifest.json`

Remplacer intégralement le tableau `icons` (le reste du fichier est inchangé) :

```json
  "icons": [
    { "src": "/icons/icon-72.png",  "sizes": "72x72",   "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-96.png",  "sizes": "96x96",   "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-128.png", "sizes": "128x128", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-144.png", "sizes": "144x144", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-152.png", "sizes": "152x152", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-180.png", "sizes": "180x180", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-256.png", "sizes": "256x256", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-384.png", "sizes": "384x384", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-384.png", "sizes": "384x384", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
```

`name`, `short_name`, `start_url`, `display`, `background_color`, `theme_color`, `orientation`
restent inchangés.

## 4. Patch `frontend/public/sw.js`

`STATIC_ASSETS` est passé à `cache.addAll()` : **toute entrée manquante fait échouer l'install
du service worker en entier**. Ne l'étendre qu'une fois les fichiers présents, et **bumper
`CACHE_NAME` dans le même commit** (le SW est cache-first : sans bump, les récurrents gardent
les anciennes icônes).

```js
const CACHE_NAME = 'vc-cache-v12'; // v11 = lot logo écran de connexion
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];
```

Les tailles intermédiaires ne sont **pas** préchargées : elles ne servent qu'à l'installation
PWA, le cache-first de `fetch` les capte à la volée. Précharger 17 fichiers rallongerait
l'install sans bénéfice.

## 5. Patch `frontend/index.html`

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="48x48" href="/icons/favicon-48.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

Aujourd'hui `apple-touch-icon` pointe sur `/icon-192.png` : mauvaise taille (iOS veut 180) et
icône à coins arrondis re-masquée par iOS, ce qui rogne deux fois les angles.

`favicon.svg` est régénéré depuis le symbole (rectangle bordeaux arrondi + tracés de
`brand/symbol.svg`, cadrage identique aux icônes `any`). Il est **déclaré en premier** :
les navigateurs qui gèrent le SVG l'utilisent et ignorent les PNG, qui ne servent que de
repli. Toute régénération du jeu d'icônes doit donc le régénérer lui aussi, sous peine de
laisser l'onglet désynchronisé du reste.

## 6. Nettoyage final

**Fait le 28/08/2026.** Les anciens fichiers plats de `frontend/public` —
`icon-72/96/128/144/192/512.png`, `icon-192.svg`, `icon-512.svg` — ont été supprimés après
vérification qu'aucune référence ne subsistait dans le dépôt (hors `node_modules`, `dist` et
`.git`). La racine de `frontend/public` ne contient plus que `favicon.svg`,
`apple-touch-icon.png`, `manifest.json`, `sw.js` et les dossiers `icons/`, `brand/`, `images/`.

Contrôle à rejouer avant toute suppression future :
`grep -rn "icon-512.svg\|/icon-192.png" frontend/ nginx/`.
