# Conexão de escrita: painel → planilha do POT

O painel lê as planilhas sozinho. Para **construir o POT pelo painel** (e salvar as análises da CMP na planilha), ele precisa deste Apps Script instalado na planilha do POT. A instalação é feita uma vez só e leva uns 5 minutos.

## 1. Colar o código

1. Abra a planilha do POT e vá em **Extensões → Apps Script**.
2. Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de [`Codigo.gs`](Codigo.gs).
3. Salve (ícone de disquete).

## 2. Criar a chave de acesso

1. No Apps Script, abra **Configurações do projeto** (ícone de engrenagem).
2. Em **Propriedades do script**, clique em **Adicionar propriedade do script**:
   - Propriedade: `PAINEL_TOKEN`
   - Valor: uma senha longa que só quem edita o POT vai saber (ex.: 4 palavras aleatórias)
3. Salve.

Sem essa chave, ninguém consegue gravar na planilha pelo painel, mesmo conhecendo a URL do script.

## 3. Implantar como App da Web

1. Clique em **Implantar → Nova implantação**.
2. Em "Selecionar tipo", escolha **App da Web**.
3. Configure:
   - **Executar como:** Eu (sua conta)
   - **Quem pode acessar:** Qualquer pessoa
4. Clique em **Implantar** e autorize o acesso à planilha quando o Google pedir.
5. Copie a **URL do app da Web** (termina em `/exec`).

## 4. Conectar no painel

1. No painel, vá em **Configurações → Conexão com as planilhas**.
2. Cole a URL do app da Web e a chave `PAINEL_TOKEN`.
3. Clique em **Testar conexão**.

A URL e a chave ficam salvas só no seu navegador. Cada pessoa que for editar o POT faz o passo 4 uma vez. Para deixar a URL fixa para todos (a chave continua individual), coloque-a em `appsScriptUrl` no arquivo `assets/js/config.js`.

## O que o script faz na planilha

| Ação no painel | Efeito na planilha |
|---|---|
| Enviar itens do construtor | Insere linhas na `[GERAL]`, logo após o último item do mesmo mês, copiando as fórmulas da linha vizinha |
| Categoria nova | Acrescenta a categoria na `[Lista de Categorias]` com o custeio escolhido |
| Editar item | Altera descrição, categoria, centro, valor, importância e obrigatoriedade da linha |
| Excluir item | Remove a linha, **somente se ainda não houver valor realizado** |
| Salvar análise da CMP | Grava na aba `[Painel - Análises]` (criada automaticamente) |

Antes de editar ou excluir, o script confere se a linha ainda tem a mesma data e descrição que o painel mostrou. Se a planilha tiver mudado, a operação é recusada.

## Atualizar o código depois

Se o `Codigo.gs` mudar: cole a nova versão e vá em **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar**. A URL continua a mesma.
