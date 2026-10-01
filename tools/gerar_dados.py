"""
Gerador do dataset fictício do protótipo POT + CMP (Empresa JR ADM UFBA).

Propósito
---------
Produz ``assets/data.js`` — a ÚNICA fonte de dados da aplicação. Todos os
indicadores exibidos na interface (KPIs, gráficos, alertas, CMP) são derivados
em tempo de execução a partir deste arquivo; nenhum número é digitado
isoladamente em uma página.

Estrutura gerada (hierarquia: ano → mês → centro → categoria → item → lançamento)
    centers      — 6 Centros de Custo
    categories   — categorias, sempre vinculadas a um centro
    items        — itens planejados do POT (valor planejado por mês)
    transactions — lançamentos realizados (vinculados a um item, ou ``itemId=None``
                   quando o gasto não foi orçado)
    incomes      — entradas mensais (usadas apenas no resumo da CMP)
    analyses     — análises mensais salvas por Centro de Custo

Consistência
------------
Todos os valores são manipulados em CENTAVOS inteiros e as divisões usam a
última parcela para absorver o arredondamento. Assim:
    categoria = soma dos lançamentos, centro = soma das categorias,
    total = soma dos centros — sem nenhuma diferença de centavos.

Agosto/2026 é calibrado para reproduzir exatamente os totais da CMP real
(R$ 63.228,63 orçado / R$ 61.121,93 realizado).

Uso
---
    python tools/gerar_dados.py      # reescreve assets/data.js

Dependências: apenas a biblioteca padrão. A semente fixa garante saída determinística.
"""

import json
import random
from pathlib import Path

# Semente fixa: o dataset precisa ser reproduzível entre execuções.
rng = random.Random(20260801)

ANO = 2026
MESES = list(range(1, 10))  # janeiro a setembro de 2026 (Q1, Q2 e Q3 fechados)
DIAS_NO_MES = {1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30}


def c(valor):
    """Converte reais (float) para centavos inteiros, evitando erro de ponto flutuante."""
    return int(round(valor * 100))


# ---------------------------------------------------------------------------
# Centros de Custo (ordem institucional)
# ---------------------------------------------------------------------------
CENTROS = [
    {"id": "vendas", "name": "Vendas", "owner": "Diretoria de Mercado"},
    {"id": "institucional", "name": "Institucional", "owner": "Presidência"},
    {"id": "cultural", "name": "Cultural", "owner": "Diretoria de Pessoas"},
    {"id": "operacao", "name": "Operação", "owner": "Diretoria de Operações"},
    {"id": "inovacao", "name": "Inovação", "owner": "Núcleo de Inovação"},
    {"id": "projetos", "name": "Projetos", "owner": "Diretoria de Projetos"},
]

