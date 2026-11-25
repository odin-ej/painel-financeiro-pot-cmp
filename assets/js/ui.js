/**
 * ui.js — componentes visuais reutilizáveis e gráficos.
 *
 * Componentes: ícones lineares, badges de status, barras de progresso,
 * valores monetários editoriais, tooltip global, drawer, modal e toast.
 * Gráficos: Planejado × Realizado (barras agrupadas), distribuição (donut)
 * e evolução acumulada (linha) — todos desenhados à mão em HTML/SVG para
 * seguir o DESIGN.md (sem aparência padrão de biblioteca).
 *
 * Dependências: window.Fin (core.js).
 */
(function () {
  'use strict';

  const F = window.Fin;
  const esc = F.esc;

  /* ------------------------------------------------------------------ */
  /* Ícones (monoline, monocromáticos)                                   */
  /* ------------------------------------------------------------------ */
  const PATHS = {
    overview: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    centers: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    pot: '<path d="M4 6h16M4 12h10M4 18h6"/><circle cx="18" cy="16" r="3"/>',
    cmp: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    alert: '<path d="M12 8v5M12 16.5v.5"/>',
    check: '<path d="M6 12.5l4 4 8-9"/>',
    minus: '<path d="M7 12h10"/>',
    info: '<path d="M12 11v6M12 7.5v.5"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    sort: '<path d="M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3"/>',
    chart: '<path d="M4 20V11M10 20V5M16 20v-7M21 20H3"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  };

  /**
   * Retorna um ícone SVG inline.
   * @param {string} name - chave de PATHS
   * @param {string} [cls] - classe extra
   */
  function icon(name, cls) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls || ''}">${PATHS[name] || ''}</svg>`;
  }

  /** Ícone associado ao tom de status (forma + cor, nunca só cor). */
  function toneIcon(tone) {
    return icon({ over: 'alert', limit: 'alert', warn: 'alert', ok: 'check', idle: 'minus' }[tone] || 'info');
  }

  /* ------------------------------------------------------------------ */
  /* Componentes básicos                                                 */
  /* ------------------------------------------------------------------ */

  /** Badge de status textual: "● ACIMA DO ORÇAMENTO". */
  function badge(m, labelOverride) {
    return `<span class="badge tone-${m.tone}">${esc(labelOverride || m.statusLabel)}</span>`;
  }

  /**
   * Barra de progresso financeira.
   * - Dentro do orçamento: preenchimento proporcional (cor pelo status).
   * - Acima do orçamento: a escala passa a ser o realizado; um marcador branco
   *   indica onde estava 100% do orçado e o excedente aparece hachurado.
   * - Gasto não orçado: barra inteira hachurada.
   *
   * @param {Object} m - resultado de Fin.metrics()
   * @param {{size?:'lg'|'xs', signal?:boolean}} [opt]
   */
  function bar(m, opt = {}) {
    const cls = `bar${opt.size ? ' bar-' + opt.size : ''}`;
    const aria = `role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.pct === null ? 0 : Math.round(m.pct)}" aria-label="${esc((m.pct === null ? m.statusLabel : F.pct(m.pct) + ' utilizado'))}"`;
    if (m.status === 'unbudgeted') return `<div class="${cls}" ${aria}><div class="excess" style="left:0;border-radius:999px"></div></div>`;
    if (m.pct === null || m.pct === 0) return `<div class="${cls}" ${aria}></div>`;
    if (m.pct > 100) {
      const b = (100 / m.pct) * 100;
      return `<div class="${cls}" ${aria}><div class="fill tone-${m.tone}" style="width:${b}%;border-radius:999px 0 0 999px"></div><div class="excess" style="left:${b}%"></div><div class="mark" style="left:calc(${b}% - 1px)"></div></div>`;
    }
    const tone = opt.signal && m.tone === 'ok' ? 'signal' : 'tone-' + m.tone;
    return `<div class="${cls}" ${aria}><div class="fill ${tone}" style="width:${Math.max(m.pct, 0.8)}%"></div></div>`;
  }

  /** Valor monetário editorial com centavos reduzidos: "R$ 61.121<span>,93</span>". */
  function moneyDisplay(v) {
    const s = F.money(v);
    const i = s.lastIndexOf(',');
    if (i < 0) return esc(s);
    return `${esc(s.slice(0, i))}<span class="cents">${esc(s.slice(i))}</span>`;
  }

  /** Percentual editorial: "96,7<small>%</small>". */
  function pctDisplay(v) {
    if (v === null || !Number.isFinite(v)) return '—';
    return `${F.pct(v).replace('%', '')}<small>%</small>`;
  }

  /**
   * Texto de comparação temporal: "↓ 12,0% de gastos vs. trimestre anterior".
   * @param {ReturnType<Fin.comparePrev>} cmp
   */
  function deltaText(cmp) {
    if (!cmp) return '<span class="delta text-fog">Sem dados do período anterior para comparação</span>';
    if (cmp.delta === null) return `<span class="delta">Sem gastos no ${esc(cmp.label)}</span>`;
    const up = cmp.delta > 0;
    return `<span class="delta"><b>${up ? '↑' : cmp.delta < 0 ? '↓' : '='} ${F.pct(Math.abs(cmp.delta))}</b> de gastos em relação ao ${esc(cmp.label)}</span>`;
  }

  /** Select estilizado com chevron. */
  function select(id, options, value, { label, mono, attrs = '' } = {}) {
    const opts = options.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
    return `<label class="field">${label ? `<span class="sr-only">${esc(label)}</span>` : ''}<select id="${id}" class="select${mono ? ' select-mono' : ''}" ${attrs}>${opts}</select>${icon('down', 'chev')}</label>`;
  }

  /* ------------------------------------------------------------------ */
  /* Lista suspensa própria (substitui o visual do <select> nativo)     */
  /* ------------------------------------------------------------------ */

  /*
   * Todo <select class="select"> que entra na página é "aprimorado": o select
   * nativo continua no DOM (escondido) como fonte da verdade — formulários,
   * FormData e os listeners de 'change' das páginas seguem funcionando — e um
   * botão + painel próprios assumem o visual e a interação.
   * NOTA: a lista abre num painel fixo no <body> para não ser cortada por
   * tabelas com rolagem ou modais com overflow.
   */
  const DD_SEARCH_MIN = 10; // a partir de 10 opções, mostra campo de busca
  let ddOpen = null; // { sel, btn, pop }

  /** Texto do botão: rótulo da opção selecionada. */
  function ddLabel(sel) {
    const o = sel.options[sel.selectedIndex];
    return o ? o.textContent : '';
  }

  /** Transforma um <select> nativo em lista suspensa própria (idempotente). */
  function enhanceSelect(sel) {
    if (sel.dataset.dd) return;
    sel.dataset.dd = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-btn' + (sel.classList.contains('select-mono') ? ' dd-mono' : '') + (sel.classList.contains('sm') ? ' dd-sm' : '');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const aria = sel.getAttribute('aria-label') || (sel.closest('label') && sel.closest('label').textContent.trim());
    if (aria) btn.setAttribute('aria-label', aria);
    if (sel.style.cssText) btn.style.cssText = sel.style.cssText;
    btn.innerHTML = `<span class="dd-val"></span>${icon('down', 'dd-chev')}`;
    const refresh = () => {
      btn.querySelector('.dd-val').textContent = ddLabel(sel);
      btn.disabled = sel.disabled;
    };
    refresh();
    sel.classList.add('dd-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.after(btn);
    // Mantém o botão em dia quando o código altera value/selectedIndex diretamente
    ['value', 'selectedIndex'].forEach((prop) => {
      const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
      Object.defineProperty(sel, prop, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); refresh(); } });
    });
    sel.addEventListener('change', refresh);
    sel.addEventListener('focus', () => btn.focus()); // clique no <label> leva ao botão
    sel._ddRefresh = refresh;
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); ddOpen && ddOpen.sel === sel ? ddClose(true) : ddOpenFor(sel, btn); });
    btn.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); if (!ddOpen) ddOpenFor(sel, btn); }
    });
  }

  /** Abre o painel de opções sob (ou sobre, se faltar espaço) o botão. */
  function ddOpenFor(sel, btn) {
    ddClose(false);
    if (sel.disabled) return;
    sel._ddRefresh();
    const opts = [...sel.options];
    const mono = btn.classList.contains('dd-mono');
    const pop = document.createElement('div');
    pop.className = 'dd-pop' + (mono ? ' dd-mono' : '');
    pop.innerHTML = `${opts.length >= DD_SEARCH_MIN ? '<div class="dd-search"><input type="text" placeholder="Buscar…" aria-label="Buscar opção"></div>' : ''}
      <div class="dd-list" role="listbox">${opts.map((o, i) => `<button type="button" role="option" class="dd-opt" data-i="${i}" aria-selected="${i === sel.selectedIndex}"${o.disabled ? ' disabled' : ''}><span>${esc(o.textContent)}</span>${icon('check', 'dd-check')}</button>`).join('')}</div>`;
    document.body.appendChild(pop);
    // Posicionamento: largura mínima do botão; abre para cima se não couber embaixo
    const r = btn.getBoundingClientRect();
    const w = Math.min(Math.max(r.width, 200), window.innerWidth - 32);
    pop.style.minWidth = w + 'px';
    const left = Math.min(Math.max(16, r.left), window.innerWidth - pop.offsetWidth - 16);
    pop.style.left = left + 'px';
    const below = window.innerHeight - r.bottom - 16;
    if (below < Math.min(pop.offsetHeight, 240) && r.top > below) { pop.style.bottom = (window.innerHeight - r.top + 6) + 'px'; pop.classList.add('up'); }
    else pop.style.top = (r.bottom + 6) + 'px';
    pop.style.maxHeight = Math.max(160, (pop.classList.contains('up') ? r.top : below) - 12) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    ddOpen = { sel, btn, pop };

    const items = () => [...pop.querySelectorAll('.dd-opt:not([disabled]):not([hidden])')];
    const cur = pop.querySelector('.dd-opt[aria-selected="true"]') || items()[0];
    if (cur) cur.scrollIntoView({ block: 'nearest' });
    const input = pop.querySelector('.dd-search input');
    (input || cur || pop).focus();

    pop.addEventListener('click', (e) => {
      const o = e.target.closest('.dd-opt');
      if (!o || o.disabled) return;
      const i = Number(o.dataset.i);
      ddClose(true);
      if (i !== sel.selectedIndex) {
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    pop.addEventListener('keydown', (e) => {
      const list = items();
      const i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (list[i + 1] || list[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? list[i - 1] : input || list[list.length - 1]).focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ddClose(true); }
      else if (e.key === 'Tab') ddClose(false);
      else if (e.key === 'Enter' && document.activeElement === input && list[0]) { e.preventDefault(); list[0].click(); }
    });
    if (input) input.addEventListener('input', () => {
      // Busca sem acento/maiúsculas: "inovacao" encontra "Inovação"
      const nrm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const q = nrm(input.value);
      pop.querySelectorAll('.dd-opt').forEach((o) => { o.hidden = !!q && !nrm(o.textContent).includes(q); });
    });
  }

  /** Fecha o painel aberto (opcionalmente devolvendo o foco ao botão). */
  function ddClose(focusBtn) {
    if (!ddOpen) return;
    const { btn, pop } = ddOpen;
    ddOpen = null;
    pop.remove();
    btn.setAttribute('aria-expanded', 'false');
    if (focusBtn && btn.isConnected) btn.focus();
  }

  /** Aprimora os selects existentes e os que forem inseridos depois (páginas, modais, tabelas). */
  function initSelects() {
    const run = (root) => root.querySelectorAll && root.querySelectorAll('select.select').forEach(enhanceSelect);
    run(document);
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; run(document); });
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('mousedown', (e) => { if (ddOpen && !ddOpen.pop.contains(e.target) && !ddOpen.btn.contains(e.target)) ddClose(false); });
    // Rolagem da página/rolagem de tabela desloca o botão: fecha em vez de deixar o painel solto
    window.addEventListener('scroll', (e) => { if (ddOpen && !ddOpen.pop.contains(e.target)) ddClose(false); }, true);
    window.addEventListener('resize', () => ddClose(false));
    window.addEventListener('hashchange', () => ddClose(false));
  }

  /* ------------------------------------------------------------------ */
  /* Tooltip global                                                      */
  /* ------------------------------------------------------------------ */
  let tipEl;
  function tipShow(html, x, y) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    tipEl.innerHTML = html;
    tipEl.classList.add('show');
    const r = tipEl.getBoundingClientRect();
    let left = x + 16, top = y + 16;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 16;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 16;
    tipEl.style.left = Math.max(8, left) + 'px';
    tipEl.style.top = Math.max(8, top) + 'px';
  }
  function tipHide() { if (tipEl) tipEl.classList.remove('show'); }

  /** Conteúdo padrão de tooltip para Planejado × Realizado. */
  function tipFin(title, m) {
    return `<div class="tt">${esc(title)}</div>
      <div class="tr">Planejado <b>${F.money(m.planned)}</b></div>
      <div class="tr">Realizado <b>${F.money(m.realized)}</b></div>
      <div class="tr">Execução <b>${m.pct === null ? esc(m.statusLabel) : F.pct(m.pct)}</b></div>
      <div class="tr ts">${m.available >= 0 ? 'Saldo' : 'Excedente'} <b>${F.money(Math.abs(m.available))}</b></div>`;
  }

  // Delegação: qualquer elemento com data-tip (HTML já escapado) exibe tooltip no hover/foco.
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t) tipShow(t.getAttribute('data-tip'), e.clientX, e.clientY);
    else if (!e.target.closest('.line-chart')) tipHide();
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t) { const r = t.getBoundingClientRect(); tipShow(t.getAttribute('data-tip'), r.left + r.width / 2, r.top); }
  });
  document.addEventListener('focusout', tipHide);
  document.addEventListener('scroll', tipHide, true);

  /* ------------------------------------------------------------------ */
  /* Drawer, modal e toast                                               */
  /* ------------------------------------------------------------------ */
  let lastFocus = null;

  /**
   * Abre (ou substitui o conteúdo do) drawer lateral de detalhamento.
   * @param {{head:string, body:string, foot?:string, onMount?:(el:HTMLElement)=>void, onClose?:Function}} cfg
   */
  function openDrawer(cfg) {
    let scrim = document.querySelector('.scrim.dr');
    let dr = document.querySelector('.drawer');
    const fresh = !dr;
    if (fresh) {
      lastFocus = document.activeElement;
      scrim = document.createElement('div'); scrim.className = 'scrim dr';
      dr = document.createElement('aside'); dr.className = 'drawer'; dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', 'true');
      document.body.append(scrim, dr);
      scrim.addEventListener('click', closeDrawer);
    }
    dr._onClose = cfg.onClose;
    dr.innerHTML = `<div class="drawer-head">${cfg.head}<button class="icon-btn" data-close-drawer aria-label="Fechar detalhamento">${icon('close')}</button></div>
      <div class="drawer-body">${cfg.body}</div>${cfg.foot ? `<div class="drawer-foot">${cfg.foot}</div>` : ''}`;
    dr.querySelector('[data-close-drawer]').addEventListener('click', closeDrawer);
    const h = dr.querySelector('h2'); if (h) { h.id = 'drawer-title'; dr.setAttribute('aria-labelledby', 'drawer-title'); }
    if (cfg.onMount) cfg.onMount(dr);
    requestAnimationFrame(() => { scrim.classList.add('show'); dr.classList.add('show'); dr.querySelector('[data-close-drawer]').focus(); });
    dr.querySelector('.drawer-body').scrollTop = 0;
  }

  function closeDrawer() {
    const dr = document.querySelector('.drawer');
    const scrim = document.querySelector('.scrim.dr');
    if (!dr) return;
    const cb = dr._onClose;
    dr.classList.remove('show'); scrim.classList.remove('show');
    setTimeout(() => { dr.remove(); scrim.remove(); }, 320);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (cb) cb();
  }

  /**
   * Abre um modal centralizado.
   * @param {string} html - conteúdo
   * @param {(el:HTMLElement)=>void} [onMount]
   */
  function openModal(html, onMount) {
    closeModal(true);
    const prev = document.activeElement;
    const scrim = document.createElement('div'); scrim.className = 'scrim md';
    const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.append(scrim, wrap);
    const m = wrap.querySelector('.modal');
    m._prev = prev;
    scrim.addEventListener('click', () => closeModal());
    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
    m.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => closeModal()));
    if (onMount) onMount(m);
    requestAnimationFrame(() => { scrim.classList.add('show'); m.classList.add('show'); const f = m.querySelector('textarea, input, select, button'); if (f) f.focus(); });
  }

  function closeModal(immediate) {
    const wrap = document.querySelector('.modal-wrap');
    const scrim = document.querySelector('.scrim.md');
    if (!wrap) return;
    const m = wrap.querySelector('.modal');
    const prev = m && m._prev;
    if (immediate) { wrap.remove(); scrim && scrim.remove(); return; }
    m.classList.remove('show'); scrim.classList.remove('show');
    setTimeout(() => { wrap.remove(); scrim.remove(); }, 200);
    if (prev && prev.focus) prev.focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.modal-wrap')) closeModal();
    else if (document.querySelector('.drawer')) closeDrawer();
  });

  let toastT;
  /** Mensagem breve de confirmação. */
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ------------------------------------------------------------------ */
  /* Gráficos                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Arredonda o máximo do eixo para um valor "bonito" (1, 2, 2.5, 5 × 10^n).
   * @param {number} v
   * @returns {number}
   */
  function niceMax(v) {
    if (v <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / e;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * e;
  }

  /** Rótulo compacto de eixo: 12000 -> "12 mil". */
  function axisLabel(v) {
    if (v === 0) return '0';
    if (v >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return v.toLocaleString('pt-BR');
  }

  /**
   * Barras agrupadas Planejado (cinza) × Realizado (Cyan Signal).
   * Cada grupo carrega data-center para navegação e data-tip para tooltip.
   * @param {Array<Object>} rows - métricas por centro (Fin.aggregate().byCenter)
   * @returns {string} HTML
   */
  function barsChart(rows) {
    const max = niceMax(Math.max(...rows.map((r) => Math.max(r.planned, r.realized)), 1));
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const grid = ticks.map((t) => `<div style="bottom:${t * 100}%"><span>${axisLabel(max * t)}</span></div>`).join('');
    const groups = rows.map((r) => `
      <div class="group" role="button" tabindex="0" data-center="${r.id}" data-nav="#/centros/${r.id}" aria-label="${esc(r.name)}: planejado ${F.money(r.planned)}, realizado ${F.money(r.realized)}" data-tip="${esc(tipFin(r.name, r))}">
        <div class="cols">
          <div class="col planned" style="height:${(r.planned / max) * 100}%"></div>
          <div class="col realized${r.status === 'over' ? ' over' : ''}" style="height:${(r.realized / max) * 100}%"></div>
        </div>
        <div class="xl">${esc(r.name)}</div>
      </div>`).join('');
    return `<div class="bars"><div class="grid-y">${grid}</div><div class="groups">${groups}</div></div>`;
  }

  // Rampa monocromática para a distribuição (centros não recebem cor própria — DESIGN/briefing §59)
  const RAMP = ['#f5f5f7', '#c9c9cb', '#a2a2a4', '#7f8081', '#626364', '#4a4b4d'];

  /**
   * Donut de participação no realizado. Segmentos em rampa de cinzas;
   * o centro selecionado recebe Cyan Signal (dado selecionado).
   * @param {Array<Object>} rows - centros com realized > 0
   * @param {number} total - realizado total do período
   */
  function donut(rows, total) {
    const R = 80, C = 2 * Math.PI * R, GAP = rows.length > 1 ? 2.5 : 0;
    const sorted = rows.slice().sort((a, b) => b.realized - a.realized);
    let off = 0;
    const arcs = sorted.map((r, i) => {
      const len = total > 0 ? (r.realized / total) * C : 0;
      const seg = `<circle class="arc" data-center="${r.id}" data-nav="#/centros/${r.id}" r="${R}" cx="100" cy="100" fill="none" stroke="${RAMP[i % RAMP.length]}" data-color="${RAMP[i % RAMP.length]}" stroke-width="26" stroke-dasharray="${Math.max(len - GAP, 0.1)} ${C}" stroke-dashoffset="${-off}" data-tip="${esc(`<div class="tt">${esc(r.name)}</div><div class="tr">Realizado <b>${F.money(r.realized)}</b></div><div class="tr">Participação <b>${F.pct((r.realized / total) * 100)}</b></div>`)}"></circle>`;
      off += len;
      return seg;
    }).join('');
    const list = sorted.map((r, i) => `
      <div class="share-row" role="button" tabindex="0" data-center="${r.id}" data-nav="#/centros/${r.id}">
        <i style="background:${RAMP[i % RAMP.length]}" data-color="${RAMP[i % RAMP.length]}"></i>
        <span class="name">${esc(r.name)}</span>
        <span class="v num">${F.money(r.realized, true)}</span>
        <span class="p">${F.pct(total > 0 ? (r.realized / total) * 100 : null)}</span>
      </div>`).join('');
    return `<div class="donut-wrap" data-donut>
      <div class="donut"><svg viewBox="0 0 200 200" role="img" aria-label="Distribuição do realizado por centro de custo">${arcs}</svg>
        <div class="donut-center"><span class="label" data-dc-label>Total realizado</span><span class="display" data-dc-value style="font-size:${total >= 100000 ? 28 : 32}px">${F.money(total, true)}</span></div></div>
      <div class="share-list">${list}</div></div>`;
  }

  /**
   * Liga a interação de destaque do donut: hover em segmento ou linha da
   * legenda destaca o centro (Cyan) e atualiza o rótulo central.
   * @param {HTMLElement} root
   * @param {Object} byCenter - métricas por centro
   * @param {number} total
   * @param {(id:string|null)=>void} [onHighlight] - para sincronizar com outros blocos
   */
  function mountDonut(root, byCenter, total, onHighlight) {
    const wrap = root.querySelector('[data-donut]');
    if (!wrap) return;
    const lbl = wrap.querySelector('[data-dc-label]');
    const val = wrap.querySelector('[data-dc-value]');
    const set = (id) => {
      wrap.querySelectorAll('.arc').forEach((a) => {
        const on = a.dataset.center === id;
        a.setAttribute('stroke', on ? 'var(--cyan-signal)' : a.dataset.color);
        a.style.opacity = id && !on ? 0.35 : 1;
      });
      wrap.querySelectorAll('.share-row').forEach((r) => {
        r.classList.toggle('is-hl', r.dataset.center === id);
        r.querySelector('i').style.background = r.dataset.center === id ? 'var(--cyan-signal)' : r.querySelector('i').dataset.color;
      });
      wrap.querySelector('.share-list').classList.toggle('dimmed', !!id);
      if (id) {
        const c = byCenter[id];
        lbl.textContent = c.name;
        val.textContent = F.pct((c.realized / total) * 100);
      } else { lbl.textContent = 'Total realizado'; val.textContent = F.money(total, true); }
      if (onHighlight) onHighlight(id);
    };
    wrap.querySelectorAll('[data-center]').forEach((el) => {
      el.addEventListener('mouseenter', () => set(el.dataset.center));
      el.addEventListener('focus', () => set(el.dataset.center));
      el.addEventListener('mouseleave', () => set(null));
      el.addEventListener('blur', () => set(null));
    });
  }

  /**
   * Gráfico de linha da evolução acumulada (Planejado tracejado × Realizado Cyan).
   * Desenha em SVG com viewBox elástico e traço sem escala; rótulos em HTML
   * para manter a tipografia nítida em qualquer largura.
   * @param {Array<{label:string,date:string,planned:number,realized:number,monthEnd?:boolean}>} pts
   * @param {{kind:string}} period
   * @returns {string} HTML (interações ligadas por mountLine)
   */
  function lineChart(pts, period) {
    if (pts.length < 2) return '<div class="empty">Sem dados suficientes para a evolução.</div>';
    const max = niceMax(Math.max(...pts.map((p) => Math.max(p.planned, p.realized)), 1));
    const n = pts.length - 1;
    const x = (i) => (i / n) * 1000;
    const y = (v) => 300 - (v / max) * 300;
    const path = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
    const area = `${path('realized')}L1000,300L0,300Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => `<div class="gl" style="top:${(1 - t) * 100}%"><span>${axisLabel(max * t)}</span></div>`).join('');
    // Rótulos do eixo X: meses no meio de cada intervalo (trimestre) ou datas/meses
    let xl = '', ml = '';
    if (period.kind === 'quarter') {
      let startIdx = 0;
      pts.forEach((p, i) => {
        if (p.monthEnd) {
          const mid = (x(startIdx) + x(i)) / 2 / 10;
          xl += `<span class="xl" style="left:${mid}%">${F.MESES[Number(p.date.slice(5, 7)) - 1]}</span>`;
          if (i < n) ml += `<div class="mline" style="left:${x(i) / 10}%"></div>`;
          startIdx = i;
        }
      });
    } else {
      pts.forEach((p, i) => { if (i > 0 && (period.kind === 'year' || i % 1 === 0)) xl += `<span class="xl" style="left:${x(i) / 10}%">${esc(p.label)}</span>`; });
    }
    return `<div class="line-chart" data-line>
      ${grid}${ml}
      <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
        <path d="${area}" fill="rgba(0,179,221,0.07)"/>
        <path d="${path('planned')}" fill="none" stroke="#9f9fa0" stroke-width="1.5" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>
        <path d="${path('realized')}" fill="none" stroke="#00b3dd" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>
      ${xl}
      <div class="guide"></div>
      <div class="dot" data-k="planned" style="background:#9f9fa0"></div>
      <div class="dot" data-k="realized" style="background:#00b3dd"></div>
      <div class="hit" tabindex="0" role="img" aria-label="Evolução acumulada: planejado ${F.money(pts[n].planned)}, realizado ${F.money(pts[n].realized)} ao fim do período"></div>
    </div>`;
  }

  /**
   * Liga hover/teclado no gráfico de linha: guia vertical, pontos e tooltip.
   * @param {HTMLElement} root
   * @param {Array<Object>} pts - mesmos pontos usados em lineChart
   */
  function mountLine(root, pts) {
    const el = root.querySelector('[data-line]');
    if (!el || pts.length < 2) return;
    const max = niceMax(Math.max(...pts.map((p) => Math.max(p.planned, p.realized)), 1));
    const n = pts.length - 1;
    const guide = el.querySelector('.guide');
    const dots = el.querySelectorAll('.dot');
    const hit = el.querySelector('.hit');
    let cur = n;
    const show = (i, cx, cy) => {
      cur = i;
      const p = pts[i];
      const left = (i / n) * 100;
      guide.style.left = left + '%';
      dots.forEach((d) => { d.style.left = left + '%'; d.style.top = (100 - (p[d.dataset.k] / max) * 100) + '%'; });
      el.classList.add('active');
      const diff = p.realized - p.planned;
      tipShow(`<div class="tt">${p.start ? 'Início do período' : F.date(p.date)}</div>
        <div class="tr">Planejado acumulado <b>${F.money(p.planned)}</b></div>
        <div class="tr">Realizado acumulado <b>${F.money(p.realized)}</b></div>
        <div class="tr ts">${diff > 0 ? 'Acima do ritmo' : 'Abaixo do ritmo'} <b>${F.money(Math.abs(diff))}</b></div>`, cx, cy);
    };
    hit.addEventListener('mousemove', (e) => {
      const r = hit.getBoundingClientRect();
      const i = Math.round(((e.clientX - r.left) / r.width) * n);
      show(Math.min(n, Math.max(0, i)), e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', () => { el.classList.remove('active'); tipHide(); });
    hit.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const i = Math.min(n, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      const r = hit.getBoundingClientRect();
      show(i, r.left + (i / n) * r.width, r.top + 20);
    });
    hit.addEventListener('blur', () => { el.classList.remove('active'); tipHide(); });
  }

  /* ------------------------------------------------------------------ */
  /* Séries de indicadores                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Formata um valor de indicador conforme o tipo exibido na planilha.
   * @param {'money'|'pct'|'num'} kind
   * @param {number|null} v
   * @param {boolean} [short] - versão compacta para eixos
   */
  function fmtKind(kind, v, short) {
    if (v === null || !Number.isFinite(v)) return '—';
    if (kind === 'money') return short ? (v < 0 ? '−' : '') + axisLabel(Math.abs(v)) : F.money(v);
    if (kind === 'pct') return F.pct(v);
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  const SERIES_COLORS = ['#00b3dd', '#f5f5f7', '#6a6b6b', '#9f9fa0'];

  /**
   * Gráfico de linhas para indicadores mensais. Suporta valores negativos
   * (linha de zero destacada) e meses sem dado (a linha é interrompida).
   * @param {string[]} months - "AAAA-MM"
   * @param {Array<{name:string, values:(number|null)[]}>} series - mesmo tipo de unidade
   * @param {'money'|'pct'|'num'} kind
   * @param {{avg?:number|null}} [opts] - avg: desenha a linha tracejada de média (entra na escala)
   * @returns {string} HTML (interações via mountSeries)
   */
  function seriesChart(months, series, kind, opts = {}) {
    const avg = Number.isFinite(opts.avg) ? opts.avg : null;
    const all = series.flatMap((s) => s.values.filter((v) => v !== null));
    if (!all.length && avg === null) return '<div class="empty">Sem valores preenchidos ainda.</div>';
    // A média pode vir de meses fora do gráfico (ex.: média do ano num gráfico do trimestre)
    if (avg !== null) all.push(avg);
    const hi = Math.max(0, ...all), lo = Math.min(0, ...all);
    const top = hi > 0 ? niceMax(hi) : 0;
    const bot = lo < 0 ? -niceMax(-lo) : 0;
    const span = top - bot || 1;
    const n = months.length - 1 || 1;
    const x = (i) => (i / n) * 1000;
    const y = (v) => 300 - ((v - bot) / span) * 300;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => bot + span * t);
    const grid = ticks.map((v) => `<div class="gl${Math.abs(v) < 1e-9 && bot < 0 ? ' zero' : ''}" style="top:${(1 - (v - bot) / span) * 100}%"><span>${fmtKind(kind, v, true)}</span></div>`).join('');
    const paths = series.map((s, k) => {
      let d = '', pen = false;
      s.values.forEach((v, i) => {
        if (v === null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      return `<path d="${d}" fill="none" stroke="${SERIES_COLORS[k % SERIES_COLORS.length]}" stroke-width="${k === 0 ? 2 : 1.5}"${k > 0 ? ' stroke-dasharray="5 4"' : ''} vector-effect="non-scaling-stroke"/>`;
    }).join('');
    const xl = months.map((m, i) => `<span class="xl" style="left:${(i / n) * 100}%">${F.MESES_CURTOS[Number(m.slice(5)) - 1]}</span>`).join('');
    const dots = series.map((s, k) => `<div class="dot" data-k="${k}" style="background:${SERIES_COLORS[k % SERIES_COLORS.length]}"></div>`).join('');
    const avgLine = avg === null ? '' : `<div class="avg-line" style="top:${(1 - (avg - bot) / span) * 100}%"><span>Média ${fmtKind(kind, avg, true)}</span></div>`;
    return `<div class="line-chart series-chart" data-series data-top="${top}" data-bot="${bot}">
      ${grid}${avgLine}
      <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>
      ${xl}<div class="guide"></div>${dots}
      <div class="hit" tabindex="0" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))} por mês"></div>
    </div>`;
  }

  /**
   * Liga hover/teclado do gráfico de indicadores. O tooltip mostra todas as
   * linhas do bloco no mês (inclusive as que não estão desenhadas).
   * @param {HTMLElement} el - contêiner que contém [data-series]
   * @param {string[]} months
   * @param {Array} plotted - séries desenhadas (para posicionar os pontos)
   * @param {string} kind
   * @param {Array<{label:string, kind:string, values:(number|null)[]}>} rows - todas as linhas do bloco
   */
  function mountSeries(el, months, plotted, kind, rows) {
    const ch = el.querySelector('[data-series]');
    if (!ch) return;
    // Reaproveita a escala calculada no desenho (inclui a linha de média, se houver)
    const top = Number(ch.dataset.top) || 0, bot = Number(ch.dataset.bot) || 0, span = top - bot || 1;
    const n = months.length - 1 || 1;
    const guide = ch.querySelector('.guide');
    const dots = ch.querySelectorAll('.dot');
    const hit = ch.querySelector('.hit');
    let cur = months.length - 1;
    const show = (i, cx, cy) => {
      cur = i;
      const left = (i / n) * 100;
      guide.style.left = left + '%';
      dots.forEach((d) => {
        const v = plotted[Number(d.dataset.k)].values[i];
        d.style.display = v === null ? 'none' : '';
        d.style.left = left + '%';
        if (v !== null) d.style.top = (1 - (v - bot) / span) * 100 + '%';
      });
      ch.classList.add('active');
      tipShow(`<div class="tt">${esc(F.monthLabel(months[i]))}</div>${rows.map((r) => `<div class="tr">${esc(r.label)} <b>${esc(fmtKind(r.kind, r.values[i]))}</b></div>`).join('')}`, cx, cy);
    };
    hit.addEventListener('mousemove', (e) => {
      const r = hit.getBoundingClientRect();
      show(Math.min(months.length - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * n))), e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', () => { ch.classList.remove('active'); tipHide(); });
    hit.addEventListener('blur', () => { ch.classList.remove('active'); tipHide(); });
    hit.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const i = Math.min(months.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      const r = hit.getBoundingClientRect();
      show(i, r.left + (i / n) * r.width, r.top + 20);
    });
  }

  initSelects();

  window.UI = {
    icon, toneIcon, badge, bar, moneyDisplay, pctDisplay, deltaText, select,
    tipShow, tipHide, tipFin, openDrawer, closeDrawer, openModal, closeModal, toast,
    barsChart, donut, mountDonut, lineChart, mountLine, niceMax, fmtKind, seriesChart, mountSeries, SERIES_COLORS,
  };
})();
