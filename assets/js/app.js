/**
 * app.js — shell da aplicação: carga das planilhas, estado global,
 * roteamento por hash, seletor global de período e navegação lateral.
 *
 * Rotas:
 *   #/                     Visão Geral
 *   #/centros              Índice de centros de custo
 *   #/centros/:id?cat=     Dashboard do centro (cat abre o drawer da categoria)
 *   #/pot                  Planejamento Orçamentário
 *   #/pot/construir?q=AAAA-T   Construtor do orçamento (escreve na planilha)
 *   #/cmp/:AAAA-MM         Carta Mensal de Planejamento
 *   #/indicadores          Indicadores financeiros (aba Operações)
 *   #/lancamentos?q=&centro=&cat=   Lançamentos (filtros pré-aplicados por URL)
 *   #/configuracoes, #/perfil
 *
 * Expõe window.App = { sync, reload } para as telas.
 * Dependências: Fin, UI, Sheets, Pages.
 */
(function () {
  'use strict';

  const F = window.Fin;
  const U = window.UI;
  const P = window.Pages;
  const S = window.Sheets;
  const CFG = window.PAINEL_CONFIG;
  // v2: preferências da versão com dados fictícios não se aplicam aos dados reais
  const PREF_KEY = 'potcmp.prefs.v2';

  /** Lê preferências do usuário (período, ordenações). Falha silenciosa em modo privado. */
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) { return {}; }
  }

  const prefs = loadPrefs();
  const state = {
    period: null, // definido após a primeira leitura (depende dos meses existentes na planilha)
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

  /** Estado da sincronização com as planilhas (lido pelas telas via App.sync). */
  const sync = { indicators: null, status: null, loading: false };

  /** Persiste preferências leves (não dados de negócio). */
  function save() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ period: state.period && F.periodKey(state.period), centerSort: state.centerSort, catSort: state.catSort, potMode: state.potMode }));
    } catch (e) { /* armazenamento indisponível */ }
  }

  /**
   * Altera o período global e re-renderiza a tela atual.
   * @param {Period} p
   * @param {boolean} [silent] - apenas atualiza o estado (a navegação seguinte renderiza)
   */
  function setPeriod(p, silent) {
    state.period = p;
    pp.open = false; // escolher um período sempre fecha o painel do seletor
    save();
    if (!silent) render();
  }

  /* ------------------------------------------------------------------ */
  /* Carga e atualização automática                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Lê as planilhas e re-renderiza.
   * @param {boolean} [manual] - acionado pelo usuário (mostra confirmação)
   * @param {boolean} [onlyIfChanged] - atualização automática: só redesenha se os dados mudaram,
   *                                    para não interromper quem está lendo/digitando
   */
  async function reload(manual, onlyIfChanged) {
    if (sync.loading) return;
    sync.loading = true;
    setSyncBadge('loading');
    try {
      const res = await S.load();
      const changed = !sync.status || res.status.signature !== sync.status.signature;
      sync.indicators = res.indicators;
      sync.status = res.status;
      if (changed || !onlyIfChanged) {
        F.init(res.data);
        if (!state.period) state.period = validPeriod(F.parsePeriodKey(prefs.period)) || currentQuarter();
        const y = window.scrollY;
        render(true);
        if (onlyIfChanged || manual) window.scrollTo(0, y);
      }
      setSyncBadge(res.status.pot === 'live' ? 'live' : 'cache');
      if (manual) U.toast(changed ? 'Dados atualizados da planilha.' : 'Tudo em dia com a planilha.');
    } catch (e) {
      setSyncBadge('error');
      if (!F.D.items.length) showFatal(e);
      else if (manual) U.toast(`Não foi possível atualizar: ${e.message}`);
    } finally {
      sync.loading = false;
    }
  }

  function currentQuarter() {
    return { kind: 'quarter', year: F.D.meta.year, quarter: F.D.meta.currentQuarter };
  }

  /** Descarta um período salvo que não exista mais na planilha. */
  function validPeriod(p) {
    if (!p) return null;
    return F.periodMonths(p).some((m) => F.dataMonths.includes(m)) ? p : null;
  }

  /** Indicador de sincronização no rodapé da sidebar. */
  function setSyncBadge(kind) {
    const el = document.getElementById('sync');
    if (!el) return;
    const st = sync.status || {};
    const t = st.loadedAt ? new Date(st.loadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const map = {
      loading: ['idle', 'Sincronizando…'],
      live: ['ok', `Planilha ao vivo · ${t}`],
      cache: ['warn', 'Cópia local · sem conexão'],
      error: ['over', 'Planilha indisponível'],
    };
    const [tone, label] = map[kind];
    el.innerHTML = `<span class="sync-dot tone-${tone}"></span><span>${label}</span>`;
    el.title = kind === 'live' ? 'Dados lidos do Google Sheets. Clique para atualizar.' : 'Clique para tentar atualizar.';
  }

  /** Tela de erro quando nem a planilha nem a cópia local estão disponíveis. */
  function showFatal(e) {
    const view = document.getElementById('view');
    const denied = e.code === 'denied' || e.code === 'network';
    view.innerHTML = `<div class="panel notice" style="max-width:720px;margin:10vh auto 0">
      <span class="label tone-over">Sem dados</span>
      <h1 class="h2" style="margin:12px 0 16px">Não foi possível ler a planilha do POT</h1>
      <p class="body-sm">${denied ? 'Confira se a planilha está compartilhada como <strong class="text-cloud">Qualquer pessoa com o link — Leitor</strong> e se há conexão com a internet.' : F.esc(e.message)}</p>
      <div style="display:flex;gap:8px;margin-top:24px;flex-wrap:wrap">
        <button class="btn btn-primary" id="retry">Tentar de novo</button>
        <a class="btn btn-ghost" href="${CFG.pot.url}" target="_blank" rel="noopener">Abrir planilha</a>
      </div></div>`;
    view.querySelector('#retry').addEventListener('click', () => reload(true));
  }

  /* ------------------------------------------------------------------ */
  /* Seletor de período (topbar)                                         */
  /* ------------------------------------------------------------------ */

  /*
   * Seletor de período em painel (substitui os <select> nativos):
   *  [‹] [TRI  4º trimestre de 2026 ⌄] [›]
   * O painel tem abas Mês/Trimestre/Ano, navegação por ano e uma grade de
   * células; períodos sem nenhum mês na planilha ficam desabilitados.
   * `pp` guarda o que está sendo navegado no painel — só vira período de
   * verdade quando uma célula é clicada.
   */
  // multi/sel: modo "vários meses" da aba Mês — sel guarda os meses marcados ("AAAA-MM"),
  // inclusive de anos diferentes (a seleção sobrevive à troca de ano no painel).
  const pp = { open: false, kind: 'quarter', year: 0, multi: false, sel: [] };
  const KIND_TAG = { month: 'Mês', quarter: 'Tri', year: 'Ano', custom: 'Meses' };
  const MAX_COMPARE = 12; // colunas demais deixam a comparação ilegível

  /** Estamos na página de comparação? (o seletor passa a editar os meses comparados) */
  function onCompare() { return /^#\/comparar/.test(location.hash); }

  /** Meses comparados, lidos da URL (#/comparar?m=2026-01,2026-05). */
  function compareMonths() {
    const q = new URLSearchParams((location.hash.split('?')[1]) || '');
    return (q.get('m') || '').split(',').filter((m) => F.dataMonths.includes(m)).sort();
  }

  /** Abreviação "jan/26" usada no resumo da seleção. */
  function shortYm(m) { return `${F.MESES_CURTOS[Number(m.slice(5)) - 1].toLowerCase()}/${m.slice(2, 4)}`; }

  /** O período tem ao menos um mês presente na planilha? */
  function hasData(p) { return F.periodMonths(p).some((m) => F.dataMonths.includes(m)); }

  /**
   * Período vizinho (dir = -1 anterior, +1 próximo) ou null se não houver dados.
   * @example stepPeriod({kind:'month',year:2026,month:12}, 1) // → janeiro/2027 (se existir na planilha)
   */
  function stepPeriod(p, dir) {
    let q;
    if (p.kind === 'custom') return null; // meses avulsos não têm "vizinho" natural
    if (p.kind === 'month') { const i = p.year * 12 + (p.month - 1) + dir; q = { kind: 'month', year: Math.floor(i / 12), month: (i % 12) + 1 }; }
    else if (p.kind === 'quarter') { const i = p.year * 4 + (p.quarter - 1) + dir; q = { kind: 'quarter', year: Math.floor(i / 4), quarter: (i % 4) + 1 }; }
    else q = { kind: 'year', year: p.year + dir };
    return hasData(q) ? q : null;
  }

  /** Anos presentes na planilha, em ordem crescente. */
  function dataYears() { return [...new Set(F.dataMonths.map((m) => Number(m.slice(0, 4))))].sort((a, b) => a - b); }

  function periodSelector() {
    const p = state.period;
    const cmp = onCompare();
    const prev = cmp ? null : stepPeriod(p, -1), next = cmp ? null : stepPeriod(p, 1);
    const chev = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
    const cm = cmp ? compareMonths() : [];
    const tag = cmp ? 'Comparar' : KIND_TAG[p.kind];
    const val = cmp ? (cm.length ? cm.map(shortYm).join(' · ') : 'Escolher meses') : F.periodLabel(p);
    return `<div class="period" role="group" aria-label="Período de análise">
      <button class="pp-step" data-pp-step="-1" aria-label="Período anterior"${prev ? ` title="${F.esc(F.periodLabel(prev))}"` : ' disabled'}>‹</button>
      <button class="pp-trigger" id="pp-trigger" aria-haspopup="dialog" aria-expanded="${pp.open}" title="${F.esc(val)}">
        <span class="pp-tag${cmp || p.kind === 'custom' ? ' is-multi' : ''}">${tag}</span><span class="pp-val">${F.esc(val)}</span>${chev}
      </button>
      <button class="pp-step" data-pp-step="1" aria-label="Próximo período"${next ? ` title="${F.esc(F.periodLabel(next))}"` : ' disabled'}>›</button>
      ${pp.open ? periodPopover() : ''}
    </div>`;
  }

  /** Conteúdo do painel para o tipo/ano em navegação (pp.kind / pp.year). */
  function periodPopover() {
    const p = state.period;
    const years = dataYears();
    const now = new Date();
    const today = { y: now.getFullYear(), m: now.getMonth() + 1 };
    const cell = (q, main, sub, isNow) => {
      const sel = F.periodKey(q) === F.periodKey(p);
      return `<button class="pp-cell${isNow ? ' is-now' : ''}" data-pp-pick="${F.periodKey(q)}" aria-pressed="${sel}"${hasData(q) ? '' : ' disabled'}${isNow ? ' aria-description="período atual"' : ''}>
        <b>${main}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;
    };
    let grid;
    const nome = (nm) => nm.charAt(0) + nm.slice(1).toLowerCase();
    if (pp.kind === 'month' && pp.multi) {
      // Modo vários meses: cada célula liga/desliga o mês na seleção
      grid = `<div class="pp-grid pp-months is-multi">${F.MESES_CURTOS.map((nm, i) => {
        const ym = `${pp.year}-${String(i + 1).padStart(2, '0')}`;
        const isNow = pp.year === today.y && i + 1 === today.m;
        const on = pp.sel.includes(ym);
        const full = !on && pp.sel.length >= MAX_COMPARE;
        return `<button class="pp-cell${isNow ? ' is-now' : ''}" data-pp-toggle="${ym}" aria-pressed="${on}"${F.dataMonths.includes(ym) && !full ? '' : ' disabled'}><b>${nome(nm)}</b><i class="pp-box" aria-hidden="true"></i></button>`;
      }).join('')}</div>`;
    } else if (pp.kind === 'month') {
      grid = `<div class="pp-grid pp-months">${F.MESES_CURTOS.map((nm, i) => cell({ kind: 'month', year: pp.year, month: i + 1 }, nome(nm), '', pp.year === today.y && i + 1 === today.m)).join('')}</div>`;
    } else if (pp.kind === 'quarter') {
      grid = `<div class="pp-grid pp-quarters">${[1, 2, 3, 4].map((t) => cell({ kind: 'quarter', year: pp.year, quarter: t }, `${t}º tri`,
        `${F.MESES_CURTOS[(t - 1) * 3].toLowerCase()} – ${F.MESES_CURTOS[(t - 1) * 3 + 2].toLowerCase()}`, pp.year === today.y && Math.ceil(today.m / 3) === t)).join('')}</div>`;
    } else {
      grid = `<div class="pp-grid pp-years">${years.slice().reverse().map((y) => {
        const n = F.dataMonths.filter((m) => m.startsWith(String(y)) && m <= F.lastMonth).length;
        return cell({ kind: 'year', year: y }, String(y), n ? `${n} ${n === 1 ? 'mês' : 'meses'}` : 'sem dados', y === today.y);
      }).join('')}</div>`;
    }
    const yi = years.indexOf(pp.year);
    return `<div class="pp-pop" role="dialog" aria-label="Escolher período">
      <div class="seg pp-kinds">${[['month', 'Mês'], ['quarter', 'Trimestre'], ['year', 'Ano']].map(([k, l]) => `<button data-pp-kind="${k}" aria-pressed="${pp.kind === k}">${l}</button>`).join('')}</div>
      ${pp.kind === 'year' ? '' : `<div class="pp-year">
        <button class="pp-nav" data-pp-year="-1" aria-label="Ano anterior"${yi > 0 ? '' : ' disabled'}>‹</button>
        <span class="pp-year-n">${pp.year}</span>
        <button class="pp-nav" data-pp-year="1" aria-label="Próximo ano"${yi >= 0 && yi < years.length - 1 ? '' : ' disabled'}>›</button>
      </div>`}
      ${pp.kind === 'month' ? `<button class="pp-multi" data-pp-multi aria-pressed="${pp.multi}"><i class="pp-switch" aria-hidden="true"></i>Vários meses<span>análise conjunta ou comparação</span></button>` : ''}
      ${grid}
      ${pp.kind === 'month' && pp.multi ? multiFoot() : `<div class="pp-foot">
        <span class="label"><i class="pp-now-dot"></i>Atual</span>
        <button class="btn btn-quiet btn-sm" data-pp-today>Ir para o atual</button>
      </div>`}
    </div>`;
  }

  /**
   * Rodapé do modo vários meses: resumo da seleção (com meses de outros anos)
   * e as duas ações — analisar juntos (vira o período global) ou comparar lado a lado.
   */
  function multiFoot() {
    const n = pp.sel.length;
    const other = pp.sel.filter((m) => !m.startsWith(String(pp.year))).length;
    return `<div class="pp-foot pp-foot-multi">
      <div class="pp-selsum">
        <span class="label">${n ? `${n} ${n === 1 ? 'mês' : 'meses'}` : 'Nenhum mês marcado'}${other ? ` · ${other} de outro ano` : ''}</span>
        ${n ? `<button class="btn btn-quiet btn-sm" data-pp-clear>Limpar</button>` : ''}
      </div>
      ${n ? `<div class="pp-selchips">${pp.sel.map((m) => `<span class="pp-chip">${shortYm(m)}</span>`).join('')}</div>` : '<p class="pp-help">Marque meses de qualquer trimestre ou ano.</p>'}
      <div class="pp-actions">
        <button class="btn btn-ghost btn-sm" data-pp-compare${n >= 2 ? '' : ' disabled'} title="Meses lado a lado">Comparar</button>
        <button class="btn btn-primary btn-sm" data-pp-join${n >= 1 ? '' : ' disabled'} title="Somar os meses e analisar como um só período">Analisar juntos</button>
      </div>
    </div>`;
  }

  /** Abre/fecha o painel; ao abrir, começa no tipo e ano do período em uso. */
  function togglePicker(open) {
    pp.open = open;
    if (open) {
      const p = state.period;
      const cm = onCompare() ? compareMonths() : [];
      if (cm.length || p.kind === 'custom') {
        // Reabre já no modo vários meses, com a seleção em uso
        pp.kind = 'month'; pp.multi = true;
        pp.sel = cm.length ? cm : p.months.slice();
        pp.year = Number(pp.sel[pp.sel.length - 1].slice(0, 4));
      } else {
        pp.kind = p.kind; pp.year = p.year; pp.multi = onCompare();
        pp.sel = p.kind === 'month' ? F.periodMonths(p) : [];
      }
    }
    redrawPicker(open);
  }

  /** Redesenha só o seletor (sem re-renderizar a página). */
  function redrawPicker(focusSel) {
    const ps = document.getElementById('period-slot');
    if (!ps || !ps.firstElementChild) return;
    ps.innerHTML = periodSelector();
    if (pp.open && focusSel) {
      const el = ps.querySelector('.pp-cell[aria-pressed="true"]') || ps.querySelector('.pp-cell:not([disabled])');
      if (el) el.focus();
    }
  }

  /** Aplica um período escolhido no painel; na comparação, sai para a Visão Geral. */
  function applyPeriod(q) {
    if (onCompare()) { setPeriod(q, true); pp.open = false; location.hash = '#/visao-geral'; } else setPeriod(q);
  }

  /** Período "atual" do tipo pedido (mês/trimestre/ano corrente da planilha). */
  function currentOf(kind) {
    const y = Number(F.lastMonth.slice(0, 4)), m = Number(F.lastMonth.slice(5));
    return kind === 'month' ? { kind, year: y, month: m } : kind === 'quarter' ? { kind, year: y, quarter: Math.ceil(m / 3) } : { kind, year: y };
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

  /**
   * Renderiza a rota atual dentro de #view.
   * @param {boolean} [keepDrawer] - re-render por atualização de dados: não força scroll ao topo
   */
  function render(keepDrawer) {
    if (!state.period) return; // ainda carregando
    const { parts, query } = parseHash();
    // ?p=<chave> na URL define o período (links da comparação e links compartilhados)
    if (query.p) { const q = F.parsePeriodKey(query.p); if (q && hasData(q)) { state.period = q; save(); } }
    const ctx ={ state, save, render, setPeriod };
    const [a, b] = parts;
    let page, navKey;
    if (!a || a === 'visao-geral') { page = P.overview(ctx); navKey = 'overview'; }
    else if (a === 'centros' && !b) { page = P.centersIndex(ctx); navKey = 'centers'; }
    else if (a === 'centros') { page = P.centerPage(ctx, b); navKey = 'centers'; }
    else if (a === 'pot' && b === 'construir') { page = P.builderPage(ctx, query); navKey = 'builder'; }
    else if (a === 'pot') { page = P.potPage(ctx); navKey = 'pot'; }
    else if (a === 'cmp') { page = P.cmpPage(ctx, b); navKey = 'cmp'; }
    else if (a === 'comparar') { page = P.comparePage(ctx, query); navKey = 'compare'; }
    else if (a === 'indicadores') { page = P.indicatorsPage(ctx, b, query); navKey = 'ind'; }
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
    if (pathKey !== lastPath && keepDrawer !== true) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
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
    // Seletor de período (o painel é redesenhado a cada ação, então tudo é delegado aqui)
    const slot = e.target.closest('#period-slot');
    if (slot) {
      const t = (sel) => e.target.closest(sel);
      if (t('#pp-trigger')) { togglePicker(!pp.open); return; }
      const st = t('[data-pp-step]');
      if (st) { const q = stepPeriod(state.period, Number(st.dataset.ppStep)); if (q) setPeriod(q); return; }
      const kd = t('[data-pp-kind]');
      if (kd) {
        pp.kind = kd.dataset.ppKind;
        // Ao trocar de aba, garante que o ano navegado exista na planilha
        const ys = dataYears(); if (!ys.includes(pp.year)) pp.year = ys[ys.length - 1];
        redrawPicker(false); slot.querySelector(`[data-pp-kind="${pp.kind}"]`).focus(); return;
      }
      const yr = t('[data-pp-year]');
      if (yr) { pp.year += Number(yr.dataset.ppYear); redrawPicker(false); const b = slot.querySelector(`[data-pp-year="${yr.dataset.ppYear}"]`); if (b && !b.disabled) b.focus(); return; }
      if (t('[data-pp-multi]')) {
        pp.multi = !pp.multi;
        if (pp.multi && !pp.sel.length && state.period.kind === 'month') pp.sel = F.periodMonths(state.period);
        redrawPicker(false); slot.querySelector('[data-pp-multi]').focus(); return;
      }
      const tg = t('[data-pp-toggle]');
      if (tg) {
        const m = tg.dataset.ppToggle;
        pp.sel = pp.sel.includes(m) ? pp.sel.filter((x) => x !== m) : [...pp.sel, m].sort();
        redrawPicker(false); slot.querySelector(`[data-pp-toggle="${m}"]`)?.focus(); return;
      }
      if (t('[data-pp-clear]')) { pp.sel = []; redrawPicker(false); return; }
      if (t('[data-pp-join]')) {
        const q = F.customPeriod(pp.sel);
        if (!q) return;
        // Saindo da comparação, a análise conjunta abre na Visão Geral
        applyPeriod(q);
        return;
      }
      if (t('[data-pp-compare]')) {
        if (pp.sel.length < 2) return;
        pp.open = false;
        const h = `#/comparar?m=${pp.sel.join(',')}`;
        if (location.hash === h) render(); else location.hash = h;
        return;
      }
      const pk = t('[data-pp-pick]');
      if (pk) { const q = F.parsePeriodKey(pk.dataset.ppPick); if (q) applyPeriod(q); document.getElementById('pp-trigger')?.focus(); return; }
      if (t('[data-pp-today]')) { applyPeriod(currentOf(pp.kind)); return; }
      return;
    }
    if (pp.open) togglePicker(false); // clique fora fecha o painel
    if (e.target.closest('#sync')) { reload(true); return; }
    // Elementos não-link clicáveis (cards, barras, donut) navegam via data-nav
    const nav = e.target.closest('[data-nav]');
    if (nav && !e.target.closest('a, button:not([data-nav])')) { location.hash = nav.dataset.nav; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pp.open) { togglePicker(false); document.getElementById('pp-trigger')?.focus(); return; }
    // Setas movem o foco entre as células do painel (grade de 3, 2 ou 1 coluna)
    if (pp.open && e.target.classList && e.target.classList.contains('pp-cell') && /^Arrow/.test(e.key)) {
      const cells = [...document.querySelectorAll('#period-slot .pp-cell')];
      const cols = getComputedStyle(e.target.parentElement).gridTemplateColumns.split(' ').length;
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
      let i = cells.indexOf(e.target) + d;
      while (cells[i] && cells[i].disabled) i += Math.sign(d);
      if (cells[i]) { e.preventDefault(); cells[i].focus(); }
      return;
    }
    const nav = e.target.closest && e.target.closest('[data-nav]');
    if (nav && (e.key === 'Enter' || e.key === ' ') && e.target === nav) { e.preventDefault(); location.hash = nav.dataset.nav; }
  });
  document.getElementById('menu-btn').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
  });
  window.addEventListener('hashchange', () => render());

  // Atualização automática: a cada N minutos com a aba visível, e ao voltar para a aba.
  // Só redesenha se a planilha mudou — e nunca com um modal aberto (evita perder digitação).
  const auto = () => { if (document.visibilityState === 'visible' && !document.querySelector('.modal-wrap')) reload(false, true); };
  setInterval(auto, Math.max(1, CFG.refreshMinutes) * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sync.status && Date.now() - new Date(sync.status.loadedAt).getTime() > 60 * 1000) auto();
  });

  window.App = { sync, reload, state };
  reload();
})();