# ---------------------------------------------------------------------------
# Categorias
#   base  — orçamento mensal de referência (R$); 0 = categoria nunca orçada
#   itens — (descrição, participação no orçamento da categoria)
#   txs   — descrições possíveis para lançamentos
#   modo  — 'single' (assinatura: 1 lançamento por item), 'few' (1–3), 'many' (vários pequenos)
#   custeio, importancia, obrigatoriedade — campos secundários do POT
# ---------------------------------------------------------------------------
CATEGORIAS = {
    "vendas": [
        ("v-trafego", "Tráfego pago", 4800, [("Google Ads — campanhas institucionais", .6), ("Meta Ads — captação de leads", .4)],
         ["Recarga Google Ads", "Recarga Meta Ads", "Impulsionamento LinkedIn"], "few", "Variável", "Alta", "Planejável"),
        ("v-eventos", "Eventos comerciais", 700, [("Participação em feiras e eventos", 1)],
         ["Inscrição em evento empresarial", "Material para estande", "Coffee break — evento"], "few", "Variável", "Média", "Planejável"),
        ("v-mentoria", "Mentoria de vendas", 930, [("Mentor de Vendas — mensalidade", 1)],
         ["Mentor de Vendas — mensalidade"], "single", "Fixo", "Alta", "Obrigatório"),
        ("v-reunioes", "Reuniões comerciais", 450, [("Reuniões presenciais com clientes", 1)],
         ["Almoço com cliente", "Uber — reunião comercial", "Café com prospect"], "few", "Variável", "Média", "Planejável"),
        ("v-prospeccao", "Prospecção", 1200, [("Prospecção ativa — listas e ferramentas", .5), ("Visitas de prospecção", .5)],
         ["Créditos de prospecção (Apollo)", "Deslocamento — visita a prospect", "Lista segmentada de leads"], "few", "Variável", "Alta", "Planejável"),
        ("v-marketing", "Ações de marketing", 150, [("Brindes e materiais", 1)],
         ["Brindes comerciais", "Impressão de material"], "few", "Variável", "Baixa", "Planejável"),
        ("v-ferramentas", "Ferramentas comerciais", 600, [("CRM — licenças adicionais", 1)],
         ["Licença CRM"], "single", "Fixo", "Média", "Planejável"),
        ("v-foto", "Foto institucional", 0, [], ["Ensaio fotográfico institucional"], "single", "Variável", "Baixa", "Não orçado"),
    ],
    "institucional": [
        ("i-enej", "ENEJ", 0, [], [], "few", "Fixo", "Alta", "Planejável"),  # tratado de forma explícita abaixo
        ("i-reunioes", "Reuniões institucionais", 450, [("Reuniões com federação e parceiros", 1)],
         ["Almoço institucional", "Uber — reunião institucional", "Coffee break — reunião"], "few", "Variável", "Média", "Planejável"),
        ("i-eventos", "Eventos institucionais", 1000, [("Feira de Carreiras e eventos da UFBA", 1)],
         ["Gravação Fecs Week", "Estrutura — evento institucional", "Material gráfico — evento"], "few", "Variável", "Média", "Planejável"),
        ("i-treinamento", "Treinamentos", 500, [("Capacitações da diretoria", 1)],
         ["Curso de capacitação", "Material de treinamento"], "few", "Variável", "Média", "Planejável"),
        ("i-federacao", "Federação e associações", 800, [("Contribuição Rede Bahia Júnior", 1)],
         ["Contribuição Rede Bahia Júnior"], "single", "Fixo", "Alta", "Obrigatório"),
        ("i-representacao", "Representação institucional", 360, [("Ações de representação", 1)],
         ["Aniversário da empresa — decoração", "Placa comemorativa", "Brindes institucionais"], "few", "Variável", "Baixa", "Planejável"),
    ],
    "cultural": [
        ("c-pct", "Processo seletivo (PCT)", 900, [("Programa de Captação de Trainees", 1)],
         ["Impressões — captação", "Tráfego pago PCT", "Coffee break — dinâmica", "Material — processo seletivo"], "few", "Variável", "Alta", "Planejável"),
        ("c-cultura", "Ações da cultura", 800, [("Ações de engajamento", 1)],
         ["Lanche — reunião geral", "Kit boas-vindas", "Dinâmica de integração", "Decoração — ação interna"], "many", "Variável", "Média", "Planejável"),
        ("c-confra", "Confraternizações", 600, [("Confraternização mensal", 1)],
         ["Confraternização — espaço", "Confraternização — comidas", "Confraternização — bebidas"], "few", "Variável", "Média", "Planejável"),
        ("c-comite", "Ações do comitê", 100, [("Comitê de diversidade", 1)],
         ["Material — comitê"], "few", "Variável", "Baixa", "Planejável"),
        ("c-reconhecimentos", "Reconhecimentos", 200, [("Reconhecimento de membros", 1)],
         ["Premiação — membro destaque"], "single", "Variável", "Baixa", "Planejável"),
    ],
    "operacao": [
        ("o-softwares", "Licenças e softwares", 5600,
         [("Space Data", .32), ("RD Station", .24), ("ImpulseUP", .14), ("Conta Azul", .1), ("Clicksign", .08), ("VExpenses", .07), ("Google Workspace", .05)],
         [], "single", "Fixo", "Alta", "Obrigatório"),
        ("o-beneficios", "Carteira de benefícios", 3500, [("Carteira de Benefícios", 1)],
         ["Carteira de Benefícios — repasse"], "few", "Fixo", "Alta", "Obrigatório"),
        ("o-totalpass", "TotalPass", 1200, [("TotalPass — plano empresa", 1)],
         ["TotalPass — mensalidade"], "single", "Fixo", "Média", "Obrigatório"),
        ("o-contabilidade", "Contabilidade", 3388, [("Escritório de contabilidade", 1)],
         ["Honorários contábeis"], "single", "Fixo", "Alta", "Obrigatório"),
        ("o-juridico", "Assessoria jurídica (EJUDI)", 1083.33, [("EJUDI — assessoria", 1)],
         ["EJUDI — mensalidade"], "single", "Fixo", "Alta", "Obrigatório"),
        ("o-sede", "Melhorias na sede", 250, [("Manutenção e melhorias", 1)],
         ["Material de limpeza", "Reparo elétrico", "Organizadores"], "few", "Variável", "Baixa", "Planejável"),
        ("o-cartorio", "Cartório", 70, [("Reconhecimento de firmas", 1)],
         ["Cartório — reconhecimento de firma"], "single", "Variável", "Média", "Obrigatório"),
        ("o-alimentacao", "Alimentação — sede", 285.21, [("Copa da sede", 1)],
         ["Café e lanches — sede", "Água mineral"], "few", "Variável", "Baixa", "Planejável"),
    ],
    "inovacao": [
        ("n-atena", "Gastos com Atena", 1000, [("Edição Atena 2.0 — gravações", .7), ("Gastos Atena — operação", .3)],
         ["Gravação de aula — estúdio", "Edição de vídeo", "Alimentação convidado — gravação", "Uber convidado — gravação"], "few", "Variável", "Alta", "Planejável"),
        ("n-n8n", "N8N", 230, [("N8N — automações", 1)], ["N8N — assinatura"], "single", "Fixo", "Média", "Planejável"),
        ("n-cloudflare", "Cloudflare", 78.34, [("Cloudflare — domínios e proxy", 1)], ["Cloudflare — assinatura"], "single", "Fixo", "Média", "Obrigatório"),
        ("n-odin", "Odin", 250, [("Odin — licença", 1)], ["Odin — licença"], "single", "Fixo", "Média", "Planejável"),
        ("n-acoes", "Ações de inovação", 575, [("Inovaday", 1)],
         ["Inovaday — coffee break", "Inovaday — materiais", "Hackathon interno — lanche"], "few", "Variável", "Média", "Planejável"),
        ("n-experimentos", "Experimentos e validações", 150, [("Validação de novos produtos", 1)], [], "few", "Variável", "Baixa", "Planejável"),
    ],
    "projetos": [
        ("p-alimdesl", "Alimentação e deslocamento", 3175, [("Deslocamento de consultores", .6), ("Alimentação em campo", .4)],
         [], "many", "Variável", "Alta", "Planejável"),
        ("p-trafego", "Tráfego pago — projetos", 5200, [("Campanhas de clientes", 1)],
         ["Meta Ads — cliente", "Google Ads — cliente"], "few", "Variável", "Alta", "Planejável"),
        ("p-questionarios", "Aplicação de questionários", 1200, [("Pesquisa de campo", 1)],
         ["Aplicadores — pesquisa de campo", "Impressão de questionários", "Plataforma de formulários"], "few", "Variável", "Média", "Planejável"),
        ("p-terceirizacoes", "Terceirizações", 820, [("Serviços terceirizados", 1)],
         ["Designer freelancer", "Revisão técnica externa"], "few", "Variável", "Média", "Planejável"),
        ("p-cx", "Ação CX", 200, [("Ações de experiência do cliente", 1)],
         ["Kit cliente", "Cartão de agradecimento"], "few", "Variável", "Baixa", "Planejável"),
        ("p-reconhecimentos", "Reconhecimentos", 200, [("Reconhecimento de consultores", 1)],
         ["Premiação — projeto destaque"], "single", "Variável", "Baixa", "Planejável"),
        ("p-devolucoes", "Devoluções", 0, [], ["Devolução a cliente — rescisão de projeto"], "single", "Variável", "Média", "Não orçado"),
    ],
}

