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
   * trimestre/ano → seu último mês já corrente; mês → trimestre que o contém.
   */
  function switchKind(kind) {
    const p = state.period;
    const months = F.periodMonths(p);
    let last = months[months.length - 1] || F.lastMonth;
    if (last > F.lastMonth && months[0] <= F.lastMonth) last = F.lastMonth;
    const y = Number(last.slice(0, 4)), m = Number(last.slice(5));
    if (kind === 'month') setPeriod({ kind: 'month', year: y, month: m });
    else if (kind === 'quarter') setPeriod({ kind: 'quarter', year: y, quarter: Math.ceil(m / 3) });
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

  /**
   * Renderiza a rota atual dentro de #view.
   * @param {boolean} [keepDrawer] - re-render por atualização de dados: não força scroll ao topo
   */
  function render(keepDrawer) {
    if (!state.period) return; // ainda carregando
    const { parts, query } = parseHash();
    const ctx = { state, save, render, setPeriod };
    const [a, b] = parts;
    let page, navKey;
    if (!a || a === 'visao-geral') { page = P.overview(ctx); navKey = 'overview'; }
    else if (a === 'centros' && !b) { page = P.centersIndex(ctx); navKey = 'centers'; }
    else if (a === 'centros') { page = P.centerPage(ctx, b); navKey = 'centers'; }
    else if (a === 'pot' && b === 'construir') { page = P.builderPage(ctx, query); navKey = 'builder'; }
    else if (a === 'pot') { page = P.potPage(ctx); navKey = 'pot'; }
    else if (a === 'cmp') { page = P.cmpPage(ctx, b); navKey = 'cmp'; }
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
    const k = e.target.closest('[data-kind]');
    if (k && k.closest('#period-slot')) { switchKind(k.dataset.kind); return; }
    if (e.target.closest('#sync')) { reload(true); return; }
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
