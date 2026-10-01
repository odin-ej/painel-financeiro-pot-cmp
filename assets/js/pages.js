/**
 * pages.js — telas da aplicação e drawers de detalhamento.
 *
 * Cada página é uma função (ctx) => { title, crumbs, html, mount? }:
 *  - html  : marcação inicial (string);
 *  - mount : liga eventos e re-renderizações parciais (busca, ordenação, filtros)
 *            sem recriar a página inteira — preserva foco em campos de texto.
 *
 * Fluxos de rastreabilidade:
 *  Visão Geral → Centro → Categoria (drawer) → Lançamento (drawer)
 *  Visão Geral → Carta Mensal (CMP)
 *  POT → Centro → Categoria → Item planejado (drawer) → Lançamentos
 *
 * Dependências: window.Fin (core.js), window.UI (ui.js).
 */
(function () {
  'use strict';

  const F = window.Fin;
  const U = window.UI;
  const esc = F.esc;
  const I = U.icon;

  /* ------------------------------------------------------------------ */
  /* Blocos compartilhados                                               */
  /* ------------------------------------------------------------------ */

  /** Cabeçalho editorial de página: micro-label, título serif, texto auxiliar e ações. */
  function pageHead(label, title, lead, right) {
    return `<header class="page-head">
      <div><span class="label">${esc(label)}</span><h1 class="h1">${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div>
      ${right ? `<div class="section-tools">${right}</div>` : ''}
    </header>`;
  }

  /** Cabeçalho de seção: micro-label + título opcional + ferramentas. */
  function sectionHead(label, title, tools) {
    return `<div class="section-head"><div><span class="label">${esc(label)}</span>${title ? `<h2 class="h2">${title}</h2>` : ''}</div>${tools ? `<div class="section-tools">${tools}</div>` : ''}</div>`;
  }

  /**
   * Hero Data: o número mais importante da tela (execução %), com barra forte,
   * marcos de limiar e coluna de KPIs secundários que não competem com ele.
   * @param {Object} m - métricas (Fin.metrics)
   * @param {{label:string, compare?:string, sub?:string}} o
   */
  function hero(m, o) {
    const thresholds = m.pct !== null && m.pct <= 100
      ? `<div class="hero-scale" aria-hidden="true"><span style="left:0;transform:none">0%</span><span style="left:70%">70%</span><span style="left:90%">90%</span><span style="left:100%;transform:translateX(-100%)">100%</span></div>`
      : '';
    return `<section class="hero reveal" aria-label="${esc(o.label)}">
      <div class="hero-main">
        <div class="hero-foot"><span class="label label-strong">${esc(o.label)}</span>${U.badge(m)}</div>
        <div class="hero-figure"><span class="display num">${U.pctDisplay(m.pct)}</span></div>
        <p class="hero-caption"><strong>${F.money(m.realized)}</strong> realizados<br>de ${F.money(m.planned)} planejados${o.sub ? ` · ${o.sub}` : ''}</p>
        ${U.bar(m, { size: 'lg', signal: true })}
        ${thresholds}
        <div class="hero-foot" style="margin-top:var(--s20)">
          <span class="text-cloud">${m.available >= 0 ? `${F.money(m.available)} disponíveis` : `${F.money(-m.available)} acima do planejado`}</span>
          ${o.compare || ''}
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div><span class="label">Orçado</span><div class="hint">Planejado no POT</div></div><span class="value num">${U.moneyDisplay(m.planned)}</span></div>
        <div class="stat"><div><span class="label">Realizado</span><div class="hint">Lançamentos do período</div></div><span class="value num">${U.moneyDisplay(m.realized)}</span></div>
        <div class="stat"><div><span class="label">Disponível</span><div class="hint">Orçado − realizado</div></div><span class="value num">${U.moneyDisplay(m.available)}</span></div>
        <div class="stat"><div><span class="label">Desvio</span><div class="hint">${esc(m.deviationLabel)}</div></div><span class="value num">${esc(F.signedMoney(m.devAbs))}</span></div>
      </div>
    </section>`;
  }

  /** Linha do ledger de centros de custo (clicável → dashboard do centro). */
  function ledgerRow(c) {
    return `<div class="ledger-row" role="link" tabindex="0" data-nav="#/centros/${c.id}" data-center="${c.id}" aria-label="${esc(c.name)}: ${esc(F.pct(c.pct))} utilizado, ${esc(c.statusLabel)}">
      <div><div class="ledger-name">${esc(c.name)}</div><div class="ledger-owner label">${esc(c.owner)}</div></div>
      <div class="bar-wrap">${U.bar(c)}<div class="bar-meta"><span class="label">${c.pct === null ? esc(c.statusLabel) : F.pct(c.pct) + ' utilizado'}</span><span class="label">${c.available >= 0 ? 'Saldo ' + F.money(c.available, true) : 'Excede ' + F.money(-c.available, true)}</span></div></div>
      <div class="ledger-pct num">${F.pct(c.pct)}</div>
      <div class="ledger-vals"><strong>${F.money(c.realized)}</strong> realizados<br>de ${F.money(c.planned)} planejados</div>
      <div class="ledger-status">${U.badge(c)}</div>
      <span class="ledger-go">${I('chevron')}</span>
    </div>`;
  }

  const SORT_CENTERS = [
    { value: 'default', label: 'Ordem padrão' }, { value: 'pct', label: 'Maior execução' },
    { value: 'realized', label: 'Maior gasto' }, { value: 'planned', label: 'Maior orçamento' },
    { value: 'available', label: 'Maior saldo' },
  ];

  /** Liga o destaque cruzado entre donut, barras e ledger (mesmo centro). */
  function crossHighlight(view) {
    return (id) => {
      view.querySelectorAll('[data-center]').forEach((el) => {
        if (el.closest('[data-donut]')) return;
        el.classList.toggle('is-hl', el.dataset.center === id);
      });
      const b = view.querySelector('.bars');
      if (b) b.classList.toggle('dim', !!id);
    };
  }

  /* ------------------------------------------------------------------ */
  /* Drawers de detalhamento                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Drawer da categoria: métricas, itens planejados e lançamentos que compõem o realizado.
   * @param {string} catId
   * @param {Period} p - período de referência (global ou mês da CMP)
   * @param {{onClose?:Function}} [opt]
   */
  function openCategory(catId, p, opt = {}) {
    const cat = F.catById[catId];
    if (!cat) return;
    const m = F.aggregate(p).byCat[catId];
    const center = F.centerById[cat.centerId];
    const items = F.itemsFor(p, catId);
    const txs = F.transactionsFor(p, { categoryId: catId });
    const head = `<div><span class="label">Categoria · ${esc(center.name)} · ${esc(F.periodShort(p))}</span><h2 class="h2" style="margin-top:10px">${esc(cat.name)}</h2><div style="margin-top:12px">${U.badge(m)}</div></div>`;
    const itemsHtml = items.length ? items.map((it) => `
      <button class="tx" data-item="${it.item.id}">
        <span class="d">${esc(F.MESES_CURTOS[Number(it.item.month.slice(5)) - 1])} ${it.item.month.slice(0, 4)}</span>
        <span><span class="n">${esc(it.item.description)}</span><span class="sub label" style="display:block;margin-top:4px">${F.money(it.realized)} de ${F.money(it.planned)} · ${esc(it.pct === null ? it.statusLabel : F.pct(it.pct))}</span></span>
        <span class="a">${F.money(it.planned)}</span>
      </button>`).join('') : '<p class="text-fog body-sm" style="padding:14px 0">Nenhum item planejado nesta categoria para o período.</p>';
    const txHtml = txs.length ? txs.map((t) => `
      <button class="tx" data-tx="${t.id}">
        <span class="d">${F.date(t.date)}</span>
        <span class="n">${esc(t.description)}${!t.itemId ? ' <span class="badge tone-over" style="margin-left:6px">Não orçado</span>' : ''}</span>
        <span class="a">${F.money(t.amount)}</span>
      </button>`).join('') : '<p class="text-fog body-sm" style="padding:14px 0">Nenhum lançamento no período — categoria sem movimentação.</p>';
    const body = `
      <div class="kv">
        <div><span class="label">Orçado</span><div class="v big num">${U.moneyDisplay(m.planned)}</div></div>
        <div><span class="label">Realizado</span><div class="v big num">${U.moneyDisplay(m.realized)}</div></div>
        <div><span class="label">Disponível</span><div class="v num">${F.money(m.available)}</div></div>
        <div><span class="label">Execução</span><div class="v num">${m.pct === null ? esc(m.statusLabel) : F.pct(m.pct)}</div></div>
        <div><span class="label">Desvio</span><div class="v num">${esc(F.signedMoney(m.devAbs))} <span class="text-fog">(${esc(F.signedPct(m.devPct))})</span></div></div>
        <div><span class="label">Situação</span><div class="v">${esc(m.deviationLabel)}</div></div>
      </div>
      <div style="margin:24px 0 40px">${U.bar(m, { size: 'lg' })}</div>
      <div class="section-head" style="margin-bottom:8px"><span class="label label-strong">Itens planejados no POT · ${items.length}</span></div>
      <div class="tx-list">${itemsHtml}</div>
      <div class="section-head" style="margin:40px 0 8px"><span class="label label-strong">Lançamentos · ${txs.length}</span></div>
      <div class="tx-list">${txHtml}</div>
      <div class="tx-total"><span class="label label-strong">Total realizado</span><span class="display num">${F.money(m.realized)}</span></div>`;
    const foot = `<span class="label">Rastreável: soma dos ${txs.length} lançamentos</span>
      <a class="btn btn-ghost btn-sm" href="#/lancamentos?cat=${catId}&centro=${cat.centerId}">Abrir em Lançamentos <span class="arr">→</span></a>`;
    U.openDrawer({
      head, body, foot, onClose: opt.onClose,
      onMount: (dr) => {
        dr.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => openTx(b.dataset.tx, { back: () => openCategory(catId, p, opt) })));
        dr.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => openItem(b.dataset.item, p, { back: () => openCategory(catId, p, opt) })));
        dr.querySelectorAll('a[href^="#/"]').forEach((a) => a.addEventListener('click', () => U.closeDrawer()));
      },
    });
  }

  /**
   * Drawer do lançamento individual (último nível da hierarquia).
   * Campos de comprovante/aprovação ficam preparados para integração futura.
   */
  function openTx(txId, opt = {}) {
    const t = F.D.transactions.find((x) => x.id === txId);
    if (!t) return;
    const cat = F.catById[t.categoryId];
    const center = F.centerById[cat.centerId];
    const item = t.itemId ? F.itemById[t.itemId] : null;
    const head = `<div>${opt.back ? `<button class="btn btn-quiet btn-sm" data-back style="margin:-6px 0 10px -10px">${I('back')} Voltar</button>` : ''}
      <span class="label" style="display:block">Lançamento · ${esc(t.id)}</span><h2 class="h2" style="margin-top:10px">${esc(t.description)}</h2></div>`;
    const tone = t.status === 'Pago' ? 'ok' : t.status === 'Pendente' ? 'warn' : 'idle';
    const body = `
      <div class="display num" style="font-size:56px;margin-bottom:12px">${U.moneyDisplay(t.amount)}</div>
      <div style="margin-bottom:32px;display:flex;gap:8px;flex-wrap:wrap"><span class="badge tone-${tone}">${esc(t.status)}</span><span class="badge tone-idle">${esc(t.type === 'Fixo' ? 'Gasto fixo' : 'Gasto variável')}</span>${!item ? '<span class="badge tone-over">Gasto não orçado</span>' : ''}</div>
      <div class="kv">
        <div><span class="label">Data</span><div class="v num">${F.date(t.date)}</div></div>
        <div><span class="label">Centro de custo</span><div class="v"><a href="#/centros/${center.id}" data-close>${esc(center.name)}</a></div></div>
        <div><span class="label">Categoria</span><div class="v">${esc(cat.name)}</div></div>
        <div><span class="label">Referência do POT</span><div class="v">${item ? esc(item.description) + `<span class="sub label" style="display:block;margin-top:4px">${esc(item.id)} · planejado ${F.money(item.planned)}</span>` : 'Sem item planejado'}</div></div>
        <div><span class="label">Origem</span><div class="v">${esc(t.source)}</div></div>
        <div><span class="label">Responsável</span><div class="v">${esc(t.responsible)}</div></div>
      </div>
      <div style="margin-top:32px"><span class="label label-strong">Observação</span><p class="body-sm" style="margin-top:8px;color:var(--cloud)">${t.note ? esc(t.note) : '<span class="text-fog">Sem observações.</span>'}</p></div>
      <div style="margin-top:32px"><span class="label label-strong">Preparado para integração</span>
        <div class="kv" style="margin-top:12px">
          <div><span class="label">Comprovante</span><div class="v text-fog">Anexo via VExpenses / Conta Azul</div></div>
          <div><span class="label">Aprovação</span><div class="v text-fog">Fluxo de aprovação futuro</div></div>
        </div>
      </div>`;
    U.openDrawer({
      head, body,
      onMount: (dr) => {
        const b = dr.querySelector('[data-back]'); if (b) b.addEventListener('click', opt.back);
        dr.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => U.closeDrawer()));
      },
    });
  }

  /** Drawer do item planejado do POT com seus campos secundários e lançamentos vinculados. */
  function openItem(itemId, p, opt = {}) {
    const it = F.itemById[itemId];
    if (!it) return;
    const ip = { kind: 'month', year: Number(it.month.slice(0, 4)), month: Number(it.month.slice(5)) };
    const m = F.aggregate(ip).byItem[itemId];
    const cat = F.catById[it.categoryId];
    const center = F.centerById[cat.centerId];
    const txs = F.transactionsFor(ip, { itemId });
    const head = `<div>${opt.back ? `<button class="btn btn-quiet btn-sm" data-back style="margin:-6px 0 10px -10px">${I('back')} Voltar</button>` : ''}
      <span class="label" style="display:block">Item planejado · ${esc(F.monthLabel(it.month))}</span><h2 class="h2" style="margin-top:10px">${esc(it.description)}</h2><div style="margin-top:12px">${U.badge(m)}</div></div>`;
    const body = `
      <div class="kv">
        <div><span class="label">Planejado</span><div class="v big num">${U.moneyDisplay(m.planned)}</div></div>
        <div><span class="label">Realizado</span><div class="v big num">${U.moneyDisplay(m.realized)}</div></div>
        <div><span class="label">Saldo</span><div class="v num">${F.money(m.available)}</div></div>
        <div><span class="label">Executado</span><div class="v num">${m.pct === null ? '—' : F.pct(m.pct)}</div></div>
        <div><span class="label">Centro · Categoria</span><div class="v">${esc(center.name)} · ${esc(cat.name)}</div></div>
        <div><span class="label">Custeio</span><div class="v">${esc(it.custeio === 'Fixo' ? 'Gasto fixo' : 'Gasto variável')}</div></div>
        <div><span class="label">Importância</span><div class="v">${esc(it.importance)}</div></div>
        <div><span class="label">Obrigatoriedade</span><div class="v">${esc(it.obligation)}</div></div>
        <div><span class="label">Nível de caixa para execução</span><div class="v">${esc(it.cashLevel)}</div></div>
        <div><span class="label">Código</span><div class="v mono" style="font-size:12px">${esc(it.id)}</div></div>
      </div>
      <div style="margin:24px 0 40px">${U.bar(m, { size: 'lg' })}</div>
      <div class="section-head" style="margin-bottom:8px"><span class="label label-strong">Lançamentos vinculados · ${txs.length}</span></div>
      <div class="tx-list">${txs.length ? txs.map((t) => `<button class="tx" data-tx="${t.id}"><span class="d">${F.date(t.date)}</span><span class="n">${esc(t.description)}</span><span class="a">${F.money(t.amount)}</span></button>`).join('') : '<p class="text-fog body-sm" style="padding:14px 0">Item ainda sem lançamentos.</p>'}</div>
      <div class="tx-total"><span class="label label-strong">Total</span><span class="display num">${F.money(m.realized)}</span></div>`;
    U.openDrawer({
      head, body,
      onMount: (dr) => {
        const b = dr.querySelector('[data-back]'); if (b) b.addEventListener('click', opt.back);
        dr.querySelectorAll('[data-tx]').forEach((x) => x.addEventListener('click', () => openTx(x.dataset.tx, { back: () => openItem(itemId, p, opt) })));
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* Visão Geral                                                         */
  /* ------------------------------------------------------------------ */

  function overview(ctx) {
    const p = ctx.state.period;
    const a = F.aggregate(p);
    const t = a.total;
    const cs = F.sortCenters(Object.values(a.byCenter), ctx.state.centerSort);
    const cmp = F.comparePrev(p);
    const alerts = F.alerts(p);
    const spent = Object.values(a.byCenter).filter((c) => c.realized > 0);
    const evo = F.evolution(p);
    const cmpMonth = p.kind === 'month' ? `${p.year}-${String(p.month).padStart(2, '0')}` : null;

    const html = `
      ${pageHead(`Visão geral / ${F.periodShort(p)}`, 'Planejamento financeiro',
        `Execução orçamentária de ${esc(F.periodRange(p))} de ${p.year}.`,
        `<a class="btn btn-ghost" href="#/cmp${cmpMonth ? '/' + cmpMonth : ''}">Carta mensal <span class="arr">→</span></a>`)}
      ${hero(t, { label: 'Execução do POT', compare: U.deltaText(cmp) })}

      <section class="section" aria-labelledby="sec-centros">
        ${sectionHead('Centros de custo', '<span id="sec-centros">Execução por centro</span>', U.select('sort-centers', SORT_CENTERS, ctx.state.centerSort, { label: 'Ordenar centros', mono: true }))}
        <div class="ledger" id="ledger">${cs.map(ledgerRow).join('')}</div>
      </section>

      <section class="section" aria-labelledby="sec-pxr">
        <div class="panel">
          <div class="panel-head">
            <div><span class="label">Planejado × Realizado</span><h2 class="h2" id="sec-pxr" style="margin-top:8px">Onde o plano e a execução divergem</h2></div>
            <div class="legend"><span><i style="background:var(--steel)"></i>Planejado</span><span><i style="background:var(--cyan-signal)"></i>Realizado</span><span><i style="background:var(--over);height:3px"></i>Excesso</span></div>
          </div>
          ${U.barsChart(Object.values(a.byCenter).sort((x, y) => x.order - y.order))}
        </div>
      </section>

      <section class="section grid cols-7-5" style="margin-top:var(--s12)">
        <div class="panel">
          <div class="panel-head">
            <div><span class="label">Ritmo de consumo</span><h2 class="h2" style="margin-top:8px">Evolução acumulada</h2></div>
            <div class="legend"><span><i class="dash"></i>Planejado</span><span><i class="line" style="background:var(--cyan-signal)"></i>Realizado</span></div>
          </div>
          ${U.lineChart(evo, p)}
        </div>
        <div class="panel">
          <div class="panel-head"><div><span class="label">Distribuição dos gastos</span><h2 class="h2" style="margin-top:8px">Participação no realizado</h2></div></div>
          ${spent.length ? U.donut(spent, t.realized).replace('class="donut-wrap"', 'class="donut-wrap stack"') : '<div class="empty">Sem gastos no período.</div>'}
        </div>
      </section>

      <section class="section" aria-labelledby="sec-alertas">
        ${sectionHead('Atenção necessária', `<span id="sec-alertas">${alerts.length} ${alerts.length === 1 ? 'ponto' : 'pontos'} para acompanhar</span>`, '<span class="label">Gerado a partir dos dados do período</span>')}
        ${alerts.length ? `<div class="alerts">${alerts.map((x) => `
          <a class="alert" href="${x.link}">
            <span class="ic tone-${x.tone}">${U.toneIcon(x.tone)}</span>
            <span><span class="k label tone-${x.tone}" style="display:block">${esc(x.kind)}</span><span class="t1" style="display:block">${esc(x.title)}</span><span class="t2" style="display:block">${esc(x.detail)}</span></span>
            <span class="go">${I('chevron')}</span>
          </a>`).join('')}</div>` : '<div class="empty">Nenhum ponto de atenção no período.</div>'}
      </section>`;

    return {
      title: 'Visão Geral', crumbs: [['Visão Geral']], html,
      mount(view) {
        const hl = crossHighlight(view);
        U.mountDonut(view, a.byCenter, t.realized, hl);
        U.mountLine(view, evo);
        view.querySelector('#sort-centers').addEventListener('change', (e) => {
          ctx.state.centerSort = e.target.value; ctx.save();
          view.querySelector('#ledger').innerHTML = F.sortCenters(Object.values(F.aggregate(p).byCenter), e.target.value).map(ledgerRow).join('');
        });
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Centros de custo — índice                                           */
  /* ------------------------------------------------------------------ */

  function centersIndex(ctx) {
    const p = ctx.state.period;
    const a = F.aggregate(p);
    const cs = F.sortCenters(Object.values(a.byCenter), ctx.state.centerSort);
    const html = `
      ${pageHead(`Centros de custo / ${F.periodShort(p)}`, 'Centros de custo', `Seis áreas, ${F.D.categories.length} categorias. Selecione um centro para ver categorias, evolução e lançamentos.`)}
      <section>
        ${sectionHead('Execução por centro', '', U.select('sort-centers', SORT_CENTERS, ctx.state.centerSort, { label: 'Ordenar centros', mono: true }))}
        <div class="ledger" id="ledger">${cs.map(ledgerRow).join('')}</div>
      </section>
      <section class="section">
        <div class="panel">
          <div class="panel-head"><div><span class="label">Planejado × Realizado</span><h2 class="h2" style="margin-top:8px">Comparativo do período</h2></div>
            <div class="legend"><span><i style="background:var(--steel)"></i>Planejado</span><span><i style="background:var(--cyan-signal)"></i>Realizado</span></div></div>
          ${U.barsChart(Object.values(a.byCenter).sort((x, y) => x.order - y.order))}
        </div>
      </section>`;
    return {
      title: 'Centros de Custo', crumbs: [['Centros de Custo']], html,
      mount(view) {
        view.querySelector('#sort-centers').addEventListener('change', (e) => {
          ctx.state.centerSort = e.target.value; ctx.save();
          view.querySelector('#ledger').innerHTML = F.sortCenters(Object.values(F.aggregate(p).byCenter), e.target.value).map(ledgerRow).join('');
        });
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Centro de custo — dashboard individual                              */
  /* ------------------------------------------------------------------ */

  const SORT_CATS = [
    { value: 'realized', label: 'Maior gasto' }, { value: 'planned', label: 'Maior orçamento' },
    { value: 'pctDesc', label: 'Maior % utilizado' }, { value: 'pctAsc', label: 'Menor % utilizado' },
    { value: 'deviation', label: 'Maior desvio' }, { value: 'alpha', label: 'Ordem alfabética' },
  ];

  function centerPage(ctx, id) {
    const p = ctx.state.period;
    const ce = F.centerById[id];
    if (!ce) return notFound();
    const a = F.aggregate(p);
    const c = a.byCenter[id];
    const cmp = F.comparePrev(p, id);
    // Em trimestre/ano, mostra também a variação do último mês contra o anterior
    let cmpMonthly = '';
    if (p.kind !== 'month') {
      const ms = F.periodMonths(p);
      const last = ms[ms.length - 1];
      const lp = { kind: 'month', year: Number(last.slice(0, 4)), month: Number(last.slice(5)) };
      const cm = F.comparePrev(lp, id);
      if (cm && cm.delta !== null) cmpMonthly = `<span class="delta"><b>${cm.delta > 0 ? '↑' : '↓'} ${F.pct(Math.abs(cm.delta))}</b> em ${F.MESES[lp.month - 1]} vs. mês anterior</span>`;
    }
    const evo = F.evolution(p, { centerId: id });
    const evoLabel = p.kind === 'month' ? 'Evolução do mês' : p.kind === 'quarter' ? 'Evolução do trimestre' : 'Evolução do ano';
    const topTx = F.transactionsFor(p, { centerId: id }).slice().sort((x, y) => y.amount - x.amount).slice(0, 6);

    const tabs = F.centers.map((x) => `<a href="#/centros/${x.id}"${x.id === id ? ' aria-current="page"' : ''}>${esc(x.name)}</a>`).join('');

    const html = `
      <nav class="center-tabs" aria-label="Centros de custo">${tabs}</nav>
      ${pageHead(`Centro de custo / ${F.periodShort(p)}`, esc(ce.name), `${esc(ce.owner)} · ${c.categories.length} categorias · ${esc(F.periodLabel(p))}`,
        `<a class="btn btn-ghost" href="#/lancamentos?centro=${id}">Lançamentos <span class="arr">→</span></a>`)}
      ${hero(c, { label: 'Execução do centro', compare: `<div class="compare" style="margin-top:0">${U.deltaText(cmp)}${cmpMonthly}</div>` })}

      <section class="section">
        <div class="panel">
          <div class="panel-head">
            <div><span class="label">${esc(evoLabel)}</span><h2 class="h2" style="margin-top:8px">Velocidade de consumo do orçamento</h2></div>
            <div class="legend"><span><i class="dash"></i>Planejado acumulado</span><span><i class="line" style="background:var(--cyan-signal)"></i>Realizado acumulado</span></div>
          </div>
          ${U.lineChart(evo, p)}
        </div>
      </section>

      <section class="section" aria-labelledby="sec-cats">
        ${sectionHead('Categorias', `<span id="sec-cats">Qual categoria explica o resultado</span>`,
          `<label class="search"><span class="sr-only">Buscar categoria</span>${I('search')}<input id="cat-q" class="input" type="search" placeholder="Buscar categoria" value="${esc(ctx.state.catQuery)}"></label>
           ${U.select('cat-sort', SORT_CATS, ctx.state.catSort, { label: 'Ordenar categorias', mono: true })}`)}
        <div class="table-wrap"><table class="t" id="cat-table" style="min-width:860px"></table></div>
      </section>

      <section class="section">
        ${sectionHead('Maiores lançamentos', '', `<a class="btn btn-quiet btn-sm" href="#/lancamentos?centro=${id}">Ver todos <span class="arr">→</span></a>`)}
        <div class="tx-list">${topTx.length ? topTx.map((t) => `<button class="tx" data-tx="${t.id}"><span class="d">${F.date(t.date)}</span><span><span class="n">${esc(t.description)}</span><span class="label" style="display:block;margin-top:2px">${esc(F.catById[t.categoryId].name)}</span></span><span class="a">${F.money(t.amount)}</span></button>`).join('') : '<div class="empty">Sem lançamentos no período.</div>'}</div>
      </section>`;

    /** Re-renderiza apenas a tabela de categorias (busca/ordenação). */
    function renderCats(view) {
      const q = F.norm(ctx.state.catQuery);
      const rows = F.sortCategories(c.categories, ctx.state.catSort).filter((x) => !q || F.norm(x.name).includes(q));
      const th = (k, l, r) => `<th class="${r ? 'r' : ''}"${k ? ` aria-sort="${ctx.state.catSort === k ? 'descending' : 'none'}"` : ''}>${k ? `<button data-sort="${k}">${l}</button>` : l}</th>`;
      view.querySelector('#cat-table').innerHTML = `
        <thead><tr>${th('alpha', 'Categoria')}${th('planned', 'Orçado', 1)}${th('realized', 'Realizado', 1)}${th('', 'Disponível', 1)}${th('pctDesc', 'Execução')}${th('deviation', 'Desvio', 1)}${th('', 'Status')}</tr></thead>
        <tbody>${rows.length ? rows.map((x) => `
          <tr class="click" tabindex="0" data-cat="${x.id}" aria-label="Abrir categoria ${esc(x.name)}">
            <td class="strong">${esc(x.name)}</td>
            <td class="r">${F.money(x.planned)}</td>
            <td class="r strong">${F.money(x.realized)}</td>
            <td class="r">${F.money(x.available)}</td>
            <td><div class="cell-bar">${U.bar(x, { size: 'xs' })}<span class="mono">${x.pct === null ? '—' : F.pct(x.pct)}</span></div></td>
            <td class="r">${esc(F.signedMoney(x.devAbs))}</td>
            <td>${U.badge(x)}</td>
          </tr>`).join('') : `<tr><td colspan="7"><div class="empty">Nenhuma categoria encontrada para “${esc(ctx.state.catQuery)}”.</div></td></tr>`}</tbody>
        <tfoot><tr><td>Total do centro</td><td class="r num">${F.money(c.planned)}</td><td class="r num">${F.money(c.realized)}</td><td class="r num">${F.money(c.available)}</td><td class="mono">${F.pct(c.pct)}</td><td class="r num">${esc(F.signedMoney(c.devAbs))}</td><td></td></tr></tfoot>`;
    }

    return {
      title: ce.name, crumbs: [['Centros de Custo', '#/centros'], [ce.name]], html,
      mount(view, query) {
        renderCats(view);
        U.mountLine(view, evo);
        view.querySelector('#cat-q').addEventListener('input', (e) => { ctx.state.catQuery = e.target.value; renderCats(view); });
        view.querySelector('#cat-sort').addEventListener('change', (e) => { ctx.state.catSort = e.target.value; ctx.save(); renderCats(view); });
        const open = (catId) => {
          history.replaceState(null, '', `#/centros/${id}?cat=${catId}`);
          openCategory(catId, p, { onClose: () => history.replaceState(null, '', `#/centros/${id}`) });
        };
        view.querySelector('#cat-table').addEventListener('click', (e) => {
          const s = e.target.closest('[data-sort]');
          if (s) { ctx.state.catSort = s.dataset.sort; ctx.save(); view.querySelector('#cat-sort').value = s.dataset.sort; renderCats(view); return; }
          const r = e.target.closest('[data-cat]'); if (r) open(r.dataset.cat);
        });
        view.querySelector('#cat-table').addEventListener('keydown', (e) => {
          const r = e.target.closest('[data-cat]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(r.dataset.cat); }
        });
        view.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => openTx(b.dataset.tx)));
        if (query.cat && F.catById[query.cat]) open(query.cat);
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* POT — Planejamento Orçamentário                                     */
  /* ------------------------------------------------------------------ */

  const POT_STATUS = [
    { value: '', label: 'Todos os status' }, { value: 'over', label: 'Acima do orçamento' },
    { value: 'limit', label: 'Próximo ao limite' }, { value: 'attention', label: 'Atenção' },
    { value: 'healthy', label: 'Saudável' }, { value: 'full', label: 'Totalmente utilizado' },
    { value: 'idle', label: 'Sem movimentação' }, { value: 'unbudgeted', label: 'Gasto não orçado' },
  ];

  function potPage(ctx) {
    const p = ctx.state.period;
    const a = F.aggregate(p);
    const t = a.total;
    const mode = ctx.state.potMode;
    const open = ctx.state.potOpen;

    const desvios = Object.values(a.byCat).filter((x) => x.devAbs !== 0 && (x.planned > 0 || x.realized > 0))
      .sort((x, y) => Math.abs(y.devAbs) - Math.abs(x.devAbs)).slice(0, 6);

    const treeHtml = F.centers.map((ce) => {
      const c = a.byCenter[ce.id];
      const cats = c.categories.slice().sort((x, y) => y.planned - x.planned || y.realized - x.realized);
      const isOpen = open.has(ce.id);
      return `<div class="tree-center${isOpen ? ' open' : ''}" data-node="${ce.id}">
        <button class="tree-head" aria-expanded="${isOpen}" data-toggle="${ce.id}">
          ${I('chevron', 'caret')}
          <span><span class="nm">${esc(ce.name)}</span><span class="label" style="display:block;margin-top:6px">${cats.length} categorias · saldo ${F.money(c.available, true)}</span></span>
          <span class="col-bar">${U.bar(c)}</span>
          <span class="val num" style="font-family:var(--font-display);font-size:24px">${F.pct(c.pct)}</span>
          <span class="val col-plan"><span class="label">Orçado</span>${F.money(c.planned)}</span>
          <span class="val col-real"><span class="label">Realizado</span>${F.money(c.realized)}</span>
          <span class="col-avail" style="text-align:right">${U.badge(c)}</span>
        </button>
        <div class="tree-cats">${cats.map((x) => {
          const items = F.itemsFor(p, x.id);
          const nb = F.unbudgetedTx(p, x.id);
          const k = ce.id + '/' + x.id;
          const catOpen = open.has(k);
          return `<div class="tree-cat${catOpen ? ' open' : ''}">
            <button class="tree-cat-head" aria-expanded="${catOpen}" data-toggle="${k}">
              ${I('chevron', 'caret')}
              <span class="nm">${esc(x.name)}<span class="label" style="display:block;margin-top:2px">${items.length} ${items.length === 1 ? 'item' : 'itens'}${nb.length ? ` · ${nb.length} não orçado${nb.length > 1 ? 's' : ''}` : ''}</span></span>
              <span class="col-bar">${U.bar(x, { size: 'xs' })}</span>
              <span class="r mono" style="color:var(--cloud)">${x.pct === null ? '—' : F.pct(x.pct)}</span>
              <span class="r col-plan">${F.money(x.planned)}</span>
              <span class="r col-real" style="color:var(--cloud)">${F.money(x.realized)}</span>
              <span class="col-avail" style="text-align:right">${U.badge(x)}</span>
            </button>
            <div class="tree-items">
              ${items.map((it) => `<button class="tree-item" data-item="${it.item.id}">
                <span class="label col-month">${F.MESES_CURTOS[Number(it.item.month.slice(5)) - 1]}</span>
                <span style="color:var(--cloud)">${esc(it.item.description)}</span>
                <span class="r col-plan">${F.money(it.planned)}</span>
                <span class="r">${F.money(it.realized)}</span>
                <span class="col-status" style="text-align:right">${U.badge(it)}</span>
              </button>`).join('')}
              ${nb.map((tx) => `<button class="tree-item" data-tx="${tx.id}">
                <span class="label col-month">${F.date(tx.date).slice(0, 5)}</span>
                <span style="color:var(--cloud)">${esc(tx.description)}</span>
                <span class="r col-plan">${F.money(0)}</span>
                <span class="r">${F.money(tx.amount)}</span>
                <span class="col-status" style="text-align:right"><span class="badge tone-over">Gasto não orçado</span></span>
              </button>`).join('')}
              <div style="padding:8px 12px"><button class="btn btn-quiet btn-sm" data-opencat="${x.id}">Detalhar categoria <span class="arr">→</span></button></div>
            </div>
          </div>`;
        }).join('')}</div>
      </div>`;
    }).join('');

    const managerial = `
      <div class="tree" id="tree">${treeHtml}</div>
      <section class="section">
        ${sectionHead('Principais desvios', 'Categorias mais distantes do planejado')}
        <div class="spend-list">${desvios.map((x, i) => `
          <button class="spend" data-opencat="${x.id}">
            <span class="rk">${String(i + 1).padStart(2, '0')}</span>
            <span><span class="nm">${esc(x.name)}</span><span class="label" style="display:block;margin-top:4px">${esc(F.centerById[x.centerId].name)} · ${esc(x.deviationLabel)}</span></span>
            <span class="bar-col">${U.bar(x, { size: 'xs' })}</span>
            <span class="r num" style="font-size:20px">${esc(F.signedMoney(x.devAbs, true))}</span>
            <span class="go text-fog">${I('chevron')}</span>
          </button>`).join('')}</div>
      </section>`;

    const detailed = `
      <div class="filters">
        <label class="search"><span class="sr-only">Buscar no POT</span>${I('search')}<input id="pot-q" class="input" type="search" placeholder="Buscar item, categoria ou centro" value="${esc(ctx.state.potQ)}"></label>
        ${U.select('pot-center', [{ value: '', label: 'Todos os centros' }, ...F.centers.map((x) => ({ value: x.id, label: x.name }))], ctx.state.potCenter, { label: 'Filtrar por centro' })}
        ${U.select('pot-status', POT_STATUS, ctx.state.potStatus, { label: 'Filtrar por status' })}
        <span class="label count" id="pot-count"></span>
      </div>
      <div class="table-wrap"><table class="t wide" id="pot-table"></table></div>`;

    const html = `
      ${pageHead(`Planejamento orçamentário / ${F.periodShort(p)}`, 'Planejamento Orçamentário',
        `O POT de ${esc(F.periodRange(p))}: quanto cada centro planejou gastar, item por item, e como está a execução.`,
        `<div class="seg" role="group" aria-label="Modo de visualização"><button data-mode="manager" aria-pressed="${mode === 'manager'}">Gerencial</button><button data-mode="detailed" aria-pressed="${mode === 'detailed'}">Detalhada</button></div>`)}
      <div class="stat-strip" style="margin-bottom:var(--s48)">
        <div class="cell"><span class="label">Orçamento total</span><div class="value num">${U.moneyDisplay(t.planned)}</div><div class="hint">${a.items.length} itens planejados</div></div>
        <div class="cell"><span class="label">Realizado</span><div class="value num">${U.moneyDisplay(t.realized)}</div><div class="hint">${a.txs.length} lançamentos</div></div>
        <div class="cell"><span class="label">Saldo</span><div class="value num">${U.moneyDisplay(t.available)}</div><div class="hint">${esc(t.deviationLabel)}</div></div>
        <div class="cell"><span class="label">Execução</span><div class="value num">${F.pct(t.pct)}</div><div class="hint">${esc(t.statusLabel)}</div></div>
      </div>
      ${mode === 'manager' ? managerial : detailed}`;

    /** Linhas da visão detalhada: itens do POT + gastos não orçados (linhas sem item). */
    function detailRows() {
      const rows = a.items.map((i) => {
        const m = a.byItem[i.id];
        const cat = F.catById[i.categoryId];
        return { ...m, key: i.id, kind: 'item', month: i.month, date: i.date, description: i.description, cat: cat.name, centerId: cat.centerId, center: F.centerById[cat.centerId].name };
      });
      a.txs.filter((x) => !x.itemId).forEach((x) => {
        const cat = F.catById[x.categoryId];
        rows.push({ ...F.metrics(0, Math.round(x.amount * 100)), key: x.id, kind: 'tx', month: x.date.slice(0, 7), date: x.date, description: x.description, cat: cat.name, centerId: cat.centerId, center: F.centerById[cat.centerId].name });
      });
      return rows;
    }

    function renderDetailed(view) {
      const q = F.norm(ctx.state.potQ);
      const s = ctx.state.potSort;
      let rows = detailRows().filter((r) => (!ctx.state.potCenter || r.centerId === ctx.state.potCenter)
        && (!ctx.state.potStatus || r.status === ctx.state.potStatus)
        && (!q || F.norm(`${r.description} ${r.cat} ${r.center}`).includes(q)));
      const dir = s.dir === 'asc' ? 1 : -1;
      const val = (r) => ({ date: r.date + r.description, description: r.description, cat: r.cat, center: r.center, planned: r.planned, realized: r.realized, available: r.available, pct: r.pct ?? (r.realized > 0 ? 1e9 : -1) }[s.key]);
      rows.sort((x, y) => { const A = val(x), B = val(y); return (typeof A === 'string' ? A.localeCompare(B, 'pt-BR') : A - B) * dir; });
      const sumP = rows.reduce((z, r) => z + Math.round(r.planned * 100), 0);
      const sumR = rows.reduce((z, r) => z + Math.round(r.realized * 100), 0);
      const tot = F.metrics(sumP, sumR);
      const th = (k, l, r) => `<th class="${r ? 'r' : ''}" aria-sort="${s.key === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button data-sort="${k}">${l}${s.key === k ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`;
      view.querySelector('#pot-count').textContent = `${rows.length} linhas`;
      view.querySelector('#pot-table').innerHTML = `
        <thead><tr>${th('date', 'Mês · Data')}${th('description', 'Descrição')}${th('cat', 'Categoria')}${th('center', 'Centro')}${th('planned', 'Planejado', 1)}${th('realized', 'Realizado', 1)}${th('available', 'Saldo', 1)}${th('pct', '% exec.', 1)}<th>Status</th></tr></thead>
        <tbody>${rows.length ? rows.map((r) => `
          <tr class="click" tabindex="0" ${r.kind === 'item' ? `data-item="${r.key}"` : `data-tx="${r.key}"`}>
            <td class="num"><span class="mono" style="color:var(--cloud)">${F.MESES_CURTOS[Number(r.month.slice(5)) - 1]}</span><span class="sub">${F.date(r.date)}</span></td>
            <td class="strong">${esc(r.description)}</td>
            <td>${esc(r.cat)}</td>
            <td>${esc(r.center)}</td>
            <td class="r">${F.money(r.planned)}</td>
            <td class="r strong">${F.money(r.realized)}</td>
            <td class="r">${F.money(r.available)}</td>
            <td class="r mono">${r.pct === null ? '—' : F.pct(r.pct)}</td>
            <td>${U.badge(r)}</td>
          </tr>`).join('') : '<tr><td colspan="9"><div class="empty">Nenhum item encontrado com os filtros atuais.</div></td></tr>'}</tbody>
        <tfoot><tr><td colspan="4">Total filtrado</td><td class="r num">${F.money(tot.planned)}</td><td class="r num">${F.money(tot.realized)}</td><td class="r num">${F.money(tot.available)}</td><td class="r mono">${F.pct(tot.pct)}</td><td></td></tr></tfoot>`;
    }

    return {
      title: 'Planejamento Orçamentário', crumbs: [['Planejamento Orçamentário']], html,
      mount(view) {
        view.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { ctx.state.potMode = b.dataset.mode; ctx.save(); ctx.render(); }));
        view.addEventListener('click', (e) => {
          const tg = e.target.closest('[data-toggle]');
          if (tg) {
            const k = tg.dataset.toggle;
            const node = tg.parentElement;
            const on = !open.has(k);
            on ? open.add(k) : open.delete(k);
            node.classList.toggle('open', on);
            tg.setAttribute('aria-expanded', on);
            return;
          }
          const oc = e.target.closest('[data-opencat]'); if (oc) { openCategory(oc.dataset.opencat, p); return; }
          const it = e.target.closest('[data-item]'); if (it) { openItem(it.dataset.item, p); return; }
          const tx = e.target.closest('[data-tx]'); if (tx) { openTx(tx.dataset.tx); return; }
          const s = e.target.closest('[data-sort]');
          if (s) {
            const st = ctx.state.potSort;
            ctx.state.potSort = { key: s.dataset.sort, dir: st.key === s.dataset.sort && st.dir === 'desc' ? 'asc' : st.key === s.dataset.sort ? 'desc' : (['description', 'cat', 'center', 'date'].includes(s.dataset.sort) ? 'asc' : 'desc') };
            renderDetailed(view);
          }
        });
        if (mode === 'detailed') {
          renderDetailed(view);
          view.querySelector('#pot-q').addEventListener('input', (e) => { ctx.state.potQ = e.target.value; renderDetailed(view); });
          view.querySelector('#pot-center').addEventListener('change', (e) => { ctx.state.potCenter = e.target.value; renderDetailed(view); });
          view.querySelector('#pot-status').addEventListener('change', (e) => { ctx.state.potStatus = e.target.value; renderDetailed(view); });
          view.querySelector('#pot-table').addEventListener('keydown', (e) => {
            const r = e.target.closest('tr[data-item], tr[data-tx]');
            if (r && e.key === 'Enter') r.click();
          });
        }
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* CMP — Carta Mensal de Planejamento                                  */
  /* ------------------------------------------------------------------ */

  /** Mês padrão da CMP: mês do período global ou a última carta com análises salvas. */
  function defaultCmpMonth(ctx) {
    const p = ctx.state.period;
    if (p.kind === 'month') return `${p.year}-${String(p.month).padStart(2, '0')}`;
    const ms = F.periodMonths(p);
    const withAnalyses = ms.filter((m) => F.D.analyses.some((x) => x.month === m));
    return withAnalyses.length ? withAnalyses[withAnalyses.length - 1] : ms[ms.length - 1];
  }

  function cmpPage(ctx, monthParam) {
    const month = monthParam && F.dataMonths.includes(monthParam) ? monthParam : defaultCmpMonth(ctx);
    const p = { kind: 'month', year: Number(month.slice(0, 4)), month: Number(month.slice(5)) };
    const a = F.aggregate(p);
    const t = a.total;
    const income = F.incomeFor(month);
    const result = income === null ? null : income - t.realized;
    const pan = F.panorama(p);
    const nomeMes = F.MESES[p.month - 1];
    const publicada = F.centers.every((ce) => F.getAnalysis(month, ce.id));
    const tops = F.topSpending(p, 6);
    const centersOver = Object.values(a.byCenter).filter((c) => c.status === 'over');

    const monthOpts = F.dataMonths.filter((m) => m <= F.lastMonth).map((m) => ({ value: m, label: F.monthLabel(m) })).reverse();

    // Síntese editorial derivada (cartão invertido)
    const sintese = t.devAbs <= 0
      ? `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} fechou ${F.money(-t.devAbs)} abaixo do orçamento.`
      : `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} fechou ${F.money(t.devAbs)} acima do orçamento.`;
    const sinteseSub = centersOver.length
      ? `${centersOver.map((c) => esc(c.name)).join(' e ')} ${centersOver.length > 1 ? 'ficaram' : 'ficou'} acima do planejado${pan.acima.length ? `, puxado${centersOver.length > 1 ? 's' : ''} por ${esc(pan.acima.sort((x, y) => y.devAbs - x.devAbs)[0].name)}` : ''}; as demais áreas compensaram.`
      : 'Todas as áreas ficaram dentro do orçamento planejado.';

    const areaHtml = F.centers.map((ce) => {
      const c = a.byCenter[ce.id];
      const top = F.topCategories(p, ce.id, 3);
      const saved = F.getAnalysis(month, ce.id);
      const draft = F.draftAnalysis(p, ce.id);
      return `<article class="area" id="area-${ce.id}">
        <div>
          <span class="label">${esc(ce.owner)}</span>
          <h3 class="area-name" style="margin-top:10px"><a href="#/centros/${ce.id}" data-setmonth>${esc(ce.name)}</a></h3>
          <div class="area-pct"><span class="display num">${U.pctDisplay(c.pct)}</span>${U.badge(c)}</div>
          ${U.bar(c, { size: 'lg' })}
          <div class="area-vals">
            <div><span class="label">Planejado</span><div class="v">${F.money(c.planned)}</div></div>
            <div><span class="label">Realizado</span><div class="v">${F.money(c.realized)}</div></div>
            <div><span class="label">${c.available >= 0 ? 'Saldo' : 'Excedente'}</span><div class="v">${F.money(Math.abs(c.available))}</div></div>
          </div>
          <div class="topcats">
            <span class="label label-strong" style="display:block;margin-bottom:6px">Principais categorias</span>
            ${top.length ? top.map((x) => `<div class="topcat" role="button" tabindex="0" data-opencat="${x.id}"><span class="nm">${esc(x.name)}</span><span class="delta ${x.devPct !== null && x.devPct > 0 ? 'tone-over' : 'text-fog'}">${x.devPct === null ? 'NÃO ORÇADO' : esc(F.signedPct(x.devPct))}</span><span class="r">${F.money(x.realized)}</span></div>`).join('') : '<p class="text-fog body-sm">Sem gastos no mês.</p>'}
          </div>
        </div>
        <div class="analysis" data-analysis="${ce.id}">
          <div class="analysis-meta"><span class="label label-strong">Análise do mês</span>
            <span class="label source-dot ${saved ? (saved.source === 'ai' ? 'ai' : 'manual') : ''}">${saved ? (saved.source === 'ai' ? 'Gerada por IA · revisar' : `Escrita por ${esc(saved.author)} · ${F.date(saved.updatedAt)}`) : 'Rascunho automático · dados do mês'}</span></div>
          <p class="analysis-text${saved ? '' : ' draft'}">${esc(saved ? saved.text : draft)}</p>
          <div class="analysis-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${ce.id}">${I('edit')} ${saved ? 'Editar análise' : 'Adicionar análise'}</button>
            <button class="btn btn-quiet btn-sm" data-ai="${ce.id}" aria-disabled="true" data-tip="${esc('<div class="tt">Geração por IA</div><div class="tr">Prevista para integração futura. Hoje o rascunho é derivado automaticamente dos dados.</div>')}">${I('spark')} Gerar com IA</button>
          </div>
        </div>
      </article>`;
    }).join('');

    const html = `
      ${pageHead(`Carta mensal de planejamento / ${F.periodShort(p)}`, 'Carta Mensal de Planejamento',
        `${esc(F.monthLabel(month))} — gerada a partir do POT e dos lançamentos. Diretoria de Operações · Gerência Financeira.`,
        `${U.select('cmp-month', monthOpts, month, { label: 'Mês da carta' })}<span class="chip">${publicada ? 'Publicada' : 'Rascunho'}</span>`)}

      <section aria-labelledby="sec-resumo">
        ${sectionHead('Resumo do mês', `<span id="sec-resumo">Visão geral de ${esc(nomeMes)}</span>`)}
        <div class="cmp-cover">
          <div class="cmp-summary">
            <div class="cell"><span class="label">Orçado</span><div class="value num">${U.moneyDisplay(t.planned)}</div><div class="hint">${a.items.length} itens no POT</div></div>
            <div class="cell"><span class="label">Realizado</span><div class="value num">${U.moneyDisplay(t.realized)}</div><div class="hint">${a.txs.length} lançamentos</div></div>
            <div class="cell"><span class="label">Diferença</span><div class="value num">${U.moneyDisplay(Math.abs(t.devAbs))}</div><div class="hint">${t.devAbs <= 0 ? 'Abaixo do orçamento' : 'Acima do orçamento'}</div></div>
            <div class="cell"><span class="label">Execução</span><div class="value num">${F.pct(t.pct)}</div><div class="hint">${esc(t.statusLabel)}</div></div>
            <div class="cell"><span class="label">Entradas</span><div class="value num">${income === null ? '—' : U.moneyDisplay(income)}</div>${income === null ? '<div class="pending-int">Depende da integração com o fluxo de caixa (A Receber).</div>' : '<div class="hint">Recebimentos do mês</div>'}</div>
            <div class="cell"><span class="label">Resultado mensal</span><div class="value num ${result !== null && result < 0 ? 'tone-over' : ''}">${result === null ? '—' : esc(F.signedMoney(result))}</div><div class="hint">${result === null ? 'Aguardando entradas' : result < 0 ? 'Entradas menores que os gastos' : 'Entradas superaram os gastos'}</div></div>
          </div>
          <div class="inverted" style="display:flex;flex-direction:column;justify-content:space-between;gap:24px">
            <span class="label">Síntese</span>
            <p class="h2" style="font-size:34px;line-height:1.05">${esc(sintese)}</p>
            <p style="font-size:15px;line-height:1.55;color:rgba(0,0,0,.72)">${sinteseSub}</p>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="panel">
          <div class="panel-head"><div><span class="label">Planejado × Realizado · ${esc(F.periodShort(p))}</span><h2 class="h2" style="margin-top:8px">Performance financeira das áreas</h2></div>
            <div class="legend"><span><i style="background:var(--steel)"></i>Planejado</span><span><i style="background:var(--cyan-signal)"></i>Realizado</span></div></div>
          ${U.barsChart(Object.values(a.byCenter).sort((x, y) => x.order - y.order))}
        </div>
      </section>

      <section class="section" aria-labelledby="sec-areas">
        ${sectionHead('Performance das áreas', '<span id="sec-areas">Cada centro de custo no mês</span>', '<span class="label">Valores calculados · análises editáveis</span>')}
        ${areaHtml}
      </section>

      <section class="section" aria-labelledby="sec-gastos">
        ${sectionHead('Principais gastos do mês', '<span id="sec-gastos">Para onde o dinheiro foi</span>')}
        <div class="spend-list">${tops.map((x, i) => `
          <button class="spend" data-opencat="${x.id}">
            <span class="rk">${String(i + 1).padStart(2, '0')}</span>
            <span><span class="nm">${esc(x.name)}</span><span class="label" style="display:block;margin-top:4px">${esc(F.centerById[x.centerId].name)} · ${F.pct((x.realized / t.realized) * 100)} do mês</span></span>
            <span class="bar-col">${U.bar(x, { size: 'xs' })}</span>
            <span class="r num">${F.money(x.realized)}</span>
            <span class="go text-fog">${I('chevron')}</span>
          </button>`).join('')}</div>
      </section>

      <section class="section" aria-labelledby="sec-panorama">
        ${sectionHead('Panorama geral', '<span id="sec-panorama">O mês em seis leituras</span>')}
        <div class="insights">
          <div class="insight"><span class="label">Gasto total</span><span class="big num">${F.money(t.realized, true)}</span><span class="s">${F.pct(t.pct)} do orçamento de ${F.money(t.planned, true)}</span></div>
          <div class="insight"><span class="label">Diferença contra o planejamento</span><span class="big num">${esc(F.signedMoney(t.devAbs, true))}</span><span class="s">${esc(t.deviationLabel)} (${esc(F.signedPct(t.devPct))})</span></div>
          <a class="insight" href="#/centros/${pan.maior.id}" data-setmonth><span class="label">Centro com maior gasto</span><span class="big">${esc(pan.maior.name)}</span><span class="s">${F.money(pan.maior.realized)} · ${F.pct((pan.maior.realized / t.realized) * 100)} do total</span></a>
          <a class="insight" href="#/centros/${pan.desvio.id}" data-setmonth><span class="label">Centro com maior desvio</span><span class="big">${esc(pan.desvio.name)}</span><span class="s">${esc(F.signedMoney(pan.desvio.devAbs))} · ${esc(pan.desvio.deviationLabel.toLowerCase())}</span></a>
          <a class="insight" href="#/centros/${pan.menor.id}" data-setmonth><span class="label">Centro com menor execução</span><span class="big">${esc(pan.menor.name)}</span><span class="s">${F.pct(pan.menor.pct)} executado · ${F.money(pan.menor.available)} disponíveis</span></a>
          <div class="insight"><span class="label">Categorias acima do orçamento</span><span class="big num">${pan.acima.length}</span><span class="s">${pan.acima.length ? pan.acima.slice(0, 4).map((x) => esc(x.name)).join(', ') + (pan.acima.length > 4 ? '…' : '') : 'Nenhuma categoria acima do previsto.'}</span></div>
        </div>
      </section>

      <section class="section">
        <div class="feature feature-iris" style="display:grid;grid-template-columns:1.2fr 1fr;gap:32px;align-items:end">
          <div><span class="label" style="color:rgba(255,255,255,.7)">Próxima etapa</span>
            <p class="h2" style="color:var(--pure);margin-top:14px;font-size:38px;line-height:1">Análises que se escrevem a partir dos dados.</p></div>
          <p style="color:rgba(255,255,255,.85);font-size:16px;line-height:1.6">Cada análise fica vinculada ao mês e ao centro de custo. Hoje ela pode ser escrita pelo responsável ou partir do rascunho automático; na próxima versão, poderá ser gerada por IA, revisada e salva mensalmente.</p>
        </div>
      </section>`;

    return {
      title: 'Carta Mensal', crumbs: [['Carta Mensal', '#/cmp'], [F.monthLabel(month)]], html, hidePeriod: true,
      mount(view) {
        view.querySelector('#cmp-month').addEventListener('change', (e) => { location.hash = `#/cmp/${e.target.value}`; });
        // Ao navegar da CMP para um centro, o período global passa a ser o mês da carta (contexto preservado)
        view.querySelectorAll('[data-setmonth]').forEach((el) => el.addEventListener('click', () => ctx.setPeriod(p, true)));
        view.addEventListener('click', (e) => {
          const oc = e.target.closest('[data-opencat]'); if (oc) { openCategory(oc.dataset.opencat, p); return; }
          const ed = e.target.closest('[data-edit]'); if (ed) { editAnalysis(ctx, month, p, ed.dataset.edit); return; }
          const ai = e.target.closest('[data-ai]'); if (ai) U.toast('Geração por IA prevista para a integração futura.');
        });
        view.addEventListener('keydown', (e) => {
          const oc = e.target.closest('[data-opencat]'); if (oc && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCategory(oc.dataset.opencat, p); }
        });
      },
    };
  }

  /** Modal de edição da análise mensal de um centro (salva localmente por mês × centro). */
  function editAnalysis(ctx, month, p, centerId) {
    const ce = F.centerById[centerId];
    const saved = F.getAnalysis(month, centerId);
    const draft = F.draftAnalysis(p, centerId);
    U.openModal(`
      <span class="label">Análise do mês · ${esc(F.monthLabel(month))}</span>
      <h2 class="h2" style="margin:10px 0 20px">${esc(ce.name)}</h2>
      <label><span class="sr-only">Texto da análise</span><textarea class="input" id="an-text" placeholder="Explique o resultado do centro no mês: principais gastos, desvios e próximos passos.">${esc(saved ? saved.text : '')}</textarea></label>
      <div class="pending-int" style="margin-top:12px">Rascunho automático disponível: “${esc(draft.slice(0, 140))}${draft.length > 140 ? '…' : ''}”</div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:24px;flex-wrap:wrap">
        <button class="btn btn-quiet btn-sm" id="an-draft">${I('spark')} Usar rascunho automático</button>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" data-close-modal>Cancelar</button>
          <button class="btn btn-primary" id="an-save">Salvar análise <span class="arr">→</span></button>
        </div>
      </div>`, (m) => {
      const ta = m.querySelector('#an-text');
      m.querySelector('#an-draft').addEventListener('click', () => { ta.value = draft; ta.focus(); });
      m.querySelector('#an-save').addEventListener('click', () => {
        F.saveAnalysis(month, centerId, ta.value, 'manual');
        U.closeModal();
        U.toast(ta.value.trim() ? 'Análise salva para ' + F.monthLabel(month) + '.' : 'Análise removida.');
        const y = window.scrollY;
        ctx.render();
        window.scrollTo(0, y);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Lançamentos                                                         */
  /* ------------------------------------------------------------------ */

  const VALOR_FAIXAS = [
    { value: '', label: 'Qualquer valor' }, { value: '0-100', label: 'Até R$ 100' },
    { value: '100-1000', label: 'R$ 100 a R$ 1.000' }, { value: '1000-5000', label: 'R$ 1.000 a R$ 5.000' },
    { value: '5000-', label: 'Acima de R$ 5.000' },
  ];

  function txPage(ctx, query) {
    const p = ctx.state.period;
    const f = ctx.state.txf;
    // Filtros vindos da URL (drill-down a partir de categoria/centro)
    if (query.q !== undefined || query.centro !== undefined || query.cat !== undefined) {
      f.q = query.q || ''; f.center = query.centro || ''; f.cat = query.cat || ''; f.type = ''; f.status = ''; f.range = '';
      if (f.cat && F.catById[f.cat]) f.center = F.catById[f.cat].centerId;
    }
    ctx.state.txLimit = 60;

    const catOpts = () => [{ value: '', label: 'Todas as categorias' }, ...F.D.categories.filter((c) => !f.center || c.centerId === f.center)
      .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')).map((c) => ({ value: c.id, label: c.name + (f.center ? '' : ` · ${F.centerById[c.centerId].name}`) }))];

    const html = `
      ${pageHead(`Lançamentos / ${F.periodShort(p)}`, 'Lançamentos financeiros', `Todos os gastos realizados em ${esc(F.periodRange(p))} de ${p.year} — a origem de cada número da plataforma.`,
        '<button class="btn btn-primary" id="new-tx">+ Novo lançamento <span class="arr">→</span></button>')}
      <div class="filters">
        <label class="search"><span class="sr-only">Buscar lançamentos</span>${I('search')}<input id="tx-q" class="input" type="search" placeholder="Buscar — ex.: ENEJ" value="${esc(f.q)}"></label>
        ${U.select('tx-center', [{ value: '', label: 'Todos os centros' }, ...F.centers.map((x) => ({ value: x.id, label: x.name }))], f.center, { label: 'Centro de custo' })}
        <span id="tx-cat-wrap">${U.select('tx-cat', catOpts(), f.cat, { label: 'Categoria' })}</span>
        ${U.select('tx-type', [{ value: '', label: 'Todos os tipos' }, { value: 'Fixo', label: 'Gasto fixo' }, { value: 'Variável', label: 'Gasto variável' }], f.type, { label: 'Tipo' })}
        ${U.select('tx-status', [{ value: '', label: 'Todos os status' }, { value: 'Pago', label: 'Pago' }, { value: 'Pendente', label: 'Pendente' }, { value: 'Em conciliação', label: 'Em conciliação' }], f.status, { label: 'Status' })}
        ${U.select('tx-range', VALOR_FAIXAS, f.range, { label: 'Faixa de valor' })}
        <button class="btn btn-quiet btn-sm" id="tx-clear">Limpar filtros</button>
      </div>
      <div class="result-sum" id="tx-sum"></div>
      <div class="table-wrap"><table class="t wide" id="tx-table"></table></div>
      <div style="display:flex;justify-content:center;margin-top:24px" id="tx-more"></div>`;

    function filtered() {
      const q = F.norm(f.q);
      const [mn, mx] = f.range ? f.range.split('-').map((x) => (x === '' ? null : Number(x))) : [null, null];
      return F.transactionsFor(p).filter((t) => {
        const cat = F.catById[t.categoryId];
        if (f.center && cat.centerId !== f.center) return false;
        if (f.cat && t.categoryId !== f.cat) return false;
        if (f.type && t.type !== f.type) return false;
        if (f.status && t.status !== f.status) return false;
        if (mn !== null && t.amount < mn) return false;
        if (mx !== null && t.amount >= mx) return false;
        if (q) {
          const item = t.itemId ? F.itemById[t.itemId].description : '';
          if (!F.norm(`${t.description} ${cat.name} ${F.centerById[cat.centerId].name} ${item} ${t.id}`).includes(q)) return false;
        }
        return true;
      });
    }

    function renderTable(view) {
      const s = ctx.state.txSort;
      const rows = filtered();
      const dir = s.dir === 'asc' ? 1 : -1;
      const v = (t) => ({ date: t.date + t.id, description: t.description, amount: t.amount, cat: F.catById[t.categoryId].name, center: F.centerById[F.catById[t.categoryId].centerId].name }[s.key]);
      rows.sort((x, y) => { const A = v(x), B = v(y); return (typeof A === 'string' ? A.localeCompare(B, 'pt-BR') : A - B) * dir; });
      const total = rows.reduce((z, t) => z + Math.round(t.amount * 100), 0) / 100;
      view.querySelector('#tx-sum').innerHTML = `<span class="display num">${U.moneyDisplay(total)}</span><span class="label">${rows.length} ${rows.length === 1 ? 'lançamento' : 'lançamentos'}${f.q ? ` para “${esc(f.q)}”` : ''}</span>`;
      const shown = rows.slice(0, ctx.state.txLimit);
      const th = (k, l, r) => `<th class="${r ? 'r' : ''}" aria-sort="${s.key === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button data-sort="${k}">${l}${s.key === k ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`;
      const stTone = (st) => (st === 'Pago' ? 'ok' : st === 'Pendente' ? 'warn' : 'idle');
      view.querySelector('#tx-table').innerHTML = `
        <thead><tr>${th('date', 'Data')}${th('description', 'Descrição')}${th('cat', 'Categoria')}${th('center', 'Centro')}${th('amount', 'Valor', 1)}<th>Tipo</th><th>Status</th></tr></thead>
        <tbody>${shown.length ? shown.map((t) => {
          const cat = F.catById[t.categoryId];
          return `<tr class="click" tabindex="0" data-tx="${t.id}">
            <td class="num mono" style="color:var(--ash)">${F.date(t.date)}</td>
            <td class="strong">${esc(t.description)}<span class="sub">${t.itemId ? esc(F.itemById[t.itemId].description) : '<span class="tone-over">Gasto não orçado</span>'}</span></td>
            <td>${esc(cat.name)}</td>
            <td>${esc(F.centerById[cat.centerId].name)}</td>
            <td class="r strong">${F.money(t.amount)}</td>
            <td>${t.type === 'Fixo' ? 'Fixo' : 'Variável'}</td>
            <td><span class="badge tone-${stTone(t.status)}">${esc(t.status)}</span></td>
          </tr>`;
        }).join('') : '<tr><td colspan="7"><div class="empty">Nenhum lançamento encontrado com os filtros atuais.</div></td></tr>'}</tbody>`;
      view.querySelector('#tx-more').innerHTML = rows.length > shown.length ? `<button class="btn btn-ghost" id="tx-more-btn">Mostrar mais ${Math.min(60, rows.length - shown.length)} de ${rows.length - shown.length} restantes</button>` : '';
    }

    return {
      title: 'Lançamentos', crumbs: [['Lançamentos']], html,
      mount(view) {
        renderTable(view);
        const re = () => { ctx.state.txLimit = 60; renderTable(view); };
        view.querySelector('#tx-q').addEventListener('input', (e) => { f.q = e.target.value; re(); });
        view.querySelector('#tx-center').addEventListener('change', (e) => {
          f.center = e.target.value;
          if (f.cat && F.catById[f.cat].centerId !== f.center && f.center) f.cat = '';
          view.querySelector('#tx-cat-wrap').innerHTML = U.select('tx-cat', catOpts(), f.cat, { label: 'Categoria' });
          re();
        });
        view.querySelector('#tx-cat-wrap').addEventListener('change', (e) => { f.cat = e.target.value; re(); });
        ['type', 'status', 'range'].forEach((k) => view.querySelector('#tx-' + k).addEventListener('change', (e) => { f[k] = e.target.value; re(); }));
        view.querySelector('#tx-clear').addEventListener('click', () => {
          Object.assign(f, { q: '', center: '', cat: '', type: '', status: '', range: '' });
          history.replaceState(null, '', '#/lancamentos');
          ctx.render();
        });
        view.addEventListener('click', (e) => {
          const s = e.target.closest('[data-sort]');
          if (s) {
            const st = ctx.state.txSort;
            ctx.state.txSort = { key: s.dataset.sort, dir: st.key === s.dataset.sort ? (st.dir === 'asc' ? 'desc' : 'asc') : (['description', 'cat', 'center'].includes(s.dataset.sort) ? 'asc' : 'desc') };
            renderTable(view); return;
          }
          if (e.target.closest('#tx-more-btn')) { ctx.state.txLimit += 60; renderTable(view); return; }
          const r = e.target.closest('tr[data-tx]'); if (r) openTx(r.dataset.tx);
        });
        view.querySelector('#tx-table').addEventListener('keydown', (e) => { const r = e.target.closest('tr[data-tx]'); if (r && e.key === 'Enter') openTx(r.dataset.tx); });
        view.querySelector('#new-tx').addEventListener('click', () => newTxModal(ctx));
      },
    };
  }

  /** Modal de novo lançamento (protótipo: grava apenas em memória e recalcula toda a plataforma). */
  function newTxModal(ctx) {
    const ms = F.periodMonths(ctx.state.period);
    const lastM = ms[ms.length - 1];
    const def = `${lastM}-${String(new Date(Number(lastM.slice(0, 4)), Number(lastM.slice(5)), 0).getDate()).padStart(2, '0')}`;
    const min = `${F.dataMonths[0]}-01`;
    const max = `${F.lastMonth}-30`;
    const centerOpts = F.centers.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    U.openModal(`
      <span class="label">Novo lançamento</span>
      <h2 class="h2" style="margin:10px 0 24px">Registrar gasto realizado</h2>
      <form id="ntx" class="form-grid" novalidate>
        <label class="full"><span class="label">Descrição</span><input class="input" name="description" required placeholder="Ex.: Uber — reunião com cliente"></label>
        <label><span class="label">Data</span><input class="input" type="date" name="date" value="${def}" min="${min}" max="${max}" required></label>
        <label><span class="label">Valor (R$)</span><input class="input" type="number" name="amount" min="0.01" step="0.01" required placeholder="0,00"></label>
        <label><span class="label">Centro de custo</span><span class="field" style="width:100%"><select class="select" name="center" style="width:100%">${centerOpts}</select>${I('down', 'chev')}</span></label>
        <label><span class="label">Categoria</span><span class="field" style="width:100%"><select class="select" name="category" style="width:100%"></select>${I('down', 'chev')}</span></label>
        <label class="full"><span class="label">Item do POT (referência)</span><span class="field" style="width:100%"><select class="select" name="item" style="width:100%"></select>${I('down', 'chev')}</span></label>
        <p class="full body-sm text-fog" id="ntx-err" role="alert"></p>
        <div class="full" style="display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button>
          <button type="submit" class="btn btn-primary">Registrar <span class="arr">→</span></button>
        </div>
      </form>
      <p class="label" style="margin-top:16px">Protótipo: o lançamento vale apenas para esta sessão.</p>`, (m) => {
      const fm = m.querySelector('#ntx');
      const fillCats = () => {
        fm.category.innerHTML = F.D.categories.filter((c) => c.centerId === fm.center.value).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        fillItems();
      };
      const fillItems = () => {
        const month = (fm.date.value || def).slice(0, 7);
        const its = F.D.items.filter((i) => i.categoryId === fm.category.value && i.month === month);
        fm.item.innerHTML = `<option value="">Sem item — gasto não orçado</option>` + its.map((i) => `<option value="${i.id}">${esc(i.description)} · ${F.money(i.planned)}</option>`).join('');
        if (its.length) fm.item.value = its[0].id;
      };
      fm.center.addEventListener('change', fillCats);
      fm.category.addEventListener('change', fillItems);
      fm.date.addEventListener('change', fillItems);
      fillCats();
      fm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = Number(fm.amount.value);
        const err = m.querySelector('#ntx-err');
        if (!fm.description.value.trim()) { err.textContent = 'Informe a descrição do gasto.'; fm.description.focus(); return; }
        if (!(amount > 0)) { err.textContent = 'Informe um valor maior que zero.'; fm.amount.focus(); return; }
        if (!fm.date.value || fm.date.value < min || fm.date.value > max) { err.textContent = 'Use uma data entre janeiro e setembro de 2026.'; fm.date.focus(); return; }
        F.addTransaction({ date: fm.date.value, description: fm.description.value.trim(), categoryId: fm.category.value, amount, itemId: fm.item.value || null });
        U.closeModal();
        U.toast(`Lançamento de ${F.money(amount)} registrado — indicadores recalculados.`);
        ctx.render();
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Configurações e perfil                                              */
  /* ------------------------------------------------------------------ */

  function settingsPage() {
    const L = F.LIMIARES;
    const html = `
      ${pageHead('Configurações', 'Configurações', 'Parâmetros usados nos cálculos e integrações previstas para as próximas versões.')}
      <section>
        ${sectionHead('Limiares de execução', '')}
        <div class="settings-list">
          <div class="settings-row"><div><div class="text-cloud">Saudável</div><div class="body-sm">Execução até ${L.atencao}% do orçado</div></div><span class="badge tone-ok">Saudável</span></div>
          <div class="settings-row"><div><div class="text-cloud">Atenção</div><div class="body-sm">De ${L.atencao}% a ${L.limite}%</div></div><span class="badge tone-warn">Atenção</span></div>
          <div class="settings-row"><div><div class="text-cloud">Próximo ao limite</div><div class="body-sm">De ${L.limite}% a ${L.teto}%</div></div><span class="badge tone-limit">Próximo ao limite</span></div>
          <div class="settings-row"><div><div class="text-cloud">Acima do orçamento</div><div class="body-sm">Mais de ${L.teto}% — ou gasto sem orçamento</div></div><span class="badge tone-over">Acima do orçamento</span></div>
        </div>
      </section>
      <section class="section">
        ${sectionHead('Estrutura', '')}
        <div class="settings-list">
          ${F.centers.map((c) => `<div class="settings-row"><div><div class="text-cloud">${esc(c.name)}</div><div class="body-sm">${F.D.categories.filter((x) => x.centerId === c.id).map((x) => esc(x.name)).join(' · ')}</div></div><button class="btn btn-ghost btn-sm" data-soon>Nova categoria</button></div>`).join('')}
        </div>
      </section>
      <section class="section">
        ${sectionHead('Integrações', '')}
        <div class="settings-list">
          ${[['Planilha do POT', 'Importação dos itens planejados'], ['VExpenses', 'Despesas de projetos e reembolsos'], ['Conta Azul', 'Lançamentos, entradas e conciliação'], ['Geração de análises por IA', 'Rascunho da CMP por centro de custo']].map(([n, d]) => `<div class="settings-row"><div><div class="text-cloud">${n}</div><div class="body-sm">${d}</div></div><span class="chip">Em breve</span></div>`).join('')}
        </div>
      </section>`;
    return {
      title: 'Configurações', crumbs: [['Configurações']], html, hidePeriod: true,
      mount(view) { view.querySelectorAll('[data-soon]').forEach((b) => b.addEventListener('click', () => U.toast('Criação de categorias prevista para a próxima versão.'))); },
    };
  }

  function profilePage() {
    const html = `
      ${pageHead('Perfil', 'Gerência Financeira', 'Diretoria de Operações · Empresa JR ADM UFBA')}
      <div class="settings-list">
        <div class="settings-row"><div><div class="text-cloud">Permissão</div><div class="body-sm">Visualiza todos os centros, edita análises da CMP</div></div><span class="chip">Editor</span></div>
        <div class="settings-row"><div><div class="text-cloud">Centros acompanhados</div><div class="body-sm">${F.centers.map((c) => esc(c.name)).join(' · ')}</div></div></div>
        <div class="settings-row"><div><div class="text-cloud">Autenticação</div><div class="body-sm">Login institucional previsto para a versão com backend</div></div><span class="chip">Em breve</span></div>
      </div>`;
    return { title: 'Perfil', crumbs: [['Perfil']], html, hidePeriod: true };
  }

  function notFound() {
    return { title: 'Página não encontrada', crumbs: [['Não encontrado']], html: `${pageHead('404', 'Página não encontrada', 'O endereço não corresponde a nenhuma tela.', '<a class="btn btn-primary" href="#/">Ir para a Visão Geral <span class="arr">→</span></a>')}` };
  }

  window.Pages = { overview, centersIndex, centerPage, potPage, cmpPage, txPage, settingsPage, profilePage, notFound, openCategory, openTx, openItem };
})();