PROJETOS_CLIENTES = ["Vialise", "Monte Tabor", "Prisma", "FJS", "Jonuc", "Merenda", "Valadares", "Lacerda"]
FONTES = {"Fixo": ["Conta Azul", "Débito automático", "PIX"], "Variável": ["VExpenses", "Cartão corporativo", "PIX"]}

# Razão realizado/orçado alvo por centro e mês (fora de agosto, que é explícito).
# Calibrada para produzir no Q3: Institucional > 100%, Operação e Projetos entre
# 80–100%, Inovação < 50% — requisitos de demonstração dos estados da interface.
RAZAO = {
    "vendas":        {7: .86, 9: .80},
    "institucional": {7: .90, 9: .62},
    "cultural":      {7: .74, 9: .66},
    "operacao":      {7: .90, 9: .85},
    "inovacao":      {7: .44, 9: .28},
    "projetos":      {7: .93, 9: .92},
}
# Q1/Q2: razões variando entre 0,72 e 1,12 (sem cenário obrigatório)
for cid in RAZAO:
    for m in range(1, 7):
        RAZAO[cid][m] = round(rng.uniform(.72, 1.12), 3)

# Sazonalidade do orçamento por categoria (multiplicadores sobre ``base``)
SAZONAL = {
    ("c-pct", 3): 3.2, ("c-pct", 9): 3.4, ("c-confra", 7): 8.0, ("c-confra", 12): 4,
    ("v-trafego", 8): 1.107, ("n-acoes", 9): 1.4, ("i-eventos", 5): 1.6,
    ("p-alimdesl", 7): .8, ("p-trafego", 7): .55,
}

