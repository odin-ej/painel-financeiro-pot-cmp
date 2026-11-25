/**
 * config.js — fontes de dados do Painel Financeiro.
 *
 * O painel não guarda dados próprios: tudo é lido ao vivo das planilhas
 * Google abaixo (export CSV público) e a escrita do POT passa por um
 * Google Apps Script implantado na própria planilha do POT.
 *
 * Para trocar de planilha basta alterar os IDs/gids aqui.
 * NOTA: as planilhas precisam estar compartilhadas como
 * "Qualquer pessoa com o link — Leitor" para o navegador conseguir lê-las.
 */
window.PAINEL_CONFIG = {
  /** Planilha do POT (aba [GERAL] = itens planejados e realizados). */
  pot: {
    spreadsheetId: '1tgvNH7Eqe8rv1TU0UyTY5vtCQAlKDmYCjSyV2IbppXk',
    gidGeral: '1271431491',
    gidCategorias: '175736922', // [Lista de Categorias]: categoria → custeio
    url: 'https://docs.google.com/spreadsheets/d/1tgvNH7Eqe8rv1TU0UyTY5vtCQAlKDmYCjSyV2IbppXk/edit',
  },

  /** Planilha de indicadores (aba Operações, tudo abaixo de "Outros Indicadores"). */
  indicadores: {
    spreadsheetId: '1WWmh3lUGDHKAe5J7k4QSV-Lpo15mgHH2yn6CT338kr0',
    gid: '230818536',
    marcador: 'Outros Indicadores',
    url: 'https://docs.google.com/spreadsheets/d/1WWmh3lUGDHKAe5J7k4QSV-Lpo15mgHH2yn6CT338kr0/edit?gid=230818536',
  },

  /**
   * URL do Apps Script (implantação "App da Web") que grava no POT.
   * Vazio = painel somente leitura. Pode ser sobrescrita em Configurações
   * (fica salva no navegador). Ver apps-script/README.md.
   */
  appsScriptUrl: '',

  /** Intervalo de atualização automática, em minutos (5 = equilíbrio entre frescor e carga). */
  refreshMinutes: 5,

  /**
   * Nome do centro na planilha → id e nome exibido no painel.
   * "Pessoas" é exibido como Cultural, nome usado no planejamento do painel.
   */
  centros: [
    { sheet: 'Vendas', id: 'vendas', name: 'Vendas' },
    { sheet: 'Institucional', id: 'institucional', name: 'Institucional' },
    { sheet: 'Pessoas', id: 'cultural', name: 'Cultural' },
    { sheet: 'Operação', id: 'operacao', name: 'Operação' },
    { sheet: 'Inovação', id: 'inovacao', name: 'Inovação' },
    { sheet: 'Projetos', id: 'projetos', name: 'Projetos' },
  ],
};
