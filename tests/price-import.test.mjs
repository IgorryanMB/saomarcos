import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('dist/app.bundle.js', 'utf8');
const sandbox = {console, window:{}};
const testBundle = source.replace(
  /\bvoid boot\(\);\s*\}\)\(\);\s*$/,
  "globalThis.__testTools={ parseBrazilianPrice, priceDelta, buildPriceCandidates, " +
  "extractErpRowsFromPage, detectPriceColumns, parseErpReportDate, isAdmin, setProducts(p){ products=p; }, setSession(p){ session=p; } };\n})();\n"
);
assert.notEqual(testBundle, source, 'O bundle deve expor os helpers de testes');
vm.runInNewContext(testBundle, sandbox, {timeout:1000});
const api = sandbox.__testTools;

test('interpreta corretamente números do ERP e recusa valores inválidos', () => {
  assert.equal(api.parseBrazilianPrice('1.234,56'), 1234.56);
  assert.equal(api.parseBrazilianPrice('38,20'), 38.2);
  assert.equal(api.parseBrazilianPrice('123.45'), null);
  assert.equal(api.parseBrazilianPrice('invalido'), null);
});

test('calcula aumento e redução de custos e preços', () => {
  assert.match(api.priceDelta(20,25), /\+25,0%/);
  assert.match(api.priceDelta(50,40), /-20,0%/);
  assert.equal(api.priceDelta(20,20), 'Sem alteração');
});


test('leitor identifica custo e venda pelos nomes do cabeçalho, inclusive REL026', () => {
  const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
  const rows=api.extractErpRowsFromPage([
    item('Código',17,470),item('Descrição',106,470),
    item('Markup',531,470),item('Custo',596,470),
    item('Total Custo',643,470),item('Venda',728,470),item('Total Venda',782,470),
    item('42588',15.6,450),item('1234567890123',46.7,450),
    item('ATRON 20W50 1L',104,450),item('14,000',483.5,450),
    item('96,309',535.2,450),item('18,333',592.7,450),
    item('256,67',661.6,450),item('35,990',727.2,450),
    item('503,86',801.2,450)
  ],841.92,595.32,1);
  assert.equal(rows.columnsFound,true);
  assert.equal(rows.rows.length,1);
  assert.equal(rows.rows[0].code,'42588');
  assert.equal(rows.rows[0].cost,18.333);
  assert.equal(rows.rows[0].sale,35.99);
});

test('leitor reconhece REL011 sem consultar o número do relatório', () => {
  const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
  const rows=api.extractErpRowsFromPage([
    item('Código',16,718),item('Descrição',106,718),
    item('A vista',501,718),item('Markup',527,718),
    item('Custo Und',558,718),
    item('42580',15.6,699),item('75W140 RAID GL5',106,699),
    item('11,00',466.5,699),item('155,99',497.6,699),
    item('81,91',526,699),item('85,75',555.5,699)
  ],609.48,841.92,1);
  assert.equal(rows.columnsFound,true);
  assert.equal(rows.rows.length,1);
  assert.equal(rows.rows[0].code,'42580');
  assert.equal(rows.rows[0].cost,85.75);
  assert.equal(rows.rows[0].sale,155.99);
});

test('rejeita formato desconhecido sem colunas de custo e venda', () => {
  const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
  const rows=api.extractErpRowsFromPage([
    item('Código',16,710),item('Estoque Total',180,710),
    item('42580',16,694),item('14,000',180,694)
  ],609.48,841.92,1);
  assert.equal(rows.columnsFound,false);
  assert.equal(rows.rows.length,0);
});

test('extrai data do relatório e rejeita datas inválidas',()=>{
  assert.equal(api.parseErpReportDate('Data/Hora: 20/10/2026 11:43:13'),'2026-10-20T14:43:13.000Z');
  assert.equal(api.parseErpReportDate('Data/Hora: 31/02/2026 11:43:13'),null);
  assert.equal(api.parseErpReportDate('Relatorio sem data'),null);
});

test('preços de três casas decimais são preservados', () => {
  assert.equal(api.parseBrazilianPrice('37,537'),37.537);
  assert.match(api.priceDelta(37.54,37.537,3),/0,003/);
});

test('diferenças do PDF nunca mexem nas quantidades', () => {
  const product = {
    id:'teste-1',code:'ABC-01',erpCode:'42580',
    name:'Óleo de teste',stock:75,pista:12,cost:10,salePrice:20
  };
  api.setProducts([product]);
  const result = api.buildPriceCandidates([
    {code:'42580',cost:11,sale:22},
    {code:'999999',cost:15,sale:23}
  ]);
  assert.equal(result.changed.length,1);
  assert.equal(result.changed[0].product.id,'teste-1');
  assert.equal(result.totals.missing,1);
  assert.equal(product.stock,75);
  assert.equal(product.pista,12);
});

test('mesmo código duplicado no PDF é sinalizado', () => {
  api.setProducts([{
    id:'teste-1',code:'ABC',erpCode:'42580',name:'Teste',
    stock:2,pista:1,cost:12,salePrice:25
  }]);
  const result = api.buildPriceCandidates([
    {code:'42580',cost:13,sale:26},
    {code:'42580',cost:14,sale:27}
  ]);
  assert.equal(result.totals.ambiguous,1);
});

test('checagem de administrador rejeita usuário do caixa', () => {
  api.setSession({role:'sales'});
  assert.equal(api.isAdmin(),false);
  api.setSession({role:'admin'});
  assert.equal(api.isAdmin(),true);
});

test('migração exige administrador e atualiza somente preços', () => {
  const sql = fs.readFileSync('migrations/20261020_price_import.sql','utf8');
  assert.match(sql,/not private\.is_admin\(\)/);
  assert.match(sql,/new\.cost is distinct from old\.cost/);
  assert.match(sql,/new\.sale_price is distinct from old\.sale_price/);
  assert.match(sql,/update public\.products\s+set cost = v_cost,\s+sale_price = v_sale,/);
  assert.match(sql,/for update;/i);
  assert.match(sql,/expected_sale_price/);
});