# ---------------------------------------------------------------------------
# Agosto/2026 — calibrado com a CMP real: (orçado, realizado) por categoria em R$.
# ---------------------------------------------------------------------------
AGOSTO = {
    "v-trafego": (5314, 3871.18), "v-eventos": (700, 215.52), "v-mentoria": (930, 949.80),
    "v-reunioes": (450, 0), "v-prospeccao": (1236, 915.29), "v-marketing": (150, 43.90),
    "v-ferramentas": (600, 0), "v-foto": (0, 682.50),
    "i-enej": (19500, 25669.10), "i-reunioes": (535, 672.48), "i-eventos": (1200, 1250),
    "i-treinamento": (500, 41.16), "i-federacao": (800, 800), "i-representacao": (363.75, 730.45),
    "c-pct": (900, 571.80), "c-cultura": (800, 612.47), "c-confra": (495, 185.09),
    "c-comite": (100, 0), "c-reconhecimentos": (200, 100),
    "o-softwares": (5600, 4908.42), "o-beneficios": (3500, 4216.51), "o-totalpass": (1200, 1200),
    "o-contabilidade": (3388, 2420), "o-juridico": (1083.33, 0), "o-sede": (250, 196),
    "o-cartorio": (70, 0), "o-alimentacao": (285.21, 217.36),
    "n-atena": (1000, 66.82), "n-n8n": (230, 108.99), "n-cloudflare": (78.34, 82.30),
    "n-odin": (250, 292.86), "n-acoes": (575, 325.39), "n-experimentos": (150, 0),
    "p-alimdesl": (3175, 6523.39), "p-trafego": (5200, 1218.03), "p-questionarios": (1200, 812),
    "p-terceirizacoes": (820, 520), "p-cx": (200, 108.18), "p-reconhecimentos": (200, 200),
    "p-devolucoes": (0, 394.94),
}

