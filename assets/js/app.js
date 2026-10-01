/**
 * app.js — shell da aplicação: estado global, roteamento por hash,
 * seletor global de período, navegação lateral e delegação de eventos.
 *
 * Rotas:
 *   #/                     Visão Geral
 *   #/centros              Índice de centros de custo
 *   #/centros/:id?cat=     Dashboard do centro (cat abre o drawer da categoria)
 *   #/pot                  Planejamento Orçamentário
 *   #/cmp/:AAAA-MM         Carta Mensal de Planejamento
 *   #/lancamentos?q=&centro=&cat=   Lançamentos (filtros pré-aplicados por URL)
 *   #/configuracoes, #/perfil
 *
 * Dependências: Fin (core.js), UI (ui.js), Pages (pages.js).
 */
(function () {
  'use strict';

  const F = window.Fin;
  const U = window.UI;
  const P = window.Pages;
  const PREF_KEY = 'potcmp.prefs.v1';

  /** Lê preferências do usuário (período, ordenações). Falha silenciosa em modo privado. */
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) { return {}; }
  }

  const prefs = loadPrefs();
  const state = {
    // Padrão: trimestre corrente do dataset (Q3 2026 — último trimestre fechado)
    period: F.parsePeriodKey(prefs.period) || { kind: 'quarter', year: F.D.meta.year, quarter: F.D.meta.currentQuarter },
    centerSort: prefs.centerSort || 'default',
    catSort: prefs.catSort || 'realized',
    catQuery: '',
    potMode: prefs.potMode || 'manager',
    potOpen: new Set(),
    potQ: '', potCenter: '', potStatus: '',
    potSort: { key: 'date', dir: 'asc' },
    txf: { q: '', center: '', cat: '', type: '', status: '', range: '' },
    txSort: { key: 'date', dir: 'desc' },
    txLimit: 60,
  };

  /** Persiste preferências leves (não dados de negócio). */
  function save() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ period: F.periodKey(state.period), centerSort: state.centerSort, catSort: state.catSort, potMode: state.potMode }));
    } catch (e) { /* armazenamento indisponível */ }
  }

  /**
   * Altera o período global e re-renderiza a tela atual.
   * @param {Period} p
   * @param {boolean} [silent] - apenas atualiza o estado (a navegação seguinte renderiza)
   */
  function setPeriod(p, silent) {
    state.period = p;
    save();
    if (!silent) render();
  }

  /* ------------------------------------------------------------------ */
  /* Seletor de período (topbar)                                         */
  /* ------------------------------------------------------------------ */

  function periodSelector() {
    const p = state.period;
    // Rótulo curto (Tri) usado no mobile para o seletor caber em uma linha
    const kinds = [['month', 'Mês', 'Mês'], ['quarter', 'Trimestre', 'Tri'], ['year', 'Ano', 'Ano']];
    const opts = F.periodOptions(p.kind).map((o) => ({ value: F.periodKey(o), label: F.periodLabel(o) }));
    return `<div class="period" role="group" aria-label="Período de análise">
      <div class="seg">${kinds.map(([k, l, s]) => `<button data-kind="${k}" aria-pressed="${p.kind === k}" aria-label="${l}"><span class="long">${l}</span><span class="short">${s}</span></button>`).join('')}</div>
      ${U.select('period-select', opts, F.periodKey(p), { label: 'Selecionar período' })}
    </div>`;
  }

  /**
   * Ao trocar o tipo de período, escolhe um equivalente coerente:
   * trimestre → último mês do trimestre; mês → trimestre que o contém.
   */
  function switchKind(kind) {
    const p = state.period;
    const months = F.periodMonths(p);
    const last = months[months.length - 1] || F.lastMonth;
    const m = Number(last.slice(5));
    if (kind === 'month') setPeriod({ kind: 'month', year: p.year, month: Math.min(m, Number(F.lastMonth.slice(5))) });
    else if (kind === 'quarter') setPeriod({ kind: 'quarter', year: p.year, quarter: Math.ceil((p.kind === 'month' ? p.month : m) / 3) });
    else setPeriod({ kind: 'year', year: p.year });
  }

  /* ------------------------------------------------------------------ */
  /* Roteamento                                                          */
  /* ------------------------------------------------------------------ */

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    return { parts, query };
  }

  let lastPath = null;

  /** Renderiza a rota atual dentro de #view. */
  function render() {
    const { parts, query } = parseHash();
    const ctx = { state, save, render, setPeriod };
    const [a, b] = parts;
    let page, navKey;
    if (!a || a === 'visao-geral') { page = P.overview(ctx); navKey = 'overview'; }
    else if (a === 'centros' && !b) { page = P.centersIndex(ctx); navKey = 'centers'; }
    else if (a === 'centros') { page = P.centerPage(ctx, b); navKey = 'centers'; }
    else if (a === 'pot') { page = P.potPage(ctx); navKey = 'pot'; }
    else if (a === 'cmp') { page = P.cmpPage(ctx, b); navKey = 'cmp'; }
    else if (a === 'lancamentos') { page = P.txPage(ctx, query); navKey = 'tx'; }
    else if (a === 'configuracoes') { page = P.settingsPage(ctx); navKey = 'settings'; }
    else if (a === 'perfil') { page = P.profilePage(ctx); navKey = 'profile'; }
    else { page = P.notFound(); navKey = ''; }

    document.querySelectorAll('[data-navkey]').forEach((el) => {
      if (el.dataset.navkey === navKey) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    document.title = `${page.title} · Painel Financeiro JR ADM UFBA`;

    const crumbs = [['Empresa JR', '#/'], ...page.crumbs];
    document.getElementById('crumbs').innerHTML = crumbs.map(([l, h], i) => (i === crumbs.length - 1
      ? `<span class="cur label">${F.esc(l)}</span>`
      : `<a class="label" href="${h || '#/'}">${F.esc(l)}</a><span class="sep label">/</span>`)).join('');

    const ps = document.getElementById('period-slot');
    ps.innerHTML = page.hidePeriod ? '' : periodSelector();

    // Recria o contêiner a cada render: as páginas ligam listeners em #view e,
    // sem isso, eles se acumulariam entre navegações (cliques disparando 2×).
    const old = document.getElementById('view');
    const view = old.cloneNode(false);
    old.replaceWith(view);
    U.closeDrawer();
    view.innerHTML = page.html;
    if (page.mount) page.mount(view, query);

    const pathKey = parts.join('/');
    if (pathKey !== lastPath) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
    lastPath = pathKey;
    closeSidebar();
  }

  /* ------------------------------------------------------------------ */
  /* Sidebar mobile                                                      */
  /* ------------------------------------------------------------------ */
  function openSidebar() {
    document.querySelector('.sidebar').classList.add('open');
    let s = document.querySelector('.scrim.sb');
    if (!s) { s = document.createElement('div'); s.className = 'scrim sb'; s.style.zIndex = 35; document.body.appendChild(s); s.addEventListener('click', closeSidebar); }
    requestAnimationFrame(() => s.classList.add('show'));
    document.getElementById('menu-btn').setAttribute('aria-expanded', 'true');
  }
  function closeSidebar() {
    document.querySelector('.sidebar').classList.remove('open');
    const s = document.querySelector('.scrim.sb');
    if (s) { s.classList.remove('show'); setTimeout(() => s.remove(), 250); }
    const b = document.getElementById('menu-btn'); if (b) b.setAttribute('aria-expanded', 'false');
  }

  /* ------------------------------------------------------------------ */
  /* Eventos globais                                                     */
  /* ------------------------------------------------------------------ */
  document.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kind]');
    if (k && k.closest('#period-slot')) { switchKind(k.dataset.kind); return; }
    // Elementos não-link clicáveis (cards, barras, donut) navegam via data-nav
    const nav = e.target.closest('[data-nav]');
    if (nav && !e.target.closest('a, button:not([data-nav])')) { location.hash = nav.dataset.nav; }
  });
  document.addEventListener('keydown', (e) => {
    const nav = e.target.closest && e.target.closest('[data-nav]');
    if (nav && (e.key === 'Enter' || e.key === ' ') && e.target === nav) { e.preventDefault(); location.hash = nav.dataset.nav; }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'period-select') { const p = F.parsePeriodKey(e.target.value); if (p) setPeriod(p); }
  });
  document.getElementById('menu-btn').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
  });

  window.addEventListener('hashchange', render);
  render();
})();
