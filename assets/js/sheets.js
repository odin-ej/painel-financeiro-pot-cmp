/**
 * sheets.js — conexão do painel com o Google Sheets.
 *
 * Responsabilidades:
 *  - ler ao vivo (export CSV público) a aba [GERAL] e a [Lista de Categorias]
 *    da planilha do POT e a aba Operações da planilha de indicadores;
 *  - converter as linhas da planilha no modelo do painel
 *    (centros → categorias → itens planejados → lançamentos realizados);
 *  - interpretar os blocos de "Outros Indicadores" de forma genérica
 *    (qualquer bloco novo criado na planilha aparece automaticamente);
 *  - guardar a última leitura bem-sucedida no navegador, usada se o Google
 *    estiver indisponível;
 *  - enviar escritas (construção do POT, análises) ao Apps Script.
 *
 * Dependências: window.PAINEL_CONFIG (config.js).
 */
(function () {
  'use strict';

  const C = window.PAINEL_CONFIG;
  const CACHE_KEY = 'potcmp.sheets.cache.v2';
  const URL_KEY = 'potcmp.appsScriptUrl';
  const TOKEN_KEY = 'potcmp.appsScriptToken';

  const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /* ------------------------------------------------------------------ */
  /* Utilidades de parsing                                               */
  /* ------------------------------------------------------------------ */

  /** Normaliza texto para comparação (sem acentos, minúsculo, espaços simples). */
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /** Gera um id estável a partir de texto ("Ação MEJ" -> "acao-mej"). */
  function slug(s) {
    return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
  }

  /**
   * Parser CSV (RFC 4180): aspas, vírgulas e quebras de linha dentro de campos.
   * @param {string} text
   * @returns {string[][]}
   */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /**
   * Converte texto da planilha em número.
   * Aceita "R$ 1.234,56", "R$ (57,00)", "-R$ 3,00", "30,37%", "R$ -" (zero).
   * Erros de fórmula (#REF!, #DIV/0!, #N/A) e vazio viram null — nunca NaN.
   * @param {string} s
   * @returns {number|null}
   */
  function num(s) {
    let t = String(s ?? '').replace(/ /g, ' ').trim();
    if (!t || t.startsWith('#')) return null;
    if (/^r\$\s*-$/i.test(t)) return 0;
    if (t === '-') return null;
    const neg = /\(.*\)/.test(t) || /^-/.test(t) || /^r\$\s*-/i.test(t);
    t = t.replace(/r\$|%|\(|\)|\s|-/gi, '').replace(/\./g, '').replace(',', '.');
    if (!/^\d*\.?\d+$/.test(t)) return null;
    const v = parseFloat(t);
    return Number.isFinite(v) ? (neg ? -v : v) : null;
  }

  /** Tipo do valor pela forma como a planilha o exibe. */
  function kindOf(s) {
    const t = String(s || '');
    if (/r\$/i.test(t)) return 'money';
    if (/%\s*$/.test(t)) return 'pct';
    return 'num';
  }

  /** "15/08/2026" -> "2026-08-15" (ou null). */
  function isoDate(s) {
    const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  /**
   * Converte o cabeçalho de mês em "AAAA-MM" (ou null).
   * Aceita "agosto/2026" e também "Ago"/"Agosto" sem ano — nesse caso usa `year`.
   * @param {string} s
   * @param {number} [year] - ano do bloco, para cabeçalhos sem ano
   */
  function monthKey(s, year) {
    const t = norm(s);
    const m = t.match(/^([a-z]+)\/(\d{4})$/);
    if (m) {
      const i = MESES.indexOf(m[1]);
      return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, '0')}`;
    }
    if (!year) return null;
    const i = MESES.findIndex((x) => x === t || x.slice(0, 3) === t);
    return i < 0 ? null : `${year}-${String(i + 1).padStart(2, '0')}`;
  }

  /* ------------------------------------------------------------------ */
  /* Busca                                                               */
  /* ------------------------------------------------------------------ */

  /** URL de export CSV de uma aba. O parâmetro t evita cache intermediário. */
  function csvUrl(id, gid) {
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}&t=${Date.now()}`;
  }

  /**
   * Baixa o CSV de uma aba. Lança erro com code='denied' quando a planilha
   * não está pública (o Google responde 401/HTML de login).
   */
  async function fetchCSV(id, gid) {
    let res;
    try { res = await fetch(csvUrl(id, gid), { cache: 'no-store' }); } catch (e) {
      const err = new Error('Falha de rede ou planilha sem acesso público'); err.code = 'network'; throw err;
    }
    const text = await res.text();
    if (!res.ok || /^\s*<!doctype html/i.test(text)) {
      const err = new Error(res.status === 401 || res.status === 403 ? 'Planilha sem acesso público' : `Erro ${res.status}`);
      err.code = res.status === 401 || res.status === 403 ? 'denied' : 'http';
      throw err;
    }
    return text;
  }

  /* ------------------------------------------------------------------ */
  /* POT: [GERAL] → modelo do painel                                     */
  /* ------------------------------------------------------------------ */

  /** Localiza colunas pelo cabeçalho (tolerante a espaços/acentos e reordenação). */
  function headerIndex(header) {
    const h = header.map(norm);
    const find = (re, fallback) => { const i = h.findIndex((x) => re.test(x)); return i >= 0 ? i : fallback; };
    return {
      data: find(/^data$/, 0), desc: find(/^descricao/, 2), cat: find(/^categoria/, 3), custeio: find(/^custeio/, 4),
      centro: find(/^centro de custo/, 5), plan: find(/^valor planejado/, 6), real: find(/^valor realizado/, 7),
      revisao: find(/^revisao/, 9), coment: find(/^come?n?tarios|^cometarios/, 10), imp: find(/^importancia/, 11),
      obr: find(/^obrigatoriedade/, 12), caixa: find(/^nivel de caixa para/, 13), dir: find(/^direcionamento/, 16),
    };
  }

  /**
   * Converte as linhas da aba [GERAL] no modelo usado pelo core.js.
   *
   * Cada linha da planilha tem planejado E realizado; ela vira:
   *  - um item planejado (se Valor Planejado ≠ 0);
   *  - um lançamento realizado (se Valor Realizado ≠ 0), ligado ao item da
   *    mesma linha — ou sem item, quando não havia orçamento (gasto não orçado).
   * Os ids carregam o número da linha na planilha (R123/L123), o que permite
   * rastrear qualquer número do painel até a célula de origem.
   *
   * @param {string} geralCSV
   * @param {string|null} catsCSV
   * @returns {Object} dados no formato esperado por Fin.init
   */
  function buildPot(geralCSV, catsCSV) {
    const rows = parseCSV(geralCSV);
    const ix = headerIndex(rows[0] || []);
    const centerMap = {};
    C.centros.forEach((c) => { centerMap[norm(c.sheet)] = c; centerMap[norm(c.name)] = c; });

    const centers = C.centros.map((c, i) => ({ id: c.id, name: c.name, sheetName: c.sheet, order: i }));
    const cats = {}, items = [], transactions = [];
    let semCentro = 0, ignoradas = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const date = isoDate(r[ix.data]);
      if (!date) { if (r.some((x) => x.trim())) ignoradas++; continue; }
      const planned = num(r[ix.plan]) || 0;
      const realized = num(r[ix.real]) || 0;
      if (!planned && !realized) continue;
      let ce = centerMap[norm(r[ix.centro])];
      if (!ce) { ce = { id: 'sem-centro', name: 'Sem centro', sheet: '' }; semCentro++; }
      const catName = String(r[ix.cat] || '').trim() || 'Sem categoria';
      const catId = `${ce.id}--${slug(catName)}`;
      if (!cats[catId]) cats[catId] = { id: catId, centerId: ce.id, name: catName };
      const row = i + 1; // linha real na planilha (cabeçalho = linha 1)
      const custeio = /vari/i.test(r[ix.custeio] || '') ? 'Variável' : 'Fixo';
      const desc = String(r[ix.desc] || '').trim() || '(sem descrição)';
      const note = String(r[ix.coment] || '').trim();
      let itemId = null;
      if (planned) {
        itemId = `R${row}`;
        items.push({
          id: itemId, row, month: date.slice(0, 7), date, description: desc, categoryId: catId, planned,
          realizedInRow: realized, custeio, importance: (r[ix.imp] || '').trim() || '—', obligation: (r[ix.obr] || '').trim() || '—',
          cashLevel: (r[ix.caixa] || '').trim() || '—', direction: (r[ix.dir] || '').trim(), note,
        });
      }
      if (realized) {
        transactions.push({
          id: `L${row}`, row, date, description: desc, categoryId: catId, itemId, amount: realized, type: custeio,
          status: planned ? 'Orçado' : 'Não orçado', note, source: `Planilha POT · linha ${row}`, responsible: ce.name,
        });
      }
    }
    if (semCentro) centers.push({ id: 'sem-centro', name: 'Sem centro', sheetName: '', order: 99 });

    // Catálogo oficial de categorias (para o construtor do POT)
    const catalog = [];
    if (catsCSV) {
      parseCSV(catsCSV).slice(1).forEach((r) => {
        const name = String(r[0] || '').trim();
        if (name) catalog.push({ name, custeio: /vari/i.test(r[1] || '') ? 'Variável' : 'Fixo' });
      });
    }

    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const months = [...new Set(items.map((i) => i.month).concat(transactions.map((t) => t.date.slice(0, 7))))].sort();
    return {
      meta: {
        company: 'Empresa JR ADM UFBA', source: 'Google Sheets', year: now.getFullYear(),
        currentQuarter: Math.ceil((now.getMonth() + 1) / 3),
        // Acumulado do ano vai até o mês corrente (meses futuros só têm planejamento)
        lastClosedMonth: months.length && months[months.length - 1] < cur ? months[months.length - 1] : cur,
        maxMonth: months[months.length - 1] || cur,
        quality: { semCentro, ignoradas, linhas: rows.length - 1 },
      },
      centers, categories: Object.values(cats), items, transactions, incomes: [], analyses: [], catalog,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Indicadores: blocos abaixo de "Outros Indicadores"                  */
  /* ------------------------------------------------------------------ */

  /**
   * Interpreta os blocos de indicadores da aba Operações.
   *
   * Padrão de cada bloco na planilha:
   *   linha título  → nome do indicador + "Meta" / "Progresso"
   *   linha meses   → janeiro/AAAA … dezembro/AAAA ou Jan … Dez (+ "Total")
   *   linhas dados  → rótulo + um valor por mês (+ total, meta, progresso)
   * O parser só depende desse padrão, não de posições fixas.
   *
   * @param {string} text - CSV da aba
   * @param {string} marcador - texto a partir do qual ler ("Outros Indicadores")
   * @returns {{blocks:Array, entradas:Object}} blocos e a série "Entradas totais" (usada na CMP)
   */
  function parseIndicators(text, marcador) {
    const rows = parseCSV(text);
    let start = rows.findIndex((r) => r.some((c) => norm(c).includes(norm(marcador))));
    if (start < 0) start = 0;
    // Ano fictício só para detectar cabeçalhos sem ano ("Jan", "Fev"…)
    const isMonthRow = (r) => r.filter((c) => monthKey(c, 2000)).length >= 3;
    const nonEmpty = (r) => r.some((c) => c.trim());
    const blocks = [];
    const entradas = {};

    for (let i = start; i < rows.length; i++) {
      if (!isMonthRow(rows[i])) continue;
      const mrow = rows[i];
      let t = i - 1;
      while (t > start && !nonEmpty(rows[t])) t--;
      const trow = rows[t] || [];
      const months = [];
      // Cabeçalho sem ano: usa o ano escrito na linha do título (ex.: "2026") ou o ano corrente
      const yearCell = trow.map((c) => c.trim()).find((c) => /^20\d\d$/.test(c));
      const year = yearCell ? Number(yearCell) : new Date().getFullYear();
      mrow.forEach((c, col) => { const k = monthKey(c, year); if (k) months.push({ col, ym: k }); });
      const firstCol = months[0].col;
      const totalCol = mrow.findIndex((c) => norm(c) === 'total');
      const metaCol = trow.findIndex((c) => norm(c) === 'meta');
      const progCol = trow.findIndex((c) => norm(c) === 'progresso');

      // Título = primeiro texto antes da coluna dos meses (ignora rótulos "1º Trimestre")
      let rawTitle = trow.slice(0, firstCol).map((c) => c.trim()).find((c) => c && !/trimestre/i.test(c)) || '';
      let note = '';
      const paren = rawTitle.match(/\(([^)]*)\)\s*$/);
      if (paren) { note = paren[1]; rawTitle = rawTitle.replace(/\s*\([^)]*\)\s*$/, ''); }

      const data = [];
      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j];
        if (isMonthRow(r) || (j + 1 < rows.length && isMonthRow(rows[j + 1]) && nonEmpty(r))) break;
        if (!nonEmpty(r)) { if (data.length && !nonEmpty(rows[j + 1] || [])) break; continue; }
        const label = r.slice(0, firstCol).map((c) => c.trim()).find((c) => c);
        if (!label || /slide do caf|informa..?es? em par/i.test(norm(label))) continue;
        const rawVals = months.map((m) => r[m.col] || '');
        const values = rawVals.map(num);
        if (values.every((v) => v === null)) continue;
        const sample = rawVals.find((v) => v.trim() && !v.trim().startsWith('#')) || '';
        const clean = (s) => { const x = String(s || '').trim(); return x && !x.startsWith('#') ? x : ''; };
        const rowObj = {
          label: label.replace(/\s+/g, ' '), kind: kindOf(sample), values,
          total: totalCol >= 0 ? clean(r[totalCol]) : '', meta: metaCol >= 0 ? clean(r[metaCol]) : '', progress: progCol >= 0 ? clean(r[progCol]) : '',
        };
        data.push(rowObj);
        // "R$ -" em meses futuros significa "ainda não registrado", não entrada zero
        if (/^entradas totais/.test(norm(label))) months.forEach((m, k) => { if (values[k]) entradas[m.ym] = values[k]; });
      }
      // Bloco intitulado só "%": nomeia pela razão que ele calcula (ex.: Reinvestimento em membros (% de saídas))
      if (rawTitle.length <= 2 && data.length >= 2) rawTitle = `${data[1].label} (% de ${data[0].label.toLowerCase()})`;
      // Bloco sem título na planilha: nomeia pelos próprios indicadores
      if (!rawTitle && data.length) rawTitle = data.slice(0, 3).map((d) => d.label).join(' · ');
      if (data.length) blocks.push({ id: slug(rawTitle) + '-' + blocks.length, title: rawTitle, note, months: months.map((m) => m.ym), rows: data, sheetRow: t + 1 });
    }
    return { blocks, entradas };
  }

  /* ------------------------------------------------------------------ */
  /* Cache local (última leitura boa)                                    */
  /* ------------------------------------------------------------------ */

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* cota excedida/modo privado: segue sem cache */ }
  }

  /* ------------------------------------------------------------------ */
  /* Apps Script (escrita)                                               */
  /* ------------------------------------------------------------------ */

  /** URL do Apps Script em uso (configuração local tem prioridade). */
  function scriptUrl() {
    try { return localStorage.getItem(URL_KEY) || C.appsScriptUrl || ''; } catch (e) { return C.appsScriptUrl || ''; }
  }
  function setScriptUrl(u) { try { u ? localStorage.setItem(URL_KEY, u.trim()) : localStorage.removeItem(URL_KEY); } catch (e) { /* ignora */ } }
  /** Chave de acesso (SEGURANCA: fica só no navegador de quem edita, nunca no código público). */
  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t.trim()) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignora */ } }
  function canWrite() { return !!(scriptUrl() && token()); }

  /**
   * Envia uma ação ao Apps Script.
   * Usa Content-Type text/plain para evitar preflight CORS (o Apps Script não responde OPTIONS).
   * @param {string} action - addItems | updateItem | deleteItem | saveAnalysis | ping
   * @param {Object} payload
   * @returns {Promise<Object>} resposta JSON ({ok:true,...})
   * @throws {Error} quando não configurado, sem rede ou recusado pelo script
   */
  async function post(action, payload = {}) {
    const url = scriptUrl();
    if (!url) throw new Error('Apps Script não configurado. Veja Configurações.');
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, action, token: token() }) });
    } catch (e) { throw new Error('Não foi possível falar com o Apps Script (rede ou URL incorreta).'); }
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('Resposta inesperada do Apps Script. Confira se a implantação permite acesso a "Qualquer pessoa".'); }
    if (!json.ok) throw new Error(json.erro || 'O Apps Script recusou a operação.');
    return json;
  }

  /** Lê as análises da CMP salvas na planilha (via Apps Script; leitura não exige chave). */
  async function fetchAnalyses() {
    const url = scriptUrl();
    if (!url) return null;
    try {
      const res = await fetch(`${url}?action=analyses&t=${Date.now()}`);
      const j = await res.json();
      return j.ok ? j.analyses : null;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ */
  /* Carga principal                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Lê todas as fontes. Cada fonte falha de forma independente:
   * POT sem acesso → usa cache; indicadores sem acesso → página de indicadores
   * explica como compartilhar, o resto do painel segue funcionando.
   *
   * @returns {Promise<{data:Object, indicators:Object|null, status:Object}>}
   * @throws {Error} se o POT não puder ser lido e não houver cache
   */
  async function load() {
    const [geral, cats, ind] = await Promise.allSettled([
      fetchCSV(C.pot.spreadsheetId, C.pot.gidGeral),
      fetchCSV(C.pot.spreadsheetId, C.pot.gidCategorias),
      fetchCSV(C.indicadores.spreadsheetId, C.indicadores.gid),
    ]);
    const cache = readCache() || {};
    const now = new Date().toISOString();
    const status = { loadedAt: now };

    let geralText, catsText, indText;
    if (geral.status === 'fulfilled') { geralText = geral.value; status.pot = 'live'; }
    else if (cache.geral) { geralText = cache.geral; status.pot = 'cache'; status.potError = geral.reason.message; status.cachedAt = cache.geralAt; }
    else { const e = new Error(geral.reason.message); e.code = geral.reason.code; throw e; }
    catsText = cats.status === 'fulfilled' ? cats.value : cache.cats || null;
    if (ind.status === 'fulfilled') { indText = ind.value; status.ind = 'live'; }
    else if (cache.ind) { indText = cache.ind; status.ind = 'cache'; status.indError = ind.reason.message; status.indCode = ind.reason.code; status.indCachedAt = cache.indAt; }
    else { status.ind = 'error'; status.indError = ind.reason.message; status.indCode = ind.reason.code; }

    writeCache({
      geral: geralText, geralAt: status.pot === 'live' ? now : cache.geralAt,
      cats: catsText, ind: indText || null, indAt: status.ind === 'live' ? now : cache.indAt,
    });

    const data = buildPot(geralText, catsText);
    let indicators = null;
    if (indText) {
      indicators = parseIndicators(indText, C.indicadores.marcador);
      data.incomes = Object.entries(indicators.entradas).map(([month, amount]) => ({ month, amount }));
    }
    const analyses = await fetchAnalyses();
    if (analyses) data.analyses = analyses;
    status.analyses = analyses ? 'sheet' : 'local';
    status.signature = `${geralText.length}:${(indText || '').length}:${geralText.slice(-200)}`;
    return { data, indicators, status };
  }

  window.Sheets = { load, post, parseCSV, num, parseIndicators, buildPot, scriptUrl, setScriptUrl, token, setToken, canWrite, norm, slug };
})();