# Itens e lançamentos explícitos (casos citados na CMP / no briefing).
# Formato: cat -> {mes: {"itens": [(descricao, orcado)], "txs": [(dia, descricao, valor, indice_item|None)]}}
EXPLICITOS = {
    "n-atena": {8: {"itens": [("Edição Atena 2.0 — gravações 1/3", 700), ("Gastos Atena — operação", 300)],
                    "txs": [(15, "Alimentação convidado — gravação", 32.40, 1), (15, "Uber convidado — gravação", 34.42, 1)]}},
    "i-enej": {
        3: {"itens": [("ENEJ — Hospedagem 1/4", 5617.60), ("ENEJ — Agência de viagem 1/4", 1459.35)],
            "txs": [(10, "ENEJ — Hospedagem 1/4", 5617.60, 0), (10, "ENEJ — Agência de viagem 1/4", 1459.35, 1)]},
        4: {"itens": [("ENEJ — Hospedagem 2/4", 5617.60), ("ENEJ — Agência de viagem 2/4", 1459.35)],
            "txs": [(10, "ENEJ — Hospedagem 2/4", 5617.60, 0), (10, "ENEJ — Agência de viagem 2/4", 1459.35, 1)]},
        5: {"itens": [("ENEJ — Hospedagem 3/4", 5617.60), ("ENEJ — Agência de viagem 3/4", 1459.35)],
            "txs": [(10, "ENEJ — Hospedagem 3/4", 5617.60, 0), (10, "ENEJ — Agência de viagem 3/4", 1459.35, 1)]},
        6: {"itens": [("ENEJ — Agência de viagem 4/4", 1459.35), ("ENEJ — Hospedagem 4/4", 5617.60)],
            "txs": [(10, "ENEJ — Agência de viagem 4/4", 1459.35, 0), (10, "ENEJ — Hospedagem 4/4", 5617.50, 1)]},
        7: {"itens": [("ENEJ — Ingressos", 7848.45), ("Auxílio ENEJ 1/3", 3000), ("Pulseiras e identificação ENEJ", 400)],
            "txs": [(4, "ENEJ — Ingressos (lote principal)", 7848.45, 0), (18, "Auxílio ENEJ 1/3 — membros", 5423.35, 1)]},
        8: {"itens": [("ENEJ — Transporte", 6000), ("Kit ENEJ", 8500), ("Auxílio ENEJ 2/3", 3000), ("Orçamento ENEJ — geral", 2000)],
            "txs": [(3, "Kit ENEJ — camisas e acessórios", 5899.81, 1), (6, "Case ENEJ — impressão", 62.80, 3),
                    (8, "Auxílio ENEJ 2/3 — membros", 4723.86, 2), (12, "ENEJ — Ônibus Salvador → Belo Horizonte", 8960.00, 0),
                    (16, "ENEJ — Despesas gerais em BH", 6022.63, 3)]},
        9: {"itens": [("Auxílio ENEJ 3/3", 3000), ("Correria Barril", 200)],
            "txs": [(9, "Auxílio ENEJ 3/3 — membros", 2140.00, 0)]},
    },
    "o-beneficios": {8: {"itens": [("Carteira de Benefícios", 3500)],
                         "txs": [(5, "Carteira de Benefícios — repasse agosto", 3500.00, 0),
                                 (22, "Carteira de Benefícios — complemento emergencial", 716.51, 0)]}},
    "c-pct": {8: {"itens": [("Programa de Captação de Trainees", 900)],
                  "txs": [(14, "Impressões — captação", 471.80, 0), (20, "Tráfego pago PCT", 100.00, 0)]}},
    "v-eventos": {8: {"itens": [("Participação em feiras e eventos", 700)],
                      "txs": [(21, "Inscrição — Feira de Negócios Salvador", 215.52, 0)]}},
    "v-foto": {7: {"itens": [], "txs": [(9, "Fotos institucionais 1/2", 682.50, None)]},
               8: {"itens": [], "txs": [(7, "Fotos institucionais 2/2", 682.50, None)]}},
    "p-devolucoes": {7: {"itens": [], "txs": [(11, "Devolução — rescisão Projeto Prisma", 1353.89, None)]},
                     8: {"itens": [], "txs": [(19, "Devolução parcial — Projeto Jonuc", 394.94, None)]}},
}

# Entradas mensais (R$) — agosto reproduz a CMP real.
ENTRADAS = {1: 52310.20, 2: 41208.55, 3: 63480.90, 4: 58920.10, 5: 66105.40,
            6: 49870.35, 7: 48210.40, 8: 57297.63, 9: 71840.15}


