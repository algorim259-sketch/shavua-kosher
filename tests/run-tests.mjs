// npm test — vérifie le calcul, les recettes et la composition de la semaine.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parsePriceXml, packGrams, pickProducts } from '../scripts/prices-lib.mjs';

const require = createRequire(import.meta.url);
const Plan = require('../web/plan.js');
const root = new URL('..', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

let ok = 0, ko = 0;
const t = (name, cond, extra = '') => { if (cond) ok++; else { ko++; console.log(`✗ ${name} ${extra}`); } };

const data = Plan.prepare({ ingredients: read('data/ingredients.json'), recipes: read('data/recipes.json') });
const priceFiles = readdirSync(new URL('data/prices/', root)).filter((f) => f.endsWith('.json'));
const prices = read(`data/prices/${priceFiles[0]}`).products;

// --- Besoins (Mifflin-St Jeor) ---
const man = { sex: 'm', age: 25, height: 178, weight: 75, job: 'sit', sessions: '3-4', goal: 'gain', meals: 21, diet: 'all', budget: 400 };
const n = Plan.needs(man);
// BMR = 750 + 1112.5 - 125 + 5 = 1742.5 ; × 1.4 × 1.1 = 2683
t('calories homme prise de muscle', n.kcal === 2680, JSON.stringify(n));
t('protéines 1,8 g/kg', n.p === 135);
t('macros cohérentes', Math.abs(n.p * 4 + n.c * 4 + n.f * 9 - n.kcal) < 10);
const woman = Object.assign({}, man, { sex: 'f', goal: 'lose', weight: 60, height: 165, sessions: '0' });
t('femme perte de poids < 1600 kcal', Plan.needs(woman).kcal < 1600);

// --- Données ---
for (const r of data.recipes) {
  for (const id of Object.keys(r.ing)) t(`ingrédient connu ${r.id}/${id}`, !!data.ingredientsById[id]);
  const info = Plan.recipeInfo(r, data.ingredientsById, prices);
  t(`cacher : jamais viande + lait (${r.id})`, info.kosher);
  t(`calories raisonnables (${r.id})`, info.kcal > 250 && info.kcal < 1000, Math.round(info.kcal));
}
t('assez de petits-déjeuners végans', data.recipes.filter((r) => r.meal === 'breakfast' && Plan.recipeInfo(r, data.ingredientsById).vegan).length >= 1);
t('assez de plats végans', data.recipes.filter((r) => r.meal === 'main' && Plan.recipeInfo(r, data.ingredientsById).vegan).length >= 4);

// --- Fichiers de prix ---
const xml = `<Root><Items><Item><ItemCode>1</ItemCode><ItemName>ביצים ארוזות 18יח M</ItemName><Quantity>1.00</Quantity><UnitQty>יחידות</UnitQty><ItemPrice>20.10</ItemPrice><bIsWeighted>0</bIsWeighted></Item>
<Item><ItemCode>2</ItemCode><ItemName>קוטג 5% שומן 250ג טרה</ItemName><Quantity>250.00</Quantity><UnitQty>גרם</UnitQty><ItemPrice>6.70</ItemPrice><bIsWeighted>0</bIsWeighted></Item>
<Item><ItemCode>3</ItemCode><ItemName>גבינת קוטג%5מהדרין250גר</ItemName><Quantity>250.00</Quantity><UnitQty>גרם</UnitQty><ItemPrice>6.40</ItemPrice><bIsWeighted>0</bIsWeighted></Item>
<Item><ItemCode>4</ItemCode><ItemName>בננה</ItemName><Quantity>1.00</Quantity><UnitQty>קילוגרם</UnitQty><ItemPrice>12.90</ItemPrice><bIsWeighted>1</bIsWeighted></Item>
<Item><ItemCode>5</ItemCode><ItemName>תפוזינה תות בננה 1.5ליטר</ItemName><Quantity>1.50</Quantity><UnitQty>ליטר</UnitQty><ItemPrice>8.90</ItemPrice><bIsWeighted>0</bIsWeighted></Item></Items></Root>`;
const items = parsePriceXml(xml);
t('lecture XML', items.length === 5 && items[0].price === 20.1);
t('œufs : 18 × 60 g', packGrams(items[0], data.ingredientsById.eggs) === 1080);
const picked = pickProducts(items, data.ingredients);
t('cottage le moins cher', picked.cottage && picked.cottage.code === '3');
t('banane : pas la boisson', picked.banana && picked.banana.code === '4');

// --- Semaine ---
const plan = Plan.buildPlan(man, data, prices, 42, 150);
t('7 jours', plan.days.length === 7);
t('3 repas par jour', plan.days.every((d) => d.meals.length === 3));
t('jamais plus de 2 fois la même recette', (() => { const c = {}; plan.days.forEach((d) => d.meals.forEach((m) => (c[m.id] = (c[m.id] || 0) + 1))); return Object.values(c).every((v) => v <= 2); })());
t('budget respecté', plan.shop.total <= man.budget, `${plan.shop.total} ₪`);
t('budget minimum calculé', plan.minBudget > 50 && plan.minBudget <= plan.shop.total + 10, `${plan.minBudget}`);
t('même graine = même semaine', JSON.stringify(Plan.buildPlan(man, data, prices, 42, 150).days) === JSON.stringify(plan.days));
const vegan = Plan.buildPlan(Object.assign({}, man, { diet: 'vegan' }), data, prices, 7, 100);
t('végan : aucun produit animal', vegan.days.every((d) => d.meals.every((m) => Object.keys(m.ing).every((k) => { const i = data.ingredientsById[k]; return i.kosher === 'parve' && !i.animal; }))));
const poor = Plan.buildPlan(Object.assign({}, man, { budget: 50 }), data, prices, 3, 100);
t('budget trop bas signalé', poor.overBudget === true);
const swapped = Plan.swapMeal(plan, man, data, prices, 0, 1, 99);
t('remplacer un repas', swapped.days[0].meals[1].id !== plan.days[0].meals[1].id && swapped.days[1] === plan.days[1]);
const two = Plan.buildPlan(Object.assign({}, man, { meals: 14 }), data, prices, 5, 100);
t('14 repas = déjeuner + dîner', two.days.every((d) => d.meals.length === 2 && d.meals[0].slot === 'lunch'));

console.log(`\n${ok} réussis, ${ko} ratés`);
console.log(`Exemple : ${plan.needs.kcal} kcal/jour, semaine à ${plan.shop.total} ₪ (minimum ${plan.minBudget} ₪), protéines ${plan.protein} % de l'objectif`);
process.exit(ko ? 1 : 0);
