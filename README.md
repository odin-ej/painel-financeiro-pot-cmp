# Painel Financeiro — POT + CMP (Empresa JR ADM UFBA)

Painel que unifica o **POT** (Planejamento Orçamentário Trimestral), a **CMP** (Carta Mensal de Planejamento) e os **indicadores financeiros**, conectado ao vivo às planilhas Google da empresa.

Publicado em https://odin-ej.github.io/painel-financeiro-pot-cmp/

## Como os dados chegam

O painel não guarda dados próprios. A cada acesso (e a cada 5 minutos com a aba aberta) o navegador lê:

| Fonte | Aba | Uso no painel |
|---|---|---|
| Planilha do POT | `[GERAL]` | Planejado × realizado: Visão Geral, Centros, POT, CMP, Lançamentos |
| Planilha do POT | `[Lista de Categorias]` | Categorias e custeio no construtor do orçamento |
| Planilha de indicadores | Operações, abaixo de "Outros Indicadores" | Aba Indicadores e as entradas do mês na CMP |

As planilhas precisam estar compartilhadas como **"Qualquer pessoa com o link — Leitor"**. Os IDs ficam em [assets/js/config.js](assets/js/config.js).

Se o Google estiver indisponível, o painel mostra a última leitura salva no navegador e avisa isso na barra lateral.

## Escrita na planilha

Construir o POT pelo painel, editar/excluir itens e salvar análises da CMP passam por um Google Apps Script instalado na planilha do POT, protegido por uma chave de acesso. Instalação: [apps-script/README.md](apps-script/README.md).

Sem o Apps Script, o painel funciona normalmente em modo leitura; o construtor guarda o rascunho no navegador.

## Rodar localmente

```bash
python -m http.server 5173
```

Depois acesse http://localhost:5173.

## Estrutura

| Arquivo | Papel |
|---|---|
| `assets/js/config.js` | IDs das planilhas, URL do Apps Script, mapeamento dos centros |
| `assets/js/sheets.js` | Leitura das planilhas, parser dos indicadores, envio ao Apps Script |
| `assets/js/core.js` | Regras financeiras: períodos, agregações, status, alertas, insights |
| `assets/js/ui.js` | Componentes e gráficos SVG |
| `assets/js/pages.js` | Visão Geral, Centros, POT, CMP, Lançamentos, drawers |
| `assets/js/pages-planilha.js` | Indicadores, Construir orçamento, Configurações |
| `assets/js/app.js` | Carga, atualização automática, rotas, seletor de período |
| `apps-script/Codigo.gs` | API de escrita (colar no Apps Script da planilha do POT) |

## Regras de leitura da `[GERAL]`

- Cada linha com Valor Planejado vira um item do POT; cada linha com Valor Realizado vira um lançamento.
- Linha com realizado e sem planejado = **gasto não orçado**.
- O centro "Pessoas" da planilha aparece como **Cultural** no painel.
- Todo número do painel leva até a linha de origem na planilha (link nos detalhes do item e do lançamento).
