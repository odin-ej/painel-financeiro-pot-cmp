/**
 * core.js — camada de dados e regras financeiras do protótipo POT + CMP.
 *
 * Responsabilidades:
 *  - formatação monetária/percentual em pt-BR;
 *  - modelo de período (mês, trimestre, acumulado do ano);
 *  - agregações Planejado × Realizado em todos os níveis da hierarquia
 *    (empresa → centro → categoria → item → lançamento);
 *  - classificação de status financeiro e geração de alertas/insights;
 *  - armazenamento local das análises mensais da CMP.
 *
 * Dependências: nenhuma biblioteca externa. Os dados chegam via Fin.init(data),
 * chamado pelo app.js com o resultado de Sheets.load() (Google Sheets ao vivo).
 *
 * NOTA: todas as somas são feitas em centavos inteiros para que
 * "centro = soma das categorias" e "categoria = soma dos lançamentos"
 * sejam verdadeiros também na exibição (sem resíduos de ponto flutuante).
 */
(function () {
  'use strict';

  // Dataset vigente. Substituído por init() a cada leitura da planilha.
  let D = { meta: { year: new Date().getFullYear(), currentQuarter: 1, lastClosedMonth: '', maxMonth: '' }, centers: [], categories: [], items: [], transactions: [], incomes: [], analyses: [], catalog: [] };

  /* ------------------------------------------------------------------ */
  /* Formatação                                                          */
  /* ------------------------------------------------------------------ */

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const num1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_CURTOS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

  /**
   * Formata um valor em reais.
   * @param {number} v - valor em reais
   * @param {boolean} [semCentavos=false] - arredonda para inteiro (uso em gráficos/resumos)
   * @returns {string} ex.: "R$ 61.121,93"
   */
  function money(v, semCentavos) {
    if (!Number.isFinite(v)) return '—';
    return (semCentavos ? brl0 : brl).format(v).replace(/ /g, ' ');
  }

  /**
   * Formata um percentual com 1 casa decimal. Retorna "—" para valores inválidos,
   * garantindo que NaN/Infinity nunca cheguem à interface.
   * @param {number|null} v - percentual (ex.: 96.67)
   * @returns {string} ex.: "96,7%"
   */
  function pct(v) {
    if (v === null || !Number.isFinite(v)) return '—';
    return num1.format(v) + '%';
  }

  /** Percentual com sinal explícito, para desvios ("+27,4%" / "−12,0%"). */
  function signedPct(v) {
    if (v === null || !Number.isFinite(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '') + num1.format(Math.abs(v)) + '%';
  }

  /** Valor monetário com sinal explícito ("+ R$ 6.264,44"). */
  function signedMoney(v, semCentavos) {
    if (!Number.isFinite(v)) return '—';
    const s = money(Math.abs(v), semCentavos);
    return v > 0 ? '+ ' + s : v < 0 ? '− ' + s : s;
  }

  /** "2026-08-15" -> "15/08/2026" */
  function date(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  /** "2026-08" -> "Agosto de 2026" */
  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    const n = MESES[m - 1];
    return n.charAt(0).toUpperCase() + n.slice(1) + ' de ' + y;
  }

  /** Escapa texto para inserção segura em HTML (SEGURANCA: evita injeção via busca/análises). */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  /** Normaliza texto para busca (sem acentos, minúsculo). */
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  const toC = (v) => Math.round(v * 100); // reais -> centavos
  const fromC = (c) => c / 100;           // centavos -> reais

  /* ------------------------------------------------------------------ */
  /* Índices                                                             */
  /* ------------------------------------------------------------------ */

  let centers = [], centerById = {}, catById = {}, itemById = {};
  /** Meses com dados no dataset (ex.: "2025-01" ... "2026-12"), em ordem. */
  let dataMonths = [];
  /** Último mês considerado "corrente" (teto do acumulado do ano). */
  let lastMonth = '';

  /**
   * Carrega um novo dataset e reconstrói os índices.
   * Também atualiza as propriedades públicas de window.Fin, que as telas
   * leem a cada renderização.
   * @param {Object} data - saída de Sheets.load().data
   */
  function init(data) {
    D = data;
    centers = D.centers.slice().sort((a, b) => a.order - b.order);
    centerById = Object.fromEntries(centers.map((c) => [c.id, c]));
    catById = Object.fromEntries(D.categories.map((c) => [c.id, c]));
    itemById = Object.fromEntries(D.items.map((i) => [i.id, i]));
    dataMonths = Array.from(new Set(D.items.map((i) => i.month).concat(D.transactions.map((t) => t.date.slice(0, 7))))).sort();
    lastMonth = D.meta.lastClosedMonth || dataMonths[dataMonths.length - 1] || '';
    cache = {};
    Object.assign(window.Fin, { D, centers, centerById, catById, itemById, dataMonths, lastMonth });
  }

  /* ------------------------------------------------------------------ */
  /* Períodos                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * @typedef {Object} Period
   * @property {'month'|'quarter'|'year'} kind
   * @property {number} year
   * @property {number} [month]   - 1..12 quando kind = 'month'
   * @property {number} [quarter] - 1..4  quando kind = 'quarter'
   */

  /**
   * Lista os meses (formato "AAAA-MM") cobertos por um período.
   * O acumulado do ano considera apenas meses já com dados (até o último mês fechado).
   * @param {Period} p
   * @returns {string[]}
   */
  function periodMonths(p) {
    const ym = (m) => `${p.year}-${String(m).padStart(2, '0')}`;
    if (p.kind === 'month') return [ym(p.month)];
    if (p.kind === 'quarter') return [1, 2, 3].map((i) => ym((p.quarter - 1) * 3 + i));
    if (p.kind === 'custom') return p.months.slice();
    return dataMonths.filter((m) => m.startsWith(String(p.year)) && m <= lastMonth);
  }

  /**
   * Cria um período "meses escolhidos" (análise conjunta de meses avulsos,
   * inclusive de trimestres ou anos diferentes). Com um só mês, vira um período
   * de mês comum.
   * @param {string[]} months - "AAAA-MM" (ordem e repetições não importam)
   * @returns {Period|null}
   * @example customPeriod(['2026-08', '2026-01']) // → { kind:'custom', year:2026, months:['2026-01','2026-08'] }
   */
  function customPeriod(months) {
    const ms = [...new Set(months)].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
    if (!ms.length) return null;
    if (ms.length === 1) return { kind: 'month', year: Number(ms[0].slice(0, 4)), month: Number(ms[0].slice(5)) };
    return { kind: 'custom', year: Number(ms[ms.length - 1].slice(0, 4)), months: ms };
  }

  /** "a, b e c" — junção de lista em português. */
  function listPt(arr) {
    return arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} e ${arr[arr.length - 1]}`;
  }

  /**
   * Meses por extenso agrupados por ano: "janeiro, maio e agosto de 2026" ou
   * "novembro de 2025 e janeiro de 2026". Com muitos meses, usa nomes curtos.
   */
  function monthsPhrase(months) {
    const short = months.length > 4;
    const byYear = {};
    months.forEach((m) => { (byYear[m.slice(0, 4)] = byYear[m.slice(0, 4)] || []).push(Number(m.slice(5))); });
    return listPt(Object.keys(byYear).sort().map((y) => `${listPt(byYear[y].map((n) => (short ? MESES_CURTOS[n - 1].toLowerCase() : MESES[n - 1])))} de ${y}`));
  }

  /**
   * Período por extenso para frases: "julho a setembro de 2026", "agosto de 2026",
   * "janeiro, maio e agosto de 2026". Sempre inclui o ano.
   */
  function periodPhrase(p) {
    if (p.kind === 'custom') return monthsPhrase(p.months);
    return `${periodRange(p)} de ${p.year}`;
  }

  /** Rótulo longo do período: "Agosto de 2026", "3º trimestre de 2026", "Acumulado 2026". */
  function periodLabel(p) {
    if (p.kind === 'month') return monthLabel(`${p.year}-${String(p.month).padStart(2, '0')}`);
    if (p.kind === 'quarter') return `${p.quarter}º trimestre de ${p.year}`;
    if (p.kind === 'custom') { const s = monthsPhrase(p.months); return s.charAt(0).toUpperCase() + s.slice(1); }
    return `Acumulado ${p.year}`;
  }

  /** Rótulo curto em caixa alta para micro-labels: "AGO 2026", "Q3 2026", "ACUMULADO 2026". */
  function periodShort(p) {
    if (p.kind === 'month') return `${MESES_CURTOS[p.month - 1]} ${p.year}`;
    if (p.kind === 'quarter') return `Q${p.quarter} ${p.year}`;
    if (p.kind === 'custom') {
      const ys = [...new Set(p.months.map((m) => m.slice(0, 4)))];
      return `${p.months.length} MESES${ys.length === 1 ? ' ' + ys[0] : ''}`;
    }
    return `ACUMULADO ${p.year}`;
  }

  /** Intervalo por extenso: "julho a setembro", "agosto", "janeiro a setembro". */
  function periodRange(p) {
    if (p.kind === 'custom') return monthsPhrase(p.months); // meses avulsos: lista (já com o ano)
    const ms = periodMonths(p).map((m) => MESES[Number(m.slice(5)) - 1]);
    if (!ms.length) return '';
    return ms.length === 1 ? ms[0] : `${ms[0]} a ${ms[ms.length - 1]}`;
  }

  /**
   * Período imediatamente anterior, usado nas comparações temporais.
   * Retorna null quando não há dados (ex.: ano anterior não existe no dataset).
   */
  function prevPeriod(p) {
    let q;
    if (p.kind === 'month') q = p.month === 1 ? { kind: 'month', year: p.year - 1, month: 12 } : { kind: 'month', year: p.year, month: p.month - 1 };
    else if (p.kind === 'quarter') q = p.quarter === 1 ? { kind: 'quarter', year: p.year - 1, quarter: 4 } : { kind: 'quarter', year: p.year, quarter: p.quarter - 1 };
    // Meses avulsos: compara com os mesmos meses do ano anterior
    else if (p.kind === 'custom') q = { kind: 'custom', year: p.year - 1, months: p.months.map((m) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`) };
    else q = { kind: 'year', year: p.year - 1 };
    return periodMonths(q).some((m) => dataMonths.includes(m)) ? q : null;
  }

  /** Nome do período anterior para textos de comparação. */
  function prevLabel(p) {
    return p.kind === 'month' ? 'mês anterior' : p.kind === 'quarter' ? 'trimestre anterior' : p.kind === 'custom' ? 'mesmos meses do ano anterior' : 'ano anterior';
  }

  /**
   * Opções do seletor global, por tipo, cobrindo todos os anos da planilha.
   * Meses futuros com planejamento (ex.: dezembro) também são selecionáveis.
   * Ordem: mais recente primeiro.
   */
  function periodOptions(kind) {
    const ms = dataMonths.slice().reverse();
    if (kind === 'month') return ms.map((m) => ({ kind: 'month', year: Number(m.slice(0, 4)), month: Number(m.slice(5)) }));
    if (kind === 'quarter') {
      const seen = new Set();
      return ms.map((m) => ({ kind: 'quarter', year: Number(m.slice(0, 4)), quarter: Math.ceil(Number(m.slice(5)) / 3) }))
        .filter((q) => { const k = `${q.year}-${q.quarter}`; if (seen.has(k)) return false; seen.add(k); return true; });
    }
    return [...new Set(ms.map((m) => Number(m.slice(0, 4))))].map((year) => ({ kind: 'year', year }));
  }

  /** Serializa/desserializa período para URL/armazenamento: "m-2026-8", "q-2026-3", "y-2026". */
  function periodKey(p) {
    if (p.kind === 'custom') return `c-${p.months.join('.')}`; // "c-2026-01.2026-05"
    return p.kind === 'month' ? `m-${p.year}-${p.month}` : p.kind === 'quarter' ? `q-${p.year}-${p.quarter}` : `y-${p.year}`;
  }
  function parsePeriodKey(k) {
    if (String(k || '').startsWith('c-')) return customPeriod(String(k).slice(2).split('.'));
    const [t, y, n] = String(k || '').split('-');
    const year = Number(y);
    if (!year) return null;
    if (t === 'm' && n >= 1 && n <= 12) return { kind: 'month', year, month: Number(n) };
    if (t === 'q' && n >= 1 && n <= 4) return { kind: 'quarter', year, quarter: Number(n) };
    if (t === 'y') return { kind: 'year', year };
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Métricas e status                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Limiares de execução (percentual do orçado). Valores do briefing para o
   * protótipo; centralizados aqui para futura configuração por centro.
   */
  const LIMIARES = { atencao: 70, limite: 90, teto: 100 };

  /** Rótulos de status — sempre exibidos junto à cor (acessibilidade). */
  const STATUS = {
    healthy:    { label: 'Saudável',                        tone: 'ok' },
    attention:  { label: 'Atenção',                         tone: 'warn' },
    limit:      { label: 'Próximo ao limite',               tone: 'limit' },
    full:       { label: 'Orçamento totalmente utilizado',  tone: 'limit' },
    over:       { label: 'Acima do orçamento',              tone: 'over' },
    unbudgeted: { label: 'Gasto não orçado',                tone: 'over' },
    idle:       { label: 'Sem movimentação',                tone: 'idle' },
    empty:      { label: 'Sem orçamento',                   tone: 'idle' },
  };

  /**
   * Calcula as métricas financeiras padrão a partir de valores em centavos.
   *
   * Fórmulas (briefing §37):
   *   execução %  = realizado / orçado × 100
   *   disponível  = orçado − realizado
   *   desvio R$   = realizado − orçado
   *   desvio %    = (realizado − orçado) / orçado × 100
   *
   * Quando orçado = 0 os percentuais ficam null (nunca Infinity/NaN) e o
   * status passa a "Gasto não orçado" se houver realizado.
   *
   * @param {number} pc - orçado em centavos
   * @param {number} rc - realizado em centavos
   * @returns {{planned:number, realized:number, available:number, pct:number|null,
   *            devAbs:number, devPct:number|null, status:string, statusLabel:string,
   *            tone:string, deviationLabel:string}}
   * @example metrics(100000, 6682) // { pct: 6.682, status: 'healthy', ... }
   */
  function metrics(pc, rc) {
    const pctV = pc > 0 ? (rc / pc) * 100 : null;
    let status;
    if (pc === 0 && rc === 0) status = 'empty';
    else if (pc === 0) status = 'unbudgeted';
    else if (rc === 0) status = 'idle';
    else if (rc === pc) status = 'full';
    else if (pctV > LIMIARES.teto) status = 'over';
    else if (pctV >= LIMIARES.limite) status = 'limit';
    else if (pctV >= LIMIARES.atencao) status = 'attention';
    else status = 'healthy';

    let deviationLabel;
    if (pc === 0 && rc > 0) deviationLabel = 'Gasto não orçado';
    else if (rc > pc) deviationLabel = 'Acima do orçamento';
    else if (rc < pc) deviationLabel = 'Abaixo do orçamento';
    else deviationLabel = 'Orçamento totalmente utilizado';

    return {
      planned: fromC(pc), realized: fromC(rc), available: fromC(pc - rc),
      pct: pctV, devAbs: fromC(rc - pc), devPct: pc > 0 ? ((rc - pc) / pc) * 100 : null,
      status, statusLabel: STATUS[status].label, tone: STATUS[status].tone, deviationLabel,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Agregações                                                          */
  /* ------------------------------------------------------------------ */

  // Cache por chave de período: as agregações são puras e o dataset só muda via addTransaction().
  let cache = {};

  /**
   * Agrega orçado e realizado por categoria, centro e item para o período.
   * É a única função que lê items/transactions brutos para KPIs — todas as telas
   * consomem seu resultado, o que garante consistência entre páginas.
   *
   * @param {Period} p
   * @returns {{months:string[], total:Object, byCenter:Object, byCat:Object, byItem:Object}}
   */
  function aggregate(p) {
    const key = periodKey(p);
    if (cache[key]) return cache[key];
    const months = new Set(periodMonths(p));
    const catP = {}, catR = {}, itemR = {};
    D.categories.forEach((c) => { catP[c.id] = 0; catR[c.id] = 0; });
    const items = D.items.filter((i) => months.has(i.month));
    items.forEach((i) => { catP[i.categoryId] += toC(i.planned); });
    const txs = D.transactions.filter((t) => months.has(t.date.slice(0, 7)));
    txs.forEach((t) => {
      catR[t.categoryId] += toC(t.amount);
      if (t.itemId) itemR[t.itemId] = (itemR[t.itemId] || 0) + toC(t.amount);
    });

    const byCat = {};
    D.categories.forEach((c) => { byCat[c.id] = { ...metrics(catP[c.id], catR[c.id]), id: c.id, name: c.name, centerId: c.centerId, pc: catP[c.id], rc: catR[c.id] }; });

    const byCenter = {};
    let tp = 0, tr = 0;
    centers.forEach((ce) => {
      const cats = D.categories.filter((c) => c.centerId === ce.id);
      const pc = cats.reduce((s, c) => s + catP[c.id], 0);
      const rc = cats.reduce((s, c) => s + catR[c.id], 0);
      tp += pc; tr += rc;
      byCenter[ce.id] = { ...metrics(pc, rc), id: ce.id, name: ce.name, order: ce.order, owner: ce.owner, pc, rc, categories: cats.map((c) => byCat[c.id]) };
    });

    const byItem = {};
    items.forEach((i) => { byItem[i.id] = { ...metrics(toC(i.planned), itemR[i.id] || 0), item: i }; });

    const res = { months: [...months].sort(), total: { ...metrics(tp, tr), pc: tp, rc: tr }, byCenter, byCat, byItem, items, txs };
    cache[key] = res;
    return res;
  }

  /** Lançamentos de uma categoria (ou centro) dentro do período, mais recentes primeiro. */
  function transactionsFor(p, { categoryId, centerId, itemId } = {}) {
    const months = new Set(periodMonths(p));
    return D.transactions.filter((t) => months.has(t.date.slice(0, 7))
      && (!categoryId || t.categoryId === categoryId)
      && (!itemId || t.itemId === itemId)
      && (!centerId || catById[t.categoryId].centerId === centerId))
      .sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
  }

  /** Itens planejados de uma categoria no período. */
  function itemsFor(p, categoryId) {
    const a = aggregate(p);
    return a.items.filter((i) => i.categoryId === categoryId).map((i) => a.byItem[i.id]);
  }

  /** Itens com lançamento mas sem orçamento (gastos não orçados) — agrupados por categoria. */
  function unbudgetedTx(p, categoryId) {
    return transactionsFor(p, { categoryId }).filter((t) => !t.itemId);
  }

  /** Lista de centros ordenada por critério do seletor de ordenação. */
  function sortCenters(list, by) {
    const arr = list.slice();
    const f = {
      default: (a, b) => a.order - b.order,
      pct: (a, b) => (b.pct ?? -1) - (a.pct ?? -1),
      realized: (a, b) => b.realized - a.realized,
      planned: (a, b) => b.planned - a.planned,
      available: (a, b) => b.available - a.available,
    }[by] || ((a, b) => a.order - b.order);
    return arr.sort(f);
  }

  /** Ordenação de categorias (tabela do centro de custo). */
  function sortCategories(list, by) {
    const arr = list.slice();
    const f = {
      realized: (a, b) => b.realized - a.realized,
      planned: (a, b) => b.planned - a.planned,
      pctDesc: (a, b) => (b.pct ?? 1e9 * Math.sign(b.realized)) - (a.pct ?? 1e9 * Math.sign(a.realized)),
      pctAsc: (a, b) => (a.pct ?? 1e9) - (b.pct ?? 1e9),
      deviation: (a, b) => Math.abs(b.devAbs) - Math.abs(a.devAbs),
      alpha: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
    }[by] || ((a, b) => b.realized - a.realized);
    return arr.sort(f);
  }

  /**
   * Série acumulada Planejado × Realizado para o gráfico de evolução.
   *
   * Granularidade mensal (a da planilha): orçado e realizado acumulados ao
   * fim de cada mês do período.
   *
   * @param {Period} p
   * @param {{centerId?:string, categoryId?:string}} filtro
   * @returns {{label:string, date:string, planned:number, realized:number}[]}
   */
  function evolution(p, filtro = {}) {
    const months = periodMonths(p);
    const catOk = (cid) => (!filtro.categoryId || cid === filtro.categoryId) && (!filtro.centerId || catById[cid].centerId === filtro.centerId);
    const plannedByMonth = {};
    months.forEach((m) => { plannedByMonth[m] = 0; });
    D.items.forEach((i) => { if (i.month in plannedByMonth && catOk(i.categoryId)) plannedByMonth[i.month] += toC(i.planned); });
    const txs = D.transactions.filter((t) => months.includes(t.date.slice(0, 7)) && catOk(t.categoryId));

    const pontos = [];
    const daysIn = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate();
    const cumPlannedAt = (iso) => {
      let s = 0;
      months.forEach((m) => {
        const dm = daysIn(m);
        if (iso >= `${m}-${String(dm).padStart(2, '0')}`) s += plannedByMonth[m];
        else if (iso.slice(0, 7) === m) s += plannedByMonth[m] * (Number(iso.slice(8)) / dm);
      });
      return s;
    };
    const cumRealAt = (iso) => txs.reduce((s, t) => (t.date <= iso ? s + toC(t.amount) : s), 0);

    // A planilha registra valores por mês (data = dia 1), então a evolução é
    // mensal: ponto zero no início do período e um ponto ao fim de cada mês.
    if (!months.length) return pontos;
    pontos.push({ label: '', date: `${months[0]}-01`, planned: 0, realized: 0, start: true });
    months.forEach((m) => {
      const end = `${m}-${String(daysIn(m)).padStart(2, '0')}`;
      pontos.push({ label: MESES_CURTOS[Number(m.slice(5)) - 1], date: end, planned: fromC(Math.round(cumPlannedAt(end))), realized: fromC(cumRealAt(end)), monthEnd: true });
    });
    return pontos;
  }

  /**
   * Comparação de gastos com o período anterior (mesmo tipo).
   * @returns {{delta:number|null, prevRealized:number, label:string}|null} null quando não há dados.
   */
  function comparePrev(p, centerId) {
    const q = prevPeriod(p);
    if (!q) return null;
    const cur = aggregate(p), prev = aggregate(q);
    const rc = centerId ? cur.byCenter[centerId].rc : cur.total.rc;
    const prc = centerId ? prev.byCenter[centerId].rc : prev.total.rc;
    return { delta: prc > 0 ? ((rc - prc) / prc) * 100 : null, prevRealized: fromC(prc), label: prevLabel(p), period: q };
  }

  /* ------------------------------------------------------------------ */
  /* Alertas e insights                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Gera os alertas da seção "Atenção necessária" a partir dos dados agregados.
   * Ordem de severidade: centro acima → categoria acima → não orçado → limite → folga.
   * @param {Period} p
   * @returns {{tone:string, title:string, detail:string, link:string, value?:string}[]}
   */
  function alerts(p) {
    const a = aggregate(p);
    const out = [];
    const cs = Object.values(a.byCenter);
    cs.filter((c) => c.status === 'over').sort((x, y) => y.devAbs - x.devAbs).forEach((c) => out.push({
      tone: 'over', kind: 'Centro acima do orçamento',
      title: `${c.name} ultrapassou o orçamento`,
      detail: `${money(c.realized)} realizados de ${money(c.planned)} planejados — excedente de ${money(c.devAbs)} (${signedPct(c.devPct)}).`,
      link: `#/centros/${c.id}`,
    }));
    // Materialidade: desvios < 5% são ruído operacional e não viram alerta (seguem visíveis nas tabelas)
    Object.values(a.byCat).filter((c) => c.status === 'over' && c.devPct >= 5).sort((x, y) => y.devAbs - x.devAbs).slice(0, 4).forEach((c) => out.push({
      tone: 'over', kind: 'Categoria acima do planejado',
      title: `${c.name} está ${pct(c.devPct)} acima do planejado`,
      detail: `${centerById[c.centerId].name} · planejado ${money(c.planned)}, realizado ${money(c.realized)}.`,
      link: `#/centros/${c.centerId}?cat=${c.id}`,
    }));
    Object.values(a.byCat).filter((c) => c.status === 'unbudgeted').forEach((c) => out.push({
      tone: 'over', kind: 'Gasto não orçado',
      title: `${c.name} teve gasto sem orçamento`,
      detail: `${centerById[c.centerId].name} · ${money(c.realized)} realizados sem item correspondente no POT.`,
      link: `#/centros/${c.centerId}?cat=${c.id}`,
    }));
    cs.filter((c) => c.status === 'limit' || c.status === 'full').forEach((c) => out.push({
      tone: 'limit', kind: 'Próximo ao limite',
      title: `${c.name} utilizou ${pct(c.pct)} do orçamento`,
      detail: `Restam ${money(c.available)} disponíveis no período.`,
      link: `#/centros/${c.id}`,
    }));
    cs.filter((c) => c.status === 'attention').forEach((c) => out.push({
      tone: 'warn', kind: 'Atenção',
      title: `${c.name} está em ${pct(c.pct)} de execução`,
      detail: `${money(c.available)} disponíveis de ${money(c.planned)} planejados.`,
      link: `#/centros/${c.id}`,
    }));
    cs.filter((c) => c.pct !== null && c.pct < 50).forEach((c) => out.push({
      tone: 'ok', kind: 'Baixa execução',
      title: `${c.name} possui ${pct(100 - c.pct)} do orçamento disponível`,
      detail: `${money(c.available)} ainda não utilizados — avaliar se o planejamento segue válido.`,
      link: `#/centros/${c.id}`,
    }));
    const idle = Object.values(a.byCat).filter((c) => c.status === 'idle');
    if (idle.length) out.push({
      tone: 'idle', kind: 'Sem movimentação',
      title: `${idle.length} ${idle.length === 1 ? 'categoria orçada sem' : 'categorias orçadas sem'} movimentação`,
      detail: idle.slice(0, 4).map((c) => c.name).join(', ') + (idle.length > 4 ? ` e mais ${idle.length - 4}` : '') + '.',
      link: '#/pot',
    });
    return out;
  }

  /** Principais categorias de um centro (maior realizado) — usadas na CMP. */
  function topCategories(p, centerId, n = 3) {
    return aggregate(p).byCenter[centerId].categories.filter((c) => c.realized > 0).sort((x, y) => y.realized - x.realized).slice(0, n);
  }

  /** Maiores categorias da empresa no período (seção "Principais gastos"). */
  function topSpending(p, n = 6) {
    return Object.values(aggregate(p).byCat).filter((c) => c.realized > 0).sort((x, y) => y.realized - x.realized).slice(0, n);
  }

  /**
   * Insights do "Panorama geral" da CMP. Cada insight é derivado do agregado;
   * nenhum texto é estático.
   */
  function panorama(p) {
    const a = aggregate(p);
    const cs = Object.values(a.byCenter).filter((c) => c.planned > 0 || c.realized > 0);
    const maxBy = (arr, f) => arr.reduce((m, x) => (f(x) > f(m) ? x : m), arr[0]);
    const minBy = (arr, f) => arr.reduce((m, x) => (f(x) < f(m) ? x : m), arr[0]);
    const maior = maxBy(cs, (c) => c.realized);
    const desvio = maxBy(cs, (c) => Math.abs(c.devAbs));
    const menor = minBy(cs.filter((c) => c.pct !== null), (c) => c.pct);
    const acima = Object.values(a.byCat).filter((c) => c.status === 'over' || c.status === 'unbudgeted');
    return { a, maior, desvio, menor, acima };
  }

  /**
   * Rascunho automático da "Análise do mês" de um centro, derivado dos dados.
   * NOTA: substitui provisoriamente a geração por IA (integração futura);
   * o texto é determinístico e sempre rastreável aos números exibidos.
   */
  function draftAnalysis(p, centerId) {
    const a = aggregate(p);
    const c = a.byCenter[centerId];
    const nomeP = p.kind === 'month' ? MESES[p.month - 1] : periodLabel(p).toLowerCase();
    if (c.planned === 0 && c.realized === 0) return `${c.name} não teve orçamento nem gastos em ${nomeP}.`;
    let t = c.pct === null
      ? `${c.name} realizou ${money(c.realized)} sem orçamento previsto para ${nomeP}.`
      : `${c.name} realizou ${pct(c.pct)} do orçamento planejado para ${nomeP} (${money(c.realized)} de ${money(c.planned)}).`;
    const tops = topCategories(p, centerId, 2);
    if (tops.length) t += ` Os maiores gastos foram em ${tops.map((x) => `${x.name} (${money(x.realized)})`).join(' e ')}.`;
    const over = c.categories.filter((x) => x.status === 'over').sort((x, y) => y.devAbs - x.devAbs)[0];
    if (over) t += ` ${over.name} ficou ${pct(over.devPct)} acima do planejado.`;
    const nb = c.categories.filter((x) => x.status === 'unbudgeted');
    if (nb.length) t += ` Houve gasto não orçado em ${nb.map((x) => x.name).join(', ')}.`;
    const idle = c.categories.filter((x) => x.status === 'idle');
    if (idle.length) t += ` ${idle.length === 1 ? 'Uma categoria orçada não teve' : idle.length + ' categorias orçadas não tiveram'} movimentação.`;
    return t;
  }

  /* ------------------------------------------------------------------ */
  /* Análises salvas (CMP)                                               */
  /* ------------------------------------------------------------------ */

  const STORE_KEY = 'potcmp.analyses.v1';

  /** Lê análises editadas localmente. Armazenamento pode falhar (modo privado) — tratado. */
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; }
  }

  /**
   * Análise salva para mês × centro (edição local tem prioridade sobre o dataset).
   * @param {string} month - "AAAA-MM"
   * @param {string} centerId
   * @returns {{text:string, author:string, source:string, updatedAt:string}|null}
   */
  function getAnalysis(month, centerId) {
    const loc = readLocal()[`${month}|${centerId}`];
    if (loc) return loc;
    return D.analyses.find((x) => x.month === month && x.centerId === centerId) || null;
  }

  /** Salva (ou remove, com texto vazio) a análise de mês × centro. */
  function saveAnalysis(month, centerId, text, source) {
    const all = readLocal();
    const k = `${month}|${centerId}`;
    if (text && text.trim()) all[k] = { text: text.trim(), author: 'Você', source: source || 'manual', updatedAt: new Date().toISOString().slice(0, 10) };
    else delete all[k];
    try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) { /* armazenamento indisponível: mantém só em memória */ }
  }

  /** Entradas do mês (planilha de indicadores › Resultado de Caixa), ou null quando não houver dado. */
  function incomeFor(month) {
    const x = D.incomes.find((i) => i.month === month);
    return x ? x.amount : null;
  }

  window.Fin = {
    init, D, centers, centerById, catById, itemById, dataMonths, lastMonth, MESES, MESES_CURTOS, LIMIARES, STATUS,
    money, pct, signedPct, signedMoney, date, monthLabel, esc, norm,
    periodMonths, periodLabel, periodShort, periodRange, periodPhrase, customPeriod, monthsPhrase, prevPeriod, prevLabel, periodOptions, periodKey, parsePeriodKey,
    metrics, aggregate, transactionsFor, itemsFor, unbudgetedTx, sortCenters, sortCategories, evolution, comparePrev,
    alerts, topCategories, topSpending, panorama, draftAnalysis, getAnalysis, saveAnalysis, incomeFor,
  };
})();
