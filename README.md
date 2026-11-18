# שבוע כושר (nom provisoire)

Semaine de repas sportifs + liste de courses, **au vrai prix du supermarché** en Israël.
Le plan complet est dans le doc « Plan — app de repas sportifs en Israël ».

## Lancer le site

```
npm start
```
puis ouvrir http://localhost:5173 (ou double-cliquer sur `web/index.html`).

## Mettre les prix à jour

```
npm run prix
```
Télécharge les fichiers publics de Shufersal (loi sur la transparence des prix) pour les magasins
de `data/stores.json`, garde pour chaque ingrédient le produit le moins cher au kilo, puis reconstruit `web/data.js`.

## Tests

```
npm test
```

## Comment c'est rangé

| Fichier | Rôle |
| --- | --- |
| `data/ingredients.json` | 38 ingrédients : nutrition pour 100 g (valeurs moyennes, approximatives), cacher (viande / lait / parve / poisson), mots-clés pour les retrouver dans les fichiers de prix |
| `data/recipes.json` | 32 recettes (7 petits-déjeuners, 25 plats), grammes pour une portion de base |
| `data/stores.json` | les magasins suivis |
| `data/prices/` | le produit choisi et son prix, par magasin |
| `scripts/fetch-prices.mjs` + `prices-lib.mjs` | récupération et lecture des fichiers de prix |
| `web/plan.js` | besoins (Mifflin-St Jeor), choix des repas, portions, budget, liste de courses |
| `web/app.js`, `i18n.js`, `style.css` | le site (hébreu + français) |

## Réglages

- Prix de l'abonnement : `PRICE` dans `web/app.js` (39 ₪).
- `TEST_MODE = true` : tout est gratuit tant que le paiement n'existe pas.

## Pas encore fait

- Paiement (39 ₪ / mois) : il faut choisir un prestataire et ouvrir un compte (à faire par Allan).
- Autres chaînes (Rami Levy, Victory…) : passent par une page de connexion, à faire ensuite.
- Promotions (fichiers `PromoFull`), récupération automatique chaque nuit (Supabase ou GitHub Actions).
- Valeurs nutritionnelles à vérifier avec une vraie base de données.
