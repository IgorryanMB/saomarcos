# Organização do JavaScript e importação de preços

Esta alteração foi feita **fora da branch main**. Não publicar os arquivos sem antes aplicar e validar a migração do banco.

## Arquivos

- `app.js`: carregador sequencial, para garantir as dependências entre os arquivos.
- `scripts/core.js`: estado, utilitários e configuração inicial.
- `scripts/auth-data.js`: login, perfis, leitura de dados e navegação.
- `scripts/inventory.js`: dashboard e gerenciamento visual de produtos.
- `scripts/sales-ui.js`: interface de movimentações e vendas.
- `scripts/finance.js`: fechamento mensal.
- `scripts/exports.js`: exportação de planilhas.
- `scripts/mutations.js`: gravação de produtos, vendas e sincronização em tempo real.
- `scripts/price-tools.js`: leitura de PDF, prévia selecionável e histórico de preços.
- `scripts/events.js`: eventos e inicialização.

**Atenção:** os arquivos de `scripts/` são seções de código para manutenção, e não devem ser carregados individualmente no HTML. O navegador carrega **somente** `dist/app.bundle.js`, que contém os módulos no mesmo escopo do aplicativo original. A ordem dos módulos é obrigatória. Uma migração futura para ES Modules com imports explícitos exigirá uma refatoração adicional.

Após editar qualquer módulo, execute `node tools/build.mjs` para regenerar o bundle. `node tools/build.mjs --check` verifica se o bundle está sincronizado; o workflow do GitHub faz essa verificação a cada PR.

## Importação de PDF

- Formato compatível: relatório ERP **REL011** "SAO MARCOS AUTO POST" como os dois arquivos fornecidos originalmente.
- Campos capturados por posição da coluna no PDF: código ERP, `A vista` (venda) e `Custo`.
- Não importa nem modifica quantidades de depósito ou pista.
- Exibe apenas produtos alterados na tabela de prévia, e conta os não encontrados, iguais, repetidos ou inválidos.
- Admin pode selecionar todos ou itens individuais.
- Confirmação salva custo e venda na mesma transação de banco.
- Se o preço foi alterado enquanto alguém revisava o PDF, a transação aborta inteira para evitar sobrescrita.
- Preço de venda abaixo do custo exige confirmação adicional.
- As datas e o responsável são registrados na tabela `price_history`.

## Etapas necessárias antes do lançamento

1. Executar a migração `migrations/20261020_price_import.sql` no banco em uma janela segura. A migração adiciona metadados ao histórico e a função RPC `apply_price_import`.
2. Conferir as permissões usando perfis admin e caixa (caixa não deve conseguir executar a atualização nem ver o histórico).
3. Os PDFs reais foram examinados: 82 e 443 linhas com colunas numéricas válidas. Testar novamente no navegador conectado ao ambiente de homologação, sem gravar alterações reais.
4. Testar uma atualização em ambiente separado ou produto de teste, inclusive tentativa simultânea de alteração.
5. Só depois publicar a interface, com revisão final.

Não foi aplicada qualquer modificação ao banco de produção nesta branch.
