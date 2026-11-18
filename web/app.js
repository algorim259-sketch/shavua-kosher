// Interface : accueil → 9 questions → semaine, comparaison des magasins, liste de courses.
(function () {
  'use strict';
  const TEST_MODE = true;   // tant que le paiement n'existe pas : tout est gratuit
  const PRICE = 39;         // ₪ par mois
  const RADIUS_KM = 25;     // magasins proposés autour de la ville
  const WHEEL_H = 44;       // hauteur d'une ligne des roues âge / taille / poids

  const DATA = Plan.prepare(window.DATA);
  const CITY = Object.fromEntries(DATA.cities.map((c) => [c.code, c]));
  const STORE = Object.fromEntries(DATA.stores.map((s) => [s.key, s]));
  const RECIPE = Object.fromEntries(DATA.recipes.map((r) => [r.id, r]));
  const app = document.getElementById('app');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* navigation privée */ } },
  };

  let lang = store.get('lang', 'he');
  let t = T[lang];
  const defaults = { goal: null, city: null, stores: [], meals: 21, diet: 'all', sessions: '3-4', job: 'sit', likes: {}, family: false, members: [], age: 25, height: 175, weight: 75, sex: null, budget: null, shopStore: null };
  let profile = Object.assign({}, defaults, store.get('profile', {}));
  if (!Array.isArray(profile.stores)) profile.stores = [];
  if (!Array.isArray(profile.members)) profile.members = [];
  profile.stores = profile.stores.filter((k) => STORE[k]);
  let step = 0, plan = null, tab = 'week', likeIdx = 0, cityQuery = '', minBudget = null;
  let seed = store.get('seed', 1);
  const PRICES = {};

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nis = (n) => `${(Math.round(n * 10) / 10).toLocaleString('he-IL')} ₪`;
  const name = (x) => (lang === 'he' ? x.he : x.fr);
  const save = () => store.set('profile', profile);
  const img = (id, w, h) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format&q=70`;
  const LOGOS = { shufersal: 'logos/shufersal.svg', ramilevy: 'logos/ramilevy.png', osherad: 'logos/osherad.png', yochananof: 'logos/yochananof.png', victory: 'logos/victory.svg' };
  const chainBadge = (key, size) => { const c = DATA.chains[key]; return `<span class="badge-chain logo${size ? ' ' + size : ''}" title="${esc(name(c))}"><img src="${LOGOS[key]}" alt="${esc(name(c))}"></span>`; };
  // « texte |mise en valeur » → la fin du titre en vert, en italique
  const title = (s) => { const [a, b] = s.split('|'); return b == null ? esc(a) : `${esc(a)}<em>${esc(b)}</em>`; };

  async function loadPrices(keys) {
    await Promise.all(keys.filter((k) => PRICES[k] === undefined).map(async (k) => {
      try { PRICES[k] = (await (await fetch(`prices/${k}.json?v=${DATA.v || ""}`)).json()).products; } catch (e) { PRICES[k] = null; }
    }));
  }

  // ---------- Villes et magasins proches ----------
  function km(a, b) {
    const r = (x) => (x * Math.PI) / 180;
    const d = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(d));
  }
  function nearbyStores(code) {
    const c = CITY[code]; if (!c) return [];
    let list;
    if (c.lat != null) list = DATA.stores.filter((s) => s.lat != null).map((s) => ({ s, d: km(c, s) })).filter((x) => x.d <= RADIUS_KM);
    else list = DATA.stores.filter((s) => CITY[s.cityCode] && CITY[s.cityCode].napa === c.napa).map((s) => ({ s, d: null }));
    list.sort((a, b) => (a.d ?? 99) - (b.d ?? 99));
    // les 14 plus proches, plus le plus proche de chaque chaîne s'il n'y est pas
    const top = list.slice(0, 14);
    for (const ch of Object.keys(DATA.chains)) {
      if (!top.some((x) => x.s.chain === ch)) { const first = list.find((x) => x.s.chain === ch); if (first) top.push(first); }
    }
    return top;
  }
  function defaultStores(list) {
    const seen = new Set(); const out = [];
    for (const { s } of list) if (!seen.has(s.chain)) { seen.add(s.chain); out.push(s.key); }
    return out; // le plus proche de chaque chaîne
  }
  function searchCities(q) {
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const hit = (c) => c.he.toLowerCase().includes(q) || (c.en && c.en.toLowerCase().includes(q));
    return DATA.cities.filter(hit).sort((a, b) => (a.he.startsWith(q) ? 0 : 1) - (b.he.startsWith(q) ? 0 : 1) || (b.lat != null) - (a.lat != null) || a.he.length - b.he.length).slice(0, 6);
  }
  const cityButtons = (res) => res.map((r) => `<button class="city-opt" data-city="${r.code}">${esc(r.he)}${r.en ? `<small>${esc(r.en)}</small>` : ''}</button>`).join('');

  function setLang(l) {
    lang = l; t = T[l]; store.set('lang', l);
    document.documentElement.lang = l; document.documentElement.dir = t.dir;
    document.getElementById('lang').textContent = t.other;
    document.getElementById('brand').textContent = T.he.brand;
    render();
  }
  document.getElementById('lang').onclick = () => setLang(lang === 'he' ? 'fr' : 'he');
  document.querySelector('[data-go="home"]').onclick = (e) => { e.preventDefault(); plan = null; go(0); };

  // ---------- Accueil ----------
  // ---------- Accueil ----------
  let refPrices = null; // prix d'un magasin de référence pour afficher « ₪ la portion » sur l'accueil
  function home() {
    const hasPlan = profile.goal && profile.stores.length && profile.sex && profile.budget;
    const R = DATA.recipes;
    const half = Math.ceil(R.length / 2);
    const card = (r) => {
      const info = Plan.recipeInfo(r, DATA.ingredientsById, refPrices);
      return `<figure class="rcard"><img src="${img(r.img, 360, 260)}" alt="" loading="lazy">
        <figcaption><b>${esc(name(r))}</b><span>${Math.round(info.p)} ${t.g} ${t.prot} · ${r.min} ${t.min}${refPrices && info.cost ? ` · <em>${nis(info.cost)}</em>` : ''}</span></figcaption></figure>`;
    };
    // chaque rangée est répétée deux fois pour défiler sans coupure
    const row = (list, dir) => `<div class="marquee ${dir}"><div class="track">${list.map(card).join('')}${list.map(card).join('')}</div></div>`;
    const cities = new Set(DATA.stores.map((s) => s.cityCode)).size;
    if (!refPrices && DATA.stores.length) {
      const ref = DATA.stores.find((s) => s.chain === 'ramilevy') || DATA.stores[0];
      loadPrices([ref.key]).then(() => { refPrices = PRICES[ref.key]; if (step === 0) { app.querySelectorAll('.marquee').forEach((m, i) => { m.outerHTML = row(i ? R.slice(half) : R.slice(0, half), i ? 'rev' : 'fwd'); }); } });
    }
    return `
    <section class="hero2">
      <p class="eyebrow"><span class="dot"></span>${t.heroTag}</p>
      <h1 class="hook">${esc(t.hook1)}<br><em>${esc(t.hook2)}</em></h1>
      <p class="sub">${t.heroSub}</p>
      <button class="cta" data-act="start"><span>${t.start}</span><span class="cta-arrow arrow">←</span></button>
      <p class="note">${t.heroNote}</p>
      ${hasPlan ? `<button class="ghost" data-act="mine">${t.see}</button>` : ''}
    </section>
    <section class="logos">
      <p>${t.logosTitle.replace('{n}', DATA.stores.length)}</p>
      <div class="logo-row">${Object.keys(DATA.chains).map((k) => `<span class="logo-tile"><img src="${LOGOS[k]}" alt="${esc(name(DATA.chains[k]))}"></span>`).join('')}</div>
    </section>
    <section class="recipes">
      <h2>${t.recipesTitle.replace('{n}', R.length)}</h2>
      ${row(R.slice(0, half), 'fwd')}${row(R.slice(half), 'rev')}
    </section>
    <section class="stats">
      <div><b data-count="${DATA.stores.length}">${DATA.stores.length}</b><span>${t.statStores}</span></div>
      <div><b data-count="${Object.keys(DATA.chains).length}">${Object.keys(DATA.chains).length}</b><span>${t.statChains}</span></div>
      <div><b data-count="${cities}">${cities}</b><span>${t.statCities}</span></div>
      <div><b data-count="${R.length}">${R.length}</b><span>${t.statRecipes}</span></div>
    </section>
    <section class="how">
      <h2>${t.how}</h2>
      <ol class="steps">
        <li><b>01</b><h3>${t.step1}</h3><p>${t.step1d}</p></li>
        <li><b>02</b><h3>${t.step2}</h3><p>${t.step2d}</p></li>
        <li><b>03</b><h3>${t.step3}</h3><p>${t.step3d}</p></li>
      </ol>
    </section>
    ${priceCard()}
    <section class="final">
      <h2>${t.finalCta}</h2>
      <button class="cta" data-act="start"><span>${t.start}</span><span class="cta-arrow arrow">←</span></button>
    </section>
    <p class="fine">${t.disclaimer}<br>${t.photos} · ${t.logosNote}</p>`;
  }

  function priceCard() {
    return `<section class="price">
      <p class="chip">${t.priceTitle}</p>
      <p class="amount"><span>${PRICE}</span> ${t.perMonth}</p>
      <p class="sub">${t.priceNote}</p>
      ${TEST_MODE ? `<p class="badge">${t.testMode}</p><button class="ghost" disabled>${t.soon}</button>` : ''}
    </section>`;
  }

  // ---------- Questions ----------
  const STEPS = ['goal', 'city', 'meals', 'family', 'diet', 'train', 'likes', 'body', 'sex', 'budget'];
  const opt = (field, value, label, desc, icon) =>
    `<button class="opt ${profile[field] === value ? 'on' : ''}" data-set="${field}" data-val="${esc(value)}">${icon ? `<i class="ico">${icon}</i>` : ''}<span class="txt"><span>${label}</span>${desc ? `<small>${desc}</small>` : ''}</span><span class="check">✓</span></button>`;

  // Une carte par personne de la famille (adulte : sexe, âge, taille, poids ; enfant : âge).
  function memberCard(m, i) {
    const num = (f, min, max, unit) => `<label class="mini-num"><span>${t[f === 'age' ? 'age' : f].replace(/ \(.*/, '')}</span><input type="number" inputmode="numeric" min="${min}" max="${max}" value="${m[f]}" data-member="${i}" data-mf="${f}"><small>${unit}</small></label>`;
    const head = `<div class="m-head"><b>${m.type === 'child' ? t.child : t.adult} ${i + 1}</b><span class="m-kcal">≈ ${Plan.memberKcal(m).toLocaleString('he-IL')} ${t.kcal}</span><button class="m-del" data-del="${i}" aria-label="✕">✕</button></div>`;
    if (m.type === 'child') {
      return `<div class="member rise">${head}<div class="m-row"><span>${t.childAge}</span><button class="pm" data-mstep="${i}" data-d="-1">−</button><b class="cnt">${m.age}</b><button class="pm plus" data-mstep="${i}" data-d="1">+</button><small>${t.years}</small></div></div>`;
    }
    return `<div class="member rise">${head}
      <div class="seg"><button class="${m.sex === 'm' ? 'on' : ''}" data-msex="${i}" data-v="m">${t.male}</button><button class="${m.sex === 'f' ? 'on' : ''}" data-msex="${i}" data-v="f">${t.female}</button></div>
      <div class="row3">${num('age', 16, 99, t.years)}${num('height', 120, 220, 'cm')}${num('weight', 30, 250, 'kg')}</div></div>`;
  }

  function cityStep() {
    const c = CITY[profile.city];
    const results = searchCities(cityQuery);
    let html = `<div class="city-search"><i aria-hidden="true">⌕</i><input id="city" type="search" autocomplete="off" placeholder="${t.cityPh}" value="${esc(cityQuery || (c ? c.he : ''))}"></div>
      <div id="city-results" class="city-results">${cityButtons(results)}</div>`;
    if (c && !results.length) {
      const list = nearbyStores(c.code);
      html += list.length ? `<p class="sub">${t.nearby}</p><div class="stores">${list.map(({ s, d }) => `
        <button class="store-row ${profile.stores.includes(s.key) ? 'on' : ''}" data-store="${s.key}">
          ${chainBadge(s.chain)}
          <span class="what"><b>${esc(name(DATA.chains[s.chain]))} · ${esc(s.name)}</b><small>${/unknown/i.test(s.address || "") ? "" : esc(s.address)}${s.city ? ', ' + esc(s.city) : ''}</small></span>
          <span class="dist">${d != null ? `${d < 1 ? '<1' : Math.round(d)} ${t.km}` : t.sameArea}</span>
          <span class="tick">✓</span>
        </button>`).join('')}</div>` : `<p class="warn">${t.noStores}</p>`;
    }
    return html;
  }

  function wheel(field, min, max, unit, label) {
    let items = '';
    for (let v = min; v <= max; v++) items += `<li>${v}</li>`;
    return `<div class="wheel-col"><span class="wheel-lbl">${label}</span><div class="wheel" data-wheel="${field}" data-min="${min}"><ul>${items}</ul></div><span class="wheel-unit">${unit}</span></div>`;
  }

  function budgetDial() {
    const max = Math.max(minBudget * 3, profile.budget + 50);
    const frac = Math.min(1, profile.budget / max);
    const R = 92, C = 2 * Math.PI * R;
    return `<div class="dial">
      <svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="${R}" class="dial-track"/><circle id="dial-arc" cx="110" cy="110" r="${R}" class="dial-arc" stroke-dasharray="${C * frac} ${C}"/></svg>
      <div class="dial-in"><b id="bud">${profile.budget}</b><span>${t.perWeek}</span></div>
    </div>
    <div class="pmrow"><button class="pm" data-bud="-10" aria-label="-10">−</button><span id="permeal">≈ ${nis(profile.budget / profile.meals / persons())} ${persons() > 1 ? t.perPerson : t.perMeal}</span><button class="pm plus" data-bud="10" aria-label="+10">+</button></div>
    <p class="sub center">${t.minBudget} <b>${minBudget} ₪</b></p>`;
  }

  function question() {
    const key = STEPS[step - 1];
    let body = '', ttl = '', desc = '', canNext = false;
    if (key === 'goal') {
      ttl = t.q_goal; desc = t.q_goal_d;
      body = opt('goal', 'lose', t.goal_lose, '', '↘') + opt('goal', 'gain', t.goal_gain, '', '↗') + opt('goal', 'fit', t.goal_fit, '', '→');
    } else if (key === 'city') {
      ttl = t.q_city; desc = t.q_city_d; body = cityStep(); canNext = profile.stores.length > 0;
    } else if (key === 'meals') {
      ttl = t.q_meals; desc = t.q_meals_d;
      body = `<div class="row3">${[7, 14, 21].map((m) => `<button class="opt big ${profile.meals === m ? 'on' : ''}" data-set="meals" data-val="${m}" data-num="1"><b>${m}</b><small>${t['m' + m]}</small></button>`).join('')}</div>`;
      canNext = true;
    } else if (key === 'family') {
      ttl = t.q_family; desc = t.q_family_d;
      body = `<div class="row2">${opt('family', false, t.justMe, t.justMe_d, '●')}${opt('family', true, t.myFamily, t.myFamily_d, '●●')}</div>`;
      if (profile.family) {
        body += `<div class="family-box">${profile.members.map(memberCard).join('')}
          <div class="row2"><button class="ghost add" data-add="adult">+ ${t.addAdult}</button><button class="ghost add" data-add="child">+ ${t.addChild}</button></div></div>`;
      }
      canNext = !profile.family || profile.members.length > 0;
    } else if (key === 'diet') {
      ttl = t.q_diet; desc = t.q_diet_d;
      body = opt('diet', 'all', t.diet_all, '', '✦') + opt('diet', 'kosher', t.diet_kosher, t.diet_kosher_d, '✡') + opt('diet', 'vegetarian', t.diet_vegetarian, '', '❦') + opt('diet', 'vegan', t.diet_vegan, '', '✿');
      canNext = true;
    } else if (key === 'train') {
      ttl = t.q_train; desc = t.q_train_d;
      body = `<div class="row4">${[['0', t.s0], ['1-2', t.s12], ['3-4', t.s34], ['5+', t.s5]].map(([v, l]) =>
        `<button class="opt small ${profile.sessions === v ? 'on' : ''}" data-set="sessions" data-val="${v}"><b>${v}</b><small>${l}</small></button>`).join('')}</div>
        <h3 class="mini">${t.q_job}</h3>
        <div class="row3">${['sit', 'stand', 'physical'].map((j) => `<button class="opt small ${profile.job === j ? 'on' : ''}" data-set="job" data-val="${j}"><span>${t['job_' + j]}</span></button>`).join('')}</div>`;
      canNext = true;
    } else if (key === 'likes') {
      ttl = t.q_likes; desc = t.q_likes_d;
      const tag = Plan.TAGS[likeIdx];
      if (tag) {
        const pic = { express: 'tuna-wrap', protein: 'chicken-rice-broccoli', balanced: 'salmon-rice', light: 'tofu-quinoa', comfort: 'chickpea-curry', cheap: 'mujadara' }[tag];
        const r = RECIPE[pic];
        const [h, d] = t['like_' + tag];
        body = `<div class="card-like">${r ? `<img src="${img(r.img, 600, 360)}" alt="">` : ''}<div class="pad"><p class="count">${likeIdx + 1} / ${Plan.TAGS.length}</p><h3>${h}</h3><p>${d}</p>
          <div class="row2"><button class="no" data-like="0">✕ ${t.no}</button><button class="yes" data-like="1">✓ ${t.yes}</button></div></div></div>`;
      } else { body = `<p class="sub center">✓</p>`; canNext = true; }
    } else if (key === 'body') {
      ttl = t.q_body; desc = t.wheelHint;
      body = `<div class="wheels">${wheel('age', 16, 90, t.years, t.age.replace(/ \(.*/, ''))}${wheel('height', 140, 210, 'cm', t.height.replace(/ \(.*/, ''))}${wheel('weight', 40, 180, 'kg', t.weight.replace(/ \(.*/, ''))}</div>`;
      canNext = true;
    } else if (key === 'sex') {
      ttl = t.q_sex; desc = t.q_sex_d;
      body = `<div class="row2">${opt('sex', 'm', t.male, '', '♂')}${opt('sex', 'f', t.female, '', '♀')}</div>`;
    } else if (key === 'budget') {
      ttl = t.q_budget; desc = t.q_budget_d;
      const loaded = profile.stores.every((k) => PRICES[k] !== undefined);
      const prices = loaded ? planPrices() : undefined;
      if (!loaded) { loadPrices(profile.stores).then(render); body = `<div class="spinner"></div><p class="sub center">${t.loading}</p>`; }
      else {
        const probe = prices ? Plan.buildPlan(Object.assign(eff(), { budget: Infinity }), DATA, prices, seed, 120) : { error: 1 };
        if (probe.error) body = `<p class="warn">${t.noRecipes}</p>`;
        else {
          minBudget = probe.minBudget;
          if (!profile.budget || profile.budget < minBudget) { profile.budget = Math.ceil((minBudget * 1.25) / 10) * 10; save(); }
          body = budgetDial();
          canNext = true;
        }
      }
    }
    if (profile[key] != null && !['likes', 'body', 'budget', 'city', 'family'].includes(key)) canNext = true;
    const last = step === STEPS.length;
    const segs = STEPS.map((_, i) => `<i class="${i < step - 1 ? 'done' : i === step - 1 ? 'now' : ''}"></i>`).join('');
    return `<section class="q">
      <div class="progress"><button class="back" data-act="back" aria-label="${t.back}"><span class="arrow">→</span></button><span class="stepno"><b>${String(step).padStart(2, '0')}</b>/${STEPS.length}</span><span class="segs">${segs}</span></div>
      <h1 class="qt">${title(ttl)}</h1>${desc ? `<p class="sub">${desc}</p>` : ''}
      <div class="opts">${body}</div>
      <div class="sticky"><button class="cta" data-act="next" ${canNext ? '' : 'disabled'}><span>${last ? t.see : t.next}</span><span class="cta-arrow arrow">←</span></button></div>
    </section>`;
  }

  function initWheels() {
    document.querySelectorAll('.wheel').forEach((w) => {
      const f = w.dataset.wheel, min = Number(w.dataset.min);
      const items = w.querySelectorAll('li');
      const mark = () => { const i = Math.round(w.scrollTop / WHEEL_H); items.forEach((li, j) => li.classList.toggle('sel', j === i)); return i; };
      w.scrollTop = (profile[f] - min) * WHEEL_H; mark();
      let timer;
      w.addEventListener('scroll', () => { mark(); clearTimeout(timer); timer = setTimeout(() => { profile[f] = min + mark(); profile.budget = null; save(); }, 120); });
      w.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) w.scrollTo({ top: [...items].indexOf(li) * WHEEL_H, behavior: 'smooth' }); });
    });
  }

  // ---------- Résultat ----------
  // Le calcul ne compte les autres personnes que si « pour ma famille » est choisi.
  const eff = () => Object.assign({}, profile, { members: profile.family ? profile.members : [] });
  const persons = () => 1 + (profile.family ? profile.members.length : 0);

  // Prix du premier magasin, limités aux ingrédients vendus dans TOUS les magasins choisis,
  // pour que la même semaine puisse être comparée partout.
  function planPrices() {
    const first = PRICES[profile.stores[0]] || {};
    const all = profile.stores.map((k) => PRICES[k]).filter(Boolean);
    const common = Object.fromEntries(Object.entries(first).filter(([id]) => all.every((p) => p[id])));
    const test = Plan.buildPlan(Object.assign(eff(), { budget: Infinity }), DATA, common, 1, 5);
    return test.error ? first : common;
  }
  function computePlan() {
    const base = Plan.buildPlan(eff(), DATA, planPrices(), seed, 300);
    return base.error ? base : withShop(base);
  }
  function withShop(base) {
    const sel = Object.fromEntries(profile.stores.map((k) => [k, PRICES[k]]));
    const comp = Plan.compareStores(base.days, DATA, sel);
    const shopKey = comp.find((c) => c.key === profile.shopStore) ? profile.shopStore : (comp[0] ? comp[0].key : profile.stores[0]);
    const days = Plan.repriceDays(base.days, DATA, PRICES[shopKey]);
    const shop = Plan.shopping(days, DATA, PRICES[shopKey]);
    return Object.assign({}, base, { days, comp, shopKey, shop, overBudget: shop.total > profile.budget });
  }

  function result() {
    if (profile.stores.some((k) => PRICES[k] === undefined)) { loadPrices(profile.stores).then(() => { plan = null; render(); }); return `<section class="q center"><div class="spinner"></div><p class="sub">${t.loading}</p></section>`; }
    if (!plan) plan = computePlan();
    if (plan.error) return `<section class="q"><p class="warn">${t.noRecipes}</p><button class="ghost" data-act="edit">${t.edit}</button></section>`;
    const n = plan.needs;
    const st = STORE[plan.shopKey];
    const head = `<section class="needs">
      <p class="chip on-dark">${t.yourDay}</p>${persons() > 1 ? `<p class="fam-chip">👪 ${t.forFamily} · ${persons()} ${t.people}</p>` : ''}
      <p class="kcal"><b data-count="${n.kcal}">${n.kcal.toLocaleString('he-IL')}</b> ${t.kcal}</p>
      <div class="macros">${[[n.p, t.prot, n.p * 4], [n.c, t.carbs, n.c * 4], [n.f, t.fat, n.f * 9]].map(([v, l, k]) =>
        `<span><b>${v} ${t.g}</b>${l}<span class="mbar"><i style="width:${Math.round((k / n.kcal) * 100)}%"></i></span></span>`).join('')}</div>
    </section>
    ${compareCard()}
    ${plan.overBudget ? `<p class="warn">${t.over}</p>` : ''}
    <div class="tabs"><button class="${tab === 'week' ? 'on' : ''}" data-tab="week">${t.week}</button><button class="${tab === 'list' ? 'on' : ''}" data-tab="list">${t.list} · ${nis(plan.shop.total)}</button></div>
    <p class="sub center small">${t.shopAt}${esc(name(DATA.chains[st.chain]))} · ${esc(st.name)}</p>`;
    return head + (tab === 'week' ? weekView() : listView()) +
      `<div class="row2 actions"><button class="ghost" data-act="redo">↻ ${t.redo}</button><button class="ghost" data-act="edit">${t.edit}</button></div>` + priceCard() + `<p class="fine">${t.disclaimer}<br>${t.photos}</p>`;
  }

  function compareCard() {
    if (plan.comp.length < 2) return '';
    const saving = plan.comp[plan.comp.length - 1].total - plan.comp[0].total;
    return `<section class="compare"><h3>${t.compare}</h3>
      ${plan.comp.map((c, i) => { const s = STORE[c.key]; return `<button class="cmp-row ${c.key === plan.shopKey ? 'on' : ''}" data-shop="${c.key}">
        ${chainBadge(s.chain, 'sm')}<span class="what"><b>${esc(name(DATA.chains[s.chain]))}</b><small>${esc(s.name)}</small></span>
        ${i === 0 ? `<span class="pill-ok">${t.cheapest}</span>` : ''}<span class="cost" data-count="${Math.round(c.total * 10) / 10}" data-dec="1" data-suf=" ₪">${nis(c.total)}</span>
        <span class="cbar"><i style="width:${Math.round((c.total / plan.comp[plan.comp.length - 1].total) * 100)}%"></i></span></button>`; }).join('')}
      ${saving >= 1 ? `<p class="save">${t.saveWeek.replace('{n}', nis(saving))}</p>` : ''}
      <p class="sub small">${t.tapToSwitch}</p></section>`;
  }

  const qty = (k, g) => { const i = DATA.ingredientsById[k]; return i.unitG ? `${Math.max(1, Math.round((g / i.unitG) * 2) / 2)} ${t.pcs}` : `${g} ${t.g}`; };

  function weekView() {
    return `<p class="sub center">${plan.protein} % ${t.proteinOk}</p>` + plan.days.map((day, di) => `
      <section class="day"><h2>${t.days[di]}</h2>
      ${day.meals.map((m, mi) => `<article class="meal">
        ${RECIPE[m.id] && RECIPE[m.id].img ? `<div class="meal-img"><img loading="lazy" src="${img(RECIPE[m.id].img, 640, 300)}" alt=""><span class="slot">${t['slot_' + m.slot]}</span><span class="type ${m.type}">${t[m.type]}</span></div>` : ''}
        <div class="pad">
        <h3>${esc(name(m))}</h3>
        <p class="meta">${m.min} ${t.min} · ${m.kcal} ${t.kcal} · ${m.p} ${t.g} ${t.prot} · <b>${nis(m.cost)}</b></p>
        ${persons() > 1 ? `<p class="ing-h">${t.familyQty}</p>` : ''}
        <ul class="ing">${Object.entries(m.ing).map(([k, g]) => `<li>${esc(name(DATA.ingredientsById[k]))} <b>${qty(k, g)}</b></li>`).join('')}</ul>
        ${persons() > 1 && m.mine ? `<p class="mine">${t.yourPortion} ${Object.entries(m.mine).map(([k, g]) => `${esc(name(DATA.ingredientsById[k]))} ${qty(k, g)}`).join(' · ')}</p>` : ''}
        <button class="swap" data-swap="${di},${mi}">⇄ ${t.swap}</button></div>
      </article>`).join('')}</section>`).join('');
  }

  function listView() {
    const ticked = store.get('ticked', {});
    let html = '', aisle = null;
    for (const l of plan.shop.lines) {
      if (l.aisle !== aisle) { if (aisle) html += '</ul>'; aisle = l.aisle; html += `<h3 class="aisle">${t['aisle_' + aisle]}</h3><ul class="shop">`; }
      const qty = l.weighted ? `${(l.buy / 1000).toLocaleString('he-IL')} ${t.kg}` : `${l.packs} ${t.packs} × ${l.packG} ${t.g}`;
      html += `<li class="${ticked[l.id] ? 'done' : ''}"><label><input type="checkbox" data-tick="${l.id}" ${ticked[l.id] ? 'checked' : ''}>
        <span class="what"><b>${esc(name(l))}</b><small>${esc(l.product)}</small></span>
        <span class="qty">${qty}</span><span class="cost">${nis(l.cost)}</span></label></li>`;
    }
    html += '</ul>';
    return `<section class="list">${html}
      <div class="totals"><p><span>${t.total}</span><b>${nis(plan.shop.total)}</b></p>
      <p class="sub">${t.eaten} : ${nis(plan.shop.eaten)} — ${t.leftover}</p><p class="sub">${t.pantry}</p></div></section>`;
  }

  // ---------- Affichage et clics ----------
  function render() {
    document.body.classList.toggle('in-q', step > 0 && step <= STEPS.length);
    app.innerHTML = step === 0 ? home() : step > STEPS.length ? result() : question();
    initWheels();
  }
  // Les animations ne jouent qu'en changeant d'écran, pas à chaque toucher.
  let enterTimer;
  function go(n) {
    step = n; app.classList.add('enter'); render(); window.scrollTo(0, 0); countUp();
    clearTimeout(enterTimer); enterTimer = setTimeout(() => app.classList.remove('enter'), 1600);
  }
  // chiffres qui défilent jusqu'à leur valeur (calories, prix)
  function countUp() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    app.querySelectorAll('[data-count]').forEach((el) => {
      const to = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), suf = el.dataset.suf || '';
      const t0 = performance.now(), dur = Number(el.dataset.dur || 1100);
      const f = (now) => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = (to * e).toLocaleString('he-IL', { maximumFractionDigits: dec, minimumFractionDigits: 0 }) + suf; if (k < 1) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    });
  }

  // Écran de calcul : anneau qui se remplit et étapes cochées une à une.
  function computing() {
    const items = [t.calc1, t.calc2.replace('{n}', profile.stores.length), t.calc3.replace('{n}', profile.meals), t.calc4];
    app.innerHTML = `<section class="calc"><svg viewBox="0 0 150 150" aria-hidden="true"><circle class="track" cx="75" cy="75" r="64"/><circle class="arc" cx="75" cy="75" r="64"/></svg>
      <p class="pct" data-count="100" data-dur="2300" data-suf="%">0%</p><h2>${t.computing}</h2>
      <ul>${items.map((x, i) => `<li style="animation-delay:${0.35 + i * 0.5}s"><b>✓</b>${esc(x)}</li>`).join('')}</ul></section>`;
    window.scrollTo(0, 0); countUp();
    const t0 = Date.now();
    loadPrices(profile.stores).then(() => {
      plan = null; plan = computePlan();
      setTimeout(() => go(STEPS.length + 1), Math.max(0, 2500 - (Date.now() - t0)));
    });
  }

  app.addEventListener('input', (e) => {
    if (e.target.id !== 'city') return;
    cityQuery = e.target.value;
    document.getElementById('city-results').innerHTML = cityButtons(searchCities(cityQuery));
  });

  app.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.city) {
      profile.city = b.dataset.city; cityQuery = '';
      profile.stores = defaultStores(nearbyStores(profile.city)); profile.budget = null; profile.shopStore = null; save(); render(); return;
    }
    if (b.dataset.store) {
      const k = b.dataset.store;
      profile.stores = profile.stores.includes(k) ? profile.stores.filter((x) => x !== k) : profile.stores.concat(k);
      profile.budget = null; save(); render(); return;
    }
    if (b.dataset.shop) { profile.shopStore = b.dataset.shop; save(); const y = window.scrollY; plan = withShop(plan); render(); window.scrollTo(0, y); return; }
    if (b.dataset.set) {
      const raw = b.dataset.val;
      profile[b.dataset.set] = b.dataset.num ? Number(raw) : raw === 'true' ? true : raw === 'false' ? false : raw;
      if (b.dataset.set === 'family') profile.budget = null;
      if (b.dataset.set === 'diet' || b.dataset.set === 'meals') profile.budget = null;
      save();
      if (['goal', 'sex'].includes(b.dataset.set)) setTimeout(() => go(step + 1), 180);
      render();
      return;
    }
    if (b.dataset.like) {
      profile.likes = Object.assign({}, profile.likes, { [Plan.TAGS[likeIdx]]: b.dataset.like === '1' });
      save(); likeIdx++; render(); const cl = app.querySelector('.card-like'); if (cl) cl.classList.add('next'); return;
    }
    if (b.dataset.add) {
      profile.members.push(b.dataset.add === 'child' ? { type: 'child', age: 8 } : { type: 'adult', sex: profile.sex === 'f' ? 'm' : 'f', age: 35, height: 168, weight: 68 });
      profile.budget = null; save(); render(); return;
    }
    if (b.dataset.del) { profile.members.splice(Number(b.dataset.del), 1); profile.budget = null; save(); render(); return; }
    if (b.dataset.mstep) {
      const m = profile.members[Number(b.dataset.mstep)];
      m.age = Math.min(17, Math.max(1, m.age + Number(b.dataset.d))); profile.budget = null; save(); render(); return;
    }
    if (b.dataset.msex) { profile.members[Number(b.dataset.msex)].sex = b.dataset.v; profile.budget = null; save(); render(); return; }
    if (b.dataset.bud) {
      profile.budget = Math.max(50, profile.budget + Number(b.dataset.bud)); save();
      const dial = document.querySelector('.dial'); if (dial) { dial.outerHTML = budgetDial().split('<div class="pmrow">')[0]; }
      document.getElementById('permeal').textContent = `≈ ${nis(profile.budget / profile.meals / persons())} ${persons() > 1 ? t.perPerson : t.perMeal}`;
      return;
    }
    if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
    if (b.dataset.swap) {
      const [di, mi] = b.dataset.swap.split(',').map(Number);
      const y = window.scrollY;
      plan = withShop(Plan.swapMeal(plan, eff(), DATA, planPrices(), di, mi, Date.now() & 0xffff));
      render(); window.scrollTo(0, y); return;
    }
    const act = b.dataset.act;
    if (act === 'start') { likeIdx = 0; go(1); }
    else if (act === 'mine') go(STEPS.length + 1);
    else if (act === 'back') { if (STEPS[step - 1] === 'likes' && likeIdx > 0) { likeIdx--; render(); } else go(step - 1); }
    else if (act === 'next') { if (step === STEPS.length) computing(); else { if (STEPS[step] === 'likes') likeIdx = 0; go(step + 1); } }
    else if (act === 'redo') { seed++; store.set('seed', seed); store.set('ticked', {}); computing(); }
    else if (act === 'edit') go(1);
  });

  app.addEventListener('change', (e) => {
    if (e.target.dataset.member) {
      const m = profile.members[Number(e.target.dataset.member)], v = Number(e.target.value);
      if (m && v > 0) { m[e.target.dataset.mf] = v; profile.budget = null; save(); render(); }
      return;
    }
    const tick = e.target.dataset.tick;
    if (tick) { const tk = store.get('ticked', {}); tk[tick] = e.target.checked; store.set('ticked', tk); e.target.closest('li').classList.toggle('done', e.target.checked); }
  });

  setLang(lang);
  go(0);
})();
