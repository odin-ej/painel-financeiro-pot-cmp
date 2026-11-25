/**
 * Painel Financeiro — API de escrita do POT (Google Apps Script).
 *
 * Propósito: permitir que o painel (site estático no GitHub Pages) grave na
 * planilha do POT sem expor credenciais do Google. O script roda com a conta
 * de quem o implantou e só aceita pedidos que tragam a chave PAINEL_TOKEN.
 *
 * Ações (POST, corpo JSON enviado como text/plain):
 *   ping          — testa conexão e chave
 *   addItems      — insere itens planejados na aba [GERAL], agrupados no mês
 *   updateItem    — altera um item existente (confere data + descrição antes)
 *   deleteItem    — remove um item sem valor realizado
 *   saveAnalysis  — grava a "Análise do mês" da CMP na aba [Painel - Análises]
 * GET ?action=analyses — lista as análises salvas (leitura pública).
 *
 * Instalação: ver apps-script/README.md.
 *
 * SEGURANCA: a chave fica em Propriedades do script (não no código) e é
 * comparada a cada pedido. Todas as escritas usam LockService para evitar
 * que dois envios simultâneos insiram linhas no mesmo lugar.
 */

/** Nomes das abas usadas. */
const ABA_GERAL = '[GERAL]';
const ABA_CATEGORIAS = '[Lista de Categorias]';
const ABA_ANALISES = '[Painel - Análises]';

/** Colunas de entrada da aba [GERAL] (1 = A). As demais são fórmulas e são copiadas da linha vizinha. */
const COL = { DATA: 1, DESC: 3, CAT: 4, CENTRO: 6, PLAN: 7, REAL: 8, REVISAO: 10, COMENT: 11, IMPORT: 12, OBRIG: 13 };

/** Valores aceitos — iguais às validações usadas na planilha. */
const CENTROS = ['Vendas', 'Institucional', 'Pessoas', 'Operação', 'Inovação', 'Projetos'];
const IMPORTANCIAS = ['Alta', 'Média', 'Baixa', ''];
const OBRIGATORIEDADES = ['Obrigatória', 'Planejável', 'Adiável', ''];

