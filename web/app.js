// Interface : accueil → 10 questions → semaine + liste de courses.
(function () {
  'use strict';
  const TEST_MODE = true;   // tant que le paiement n'existe pas : tout est gratuit
  const PRICE = 39;         // ₪ par mois

  const DATA = Plan.prepare(window.DATA);
  const app = document.getElementById('app');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* navigation privée */ } },
  };

  let lang = store.get('lang', 'he');
  let t = T[lang];
  const defaults = { goal: null, store: null, meals: 21, diet: 'all', sessions: '3-4', job: 'sit', likes: {}, age: 25, height: 175, weight: 75, sex: null, budget: null };
  let profile = Object.assign({}, defaults, store.get('profile', {}));
  let step = 0;
  let plan = null;
  let seed = store.get('seed', 1);
  let tab = 'week';
  let likeIdx = 0;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nis = (n) => `${(Math.round(n * 10) / 10).toLocaleString('he-IL')} ₪`;
  const name = (x) => (lang === 'he' ? x.he : x.fr);

  function setLang(l) {
    lang = l; t = T[l]; store.set('lang', l);
    document.documentElement.lang = l; document.documentElement.dir = t.dir;
    document.getElementById('lang').textContent = t.other;
    document.getElementById('brand').textContent = T.he.brand;
    render();
  }
  document.getElementById('lang').onclick = () => setLang(lang === 'he' ? 'fr' : 'he');
  document.querySelector('[data-go="home"]').onclick = (e) => { e.preventDefault(); step = 0; plan = null; render(); };

  const prices = () => DATA.prices[profile.store] || {};

  // ---------- Accueil ----------
  function home() {
    const hasPlan = profile.goal && profile.store && profile.sex && profile.budget;
    return `
    <section class="hero">
      <p class="chip">${t.tag}</p>
      <h1>${t.hero1}<br><em>${t.hero2}</em></h1>
      <p class="sub">${t.heroSub}</p>
      <button class="cta" data-act="start">${t.start} <span class="arrow">←</span></button>
      ${hasPlan ? `<button class="ghost" data-act="mine">${t.see}</button>` : ''}
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
    <p class="fine">${t.disclaimer}</p>`;
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
  const STEPS = ['goal', 'store', 'meals', 'diet', 'train', 'likes', 'body', 'sex', 'budget'];
  const opt = (field, value, label, desc) =>
    `<button class="opt ${profile[field] === value ? 'on' : ''}" data-set="${field}" data-val="${esc(value)}"><span>${label}</span>${desc ? `<small>${desc}</small>` : ''}</button>`;

  function question() {
    const key = STEPS[step - 1];
    let body = '', title = '', desc = '', canNext = false;
    if (key === 'goal') {
      title = t.q_goal; desc = t.q_goal_d;
      body = ['lose', 'gain', 'fit'].map((g) => opt('goal', g, t['goal_' + g])).join('');
    } else if (key === 'store') {
      title = t.q_store; desc = t.q_store_d;
      body = DATA.stores.map((s) => opt('store', s.key, s.city, s.name)).join('');
    } else if (key === 'meals') {
      title = t.q_meals; desc = t.q_meals_d;
      body = [7, 14, 21].map((m) => `<button class="opt big ${profile.meals === m ? 'on' : ''}" data-set="meals" data-val="${m}" data-num="1"><b>${m}</b><small>${t['m' + m]}</small></button>`).join('');
      canNext = true;
    } else if (key === 'diet') {
      title = t.q_diet; desc = t.q_diet_d;
      body = opt('diet', 'all', t.diet_all) + opt('diet', 'kosher', t.diet_kosher, t.diet_kosher_d) + opt('diet', 'vegetarian', t.diet_vegetarian) + opt('diet', 'vegan', t.diet_vegan);
      canNext = true;
    } else if (key === 'train') {
      title = t.q_train; desc = t.q_train_d;
      body = `<div class="row4">${[['0', t.s0], ['1-2', t.s12], ['3-4', t.s34], ['5+', t.s5]].map(([v, l]) =>
        `<button class="opt small ${profile.sessions === v ? 'on' : ''}" data-set="sessions" data-val="${v}"><b>${v}</b><small>${l}</small></button>`).join('')}</div>
        <h3 class="mini">${t.q_job}</h3>
        <div class="row3">${['sit', 'stand', 'physical'].map((j) => opt('job', j, t['job_' + j])).join('')}</div>`;
      canNext = true;
    } else if (key === 'likes') {
      title = t.q_likes; desc = t.q_likes_d;
      const tag = Plan.TAGS[likeIdx];
      if (tag) {
        const [h, d] = t['like_' + tag];
        body = `<div class="card-like"><p class="count">${likeIdx + 1} / ${Plan.TAGS.length}</p><h3>${h}</h3><p>${d}</p>
          <div class="row2"><button class="no" data-like="0">✕ ${t.no}</button><button class="yes" data-like="1">✓ ${t.yes}</button></div></div>`;
      } else { body = `<p class="sub">✓</p>`; canNext = true; }
    } else if (key === 'body') {
      title = t.q_body;
      const field = (f, min, max) => `<label class="num"><span>${t[f]}</span><input type="number" inputmode="numeric" min="${min}" max="${max}" data-num-field="${f}" value="${profile[f]}"></label>`;
      body = `<div class="row3">${field('age', 16, 90)}${field('height', 140, 210)}${field('weight', 40, 180)}</div>`;
      canNext = true;
    } else if (key === 'sex') {
      title = t.q_sex; desc = t.q_sex_d;
      body = `<div class="row2">${opt('sex', 'm', t.male)}${opt('sex', 'f', t.female)}</div>`;
    } else if (key === 'budget') {
      title = t.q_budget; desc = t.q_budget_d;
      const probe = Plan.buildPlan(Object.assign({}, profile, { budget: Infinity }), DATA, prices(), seed, 120);
      if (probe.error) { body = `<p class="warn">${t.noRecipes}</p>`; }
      else {
        if (!profile.budget || profile.budget < probe.minBudget) { profile.budget = Math.ceil((probe.minBudget * 1.25) / 10) * 10; store.set('profile', profile); }
        body = `<div class="budget">
          <button class="pm" data-bud="-10">−</button>
          <p><b id="bud">${profile.budget}</b><span>${t.perWeek}</span><small id="permeal">≈ ${nis(profile.budget / profile.meals)} ${t.perMeal}</small></p>
          <button class="pm" data-bud="10">+</button></div>
          <p class="sub">${t.minBudget} <b>${probe.minBudget} ₪</b></p>`;
        canNext = true;
      }
    }
    if (profile[key] != null && !['likes', 'body', 'budget'].includes(key)) canNext = true;
    const last = step === STEPS.length;
    return `<section class="q">
      <div class="progress"><button class="back" data-act="back"><span class="arrow">→</span> ${t.back}</button><span>${String(step).padStart(2, '0')} ${t.of} ${STEPS.length}</span></div>
      <div class="bar"><i style="width:${(step / STEPS.length) * 100}%"></i></div>
      <h1>${title}</h1>${desc ? `<p class="sub">${desc}</p>` : ''}
      <div class="opts">${body}</div>
      <button class="cta" data-act="next" ${canNext ? '' : 'disabled'}>${last ? t.see : t.next} <span class="arrow">←</span></button>
    </section>`;
  }

  // ---------- Résultat ----------
  function result() {
    if (!plan) plan = Plan.buildPlan(profile, DATA, prices(), seed, 300);
    if (plan.error) return `<section class="q"><p class="warn">${t.noRecipes}</p><button class="ghost" data-act="edit">${t.edit}</button></section>`;
    const n = plan.needs;
    const st = DATA.stores.find((s) => s.key === profile.store);
    const d = st && st.date && st.date.length === 8 ? `${st.date.slice(6)}/${st.date.slice(4, 6)}/${st.date.slice(0, 4)}` : '';
    const head = `<section class="needs">
      <p class="chip">${t.yourDay}</p>
      <p class="kcal"><b>${n.kcal.toLocaleString('he-IL')}</b> ${t.kcal}</p>
      <div class="macros"><span><b>${n.p} ${t.g}</b>${t.prot}</span><span><b>${n.c} ${t.g}</b>${t.carbs}</span><span><b>${n.f} ${t.g}</b>${t.fat}</span></div>
      <p class="sub">${t.pricesFrom}${lang === 'he' ? '' : ' '}${esc(st ? st.name : '')}${d ? ` · ${t.updated} ${d}` : ''}</p>
    </section>
    ${plan.overBudget ? `<p class="warn">${t.over}</p>` : ''}
    <div class="tabs"><button class="${tab === 'week' ? 'on' : ''}" data-tab="week">${t.week}</button><button class="${tab === 'list' ? 'on' : ''}" data-tab="list">${t.list} · ${nis(plan.shop.total)}</button></div>`;
    const body = tab === 'week' ? weekView() : listView();
    return head + body + `<div class="row2 actions"><button class="ghost" data-act="redo">↻ ${t.redo}</button><button class="ghost" data-act="edit">${t.edit}</button></div>` + priceCard() + `<p class="fine">${t.disclaimer}</p>`;
  }

  function weekView() {
    return `<p class="sub center">${plan.protein} % ${t.proteinOk}</p>` + plan.days.map((day, di) => `
      <section class="day"><h2>${t.days[di]}</h2>
      ${day.meals.map((m, mi) => `<article class="meal">
        <div class="meal-top"><span class="slot">${t['slot_' + m.slot]}</span><span class="type ${m.type}">${t[m.type]}</span></div>
        <h3>${esc(name(m))}</h3>
        <p class="meta">${m.min} ${t.min} · ${m.kcal} ${t.kcal} · ${m.p} ${t.g} ${t.prot} · ${nis(m.cost)}</p>
        <ul class="ing">${Object.entries(m.ing).map(([k, g]) => { const i = DATA.ingredientsById[k]; return `<li>${esc(name(i))} <b>${i.unitG ? `${Math.max(1, Math.round((g / i.unitG) * 2) / 2)} ${t.pcs}` : `${g} ${t.g}`}</b></li>`; }).join('')}</ul>
        <button class="swap" data-swap="${di},${mi}">⇄ ${t.swap}</button>
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
    app.innerHTML = step === 0 ? home() : step > STEPS.length ? result() : question();
    window.scrollTo(0, 0);
  }

  function computing() {
    app.innerHTML = `<section class="q center"><div class="spinner"></div><p class="sub">${t.computing}</p></section>`;
    setTimeout(() => { plan = null; step = STEPS.length + 1; render(); }, 50);
  }

  app.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.set) {
      const v = b.dataset.num ? Number(b.dataset.val) : b.dataset.val;
      profile[b.dataset.set] = v; store.set('profile', profile);
      if (b.dataset.set === 'store' || b.dataset.set === 'diet' || b.dataset.set === 'meals') profile.budget = null;
      const auto = ['goal', 'store', 'sex'].includes(b.dataset.set);
      if (auto) { step++; } render(); return;
    }
    if (b.dataset.like) {
      profile.likes = Object.assign({}, profile.likes, { [Plan.TAGS[likeIdx]]: b.dataset.like === '1' });
      store.set('profile', profile); likeIdx++; render(); return;
    }
    if (b.dataset.bud) {
      profile.budget = Math.max(50, profile.budget + Number(b.dataset.bud)); store.set('profile', profile);
      document.getElementById('bud').textContent = profile.budget;
      document.getElementById('permeal').textContent = `≈ ${nis(profile.budget / profile.meals)} ${t.perMeal}`;
      return;
    }
    if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
    if (b.dataset.swap) {
      const [di, mi] = b.dataset.swap.split(',').map(Number);
      plan = Plan.swapMeal(plan, profile, DATA, prices(), di, mi, Date.now() & 0xffff);
      const y = window.scrollY; render(); window.scrollTo(0, y); return;
    }
    const act = b.dataset.act;
    if (act === 'start') { step = 1; likeIdx = 0; render(); }
    else if (act === 'mine') { step = STEPS.length + 1; render(); }
    else if (act === 'back') { if (STEPS[step - 1] === 'likes' && likeIdx > 0) likeIdx--; else step--; render(); }
    else if (act === 'next') { if (step === STEPS.length) computing(); else { step++; if (STEPS[step - 1] === 'likes') likeIdx = 0; render(); } }
    else if (act === 'redo') { seed++; store.set('seed', seed); store.set('ticked', {}); computing(); }
    else if (act === 'edit') { step = 1; render(); }
  });

  app.addEventListener('change', (e) => {
    const f = e.target.dataset.numField;
    if (f) { const v = Number(e.target.value); if (v > 0) { profile[f] = v; profile.budget = null; store.set('profile', profile); } }
    const tick = e.target.dataset.tick;
    if (tick) { const tk = store.get('ticked', {}); tk[tick] = e.target.checked; store.set('ticked', tk); e.target.closest('li').classList.toggle('done', e.target.checked); }
  });

  setLang(lang);
})();
