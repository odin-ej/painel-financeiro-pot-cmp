# Painel Financeiro — POT + CMP (Empresa JR ADM UFBA)

Protótipo navegável que unifica o **POT** (Planejamento Orçamentário Trimestral) e a **CMP** (Carta Mensal de Planejamento) em uma única plataforma: dados → dashboard → análise → decisão.

## Como abrir

O app é HTML/CSS/JS puro, sem build. Sirva a pasta com qualquer servidor estático:

```bash
python -m http.server 5173
```

Depois acesse http://localhost:5173.

## Estrutura

| Arquivo | Papel |
|---|---|
| `assets/data.js` | **Fonte única de dados** (gerada — não editar à mão) |
| `tools/gerar_dados.py` | Gera `data.js` de forma determinística; agosto/2026 reproduz a CMP real |
| `assets/js/core.js` | Regras financeiras: períodos, agregações, status, alertas, insights |
| `assets/js/ui.js` | Componentes (badges, barras, drawer, modal, tooltip) e gráficos SVG |
| `assets/js/pages.js` | Telas: Visão Geral, Centros, POT, CMP, Lançamentos |
| `assets/js/app.js` | Roteamento por hash, estado global, seletor de período |
| `assets/css/styles.css` | Design system derivado do `DESIGN.md` |

## Consistência

Todas as somas são feitas em centavos inteiros: lançamentos → categoria → centro → total.
Nenhum número da interface é digitado manualmente; tudo é derivado de `data.js`.

## Cenários de demonstração (Q3 2026)

- Institucional acima de 100% (ENEJ)
- Projetos (91,8%) e Operação (86,9%) entre 80–100%
- Inovação abaixo de 50%
- Categorias acima do orçamento (ENEJ, Alimentação e deslocamento)
- Gastos não orçados (Foto institucional, Devoluções)
- Categoria sem movimentação (Experimentos e validações)
- TotalPass com orçamento totalmente utilizado

## Limitações do protótipo

- Análises da CMP e preferências ficam no `localStorage` do navegador.
- "Novo lançamento" vale apenas para a sessão.
- Geração por IA, integrações (VExpenses, Conta Azul), autenticação e exportação estão sinalizadas como futuras.
