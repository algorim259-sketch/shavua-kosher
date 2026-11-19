# שבוע כושר (nom provisoire)

Semaine de repas sportifs + liste de courses, **au vrai prix du supermarché** en Israël,
en comparant les magasins proches de chez toi.
Le plan complet est dans le doc « Plan — app de repas sportifs en Israël ».

## Lancer le site

```
npm start
```
puis ouvrir http://localhost:5173 (le site charge les prix de chaque magasin à la demande : il faut le serveur).

## Mettre les prix à jour

```
npm run prix
```
- Récupère les listes de magasins et les prix publics (loi sur la transparence des prix) :
  **Shufersal** (site web), **Rami Levy**, **Osher Ad** et **Yochananof** (serveur commun `publishedprices`, nom public de la chaîne, sans mot de passe), **Victory** (laibcatalog.co.il).
- Villes : codes officiels de data.gov.il ; position des villes cherchée une fois sur OpenStreetMap et gardée dans `data/cities.json`.
- Pour chaque magasin, garde le produit le moins cher au kilo de chaque ingrédient → `web/prices/<chaîne>-<magasin>.json`.
- Une seule chaîne : `node scripts/fetch-prices.mjs --chain ramilevy`.

## Contrôle des produits

```
npm run controle
```
Liste, pour chaque ingrédient, les produits retenus dans tous les magasins (pour repérer une erreur du genre « épinards » = friandise pour chien). Les mauvais choix se corrigent avec `exclude` dans `data/ingredients.json`.

## Tests

```
npm test
```

## Comment c'est rangé

| Fichier | Rôle |
| --- | --- |
| `data/ingredients.json` | 38 ingrédients : nutrition pour 100 g (valeurs moyennes, approximatives), cacher, mots-clés pour les retrouver dans les fichiers de prix |
| `data/recipes.json` | 32 recettes, grammes pour une portion de base, photo (Unsplash) |
| `data/stores.json`, `data/cities.json` | magasins de toutes les chaînes, villes avec leur position |
| `scripts/fetch-prices.mjs` + `prices-lib.mjs` | récupération et lecture des fichiers des chaînes |
| `scripts/build-data.mjs` | fabrique `web/data.js` |
| `web/plan.js` | besoins (Mifflin-St Jeor), choix des repas, budget, liste de courses, comparaison des magasins |
| `web/app.js`, `i18n.js`, `style.css` | le site (hébreu + français) |

## Réglages

- Abonnement : `SHOW_PRICING = false` dans `web/app.js` = rien d'affiché (phase de test avec des amis). Le remettre à `true` pour afficher l'offre à `PRICE` (39 ₪ par mois).
- Rayon de recherche des magasins : `RADIUS_KM` dans `web/app.js` (25 km).
- Ajouter une chaîne : `CHAINS` dans `scripts/fetch-prices.mjs` et `scripts/build-data.mjs`.

## Pas encore fait

- Paiement (39 ₪ / mois) : il faut choisir un prestataire et ouvrir un compte (à faire par Allan).
- Autres chaînes : Tiv Taam, Carrefour, Hazi Hinam…
- 4 magasins Yochananof sans ville identifiable (noms trop vagues).
- Promotions (fichiers `PromoFull`), mise à jour automatique chaque nuit, mise en ligne.
- Vrais logos des chaînes (pour l'instant : pastilles de couleur avec les initiales).
- Valeurs nutritionnelles à vérifier avec une vraie base de données.

Photos : [Unsplash](https://unsplash.com) (licence Unsplash, gratuites).

## APK Android (pour le téléphone)

Le site est emballé dans une app avec Capacitor (dossier `android/`).
```
npx cap sync android
cd android && ./gradlew assembleDebug
```
(Java 17 : `JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot"`, SDK : `ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"`.)
L'APK sort dans `android/app/build/outputs/apk/debug/app-debug.apk` ; on le copie dans `Bureau\rentacouse apk\ShavuaKosher-test-vN.apk`.
Les prix sont ceux du moment du build : refaire `npm run prix` puis `npx cap sync android` avant chaque nouvel APK.

## Site en ligne (GitHub Pages)

Adresse : https://algorim259-sketch.github.io/shavua-kosher/

`.github/workflows/site.yml` publie le dossier `web/` :
- à chaque `git push` sur `main` ;
- chaque matin vers 7 h en hiver, 8 h en été (heure d'Israël), quand toutes les chaînes ont publié (Osher Ad et Victory publient vers 5-6 h), après avoir récupéré les prix du jour (et les enregistre dans le dépôt) ;
- à la main : onglet **Actions** → « Site en ligne » → **Run workflow**.

Si une chaîne refuse la connexion depuis les serveurs de GitHub, ses derniers prix connus restent en ligne.
Le site n'est pas référencé par les moteurs de recherche (`noindex`) : on y accède par le lien.