def dividir(total_cent, pesos):
    """
    Divide ``total_cent`` em partes inteiras proporcionais a ``pesos``.

    A última parte absorve o resto do arredondamento, garantindo que a soma
    das partes seja exatamente igual ao total.

    Exemplo: dividir(1000, [1, 1, 1]) -> [333, 333, 334]
    """
    if not pesos:
        return []
    soma = sum(pesos)
    partes = [int(total_cent * p / soma) for p in pesos[:-1]]
    partes.append(total_cent - sum(partes))
    return partes


def descricao_tx(cat_id, modelos):
    """Escolhe uma descrição plausível de lançamento para a categoria."""
    if cat_id == "p-alimdesl":
        proj = rng.choice(PROJETOS_CLIENTES)
        return rng.choice([f"Uber — Projeto {proj}", f"Almoço em campo — Projeto {proj}",
                           f"99 Táxi — Projeto {proj}", f"Lanche consultores — Projeto {proj}",
                           f"Combustível — Projeto {proj}"])
    return rng.choice(modelos) if modelos else "Lançamento"


# ---------------------------------------------------------------------------
# Geração
# ---------------------------------------------------------------------------
centers, categories, items, transactions = [], [], [], []
cat_info = {}
for ordem, ce in enumerate(CENTROS):
    centers.append({**ce, "order": ordem})
    for (cid, nome, base, itens, txs, modo, custeio, imp, obr) in CATEGORIAS[ce["id"]]:
        categories.append({"id": cid, "centerId": ce["id"], "name": nome})
        cat_info[cid] = dict(center=ce["id"], base=base, itens=itens, txs=txs, modo=modo,
                             custeio=custeio, imp=imp, obr=obr, nome=nome)

seq = {"item": 0, "tx": 0}


def novo_item(mes, cat_id, desc, planned_cent):
    """Cria um item planejado do POT e devolve seu id."""
    info = cat_info[cat_id]
    seq["item"] += 1
    iid = f"IT-{ANO}{mes:02d}-{seq['item']:04d}"
    items.append({
        "id": iid, "month": f"{ANO}-{mes:02d}", "date": f"{ANO}-{mes:02d}-01",
        "description": desc, "categoryId": cat_id, "planned": planned_cent / 100,
        "custeio": info["custeio"], "importance": info["imp"], "obligation": info["obr"],
        "cashLevel": rng.choice(["Alto", "Alto", "Médio", "Baixo"]),
    })
    return iid


def novo_tx(mes, dia, cat_id, item_id, desc, amount_cent):
    """Cria um lançamento realizado. Setembro tem parte dos lançamentos ainda pendente de conciliação."""
    info = cat_info[cat_id]
    seq["tx"] += 1
    status = "Pago"
    if mes == 9 and dia >= 22 and rng.random() < .45:
        status = "Pendente"
    elif rng.random() < .04:
        status = "Em conciliação"
    nota = ""
    if item_id is None:
        nota = "Gasto sem item correspondente no POT do período."
    elif cat_id == "p-alimdesl" and mes == 8 and rng.random() < .3:
        nota = "Despesa de julho lançada em agosto após entrada dos consultores no VExpenses."
    transactions.append({
        "id": f"LC-{ANO}{mes:02d}-{seq['tx']:04d}", "date": f"{ANO}-{mes:02d}-{dia:02d}",
        "description": desc, "categoryId": cat_id, "itemId": item_id, "amount": amount_cent / 100,
        "type": info["custeio"], "status": status, "note": nota,
        "source": rng.choice(FONTES[info["custeio"]]),
        "responsible": next(x["owner"] for x in CENTROS if x["id"] == info["center"]),
    })


