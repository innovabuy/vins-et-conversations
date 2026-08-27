# Icônes PWA & favicon — spécification et patchs à appliquer

Statut : **structure préparée, images définitives en attente** de la source
`frontend/public/brand/symbol.svg` (cf. `frontend/public/brand/README.md`).

`frontend/public/manifest.json`, `sw.js` (hors bump de version) et `index.html`
**ne sont pas modifiés par ce lot** : déclarer des icônes qui n'existent pas encore
casserait `cache.addAll()` du service worker (l'événement `install` rejette → le SW
ne s'active jamais). Les patchs ci-dessous s'appliquent **le jour où les PNG existent**.

---

## 1. Défaut constaté sur l'existant

Les icônes actuelles sont générées depuis `frontend/public/icon-512.svg`, un
**placeholder générique** (verre stylisé + texte « V&C » en Arial), pas le logo de la marque.

Surtout, `manifest.json` déclare aujourd'hui :

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
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

Aujourd'hui `apple-touch-icon` pointe sur `/icon-192.png` : mauvaise taille (iOS veut 180) et
icône à coins arrondis re-masquée par iOS, ce qui rogne deux fois les angles.

`favicon.svg` doit lui aussi être régénéré depuis le symbole ; il contient actuellement le
placeholder « V&C ».

## 6. Nettoyage final

Une fois les patchs 3–5 appliqués et vérifiés, supprimer les anciens fichiers plats à la
racine de `frontend/public` — `icon-72/96/128/144/192/512.png`, `icon-192.svg`, `icon-512.svg` —
et l'ancien placeholder n'est alors plus référencé nulle part. Vérifier avec
`grep -rn "icon-512.svg\|/icon-192.png" frontend/ nginx/` avant de supprimer.
