/**
 * pages-compare.js — Comparar meses (#/comparar?m=2026-01,2026-05,2026-08).
 *
 * Coloca meses avulsos lado a lado — de trimestres ou anos diferentes — e
 * acrescenta a leitura conjunta (soma/média dos meses escolhidos):
 *  - resumo do orçamento (orçado, realizado, saldo, execução, entradas, resultado);
 *  - gráfico Planejado × Realizado por mês;
 *  - centros de custo e principais categorias mês a mês;
 *  - indicadores do Painel de Bordo mês a mês, com a média dos meses.
 *
 * Todos os números vêm de Fin.aggregate (mesma fonte das demais telas), então
 * a coluna "Conjunto" bate com a Visão Geral em "Analisar juntos".
 *
 * Dependências: Fin (core.js), UI (ui.js), Pages (pages.js, pages-planilha.js), App (app.js).
 */
(function () {
  'use strict';

  const F = window.Fin;
  const U = window.UI;
  const P = window.Pages;
  const { pageHead, sectionHead } = P._h;
  const esc = F.esc;

  const MAX_MONTHS = 12; // mesmo limite do seletor: mais colunas que isso fica ilegível

  /** Período de um mês a partir de "AAAA-MM". */
  function monthP(m) { return { kind: 'month', year: Number(m.slice(0, 4)), month: Number(m.slice(5)) }; }

  /** Cabeçalho de coluna: "Jan 26". */
  function colLabel(m) {
    const n = F.MESES_CURTOS[Number(m.slice(5)) - 1];
    return `${n.charAt(0)}${n.slice(1).toLowerCase()} ${m.slice(2, 4)}`;
  }

  /** Lê e valida os meses da URL (só meses existentes na planilha, sem repetição, em ordem). */
  function readMonths(query) {
    return [...new Set(String(query.m || '').split(','))].filter((m) => F.dataMonths.includes(m)).sort().slice(0, MAX_MONTHS);
  }

  /** Soma das entradas (Painel de Bordo) nos meses; null se nenhum mês tiver entradas. */
  function incomeSum(months) {
    const vals = months.map((m) => F.incomeFor(m)).filter((v) => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  }

  /** Soma de (entradas − realizado) dos meses que têm entradas; null se nenhum tiver. */
  function jointResult(per) {
    const ok = per.filter((x) => x.inc !== null);
    return ok.length ? ok.reduce((s, x) => s + x.inc - x.a.total.realized, 0) : null;
  }

  /**
   * Variação do último mês contra o primeiro (só faz sentido com 2 meses).
   * Percentual relativo para valores; pontos percentuais para execução.
   */
  function deltaCell(a, b, kind) {
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return '<td class="r text-fog">—</td>';
    const d = b - a;
    if (Math.abs(d) < 0.005) return '<td class="r text-fog">=</td>';
    const arrow = d > 0 ? '↑' : '↓';
    if (kind === 'pct') return `<td class="r cmp-delta">${arrow} ${F.pct(Math.abs(d)).replace('%', '')} p.p.</td>`;
    const rel = a !== 0 ? ` <span class="text-fog">(${F.pct(Math.abs(d / a) * 100)})</span>` : '';
    return `<td class="r cmp-delta">${arrow} ${esc(F.money(Math.abs(d), true))}${rel}</td>`;
  }

  /** Estado vazio: explica o recurso e oferece atalhos prontos. */
  function emptyState(ctx) {
    const last = F.lastMonth;
    const idx = F.dataMonths.indexOf(last);
    const prev3 = F.dataMonths.slice(Math.max(0, idx - 2), idx + 1);
    const lastYear = `${Number(last.slice(0, 4)) - 1}${last.slice(4)}`;
    const shortcuts = [
      prev3.length >= 2 && ['Últimos 3 meses', prev3],
      F.dataMonths.includes(lastYear) && [`${F.monthLabel(last)} × ano anterior`, [lastYear, last]],
      idx >= 1 && ['Este mês × mês anterior', [F.dataMonths[idx - 1], last]],
    ].filter(Boolean);
    return `${pageHead('Comparar', 'Comparar meses', 'Coloque meses lado a lado — de trimestres ou anos diferentes — e veja também o resultado conjunto.')}
      <div class="panel notice cmp-empty">
        <span class="label">Como usar</span>
        <p class="body-sm" style="margin-top:8px;max-width:620px">No seletor de período, no topo, abra a aba <strong class="text-cloud">Mês</strong>, ligue <strong class="text-cloud">Vários meses</strong>, marque os meses e escolha <strong class="text-cloud">Comparar</strong>. Ou comece por um atalho:</p>
        <div class="cmp-shortcuts">${shortcuts.map(([l, ms]) => `<a class="btn btn-ghost" href="#/comparar?m=${ms.join(',')}">${esc(l)} <span class="arr">→</span></a>`).join('')}</div>
      </div>`;
  }

  function comparePage(ctx, query = {}) {
    const months = readMonths(query);
    if (months.length < 2) return { title: 'Comparar meses', crumbs: [['Comparar meses']], html: emptyState(ctx) };

    const joint = F.customPeriod(months);
    const per = months.map((m) => ({ m, a: F.aggregate(monthP(m)), inc: F.incomeFor(m) }));
    const ja = F.aggregate(joint);
    const jInc = incomeSum(months);
    const two = months.length === 2;
    const compact = months.length > 3; // valores curtos quando há muitas colunas
    const fm = (v) => (v === null || !Number.isFinite(v) ? '—' : esc(F.money(v, compact)));
    const n = months.length;

    // Colunas extras: média mensal e conjunto (soma); com 2 meses, também a variação
    const headCols = `${per.map((x) => `<th class="r"><a href="#/visao-geral?p=${F.periodKey(monthP(x.m))}" class="cmp-col" title="Abrir ${esc(F.monthLabel(x.m))}">${colLabel(x.m)}</a></th>`).join('')}
      <th class="r is-joint">Média</th><th class="r is-joint">Conjunto</th>${two ? '<th class="r">Variação</th>' : ''}`;

    /* ---- Resumo ---- */
    const resRows = [
      ['Orçado', (x) => x.a.total.planned, ja.total.planned, 'money'],
      ['Realizado', (x) => x.a.total.realized, ja.total.realized, 'money'],
      ['Saldo', (x) => x.a.total.available, ja.total.available, 'money'],
      ['Execução', (x) => x.a.total.pct, ja.total.pct, 'pct'],
      ['Entradas', (x) => x.inc, jInc, 'money'],
      // Resultado conjunto: soma só dos meses com entradas registradas — senão um mês
      // sem entradas contaria apenas o gasto e distorceria o resultado para baixo
      ['Resultado (entradas − realizado)', (x) => (x.inc === null ? null : x.inc - x.a.total.realized), jointResult(per), 'money'],
    ];
    const resumo = `<div class="table-wrap"><table class="t cmp-table" style="min-width:${260 + (n + 3) * 120}px">
      <thead><tr><th>Métrica</th>${headCols}</tr></thead>
      <tbody>${resRows.map(([label, get, jv, kind]) => {
        const vals = per.map(get);
        const ok = vals.filter((v) => v !== null && Number.isFinite(v));
        // Execução conjunta = realizado/orçado somados (não a média dos %); a média é a simples dos meses
        const avg = ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : null;
        const f = (v) => (kind === 'pct' ? (v === null ? '—' : F.pct(v)) : fm(v));
        const max = ok.length > 1 && kind === 'money' ? Math.max(...ok) : null;
        return `<tr><td class="strong">${esc(label)}</td>${vals.map((v) => `<td class="r${max !== null && v === max ? ' is-max' : ''}">${f(v)}</td>`).join('')}
          <td class="r is-joint">${f(avg)}</td><td class="r is-joint strong">${kind === 'pct' ? f(jv) : f(jv)}</td>${two ? deltaCell(vals[0], vals[1], kind) : ''}</tr>`;
      }).join('')}</tbody></table></div>`;

    /* ---- Gráfico por mês ---- */
    const barRows = per.map((x) => ({ ...x.a.total, id: x.m, name: colLabel(x.m) }));
    const chart = U.barsChart(barRows, { nav: (r) => `#/visao-geral?p=${F.periodKey(monthP(r.id))}` });

    /* ---- Centros ---- */
    const metric = ['realized', 'pct', 'planned'].includes(ctx.state.cmpMetric) ? ctx.state.cmpMetric : 'realized';
    const MET = { realized: 'Realizado', pct: 'Execução', planned: 'Orçado' };
    const fc = (c) => (metric === 'pct' ? (c.pct === null ? '—' : F.pct(c.pct)) : fm(c[metric]));
    const centros = `<div class="table-wrap"><table class="t cmp-table" style="min-width:${260 + (n + 2) * 120}px">
      <thead><tr><th>Centro</th>${per.map((x) => `<th class="r">${colLabel(x.m)}</th>`).join('')}<th class="r is-joint">Conjunto</th>${two ? '<th class="r">Variação</th>' : ''}</tr></thead>
      <tbody>${F.centers.map((ce) => {
        const cs = per.map((x) => x.a.byCenter[ce.id]);
        const jc = ja.byCenter[ce.id];
        return `<tr><td class="strong"><a href="#/centros/${ce.id}?p=${F.periodKey(joint)}" class="cmp-link">${esc(ce.name)}</a></td>
          ${cs.map((c) => `<td class="r${c.status === 'over' ? ' tone-over' : ''}">${fc(c)}</td>`).join('')}
          <td class="r is-joint strong${jc.status === 'over' ? ' tone-over' : ''}">${fc(jc)}</td>${two ? deltaCell(metric === 'pct' ? cs[0].pct : cs[0][metric], metric === 'pct' ? cs[1].pct : cs[1][metric], metric === 'pct' ? 'pct' : 'money') : ''}</tr>`;
      }).join('')}</tbody></table></div>`;

    /* ---- Categorias: as 12 com mais gasto no conjunto ---- */
    const cats = Object.values(ja.byCat).filter((c) => c.realized > 0).sort((x, y) => y.realized - x.realized).slice(0, 12);
    const categorias = cats.length ? `<div class="table-wrap"><table class="t cmp-table" style="min-width:${300 + (n + 2) * 120}px">
      <thead><tr><th>Categoria</th>${per.map((x) => `<th class="r">${colLabel(x.m)}</th>`).join('')}<th class="r is-joint">Conjunto</th>${two ? '<th class="r">Variação</th>' : ''}</tr></thead>
      <tbody>${cats.map((c) => {
        const vs = per.map((x) => x.a.byCat[c.id].realized);
        return `<tr><td class="strong">${esc(c.name)}<span class="sub">${esc(F.centerById[c.centerId].name)}</span></td>${vs.map((v) => `<td class="r">${v ? fm(v) : '<span class="text-fog">—</span>'}</td>`).join('')}
          <td class="r is-joint strong">${fm(c.realized)}</td>${two ? deltaCell(vs[0], vs[1], 'money') : ''}</tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">Nenhum gasto nos meses escolhidos.</div>';

    /* ---- Indicadores ---- */
    const ind = window.App.sync.indicators;
    let indicadores = '';
    if (ind && ind.blocks.length && P._ind) {
      const { headline, pick, byTheme } = P._ind;
      const groups = byTheme(ind.blocks);
      indicadores = `<div class="table-wrap"><table class="t cmp-table" style="min-width:${320 + (n + 2) * 120}px">
        <thead><tr><th>Indicador</th>${per.map((x) => `<th class="r">${colLabel(x.m)}</th>`).join('')}<th class="r is-joint">Média</th>${two ? '<th class="r">Variação</th>' : ''}</tr></thead>
        <tbody>${groups.map((g) => `<tr class="cmp-group"><td colspan="${n + 2 + (two ? 1 : 0)}">${esc(g.name)}</td></tr>${g.blocks.map((b) => {
          const h = headline(b);
          const vs = pick(b, h, months);
          const ok = vs.filter((v) => v !== null);
          const avg = ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : null;
          const dk = h.kind === 'pct' ? 'pct' : 'money';
          return `<tr><td class="strong"><a href="#/indicadores/${b.id}" class="cmp-link">${esc(b.title)}</a></td>${vs.map((v) => `<td class="r">${esc(U.fmtKind(h.kind, v))}</td>`).join('')}
            <td class="r is-joint strong">${esc(U.fmtKind(h.kind, avg))}</td>${two ? (h.kind === 'num' ? '<td class="r text-fog">—</td>' : deltaCell(vs[0], vs[1], dk)) : ''}</tr>`;
        }).join('')}`).join('')}</tbody></table></div>`;
    }

    const html = `
      ${pageHead(`Comparar / ${n} meses`, 'Comparar meses', `${esc(F.periodLabel(joint))}. Cada mês em uma coluna; “Conjunto” soma os meses e “Média” é a média mensal.`,
        `<a class="btn btn-primary" href="#/visao-geral?p=${F.periodKey(joint)}">Analisar juntos <span class="arr">→</span></a>`)}
      <div class="cmp-months">${months.map((m) => `<span class="cmp-chip">${esc(F.monthLabel(m))}<a href="#/comparar?m=${months.filter((x) => x !== m).join(',')}" aria-label="Remover ${esc(F.monthLabel(m))}" title="Remover">×</a></span>`).join('')}</div>

      <section class="section">
        ${sectionHead('Orçamento', 'Resumo lado a lado')}
        ${resumo}
      </section>

      <section class="section">
        <div class="panel">
          <div class="panel-head"><div><span class="label">Planejado × Realizado</span><h2 class="h2" style="margin-top:8px">Por mês</h2></div>
            <div class="legend"><span><i style="background:var(--steel)"></i>Planejado</span><span><i style="background:var(--cyan-signal)"></i>Realizado</span></div></div>
          ${chart}
        </div>
      </section>

      <section class="section">
        ${sectionHead('Centros de custo', 'Mês a mês por centro', `<div class="seg" role="group" aria-label="Métrica dos centros">${Object.entries(MET).map(([k, l]) => `<button data-cmp-metric="${k}" aria-pressed="${metric === k}">${l}</button>`).join('')}</div>`)}
        ${centros}
      </section>

      <section class="section">
        ${sectionHead('Categorias', 'Onde o gasto mudou', '')}
        ${categorias}
      </section>

      ${indicadores ? `<section class="section">${sectionHead('Indicadores', 'Painel de Bordo mês a mês')}${indicadores}</section>` : ''}`;

    return {
      title: 'Comparar meses', crumbs: [['Comparar meses']], html,
      mount(view) {
        // Tooltips das barras são globais (data-tip, ui.js); aqui só a troca de métrica
        view.querySelectorAll('[data-cmp-metric]').forEach((b) => b.addEventListener('click', () => { ctx.state.cmpMetric = b.dataset.cmpMetric; ctx.render(true); }));
      },
    };
  }

  Object.assign(window.Pages, { comparePage });
})();