def gerar_categoria_mes(mes, cat_id, planned_cent, realized_cent):
    """Gera itens e lançamentos de uma categoria em um mês respeitando os totais exatos."""
    info = cat_info[cat_id]
    exp = EXPLICITOS.get(cat_id, {}).get(mes)
    if exp:
        ids = [novo_item(mes, cat_id, d, c(v)) for d, v in exp["itens"]]
        for dia, d, v, idx in exp["txs"]:
            novo_tx(mes, dia, cat_id, ids[idx] if idx is not None else None, d, c(v))
        return
    if not info["itens"]:
        return  # categoria não orçada sem lançamento explícito no mês
    pesos_plan = [p for _, p in info["itens"]]
    planos = dividir(planned_cent, pesos_plan)
    ids = [novo_item(mes, cat_id, d, p) for (d, _), p in zip(info["itens"], planos)]
    if realized_cent <= 0:
        return
    # Distribui o realizado entre os itens com ruído (itens nunca ficam idênticos ao plano)
    pesos_real = [p * rng.uniform(.75, 1.25) for p in pesos_plan]
    reais = dividir(realized_cent, pesos_real)
    for iid, (desc_item, _), r in zip(ids, info["itens"], reais):
        if r <= 0:
            continue
        if info["modo"] == "single":
            n = 1
        elif info["modo"] == "many":
            n = max(3, min(16, r // 32000 + rng.randint(3, 8)))
        else:
            n = rng.randint(1, 3)
        partes = dividir(r, [rng.uniform(.4, 1.6) for _ in range(n)])
        dias = sorted(rng.randint(2, DIAS_NO_MES[mes] - 1) for _ in range(n))
        for dia, parte in zip(dias, partes):
            desc = desc_item if info["modo"] == "single" or not info["txs"] and cat_id != "p-alimdesl" else descricao_tx(cat_id, info["txs"])
            novo_tx(mes, dia, cat_id, iid, desc, parte)


for mes in MESES:
    for ce in CENTROS:
        cats = [x[0] for x in CATEGORIAS[ce["id"]]]
        if mes == 8:
            for cid in cats:
                p, r = AGOSTO[cid]
                gerar_categoria_mes(mes, cid, c(p), c(r))
            continue
        # ---- meses gerados: orçamento por categoria e realizado calibrado pela razão do centro
        planos, fixos_real, flex = {}, {}, {}
        for cid in cats:
            info = cat_info[cid]
            exp = EXPLICITOS.get(cid, {}).get(mes)
            if exp:
                planos[cid] = sum(c(v) for _, v in exp["itens"])
                fixos_real[cid] = sum(c(v) for _, _, v, _ in exp["txs"])
                continue
            if info["base"] == 0:
                planos[cid] = 0
                fixos_real[cid] = 0
                continue
            p = c(info["base"] * SAZONAL.get((cid, mes), 1) * (1 if info["modo"] == "single" else rng.uniform(.85, 1.15)))
            planos[cid] = p
            if cid == "o-totalpass":
                fixos_real[cid] = p  # TotalPass: sempre 100% (caso "orçamento totalmente utilizado")
            elif cid == "n-experimentos":
                fixos_real[cid] = 0  # sem movimentação em todo o ano (caso de demonstração)
            elif info["modo"] == "single" and cid not in ("v-ferramentas", "o-juridico"):
                fixos_real[cid] = p if rng.random() < .85 else 0
            else:
                flex[cid] = p * rng.uniform(.55, 1.3)
        alvo = int(sum(planos.values()) * RAZAO[ce["id"]][mes])
        resto = max(0, alvo - sum(fixos_real.values()))
        soma_flex = sum(flex.values()) or 1
        partes = dividir(resto, list(flex.values())) if flex else []
        for cid, parte in zip(flex.keys(), partes):
            fixos_real[cid] = parte
        _ = soma_flex
        for cid in cats:
            gerar_categoria_mes(mes, cid, planos[cid], fixos_real.get(cid, 0))

transactions.sort(key=lambda t: (t["date"], t["id"]))

# ---------------------------------------------------------------------------
# Análises mensais salvas (agosto) — resumo das análises da CMP real.
# As demais combinações mês × centro ficam sem análise: a interface oferece
# um rascunho automático derivado dos dados.
# ---------------------------------------------------------------------------
analyses = [
    {"month": "2026-08", "centerId": "projetos", "source": "manual", "author": "Gerência Financeira", "updatedAt": "2026-09-08",
     "text": "Projetos ficou próximo ao previsto no POT. O ponto de atenção foi Alimentação e deslocamento: parte das despesas de julho só foi contabilizada em agosto, após a entrada dos consultores no VExpenses. Os quatro projetos mais custosos concentraram a maior parte desses gastos; foi definido um fluxo de mapeamento prévio de deslocamento por projeto."},
    {"month": "2026-08", "centerId": "vendas", "source": "manual", "author": "Gerência Financeira", "updatedAt": "2026-09-08",
     "text": "Mês forte em vendas e com boa gestão do orçamento. Gastos previstos como reuniões comerciais e parte do tráfego pago não foram necessários, e eventos ficaram bem abaixo do planejado. A foto institucional entrou como gasto não orçado."},
    {"month": "2026-08", "centerId": "institucional", "source": "manual", "author": "Gerência Financeira", "updatedAt": "2026-09-08",
     "text": "Institucional ultrapassou o orçamento por conta do ENEJ. O transporte para Belo Horizonte custou mais do que o previsto e o auxílio aos membros foi ampliado para melhorar a experiência no evento."},
    {"month": "2026-08", "centerId": "cultural", "source": "manual", "author": "Gerência Financeira", "updatedAt": "2026-09-08",
     "text": "Gastos abaixo do esperado, concentrados na manutenção da área e no início do PCT. Operações e Pessoas optaram por concentrar o investimento do processo seletivo em setembro."},
    {"month": "2026-08", "centerId": "inovacao", "source": "manual", "author": "Gerência Financeira", "updatedAt": "2026-09-08",
     "text": "Inovação reduziu a principal despesa (Atena): houve apenas uma gravação, e os custos se limitaram a deslocamento e alimentação do convidado. A área mudou a estratégia para economizar nas gravações nos últimos meses."},
    {"month": "2026-08", "centerId": "operacao", "source": "manual", "author": "Gerência Financeira", "updatedAt": "2026-09-08",
     "text": "Operação ficou abaixo do orçamento porque algumas despesas previstas não ocorreram no mês. A Carteira de Benefícios ultrapassou o planejado com um complemento emergencial, considerado essencial."},
]

data = {
    "meta": {"company": "Empresa JR ADM UFBA", "year": ANO, "generatedBy": "tools/gerar_dados.py",
             "currentQuarter": 3, "lastClosedMonth": "2026-09"},
    "centers": centers,
    "categories": categories,
    "items": items,
    "transactions": transactions,
    "incomes": [{"month": f"{ANO}-{m:02d}", "amount": v} for m, v in ENTRADAS.items()],
    "analyses": analyses,
}

saida = Path(__file__).resolve().parent.parent / "assets" / "data.js"
saida.parent.mkdir(parents=True, exist_ok=True)
cabecalho = (
    "/**\n"
    " * Dataset fictício do protótipo POT + CMP — FONTE ÚNICA DE DADOS.\n"
    " * Gerado por tools/gerar_dados.py (não editar manualmente; rode o script novamente).\n"
    " * Valores em reais; a consistência exata entre níveis é garantida na geração (centavos inteiros).\n"
    " */\n"
)
saida.write_text(cabecalho + "window.POT_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")

# ---------------------------------------------------------------------------
# Relatório de verificação
# ---------------------------------------------------------------------------
def tot(meses, centro=None):
    cats = {x["id"] for x in categories if centro is None or x["centerId"] == centro}
    ms = {f"{ANO}-{m:02d}" for m in meses}
    p = sum(c(i["planned"]) for i in items if i["month"] in ms and i["categoryId"] in cats)
    r = sum(c(t["amount"]) for t in transactions if t["date"][:7] in ms and t["categoryId"] in cats)
    return p / 100, r / 100


if __name__ == "__main__":
    for rot, ms in (("Ago", [8]), ("Q3", [7, 8, 9]), ("Q2", [4, 5, 6])):
        p, r = tot(ms)
        print(f"{rot} TOTAL  orçado {p:>11,.2f}  realizado {r:>11,.2f}  {r / p * 100:6.2f}%")
        for ce in CENTROS:
            p, r = tot(ms, ce["id"])
            print(f"   {ce['name']:<14} {p:>11,.2f} {r:>11,.2f}  {r / p * 100:6.2f}%")
    print(len(items), "itens,", len(transactions), "lançamentos ->", saida)
