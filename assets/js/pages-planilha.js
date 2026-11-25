/**
 * pages-planilha.js — telas ligadas diretamente às planilhas Google.
 *
 *  - Indicadores financeiros (aba Operações › "Outros Indicadores");
 *  - Construtor do POT (rascunho → envio de itens para a aba [GERAL]);
 *  - Configurações (status da conexão, Apps Script e chave de acesso).
 *
 * Dependências: Fin (core.js), UI (ui.js), Sheets (sheets.js), Pages (pages.js), App (app.js).
 */
(function () {
  'use strict';

  const F = window.Fin;
  const U = window.UI;
  const S = window.Sheets;
  const P = window.Pages;
  const CFG = window.PAINEL_CONFIG;
  const { pageHead, sectionHead, knownCategories, sheetCenterName, IMPORTANCIAS, OBRIGATORIEDADES } = P._h;
  const esc = F.esc;
  const I = U.icon;

  /** Data/hora curta "25/11 14:32". */
  function stamp(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /* ------------------------------------------------------------------ */
  /* Indicadores                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Escolhe a linha "manchete" de um bloco: Resultado > Porcentagem/% > última.
   * É o número que o indicador existe para responder.
   */
  function headline(block) {
    return block.rows.find((r) => /^resultado/i.test(r.label))
      || block.rows.find((r) => /^porcentagem$|^%$/i.test(r.label))
      || block.rows[block.rows.length - 1];
  }

  /**
   * Anula meses ainda não preenchidos: na planilha aparecem como "R$ -" (zero)
   * e desenhariam uma queda falsa. Zera meses após o corrente e os zeros finais.
   */
  function untilNow(block, values) {
    const out = values.map((v, i) => (block.months[i] > F.lastMonth ? null : v));
    for (let i = out.length - 1; i >= 0 && (out[i] === null || out[i] === 0); i--) out[i] = null;
    return out;
  }

  /**
   * Meses exibidos no gráfico para o período global:
   *  - mês → o trimestre que o contém (um ponto só não mostra tendência);
   *  - trimestre → os 3 meses; ano → os 12 meses.
   * Também devolve os meses "do período" (para o valor em destaque e a tabela).
   */
  function viewMonths(p) {
    const y = p.year;
    const ym = (m) => `${y}-${String(m).padStart(2, '0')}`;
    // Meses escolhidos: o gráfico mostra exatamente esses meses, lado a lado
    if (p.kind === 'custom') return { chart: p.months.slice(), focus: p.months.slice() };
    if (p.kind === 'year') { const all = Array.from({ length: 12 }, (_, i) => ym(i + 1)); return { chart: all, focus: all }; }
    const q = p.kind === 'quarter' ? p.quarter : Math.ceil(p.month / 3);
    const chart = [1, 2, 3].map((i) => ym((q - 1) * 3 + i));
    return { chart, focus: p.kind === 'month' ? [ym(p.month)] : chart };
  }

  /** Recorta os valores de uma linha para uma lista de meses (null onde o bloco não tem o mês). */
  function pick(block, row, months) {
    const vals = untilNow(block, row.values);
    return months.map((m) => { const i = block.months.indexOf(m); return i < 0 ? null : vals[i]; });
  }

  /**
   * Meses que entram na média em destaque: o ano do período, de janeiro até o
   * fim do período escolhido (o ano inteiro quando o período é "Ano").
   * Assim, Q2/2026 mostra a média jan–jun e o ano mostra a média do ano.
   * @param {Period} p
   * @returns {string[]} "AAAA-MM"
   */
  function avgMonths(p) {
    if (p.kind === 'custom') return p.months.slice(); // análise conjunta: média só dos meses escolhidos
    const all = viewMonths({ kind: 'year', year: p.year }).chart;
    const end = p.kind === 'year' ? all[11] : F.periodMonths(p).slice(-1)[0];
    return all.filter((m) => m <= end);
  }

  /**
   * Média mensal de uma linha nos meses preenchidos (meses vazios não contam).
   * Percentuais usam a média simples dos meses, como na leitura mensal da planilha.
   * @returns {{v:number, n:number, from:string, to:string, last:{v:number, month:string}}|null}
   * @example average(bloco, manchete, avgMonths(p)) // → { v: 0.403, n: 9, from: '2026-01', to: '2026-09', ... }
   */
  function average(block, row, months) {
    const vals = pick(block, row, months);
    const filled = months.map((m, i) => [m, vals[i]]).filter(([, v]) => v !== null && Number.isFinite(v));
    if (!filled.length) return null;
    const [lastM, lastV] = filled[filled.length - 1];
    return { v: filled.reduce((s, [, v]) => s + v, 0) / filled.length, n: filled.length, from: filled[0][0], to: lastM, last: { v: lastV, month: lastM } };
  }

  /** Séries do gráfico: a manchete primeiro (Cyan Signal) e as linhas da mesma unidade, até 4. */
  function plottedOf(block, h, months, onlyKind, hidden) {
    const kind = onlyKind || h.kind;
    const first = h.kind === kind ? [h] : [];
    return [...first, ...block.rows.filter((r) => r !== h && r.kind === kind)]
      .filter((r) => !hidden || !hidden.has(r.label)).slice(0, 4)
      .map((r) => ({ name: r.label, values: pick(block, r, months) }));
  }

  /** Chips de meta/progresso/total vindos da planilha. */
  function chipsOf(b, h) {
    return [b.meta && `<span class="chip">Meta ${esc(b.meta)}</span>`, b.progress && `<span class="chip">Progresso ${esc(b.progress)}</span>`, h.total && `<span class="chip">Total ${esc(h.total)}</span>`].filter(Boolean).join('');
  }

  /**
   * Tabela de valores do bloco nos meses indicados (meses do período em destaque),
   * com a coluna "Média" calculada sobre `avgMs` (mesma conta do número em destaque).
   */
  function dataTable(b, months, focus, avgMs) {
    return `<div class="table-wrap"><table class="t ind-table" style="min-width:${Math.max(420, 260 + months.length * 96)}px">
      <thead><tr><th>Linha</th>${months.map((m) => `<th class="r${focus.includes(m) ? ' is-focus' : ''}">${F.MESES_CURTOS[Number(m.slice(5)) - 1]}</th>`).join('')}<th class="r is-avg">Média</th><th class="r">Total</th></tr></thead>
      <tbody>${b.rows.map((r) => {
        const vals = pick(b, r, months);
        const a = average(b, r, avgMs);
        return `<tr><td class="strong">${esc(r.label)}</td>${vals.map((v, i) => `<td class="r${focus.includes(months[i]) ? ' is-focus' : ''}">${esc(U.fmtKind(r.kind, v))}</td>`).join('')}<td class="r is-avg">${esc(a ? U.fmtKind(r.kind, a.v) : '—')}</td><td class="r">${esc(r.total || '—')}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  /** Agrupa blocos pelo tema definido em config.indicadores.grupos (ordem preservada). */
  function byTheme(blocks) {
    const out = [];
    blocks.forEach((b) => {
      const t = b.theme || 'Outros indicadores';
      let g = out.find((x) => x.name === t);
      if (!g) out.push(g = { name: t, blocks: [] });
      g.blocks.push(b);
    });
    return out;
  }

  /** Seletor "ver indicador sozinho", agrupado pela ordem da planilha. */
  function indicatorPicker(ind, current) {
    const opts = [{ value: '', label: 'Todos os indicadores' }, ...ind.blocks.map((b) => ({ value: b.id, label: b.title }))];
    return U.select('ind-pick', opts, current || '', { label: 'Ver um indicador' });
  }

  /** Estado vazio/erro comum às duas telas de indicadores. */
  function indicatorsUnavailable(head, st) {
    const denied = st.indCode === 'denied' || st.indCode === 'network';
    return `${head}<div class="panel notice">
      <span class="label tone-limit">Planilha de indicadores indisponível</span>
      <h2 class="h2" style="margin:12px 0 16px">${denied ? 'A planilha ainda não está compartilhada' : 'Não encontramos os indicadores'}</h2>
      ${denied ? `<p class="body-sm" style="max-width:640px">O painel lê a planilha direto do navegador, então ela precisa permitir leitura por link. Na planilha, clique em <strong class="text-cloud">Compartilhar → Acesso geral → Qualquer pessoa com o link (Leitor)</strong>. Depois, volte aqui e atualize.</p>`
        : `<p class="body-sm" style="max-width:640px">A aba foi lida, mas nenhum bloco foi encontrado abaixo de “${esc(CFG.indicadores.marcador)}”. Confira se o marcador continua na aba Operações.</p>`}
      <p class="label" style="margin-top:16px">Detalhe: ${esc(st.indError || 'sem resposta')}</p>
      <button class="btn btn-primary" style="margin-top:24px" data-reload>${I('refresh')} Tentar de novo</button>
    </div>`;
  }

  /** Liga o seletor de indicador (navega para a visão individual). */
  function mountPicker(view) {
    const sel = view.querySelector('#ind-pick');
    if (sel) sel.addEventListener('change', (e) => { location.hash = e.target.value ? `#/indicadores/${e.target.value}` : '#/indicadores'; });
    const r = view.querySelector('[data-reload]');
    if (r) r.addEventListener('click', () => window.App.reload(true));
  }

  /**
   * Barra de seleção múltipla: cada indicador é um botão liga/desliga.
   * A seleção vai para a URL (?sel=id1,id2) para poder ser compartilhada.
   */
  function selectionBar(ind, sel) {
    const all = !sel.length;
    const groups = byTheme(ind.blocks);
    return `<div class="ind-select" role="group" aria-label="Indicadores exibidos">
      <div class="ind-select-top">
        <button class="toggle toggle-all" data-sel-all aria-pressed="${all}">Todos</button>
        <span class="label">${all ? `${ind.blocks.length} indicadores` : `${sel.length} de ${ind.blocks.length} selecionados`} · clique para combinar</span>
      </div>
      <div class="ind-groups">${groups.map((g, gi) => {
        const on = g.blocks.every((b) => sel.includes(b.id));
        return `<div class="ind-group">
          <button class="ind-group-name label" data-sel-group="${gi}" aria-pressed="${on}" title="Selecionar o grupo inteiro">${esc(g.name)} <span>${g.blocks.length}</span></button>
          <div class="ind-group-chips">${g.blocks.map((b) => `<button class="toggle" data-sel="${b.id}" aria-pressed="${sel.includes(b.id)}">${esc(b.title)}</button>`).join('')}</div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  function indicatorsPage(ctx, id, query = {}) {
    const sync = window.App.sync;
    const ind = sync.indicators;
    const st = sync.status || {};
    const p = ctx.state.period;
    const openSheet = `<a class="btn btn-ghost" href="${CFG.indicadores.url}" target="_blank" rel="noopener">Abrir planilha ${I('external')}</a>`;

    if (!ind || !ind.blocks.length) {
      const head = pageHead('Indicadores', 'Indicadores financeiros', '', openSheet);
      return { title: 'Indicadores', crumbs: [['Indicadores']], html: indicatorsUnavailable(head, st), mount: mountPicker };
    }
    if (id) return indicatorDetail(ctx, ind, id, openSheet);

    // Seleção: URL tem prioridade; sem ela, mantém a última escolha da sessão
    const valid = new Set(ind.blocks.map((b) => b.id));
    if (query.sel !== undefined) ctx.state.indSel = String(query.sel).split(',').filter((x) => valid.has(x));
    const sel = (ctx.state.indSel || []).filter((x) => valid.has(x));
    const shown = sel.length ? ind.blocks.filter((b) => sel.includes(b.id)) : ind.blocks;

    const vm = viewMonths(p);
    const am = avgMonths(p);
    const hasData = ind.blocks.some((b) => vm.chart.some((m) => b.months.includes(m)));
    const head = pageHead(`Indicadores / ${F.periodShort(p)}`, 'Indicadores financeiros',
      p.kind === 'custom'
        ? `Painel de Bordo · aba Operações. Em destaque, a média de ${esc(F.periodPhrase(p))}.`
        : `Painel de Bordo · aba Operações. Em destaque, a média mensal de ${p.year}${p.kind === 'year' ? '' : ` até ${esc(F.MESES[Number(am[am.length - 1].slice(5)) - 1])}`}; o gráfico mostra ${p.kind === 'year' ? 'o ano' : esc(F.periodRange(p))}.`,
      openSheet);

    // Faixa de destaque: indicadores mais executivos (ordem de preferência)
    const PREF = [/resultado de caixa/i, /cash runway/i, /conversao de receitas|conversão de receitas/i, /rigidez/i];
    const picked = [];
    PREF.forEach((re) => { const b = shown.find((x) => re.test(x.title) && !picked.includes(x)); if (b && picked.length < 4) picked.push(b); });
    shown.forEach((b) => { if (picked.length < 4 && !picked.includes(b)) picked.push(b); });

    const strip = picked.map((b) => {
      const h = headline(b);
      const a = average(b, h, am);
      return `<a class="cell ind-kpi" href="#/indicadores/${b.id}">
        <span class="label">${esc(b.title)}</span>
        <div class="value num">${a ? esc(U.fmtKind(h.kind, a.v)) : '—'}</div>
        
      </a>`;
    }).join('');

    const card = (b) => {
      const h = headline(b);
      const a = average(b, h, am);
      const plotted = plottedOf(b, h, vm.chart);
      const chips = chipsOf(b, h);
      return `<article class="panel ind-card" id="ind-${b.id}" data-block="${b.id}">
        <div class="panel-head" style="margin-bottom:16px">
          <div>${b.group ? `<span class="label">${esc(b.group)}</span>` : ''}<h2 class="h2"${b.group ? ' style="margin-top:8px"' : ''}><a href="#/indicadores/${b.id}" class="ind-title">${esc(b.title)}</a></h2></div>
        </div>
        <div class="ind-head">
          <div><div class="display num ind-value">${a ? esc(U.fmtKind(h.kind, a.v)) : '—'}</div></div>
          ${chips ? `<div class="ind-chips">${chips}</div>` : ''}
        </div>
        ${U.seriesChart(vm.chart, plotted, h.kind, { avg: a ? a.v : null })}
        <div class="legend" style="margin-top:4px">${plotted.map((s, k) => `<span><i class="line" style="background:${U.SERIES_COLORS[k]}"></i>${esc(s.name)}</span>`).join('')}${a ? '<span><i class="dash avg"></i>Média</span>' : ''}</div>
        <div class="ind-foot">
          <details class="ind-details"><summary class="btn btn-quiet btn-sm">Ver dados</summary>${dataTable(b, vm.chart, vm.focus, am)}</details>
          <a class="btn btn-ghost btn-sm" href="#/indicadores/${b.id}">Ver sozinho <span class="arr">→</span></a>
        </div>
      </article>`;
    };
    // Cards separados por tema; com um só tema visível o título do grupo é dispensável
    const themes = byTheme(shown);
    const cards = themes.map((g) => `${themes.length > 1 ? `<h2 class="ind-theme label">${esc(g.name)}</h2>` : ''}${g.blocks.map(card).join('')}`).join('');

    const html = `${head}
      ${st.ind === 'cache' ? `<div class="pending-int" style="margin:-24px 0 32px">Sem acesso à planilha agora — exibindo a cópia lida em ${esc(stamp(st.indCachedAt))}.</div>` : ''}
      ${selectionBar(ind, sel)}
      ${hasData ? `<div class="stat-strip ind-strip${picked.length < 4 ? ' n' + picked.length : ''}" style="margin-bottom:var(--s48)">${strip}</div><div class="ind-grid${shown.length === 1 ? ' single' : ''}">${cards}</div>`
        : `<div class="panel notice"><span class="label">Sem dados</span><p class="body-sm" style="margin-top:8px">A aba de indicadores não tem valores para ${esc(F.periodLabel(p))}. Selecione um período de ${esc([...new Set(ind.blocks[0].months.map((m) => m.slice(0, 4)))].join(', '))}.</p></div>`}
      <p class="label" style="margin-top:var(--s40)">${sel.length ? `${shown.length} de ` : ''}${ind.blocks.length} indicadores lidos abaixo de “${esc(CFG.indicadores.marcador)}” · atualizado ${esc(stamp(st.loadedAt))}</p>`;

    return {
      title: 'Indicadores', crumbs: [['Indicadores']], html,
      mount(view) {
        mountPicker(view);
        const go = (ids) => { ctx.state.indSel = ids; location.hash = ids.length ? `#/indicadores?sel=${ids.join(',')}` : '#/indicadores?sel='; };
        view.querySelector('[data-sel-all]').addEventListener('click', () => go([]));
        view.querySelectorAll('[data-sel]').forEach((btn) => btn.addEventListener('click', () => {
          const k = btn.dataset.sel;
          go(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]);
        }));
        // Nome do grupo: marca o grupo inteiro ou, se já estiver todo marcado, desmarca
        const groups = byTheme(ind.blocks);
        view.querySelectorAll('[data-sel-group]').forEach((btn) => btn.addEventListener('click', () => {
          const ids = groups[Number(btn.dataset.selGroup)].blocks.map((b) => b.id);
          const on = ids.every((x) => sel.includes(x));
          go(on ? sel.filter((x) => !ids.includes(x)) : [...sel, ...ids.filter((x) => !sel.includes(x))]);
        }));
        if (!hasData) return;
        shown.forEach((b) => {
          const el = view.querySelector(`[data-block="${b.id}"]`);
          const h = headline(b);
          U.mountSeries(el, vm.chart, plottedOf(b, h, vm.chart), h.kind, b.rows.map((r) => ({ ...r, values: pick(b, r, vm.chart) })));
        });
      },
    };
  }

  /**
   * Visão individual de um indicador: valor do período, escolha da unidade e
   * das séries no gráfico, tabela do período e navegação entre indicadores.
   */
  function indicatorDetail(ctx, ind, id, openSheet) {
    const p = ctx.state.period;
    const idx = ind.blocks.findIndex((b) => b.id === id);
    if (idx < 0) {
      return { title: 'Indicador', crumbs: [['Indicadores', '#/indicadores'], ['Não encontrado']], html: pageHead('Indicadores', 'Indicador não encontrado', 'Ele pode ter sido renomeado na planilha.', `${indicatorPicker(ind)}`), mount: mountPicker };
    }
    const b = ind.blocks[idx];
    const h = headline(b);
    const vm = viewMonths(p);
    const am = avgMonths(p);
    const a = average(b, h, am);
    const kinds = [...new Set([h.kind, ...b.rows.map((r) => r.kind)])];
    const KIND_LABEL = { money: 'R$', pct: '%', num: 'Nº' };
    ctx.state.indView = ctx.state.indView || {};
    const vs = ctx.state.indView[id] || (ctx.state.indView[id] = { kind: h.kind, hidden: new Set() });
    if (!kinds.includes(vs.kind)) vs.kind = h.kind;
    const prev = ind.blocks[idx - 1], next = ind.blocks[idx + 1];
    const yearMonths = viewMonths({ kind: 'year', year: p.year }).chart;

    const html = `
      <nav class="crumbs-inline"><a class="label" href="#/indicadores">← Todos os indicadores</a></nav>
      ${pageHead(`Indicador / ${F.periodShort(p)}`, esc(b.title), b.group ? `Parte de ${esc(b.group)} · Painel de Bordo` : 'Painel de Bordo · aba Operações', `${indicatorPicker(ind, id)}${openSheet}`)}
      <section class="hero" aria-label="${esc(b.title)}">
        <div class="hero-main">
          <div class="hero-foot"><span class="label label-strong">${esc(h.label)}</span></div>
          <div class="hero-figure"><span class="display num" style="font-size:clamp(56px,7vw,96px)">${a ? esc(U.fmtKind(h.kind, a.v)) : '—'}</span></div>
        </div>
        <div class="stats">
          ${b.rows.filter((r) => r !== h).slice(0, 4).map((r) => { const v = average(b, r, am); return `<div class="stat"><div><span class="label">${esc(r.label)}</span></div><span class="value num" style="font-size:24px">${v ? esc(U.fmtKind(r.kind, v.v)) : '—'}</span></div>`; }).join('')}
          ${b.meta || b.progress ? `<div class="stat"><div><span class="label">Meta</span></div><span class="value" style="font-size:20px">${esc(b.meta || '—')}</span></div>` : ''}
        </div>
      </section>

      <section class="section">
        <div class="panel">
          <div class="panel-head">
            <div><span class="label">Evolução · ${p.kind === 'year' ? esc(String(p.year)) : 'ano de ' + p.year}</span><h2 class="h2" style="margin-top:8px">Mês a mês</h2></div>
            ${kinds.length > 1 ? `<div class="seg" role="group" aria-label="Unidade do gráfico">${kinds.map((k) => `<button data-kind-ind="${k}" aria-pressed="${vs.kind === k}">${KIND_LABEL[k]}</button>`).join('')}</div>` : ''}
          </div>
          <div class="series-toggles" role="group" aria-label="Séries no gráfico">${b.rows.filter((r) => r.kind === vs.kind).map((r) => `<button class="toggle" data-series-row="${esc(r.label)}" aria-pressed="${!vs.hidden.has(r.label)}">${esc(r.label)}</button>`).join('')}</div>
          <div id="ind-chart"></div>
        </div>
      </section>

      <section class="section">
        ${sectionHead('Valores', p.kind === 'year' ? `Todos os meses de ${p.year}` : `${esc(F.periodLabel(p))} em destaque`)}
        ${dataTable(b, yearMonths, vm.focus, am)}
      </section>

      <nav class="ind-nav">
        ${prev ? `<a class="btn btn-ghost" href="#/indicadores/${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="btn btn-ghost" href="#/indicadores/${next.id}">${esc(next.title)} →</a>` : ''}
      </nav>`;

    /** Redesenha só o gráfico (troca de unidade/séries), sem recarregar a página. */
    function drawChart(view) {
      const plotted = plottedOf(b, h, yearMonths, vs.kind, vs.hidden);
      const box = view.querySelector('#ind-chart');
      // Linha de média só quando o gráfico está na unidade da manchete e ela está visível
      const showAvg = a && vs.kind === h.kind && !vs.hidden.has(h.label);
      box.innerHTML = plotted.length
        ? `${U.seriesChart(yearMonths, plotted, vs.kind, { avg: showAvg ? a.v : null })}<div class="legend" style="margin-top:4px">${plotted.map((s, k) => `<span><i class="line" style="background:${U.SERIES_COLORS[k]}"></i>${esc(s.name)}</span>`).join('')}${showAvg ? '<span><i class="dash avg"></i>Média</span>' : ''}</div>`
        : '<div class="empty">Selecione ao menos uma série.</div>';
      if (plotted.length) U.mountSeries(box, yearMonths, plotted, vs.kind, b.rows.map((r) => ({ ...r, values: pick(b, r, yearMonths) })));
    }

    return {
      title: b.title, crumbs: [['Indicadores', '#/indicadores'], [b.title]], html,
      mount(view) {
        mountPicker(view);
        drawChart(view);
        view.querySelectorAll('[data-kind-ind]').forEach((btn) => btn.addEventListener('click', () => { vs.kind = btn.dataset.kindInd; ctx.render(); }));
        view.querySelectorAll('[data-series-row]').forEach((btn) => btn.addEventListener('click', () => {
          const k = btn.dataset.seriesRow;
          vs.hidden.has(k) ? vs.hidden.delete(k) : vs.hidden.add(k);
          btn.setAttribute('aria-pressed', !vs.hidden.has(k));
          drawChart(view);
        }));
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Construtor do POT                                                   */
  /* ------------------------------------------------------------------ */

  const DRAFT_KEY = 'potcmp.builder.v1';

  function readDrafts() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (e) { return {}; } }
  function writeDrafts(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* sem armazenamento: rascunho só em memória */ } }

  /** Trimestre a partir de "2027-1". */
  function parseQ(k) {
    const m = String(k || '').match(/^(\d{4})-([1-4])$/);
    return m ? { kind: 'quarter', year: Number(m[1]), quarter: Number(m[2]) } : null;
  }
  const qKey = (q) => `${q.year}-${q.quarter}`;
  const shiftQ = (q, n) => { const t = q.year * 4 + (q.quarter - 1) + n; return { kind: 'quarter', year: Math.floor(t / 4), quarter: (t % 4) + 1 }; };

  let seq = 0;
  /** Nova linha de rascunho com valores padrão. */
  function blankRow(q, extra = {}) {
    return { id: `d${Date.now().toString(36)}${(seq++).toString(36)}`, month: F.periodMonths(q)[0], center: '', category: '', description: '', planned: '', importance: '', obligation: '', custeio: 'Fixo', ...extra };
  }

  /** Erros de validação de uma linha (lista vazia = ok). Mesmas regras do Apps Script. */
  function rowErrors(r) {
    const e = [];
    if (!r.center) e.push('center');
    if (!String(r.category).trim()) e.push('category');
    if (!String(r.description).trim()) e.push('description');
    if (!(Number(r.planned) > 0)) e.push('planned');
    return e;
  }

  function builderPage(ctx, query) {
    const now = { kind: 'quarter', year: F.D.meta.year, quarter: F.D.meta.currentQuarter };
    // Padrão: próximo trimestre — o POT é montado antes de o trimestre começar
    const q = parseQ(query.q) || shiftQ(now, 1);
    const prevQ = shiftQ(q, -1);
    const months = F.periodMonths(q);
    const drafts = readDrafts();
    let rows = drafts[qKey(q)] || [];
    const save = () => { const d = readDrafts(); if (rows.length) d[qKey(q)] = rows; else delete d[qKey(q)]; writeDrafts(d); };
    const cats = knownCategories();
    const catByNorm = new Map(cats.map((c) => [F.norm(c.name), c]));
    const centers = F.centers.filter((c) => c.id !== 'sem-centro');
    const qOpts = [-1, 0, 1, 2, 3].map((n) => shiftQ(now, n)).map((x) => ({ value: qKey(x), label: F.periodLabel(x) + (qKey(x) === qKey(now) ? ' (atual)' : '') }));
    const writable = S.canWrite();
    const existing = F.aggregate(q);
    const prev = F.aggregate(prevQ);

    const html = `
      <nav class="crumbs-inline"><a class="label" href="#/pot">← Planejamento orçamentário</a></nav>
      ${pageHead(`Planejamento orçamentário / construção`, 'Construir orçamento',
        `Monte o POT de ${esc(F.periodLabel(q))} (${esc(F.periodRange(q))}). Os itens ficam em rascunho até você enviá-los para a aba [GERAL] da planilha.`,
        `${U.select('bq', qOpts, qKey(q), { label: 'Trimestre do orçamento' })}
         <span class="chip ${writable ? '' : 'chip-warn'}">${writable ? 'Conectado à planilha' : 'Somente rascunho'}</span>`)}
      ${writable ? '' : `<div class="panel notice" style="margin-bottom:var(--s40)"><span class="label tone-warn">Escrita desativada</span><p class="body-sm" style="margin-top:8px;max-width:720px">Você pode montar o rascunho normalmente (ele fica salvo neste navegador). Para enviar à planilha, instale o Apps Script e informe a URL e a chave em <a href="#/configuracoes" class="text-cloud" style="text-decoration:underline">Configurações</a>.</p></div>`}

      <section aria-labelledby="sec-resumo-b">
        ${sectionHead('Resumo por centro', `<span id="sec-resumo-b">Como fica o trimestre</span>`)}
        <div class="table-wrap"><table class="t" id="b-summary" style="min-width:820px"></table></div>
      </section>

      <section class="section" aria-labelledby="sec-draft">
        ${sectionHead('Rascunho', `<span id="sec-draft">Itens a enviar</span>`,
          `<button class="btn btn-ghost btn-sm" id="b-copy">${I('copy')} Copiar ${esc(F.periodLabel(prevQ))}</button>
           <button class="btn btn-quiet btn-sm" id="b-clear">${I('trash')} Limpar rascunho</button>`)}
        <div class="table-wrap"><table class="t builder" id="b-table"></table></div>
        <datalist id="b-cats">${cats.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
        <div class="builder-foot">
          <button class="btn btn-ghost" id="b-add">${I('plus')} Adicionar item</button>
          <div class="builder-total" id="b-total"></div>
          <button class="btn btn-primary" id="b-send">Enviar para a planilha <span class="arr">→</span></button>
        </div>
        <p class="body-sm" id="b-msg" role="status" style="margin-top:12px"></p>
      </section>

      <section class="section" aria-labelledby="sec-exist">
        ${sectionHead('Já na planilha', `<span id="sec-exist">${existing.items.length} itens planejados em ${esc(F.periodLabel(q))}</span>`)}
        ${existing.items.length ? `<div class="table-wrap"><table class="t wide" id="b-exist">
          <thead><tr><th>Mês</th><th>Descrição</th><th>Categoria</th><th>Centro</th><th class="r">Planejado</th><th class="r">Realizado</th></tr></thead>
          <tbody>${existing.items.slice().sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row).map((i) => {
            const m = existing.byItem[i.id]; const c = F.catById[i.categoryId];
            return `<tr class="click" tabindex="0" data-item="${i.id}"><td class="mono">${F.MESES_CURTOS[Number(i.month.slice(5)) - 1]}</td><td class="strong">${esc(i.description)}</td><td>${esc(c.name)}</td><td>${esc(F.centerById[c.centerId].name)}</td><td class="r">${F.money(i.planned)}</td><td class="r">${F.money(m.realized)}</td></tr>`;
          }).join('')}</tbody></table></div>` : '<div class="empty">Nenhum item deste trimestre na planilha ainda.</div>'}
      </section>`;

    /** Resumo por centro: planilha + rascunho vs. trimestre anterior. */
    function renderSummary(view) {
      const draftBy = {};
      rows.forEach((r) => { if (r.center && Number(r.planned) > 0) draftBy[r.center] = (draftBy[r.center] || 0) + Math.round(Number(r.planned) * 100); });
      let tE = 0, tD = 0, tPP = 0, tPR = 0;
      const line = (name, e, d, pp, pr, strong) => {
        const tot = e + d;
        const vs = pr > 0 ? ((tot - pr) / pr) * 100 : null;
        return `<tr${strong ? ' class="total-row"' : ''}><td class="${strong ? '' : 'strong'}">${esc(name)}</td><td class="r">${F.money(e / 100)}</td><td class="r">${d ? F.money(d / 100) : '—'}</td><td class="r strong">${F.money(tot / 100)}</td><td class="r">${F.money(pp / 100)}</td><td class="r">${F.money(pr / 100)}</td><td class="r mono">${vs === null ? '—' : F.signedPct(vs)}</td></tr>`;
      };
      const body = centers.map((c) => {
        const e = existing.byCenter[c.id] ? existing.byCenter[c.id].pc : 0;
        const d = draftBy[c.id] || 0;
        const pp = prev.byCenter[c.id] ? prev.byCenter[c.id].pc : 0;
        const pr = prev.byCenter[c.id] ? prev.byCenter[c.id].rc : 0;
        tE += e; tD += d; tPP += pp; tPR += pr;
        return line(c.name, e, d, pp, pr);
      }).join('');
      view.querySelector('#b-summary').innerHTML = `
        <thead><tr><th>Centro</th><th class="r">Já na planilha</th><th class="r">Rascunho</th><th class="r">Total proposto</th><th class="r">${esc(F.periodShort(prevQ))} planejado</th><th class="r">${esc(F.periodShort(prevQ))} realizado</th><th class="r">vs. realizado</th></tr></thead>
        <tbody>${body}</tbody><tfoot>${line('Total', tE, tD, tPP, tPR, true)}</tfoot>`;
    }

    /** Tabela editável do rascunho. Cada campo grava no estado sem re-render (preserva o foco). */
    function renderDraft(view) {
      const opt = (arr, v, empty) => [`<option value="">${empty}</option>`, ...arr.map((x) => `<option value="${esc(x.value)}"${x.value === v ? ' selected' : ''}>${esc(x.label)}</option>`)].join('');
      const mOpts = months.map((m) => ({ value: m, label: F.MESES_CURTOS[Number(m.slice(5)) - 1] }));
      const cOpts = centers.map((c) => ({ value: c.id, label: c.name }));
      const simple = (arr) => arr.map((x) => ({ value: x, label: x }));
      view.querySelector('#b-table').innerHTML = `
        <thead><tr><th>Mês</th><th>Centro</th><th>Categoria</th><th>Descrição</th><th class="r">Valor (R$)</th><th>Custeio</th><th>Importância</th><th>Obrigatoriedade</th><th><span class="sr-only">Remover</span></th></tr></thead>
        <tbody>${rows.length ? rows.map((r) => {
          const known = catByNorm.get(F.norm(r.category));
          return `<tr data-row="${r.id}">
            <td><select class="select sm" data-f="month" aria-label="Mês">${opt(mOpts, r.month, '—')}</select></td>
            <td><select class="select sm" data-f="center" aria-label="Centro">${opt(cOpts, r.center, 'Centro')}</select></td>
            <td><input class="input sm" data-f="category" list="b-cats" value="${esc(r.category)}" placeholder="Categoria" aria-label="Categoria">${r.category && !known ? '<span class="label tone-warn new-cat">Nova categoria</span>' : ''}</td>
            <td><input class="input sm wide-in" data-f="description" value="${esc(r.description)}" placeholder="Descrição do gasto" maxlength="200" aria-label="Descrição"></td>
            <td><input class="input sm num-in" data-f="planned" type="number" min="0.01" step="0.01" value="${esc(r.planned)}" placeholder="0,00" aria-label="Valor planejado"></td>
            <td><select class="select sm" data-f="custeio" aria-label="Custeio"${known ? ' disabled' : ''}>${opt(simple(['Fixo', 'Variável']), known ? known.custeio : r.custeio, '—')}</select></td>
            <td><select class="select sm" data-f="importance" aria-label="Importância">${opt(simple(IMPORTANCIAS), r.importance, '—')}</select></td>
            <td><select class="select sm" data-f="obligation" aria-label="Obrigatoriedade">${opt(simple(OBRIGATORIEDADES), r.obligation, '—')}</select></td>
            <td><button class="icon-btn" data-del="${r.id}" aria-label="Remover linha">${I('close')}</button></td>
          </tr>`;
        }).join('') : `<tr><td colspan="9"><div class="empty">Rascunho vazio. Adicione itens ou copie o ${esc(F.periodLabel(prevQ))} como ponto de partida.</div></td></tr>`}</tbody>`;
      updateTotals(view);
    }

    function updateTotals(view) {
      const valid = rows.filter((r) => !rowErrors(r).length);
      const total = valid.reduce((s, r) => s + Math.round(Number(r.planned) * 100), 0) / 100;
      view.querySelector('#b-total').innerHTML = `<span class="label">${valid.length} de ${rows.length} prontos</span><span class="display num">${F.money(total)}</span>`;
      const btn = view.querySelector('#b-send');
      btn.disabled = !writable || !rows.length;
      btn.innerHTML = writable ? `Enviar ${valid.length || ''} ${valid.length === 1 ? 'item' : 'itens'} para a planilha <span class="arr">→</span>` : 'Conecte o Apps Script para enviar';
      renderSummary(view);
    }

    /** Envio em lotes de até 200 itens (limite do Apps Script). */
    async function send(view) {
      const msg = view.querySelector('#b-msg');
      const bad = rows.filter((r) => rowErrors(r).length);
      view.querySelectorAll('#b-table tr[data-row]').forEach((tr) => {
        const r = rows.find((x) => x.id === tr.dataset.row);
        const errs = r ? rowErrors(r) : [];
        tr.querySelectorAll('[data-f]').forEach((el) => el.classList.toggle('invalid', errs.includes(el.dataset.f)));
      });
      if (bad.length) { msg.innerHTML = `<span class="tone-over">${bad.length} ${bad.length === 1 ? 'linha incompleta' : 'linhas incompletas'} (campos destacados). Centro, categoria, descrição e valor são obrigatórios.</span>`; return; }
      const total = rows.reduce((s, r) => s + Math.round(Number(r.planned) * 100), 0) / 100;
      const byMonth = months.map((m) => [m, rows.filter((r) => r.month === m)]).filter(([, l]) => l.length);
      const newCats = [...new Set(rows.filter((r) => !catByNorm.get(F.norm(r.category))).map((r) => r.category.trim()))];
      U.openModal(`
        <span class="label">Confirmar envio</span>
        <h2 class="h2" style="margin:10px 0 16px">${rows.length} ${rows.length === 1 ? 'item' : 'itens'} · ${F.money(total)}</h2>
        <p class="body-sm">Serão inseridas linhas na aba <strong class="text-cloud">[GERAL]</strong> da planilha do POT, junto aos itens de cada mês:</p>
        <div class="kv" style="margin:16px 0">${byMonth.map(([m, l]) => `<div><span class="label">${esc(F.monthLabel(m))}</span><div class="v">${l.length} itens · ${F.money(l.reduce((s, r) => s + Number(r.planned), 0))}</div></div>`).join('')}</div>
        ${newCats.length ? `<p class="body-sm">Categorias novas que serão criadas na [Lista de Categorias]: <span class="text-cloud">${newCats.map(esc).join(', ')}</span>.</p>` : ''}
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:24px">
          <button class="btn btn-ghost" data-close-modal>Voltar</button>
          <button class="btn btn-primary" id="b-confirm">Enviar agora <span class="arr">→</span></button>
        </div>`, (m) => {
        m.querySelector('#b-confirm').addEventListener('click', async (ev) => {
          ev.currentTarget.disabled = true;
          ev.currentTarget.textContent = 'Enviando…';
          const payload = rows.map((r) => {
            const known = catByNorm.get(F.norm(r.category));
            return {
              date: `${r.month}-01`, description: r.description.trim(), category: known ? known.name : r.category.trim(), center: sheetCenterName(r.center),
              planned: Math.round(Number(r.planned) * 100) / 100, importance: r.importance, obligation: r.obligation, custeio: known ? known.custeio : r.custeio,
            };
          });
          try {
            let inseridas = 0;
            for (let i = 0; i < payload.length; i += 200) {
              const res = await S.post('addItems', { items: payload.slice(i, i + 200) });
              inseridas += res.linhas.length;
              // Remove do rascunho o que já foi gravado: um erro no lote seguinte não duplica itens
              rows = rows.slice(Math.min(200, rows.length));
              save();
            }
            U.closeModal();
            U.toast(`${inseridas} itens enviados para a planilha.`);
            window.App.reload();
          } catch (ex) {
            U.closeModal();
            renderDraft(view);
            msg.innerHTML = `<span class="tone-over">Falha no envio: ${esc(ex.message)}</span>${rows.length ? ' Os itens não enviados continuam no rascunho.' : ''}`;
          }
        });
      });
    }

    return {
      title: 'Construir orçamento', crumbs: [['Planejamento Orçamentário', '#/pot'], ['Construir orçamento']], html, hidePeriod: true,
      mount(view) {
        renderDraft(view);
        view.querySelector('#bq').addEventListener('change', (e) => { location.hash = `#/pot/construir?q=${e.target.value}`; });
        view.querySelector('#b-add').addEventListener('click', () => {
          const last = rows[rows.length - 1];
          rows.push(blankRow(q, last ? { month: last.month, center: last.center } : {}));
          save(); renderDraft(view);
          const inputs = view.querySelectorAll('#b-table tr[data-row]:last-child [data-f="category"]');
          if (inputs[0]) inputs[0].focus();
        });
        view.querySelector('#b-copy').addEventListener('click', () => {
          const src = F.aggregate(prevQ).items;
          if (!src.length) { U.toast(`Nenhum item planejado em ${F.periodLabel(prevQ)}.`); return; }
          if (rows.length && !window.confirm(`Adicionar ${src.length} itens de ${F.periodLabel(prevQ)} ao rascunho atual?`)) return;
          src.forEach((i) => {
            const idx = F.periodMonths(prevQ).indexOf(i.month);
            const c = F.catById[i.categoryId];
            rows.push(blankRow(q, {
              month: months[Math.max(idx, 0)], center: c.centerId === 'sem-centro' ? '' : c.centerId, category: c.name, description: i.description,
              planned: String(i.planned), importance: IMPORTANCIAS.includes(i.importance) ? i.importance : '', obligation: OBRIGATORIEDADES.includes(i.obligation) ? i.obligation : '', custeio: i.custeio,
            }));
          });
          save(); renderDraft(view);
          U.toast(`${src.length} itens copiados — revise valores e remova o que não se repete.`);
        });
        view.querySelector('#b-clear').addEventListener('click', () => {
          if (!rows.length || !window.confirm('Apagar todo o rascunho deste trimestre?')) return;
          rows = []; save(); renderDraft(view);
        });
        const table = view.querySelector('#b-table');
        const onEdit = (e) => {
          const el = e.target.closest('[data-f]');
          if (!el) return;
          const r = rows.find((x) => x.id === el.closest('tr').dataset.row);
          if (!r) return;
          r[el.dataset.f] = el.value;
          el.classList.remove('invalid');
          save();
          // Categoria reconhecida define o custeio; redesenha só quando muda a natureza da categoria
          if (el.dataset.f === 'category' && e.type === 'change') renderDraft(view); else updateTotals(view);
        };
        table.addEventListener('input', onEdit);
        table.addEventListener('change', onEdit);
        table.addEventListener('click', (e) => {
          const d = e.target.closest('[data-del]');
          if (d) { rows = rows.filter((x) => x.id !== d.dataset.del); save(); renderDraft(view); }
        });
        view.querySelector('#b-send').addEventListener('click', () => send(view));
        const ex = view.querySelector('#b-exist');
        if (ex) {
          ex.addEventListener('click', (e) => { const r = e.target.closest('[data-item]'); if (r) P.openItem(r.dataset.item, q); });
          ex.addEventListener('keydown', (e) => { const r = e.target.closest('[data-item]'); if (r && e.key === 'Enter') P.openItem(r.dataset.item, q); });
        }
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Configurações                                                       */
  /* ------------------------------------------------------------------ */

  function settingsPage() {
    const st = window.App.sync.status || {};
    const q = F.D.meta.quality || {};
    const L = F.LIMIARES;
    const srcRow = (name, state, detail, url) => {
      const tone = state === 'live' ? 'ok' : state === 'cache' ? 'warn' : 'over';
      const label = state === 'live' ? 'Ao vivo' : state === 'cache' ? 'Cópia local' : 'Sem acesso';
      return `<div class="settings-row"><div><div class="text-cloud">${name}</div><div class="body-sm">${detail}</div></div>
        <div style="display:flex;gap:8px;align-items:center"><span class="badge tone-${tone}">${label}</span><a class="icon-btn" href="${url}" target="_blank" rel="noopener" aria-label="Abrir ${esc(name)}">${I('external')}</a></div></div>`;
    };
    const html = `
      ${pageHead('Configurações', 'Configurações', 'Conexão com as planilhas, escrita pelo painel e parâmetros dos cálculos.')}
      <section aria-labelledby="sec-conn">
        ${sectionHead('Conexão com as planilhas', `<span id="sec-conn">Fontes de dados</span>`, `<button class="btn btn-ghost btn-sm" data-reload>${I('refresh')} Atualizar agora</button>`)}
        <div class="settings-list">
          ${srcRow('Planilha do POT · [GERAL]', st.pot, st.pot === 'live' ? `${q.linhas || 0} linhas lidas · ${F.D.items.length} itens planejados · ${F.D.transactions.length} lançamentos · atualizado ${stamp(st.loadedAt)}` : `Exibindo cópia de ${stamp(st.cachedAt)} · ${esc(st.potError || '')}`, CFG.pot.url)}
          ${srcRow('Planilha de indicadores · Operações', st.ind, st.ind === 'live' ? `${(window.App.sync.indicators || { blocks: [] }).blocks.length} blocos de indicadores lidos` : st.indCode === 'denied' || st.indCode === 'network' ? 'Compartilhe como “Qualquer pessoa com o link — Leitor” para o painel conseguir ler.' : esc(st.indError || ''), CFG.indicadores.url)}
          <div class="settings-row"><div><div class="text-cloud">Análises da CMP</div><div class="body-sm">${st.analyses === 'sheet' ? 'Lidas e gravadas na aba [Painel - Análises] da planilha do POT' : 'Salvas apenas neste navegador (conecte o Apps Script para compartilhar)'}</div></div><span class="badge tone-${st.analyses === 'sheet' ? 'ok' : 'idle'}">${st.analyses === 'sheet' ? 'Planilha' : 'Local'}</span></div>
          ${q.semCentro || q.ignoradas ? `<div class="settings-row"><div><div class="text-cloud">Qualidade dos dados</div><div class="body-sm">${q.semCentro ? `${q.semCentro} linhas sem centro de custo (aparecem como “Sem centro”). ` : ''}${q.ignoradas ? `${q.ignoradas} linhas sem data válida foram ignoradas.` : ''}</div></div><span class="badge tone-warn">Revisar</span></div>` : ''}
        </div>
      </section>

      <section class="section" aria-labelledby="sec-write">
        ${sectionHead('Escrita pelo painel', `<span id="sec-write">Apps Script do POT</span>`, `<a class="btn btn-quiet btn-sm" href="https://github.com/odin-ej/painel-financeiro-pot-cmp/blob/main/apps-script/README.md" target="_blank" rel="noopener">Como instalar ${I('external')}</a>`)}
        <form id="as-form" class="form-grid" style="max-width:760px" novalidate>
          <label class="full"><span class="label">URL do app da Web (termina em /exec)</span><input class="input" name="url" type="url" value="${esc(S.scriptUrl())}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label>
          <label class="full"><span class="label">Chave de acesso (PAINEL_TOKEN)</span><input class="input" name="token" type="password" value="${esc(S.token())}" placeholder="Definida nas Propriedades do script" autocomplete="off"></label>
          <p class="full body-sm text-fog">A URL e a chave ficam salvas só neste navegador. Quem não tiver a chave continua vendo o painel normalmente, sem poder alterar a planilha.</p>
          <p class="full body-sm" id="as-msg" role="status"></p>
          <div class="full" style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="submit" class="btn btn-primary">Salvar e testar <span class="arr">→</span></button>
            <button type="button" class="btn btn-ghost" id="as-clear">Desconectar</button>
          </div>
        </form>
      </section>

      <section class="section">
        ${sectionHead('Limiares de execução', '')}
        <div class="settings-list">
          <div class="settings-row"><div><div class="text-cloud">Saudável</div><div class="body-sm">Execução até ${L.atencao}% do orçado</div></div><span class="badge tone-ok">Saudável</span></div>
          <div class="settings-row"><div><div class="text-cloud">Atenção</div><div class="body-sm">De ${L.atencao}% a ${L.limite}%</div></div><span class="badge tone-warn">Atenção</span></div>
          <div class="settings-row"><div><div class="text-cloud">Próximo ao limite</div><div class="body-sm">De ${L.limite}% a ${L.teto}%</div></div><span class="badge tone-limit">Próximo ao limite</span></div>
          <div class="settings-row"><div><div class="text-cloud">Acima do orçamento</div><div class="body-sm">Mais de ${L.teto}% — ou gasto sem orçamento</div></div><span class="badge tone-over">Acima do orçamento</span></div>
        </div>
      </section>`;
    return {
      title: 'Configurações', crumbs: [['Configurações']], html, hidePeriod: true,
      mount(view) {
        view.querySelector('[data-reload]').addEventListener('click', () => window.App.reload(true));
        const fm = view.querySelector('#as-form');
        const msg = view.querySelector('#as-msg');
        fm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const url = fm.url.value.trim();
          if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) { msg.innerHTML = '<span class="tone-over">A URL deve ser a do app da Web do Apps Script (https://script.google.com/macros/s/…/exec).</span>'; return; }
          S.setScriptUrl(url); S.setToken(fm.token.value);
          if (!url) { msg.textContent = 'Escrita desativada.'; return; }
          msg.textContent = 'Testando conexão…';
          try {
            const r = await S.post('ping');
            msg.innerHTML = `<span class="tone-ok">Conectado à planilha “${esc(r.planilha)}”. A escrita pelo painel está ativa.</span>`;
            window.App.reload();
          } catch (ex) { msg.innerHTML = `<span class="tone-over">${esc(ex.message)}</span>`; }
        });
        view.querySelector('#as-clear').addEventListener('click', () => { S.setScriptUrl(''); S.setToken(''); fm.url.value = ''; fm.token.value = ''; msg.textContent = 'Desconectado. O painel segue em modo leitura.'; });
      },
    };
  }

  // _ind: leitura dos blocos de indicador, reaproveitada pela página de comparação
  Object.assign(window.Pages, { indicatorsPage, builderPage, settingsPage, _ind: { headline, pick, byTheme } });
})();
