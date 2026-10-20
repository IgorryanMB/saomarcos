# Organização do JavaScript e importação de preços

**Implantado no repositório oficial em 20/10/2026.** A migração foi aplicada no Supabase e o site passou a referenciar `dist/app.bundle.js`. Em cada atualização posterior, manter o bundle sincronizado e revisar as permissões.

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

## Registro da implantação e validação

1. Snapshot de preços: `private.sao_marcos_price_backup_20261020` (529 produtos ativos).
2. Snapshot do histórico: `private.sao_marcos_history_backup_20261020` (540 eventos).
3. Migração `admin_pdf_price_import_and_history_20261020` aplicada no Supabase.
4. Alterações confirmadas no banco: colunas `source` e `import_batch_id` e RPC `apply_price_import`.
5. Verificação após a migração: 529 produtos ativos, 540 eventos de histórico, 363 movimentações, sem mudança de contagens.
6. Repositório oficial atualizado via merge da PR #1 (`bd5ae18af641c8be7003eec621c3647c83631cfd`).
7. Checagem de sintaxe, consistência do bundle e testes automáticos do GitHub: aprovados.
8. **Pendente:** conferência manual no navegador publicado com login de admin e caixa e importação real controlada. Não houve escrita de preços reais por teste.

### Recuperação

O estado do código anterior à implantação está no histórico Git, e os snapshots de preços e histórico estão no esquema `private` do banco. Se for necessário reverter, **nunca sobrescreva estoque/pista ou movimentos com um snapshot antigo**, pois a equipe pode ter efetuado vendas depois do backup; restaurar apenas o conteúdo necessário e validar o histórico.