/** Limite por envio: protege contra pedidos acidentais gigantes (e o tempo máximo de 6 min do Apps Script). */
const MAX_ITENS = 200;

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'analyses') return json_({ ok: true, analyses: listAnalyses_() });
  return json_({ ok: true, servico: 'painel-pot', versao: 1 });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, erro: 'Pedido inválido (JSON).' }); }

  const token = PropertiesService.getScriptProperties().getProperty('PAINEL_TOKEN');
  if (!token) return json_({ ok: false, erro: 'PAINEL_TOKEN não configurado nas Propriedades do script.' });
  if (body.token !== token) return json_({ ok: false, erro: 'Chave de acesso inválida.' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, erro: 'Planilha ocupada, tente novamente em instantes.' });
  try {
    switch (body.action) {
      case 'ping': return json_({ ok: true, planilha: SpreadsheetApp.getActive().getName() });
      case 'addItems': return json_(addItems_(body.items));
      case 'updateItem': return json_(updateItem_(body));
      case 'deleteItem': return json_(deleteItem_(body));
      case 'saveAnalysis': return json_(saveAnalysis_(body));
      default: return json_({ ok: false, erro: 'Ação desconhecida: ' + body.action });
    }
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Itens do POT                                                        */
/* ------------------------------------------------------------------ */

/**
 * Insere itens planejados na [GERAL].
 * Cada item entra logo após a última linha do mesmo mês (mantém a planilha
 * agrupada por mês) e herda as fórmulas da linha vizinha (Mês, Custeio,
 * Eficiência, Nível de caixa, Direcionamento).
 *
 * @param {Array<{date:string, description:string, category:string, center:string,
 *         planned:number, importance?:string, obligation?:string, custeio?:string}>} items
 * @returns {{ok:boolean, linhas:number[], novasCategorias:string[]}}
 */
function addItems_(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Nenhum item enviado.');
  if (items.length > MAX_ITENS) throw new Error('Máximo de ' + MAX_ITENS + ' itens por envio.');
  const valid = items.map(validateItem_);

  const sh = sheet_(ABA_GERAL);
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const lastCol = sh.getLastColumn();
  const n = Math.max(sh.getLastRow() - 1, 0);
  const dates = n ? sh.getRange(2, COL.DATA, n, 1).getValues().map(function (r) { return r[0]; }) : [];
  const ym = function (d) { return d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM') : ''; };
  const novas = ensureCategories_(valid);
  const linhas = [];

  valid.forEach(function (v) {
    const key = ym(v.date);
    let idx = -1;
    for (let i = dates.length - 1; i >= 0; i--) { if (ym(dates[i]) === key) { idx = i; break; } }
    let target;
    if (idx >= 0) {
      sh.insertRowAfter(idx + 2);          // idx 0 = linha 2
      target = idx + 3;
      dates.splice(idx + 1, 0, v.date);
    } else {
      sh.insertRowAfter(sh.getLastRow());
      target = sh.getLastRow() + 1;
      dates.push(v.date);
    }
    // Linha modelo: a de cima (ou a de baixo, se for a primeira)
    const model = target > 2 ? target - 1 : target + 1;
    sh.getRange(model, 1, 1, lastCol).copyTo(sh.getRange(target, 1, 1, lastCol));
    writeInputs_(sh, target, v);
    sh.getRange(target, COL.REAL).clearContent();
    sh.getRange(target, COL.REVISAO).clearContent();
    sh.getRange(target, COL.COMENT).setValue('Criado pelo Painel em ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm'));
    linhas.push(target);
  });
  return { ok: true, linhas: linhas, novasCategorias: novas };
}

/**
 * Altera um item. Confere data e descrição esperadas para não editar a linha
 * errada caso a planilha tenha mudado desde a última leitura do painel.
 */
function updateItem_(b) {
  const sh = sheet_(ABA_GERAL);
  checkRow_(sh, b.row, b.expect);
  const v = validateItem_(b.item);
  ensureCategories_([v]);
  writeInputs_(sh, b.row, v);
  return { ok: true, linha: b.row };
}

/** Remove um item planejado — somente se ainda não tem valor realizado. */
function deleteItem_(b) {
  const sh = sheet_(ABA_GERAL);
  checkRow_(sh, b.row, b.expect);
  const real = sh.getRange(b.row, COL.REAL).getValue();
  if (real !== '' && Number(real) !== 0) throw new Error('O item já tem valor realizado e não pode ser excluído pelo painel.');
  sh.deleteRow(b.row);
  return { ok: true, linha: b.row };
}

/** Escreve as colunas de entrada de um item validado. */
function writeInputs_(sh, row, v) {
  sh.getRange(row, COL.DATA).setValue(v.date);
  sh.getRange(row, COL.DESC).setValue(v.description);
  sh.getRange(row, COL.CAT).setValue(v.category);
  sh.getRange(row, COL.CENTRO).setValue(v.center);
  sh.getRange(row, COL.PLAN).setValue(v.planned);
  sh.getRange(row, COL.IMPORT).setValue(v.importance);
  sh.getRange(row, COL.OBRIG).setValue(v.obligation);
}

/** Confere se a linha ainda é o item que o painel exibiu. */
function checkRow_(sh, row, expect) {
  row = Number(row);
  if (!row || row < 2 || row > sh.getLastRow()) throw new Error('Linha inválida.');
  if (!expect) throw new Error('Pedido sem conferência de linha.');
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const d = sh.getRange(row, COL.DATA).getValue();
  const desc = String(sh.getRange(row, COL.DESC).getValue()).trim();
  const dIso = d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : '';
  if (dIso !== expect.date || desc !== String(expect.description || '').trim()) {
    throw new Error('A planilha mudou desde a última leitura (linha ' + row + '). Atualize o painel e tente de novo.');
  }
}

/**
 * Valida e normaliza um item vindo do painel.
 * @throws {Error} com mensagem amigável para o primeiro campo inválido
 */
function validateItem_(it) {
  if (!it) throw new Error('Item vazio.');
  const m = String(it.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Data inválida: ' + it.date);
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const description = String(it.description || '').trim();
  if (!description || description.length > 200) throw new Error('Descrição vazia ou longa demais.');
  const category = String(it.category || '').trim();
  if (!category || category.length > 100) throw new Error('Categoria inválida em "' + description + '".');
  const center = String(it.center || '').trim();
  if (CENTROS.indexOf(center) < 0) throw new Error('Centro de custo inválido: ' + center);
  const planned = Math.round(Number(it.planned) * 100) / 100;
  if (!(planned > 0) || planned > 1000000) throw new Error('Valor planejado inválido em "' + description + '".');
  const importance = String(it.importance || '');
  const obligation = String(it.obligation || '');
  if (IMPORTANCIAS.indexOf(importance) < 0) throw new Error('Importância inválida: ' + importance);
  if (OBRIGATORIEDADES.indexOf(obligation) < 0) throw new Error('Obrigatoriedade inválida: ' + obligation);
  const custeio = /vari/i.test(it.custeio || '') ? 'Gastos Variáveis' : 'Gastos Fixos';
  return { date: date, description: description, category: category, center: center, planned: planned, importance: importance, obligation: obligation, custeio: custeio };
}

/**
 * Garante que as categorias usadas existam na [Lista de Categorias]
 * (a coluna Custeio da [GERAL] faz PROCV nela). Cria as que faltarem.
 * @returns {string[]} categorias criadas
 */
function ensureCategories_(items) {
  const sh = sheet_(ABA_CATEGORIAS);
  const last = sh.getLastRow();
  const existing = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim().toLowerCase(); }) : [];
  const novas = [];
  items.forEach(function (v) {
    const k = v.category.toLowerCase();
    if (existing.indexOf(k) < 0) {
      sh.appendRow([v.category, v.custeio, '', '']);
      existing.push(k);
      novas.push(v.category);
    }
  });
  return novas;
}

/* ------------------------------------------------------------------ */
/* Análises da CMP                                                     */
/* ------------------------------------------------------------------ */

/** Cria (uma vez) e devolve a aba de análises. */
function analysesSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ABA_ANALISES);
  if (!sh) {
    sh = ss.insertSheet(ABA_ANALISES);
    sh.appendRow(['Mês (AAAA-MM)', 'Centro (id)', 'Análise', 'Autor', 'Atualizado em', 'Origem']);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Grava (ou substitui) a análise de mês × centro. Texto vazio remove. */
function saveAnalysis_(b) {
  const month = String(b.month || '');
  const centerId = String(b.centerId || '');
  if (!/^\d{4}-\d{2}$/.test(month) || !centerId) throw new Error('Mês ou centro inválido.');
  const text = String(b.text || '').trim().slice(0, 5000);
  const sh = analysesSheet_();
  const last = sh.getLastRow();
  const keys = last > 1 ? sh.getRange(2, 1, last - 1, 2).getDisplayValues() : [];
  let row = -1;
  keys.forEach(function (k, i) { if (k[0] === month && k[1] === centerId) row = i + 2; });
  if (!text) { if (row > 0) sh.deleteRow(row); return { ok: true, removida: true }; }
  // Grava o mês como texto para a planilha não convertê-lo em data
  const values = [["'" + month, centerId, text, String(b.author || 'Painel').slice(0, 80), new Date(), String(b.source || 'manual')]];
  if (row > 0) sh.getRange(row, 1, 1, 6).setValues(values); else sh.appendRow(values[0]);
  return { ok: true };
}

/** Lista as análises salvas no formato do painel. */
function listAnalyses_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(ABA_ANALISES);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().map(function (r) {
    return {
      month: String(r[0]).replace(/^'/, ''), centerId: String(r[1]), text: String(r[2]), author: String(r[3]),
      updatedAt: r[4] instanceof Date ? Utilities.formatDate(r[4], tz, 'yyyy-MM-dd') : String(r[4]).slice(0, 10),
      source: String(r[5] || 'manual'),
    };
  }).filter(function (a) { return a.month && a.text; });
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Aba não encontrada: ' + name);
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
