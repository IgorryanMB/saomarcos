  'use strict';

  let priceCandidates = [];
  let priceHistoryRows = [];
  let priceHistoryProductId = null;
  let priceHistoryPeople = new Map();

  function priceDelta(oldValue, nextValue, digits = 2) {
    if (oldValue === null || oldValue === undefined || !Number.isFinite(Number(oldValue))) {
      return 'Novo valor';
    }
    const difference = Number(nextValue) - Number(oldValue);
    const pct = Number(oldValue) === 0 ? null : difference / Number(oldValue) * 100;
    if (Math.abs(difference) < 0.0005) return 'Sem alteração';
    return (difference > 0 ? '+' : '-') + priceMoney(Math.abs(difference), digits) +
      (pct === null ? '' : ' (' + (pct > 0 ? '+' : '') + pct.toFixed(1).replace('.', ',') + '%)');
  }

  function parseBrazilianPrice(value) {
    const clean = String(value || '').trim();
    if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2,3}$/.test(clean)) return null;
    const parsed = Number(clean.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function priceFractionDigits(a, b) {
    const hasThousandths = [a, b].some(value =>
      value !== null && value !== undefined &&
      Number.isFinite(Number(value)) &&
      Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) > 0.00001
    );
    return hasThousandths ? 3 : 2;
  }

  function priceMoney(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL',
      minimumFractionDigits: digits, maximumFractionDigits: digits
    });
  }

  function normalizePdfHeading(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // Detecta as colunas pelo CABEÇALHO, não pelo número do relatório.
  // Total Custo, Total Venda, estoque e markup nunca são preços unitários.
  function detectPriceColumns(items, width, height) {
    const headings = {code: [], cost: [], sale: []};
    for (const item of items) {
      if (!item.str || !item.transform) continue;
      const label = normalizePdfHeading(item.str);
      const x = item.transform[4], y = item.transform[5];
      if (y < height * 0.55) continue; // cabeçalho da tabela, não rodapé
      if (/^codigo(?:\s+(?:de\s+)?barras?)?$/.test(label)) headings.code.push({x,y});
      if (/^(?:(?:preco|valor)\s+(?:de\s+)?)?custo(?:\s+(?:und|un|unitario))?$/.test(label)) headings.cost.push({x,y});
      if (/^(?:a vista|venda|preco(?:\s+de)?\s+venda|valor(?:\s+de)?\s+venda)$/.test(label)) headings.sale.push({x,y});
    }

    for (const code of headings.code) {
      const cost = headings.cost.find(p => Math.abs(p.y-code.y) < 28);
      const sale = headings.sale.find(p => Math.abs(p.y-code.y) < 28);
      if (!cost || !sale) continue;
      const anchors = [code.x, cost.x, sale.x];
      if (new Set(anchors.map(x=>Math.round(x/width*1000))).size!==3) continue;
      if (!(code.x < cost.x && code.x < sale.x)) continue;
      return {code: code.x, cost: cost.x, sale: sale.x, headerY: Math.min(code.y,cost.y,sale.y)};
    }
    return null;
  }

  function extractErpRowsFromPage(items, width, height, pageNumber) {
    const columns = detectPriceColumns(items,width,height);
    if (!columns) return {rows:[], columnsFound:false};
    const ordered = items.filter(item => item.str && item.transform)
      .map(item => ({text:item.str.trim(), x:item.transform[4], y:item.transform[5]}))
      .sort((a,b) => b.y-a.y || a.x-b.x);
    const lines = [];
    for (const item of ordered) {
      let line = lines[lines.length-1];
      if (!line || Math.abs(line[0].y-item.y)>2.2) {
        line=[];lines.push(line);
      }
      line.push(item);
    }

    const closest = (items, anchor, limit, predicate) =>
      items.filter(item=>Math.abs(item.x-anchor) <= limit && predicate(item.text))
        .sort((a,b)=>Math.abs(a.x-anchor)-Math.abs(b.x-anchor))[0];

    const rows=[];
    for (const line of lines) {
      if (line[0].y >= columns.headerY-2) continue;
      const code = closest(line,columns.code,width*0.023,txt=>/^\d{3,8}$/.test(txt));
      const cost = closest(line,columns.cost,width*0.036,txt=>parseBrazilianPrice(txt)!==null);
      const sale = closest(line,columns.sale,width*0.036,txt=>parseBrazilianPrice(txt)!==null);
      if (!code || !cost || !sale || cost === sale) continue;
      rows.push({
        code:code.text,cost:parseBrazilianPrice(cost.text),
        sale:parseBrazilianPrice(sale.text),page:pageNumber
      });
    }
    return {rows,columnsFound:true};
  }

  function parseErpReportDate(text) {
    const match=String(text).match(/(?:data\s*\/\s*hora|posi[cç][aã]o do estoque)\s*:\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/i);
    if (!match) return null;
    const [,day,month,year,hour='00',minute='00',second='00']=match;
    const d=Number(day),m=Number(month),y=Number(year),h=Number(hour),min=Number(minute),sec=Number(second);
    if (y<2000||y>2100||m<1||m>12||d<1||d>31||h>23||min>59||sec>59) return null;
    const timestamp=Date.UTC(y,m-1,d,h+3,min,sec); // horário local do posto: Brasil/SP (UTC-03)
    const roundtrip=new Date(Date.UTC(y,m-1,d));
    if (roundtrip.getUTCDate()!==d||roundtrip.getUTCMonth()!==m-1) return null;
    return new Date(timestamp).toISOString();
  }

  async function extractErpPricePdf(file) {
    if (!file || !/\.pdf$/i.test(file.name) || file.size > 15 * 1024 * 1024) {
      throw new Error('Selecione um PDF de até 15 MB.');
    }
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
    const pdf = await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    if (pdf.numPages>40) throw new Error('O PDF tem páginas demais (limite de 40).');

    let companyRecognized=false, pagesWithColumns=0, date=null, reportType='Sem número';
    const parsed=[];
    for (let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++) {
      const page=await pdf.getPage(pageNumber);
      const content=await page.getTextContent();
      const text=content.items.map(item=>item.str||'').join(' ');
      if (/sao\s+marcos\s+auto\s+post/i.test(normalizePdfHeading(text))) companyRecognized=true;
      const type=text.match(/\bREL\s*0?\d{2,4}\b/i);
      if (type) reportType=type[0].replace(/\s+/g,'').toUpperCase();
      if (!date) date=parseErpReportDate(text);
      const viewport=page.getViewport({scale:1});
      const extracted=extractErpRowsFromPage(content.items,viewport.width,viewport.height,pageNumber);
      if (extracted.columnsFound) pagesWithColumns++;
      parsed.push(...extracted.rows);
    }
    if (!companyRecognized) throw new Error('Este PDF não é um relatório identificado do São Marcos. Nenhum preço foi alterado.');
    if (pagesWithColumns===0) throw new Error('Não encontrei as colunas Código, Custo e Venda (ou À vista) neste relatório. Nenhum preço foi alterado.');
    if (pagesWithColumns !== pdf.numPages) throw new Error('Uma ou mais páginas estão sem cabeçalho de preços reconhecível. Importação cancelada por segurança.');
    if (!parsed.length) throw new Error('Não foi possível extrair os preços unitários com segurança. Nenhum preço foi alterado.');
    parsed.reportType=reportType;
    parsed.reportDate=date;
    return parsed;
  }

  function buildPriceCandidates(parsed) {
    const byCode = new Map();
    for (const product of products) {
      for (const key of [product.erpCode, product.code]) {
        if (!/^\d{3,8}$/.test(String(key || ''))) continue;
        const value = String(key);
        if (!byCode.has(value)) byCode.set(value, []);
        const found = byCode.get(value);
        if (!found.includes(product)) found.push(product);
      }
    }
    const incomingCodes = new Set();
    const changed = [];
    const totals = {rows: parsed.length, unchanged: 0, missing: 0, ambiguous: 0, invalid: 0};
    for (const item of parsed) {
      if (incomingCodes.has(item.code)) {
        totals.ambiguous++;
        continue;
      }
      incomingCodes.add(item.code);
      const matches = byCode.get(item.code) || [];
      if (!matches.length) {totals.missing++; continue;}
      if (matches.length !== 1) {totals.ambiguous++; continue;}
      if (item.cost < 0 || item.sale <= 0) {totals.invalid++; continue;}
      const product = matches[0];
      const oldCost = product.cost;
      const oldSale = product.salePrice;
      if (oldCost === item.cost && oldSale === item.sale) {totals.unchanged++; continue;}
      if (changed.some(candidate => candidate.product.id === product.id)) {
        totals.ambiguous++;
        const earlier = changed.findIndex(candidate => candidate.product.id === product.id);
        if (earlier !== -1) changed.splice(earlier, 1);
        continue;
      }
      changed.push({
        product, newCost: item.cost, newSale: item.sale,
        previousCost: oldCost, previousSale: oldSale, selected: true
      });
    }
    return {changed, totals};
  }

  function renderPricePreview() {
    const total = priceCandidates.filter(row => row.selected).length;
    const button = $('priceConfirmBtn');
    if (button) {
      button.disabled = !isAdmin() || total === 0;
      button.textContent = 'Confirmar ' + total + ' atualização' + (total === 1 ? '' : 'ões');
    }
    $('pricePreviewBody').innerHTML = priceCandidates.map((row, index) => {
      const warning = row.newSale < row.newCost;
      const costDigits = priceFractionDigits(row.previousCost, row.newCost);
      return '<tr>' +
        '<td><input type="checkbox" class="form-check-input price-row-check" data-index="' + index +
        '" ' + (row.selected ? 'checked' : '') + '></td>' +
        '<td><b>' + esc(row.product.name) + '</b><small class="d-block text-secondary">' +
        esc(row.product.erpCode || row.product.code) + '</small></td>' +
        '<td>' + priceMoney(row.previousCost, costDigits) + ' → <b>' + priceMoney(row.newCost, costDigits) + '</b>' +
        '<small class="d-block text-secondary">' + priceDelta(row.previousCost, row.newCost, costDigits) + '</small></td>' +
        '<td>' + money(row.previousSale) + ' → <b>' + money(row.newSale) + '</b>' +
        '<small class="d-block text-secondary">' + priceDelta(row.previousSale, row.newSale) + '</small>' +
        (warning ? '<small class="d-block text-danger fw-bold">Venda abaixo do custo</small>' : '') +
        '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="text-center py-3">Nenhuma alteração identificada.</td></tr>';
    $('pricePreviewBody').querySelectorAll('.price-row-check').forEach(input => {
      input.addEventListener('change', () => {
        priceCandidates[Number(input.dataset.index)].selected = input.checked;
        renderPricePreview();
      });
    });
  }

  async function readPricePdf(event) {
    if (!isAdmin()) return;
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const progress = $('priceImportStatus');
    progress.textContent = 'Lendo o PDF e comparando os preços...';
    priceCandidates = [];
    renderPricePreview();
    try {
      const parsed = await extractErpPricePdf(file);
      const {changed, totals} = buildPriceCandidates(parsed);
      priceCandidates = changed;
      $('priceImportCounts').textContent =
        totals.rows + ' produtos no PDF • ' + changed.length + ' com alteração • ' +
        totals.unchanged + ' sem mudança • ' + totals.missing + ' não encontrados • ' +
        totals.ambiguous + ' ambíguos • ' + totals.invalid + ' inválidos';
      progress.textContent = 'Relatório ' + parsed.reportType + ' reconhecido. Prévia pronta; nenhum preço foi alterado.';
      renderPricePreview();
    } catch (error) {
      console.error('Leitura do PDF:', error);
      $('priceImportCounts').textContent = '';
      progress.textContent = error.message || 'Falha ao ler o PDF.';
    }
  }

  async function confirmPriceImport() {
    if (!isAdmin()) return;
    const chosen = priceCandidates.filter(row => row.selected);
    if (!chosen.length) return;
    const lossCount = chosen.filter(row => row.newSale < row.newCost).length;
    if (lossCount && !window.confirm(
      lossCount + ' produto(s) ficarão com preço de venda abaixo do custo. Deseja continuar?'
    )) return;
    const button = $('priceConfirmBtn');
    if (button.disabled) return;
    setBusy(button, true, 'Aplicando...');
    try {
      const changes = chosen.map(row => ({
        product_id: row.product.id,
        expected_cost: row.previousCost,
        expected_sale_price: row.previousSale,
        new_cost: row.newCost,
        new_sale_price: row.newSale
      }));
      const {data, error} = await db.rpc('apply_price_import', {p_changes: changes});
      if (error) throw error;

      // A gravação já foi confirmada pelo servidor. Falha no refresh NÃO pode
      // fazer o usuário pensar que deve confirmar os mesmos preços novamente.
      priceCandidates = [];
      bootstrap.Modal.getInstance($('priceImportModal'))?.hide();
      toast((data?.updated ?? chosen.length) + ' produto(s) atualizados. Histórico registrado.');
      try {
        await loadData();
        renderAll();
      } catch (refreshError) {
        console.warn('Preços gravados; atualização da tela indisponível:', refreshError);
        toast('Preços salvos! Atualize a página para visualizar os novos valores.');
      }
    } catch (error) {
      console.error('Atualização de preços:', error);
      $('priceImportStatus').textContent =
        friendlyDataError(error, 'Não foi possível confirmar os preços. Reimporte o PDF para conferir os valores atuais.');
    } finally {
      setBusy(button, false);
      renderPricePreview();
    }
  }

  async function loadPriceHistory() {
    const all = [];
    for (let offset = 0; offset < 10000; offset += 1000) {
      const {data, error} = await db.from('price_history')
        .select('id,product_id,cost,sale_price,changed_at,changed_by,source,import_batch_id')
        .order('changed_at', {ascending: true}).order('id', {ascending: true})
        .range(offset, offset + 999);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return all;
  }

  function displayPriceHistory() {
    const lookup = new Map(products.map(p => [p.id, p]));
    const previous = new Map();
    const changes = [];
    for (const row of priceHistoryRows) {
      const old = previous.get(row.product_id);
      if (old && (old.cost !== row.cost || old.sale_price !== row.sale_price)) {
        changes.push({row, old, product: lookup.get(row.product_id)});
      }
      previous.set(row.product_id, row);
    }
    changes.reverse();
    const filtered = priceHistoryProductId
      ? changes.filter(item => item.row.product_id === priceHistoryProductId)
      : changes;
    $('priceHistoryCount').textContent = filtered.length + ' alteração' +
      (filtered.length === 1 ? '' : 'ões') + ' no histórico';
    $('priceHistoryBody').innerHTML = filtered.map(item => {
      const sale = priceDelta(item.old.sale_price, item.row.sale_price);
      const costDigits = priceFractionDigits(item.old.cost, item.row.cost);
      const cost = priceDelta(item.old.cost, item.row.cost, costDigits);
      return '<tr><td>' + new Date(item.row.changed_at).toLocaleString('pt-BR') +
        '</td><td><b>' + esc(item.product?.name || item.row.product_id) + '</b></td>' +
        '<td>' + priceMoney(item.old.cost, costDigits) + ' → ' + priceMoney(item.row.cost, costDigits) +
        '<small class="d-block text-secondary">' + cost + '</small></td>' +
        '<td>' + money(item.old.sale_price) + ' → ' + money(item.row.sale_price) +
        '<small class="d-block text-secondary">' + sale + '</small></td>' +
        '<td>' + (item.row.source === 'pdf' ? 'Importação PDF' : 'Manual') +
        '</td><td>' + esc(priceHistoryPeople.get(item.row.changed_by) || 'Sistema') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="text-center py-4">Ainda não há alterações registradas.</td></tr>';
  }

  async function openPriceHistory(productId = null) {
    if (!isAdmin()) return;
    priceHistoryProductId = productId;
    $('priceHistoryCount').textContent = 'Carregando histórico...';
    $('priceHistoryBody').innerHTML = '';
    bootstrap.Modal.getOrCreateInstance($('priceHistoryModal')).show();
    try {
      const [history, peopleResult] = await Promise.all([
        loadPriceHistory(),
        db.from('profiles').select('id,display_name')
      ]);
      if (peopleResult.error) throw peopleResult.error;
      priceHistoryRows = history;
      priceHistoryPeople = new Map((peopleResult.data || []).map(person => [person.id, person.display_name]));
      displayPriceHistory();
    } catch (error) {
      console.error('Histórico de preços:', error);
      $('priceHistoryCount').textContent = 'Não foi possível carregar o histórico.';
    }
  }

  function setupPriceTools() {
    const newProductButton = $('newProductBtn');
    if (!newProductButton || $('openPriceImportBtn')) return;
    const area = document.createElement('div');
    area.className = 'd-flex gap-2 flex-wrap justify-content-end admin-only';
    area.innerHTML =
      '<button type="button" id="openPriceHistoryBtn" class="btn btn-outline-light">' +
      '<i class="bi bi-clock-history me-1"></i>Histórico de preços</button>' +
      '<button type="button" id="openPriceImportBtn" class="btn btn-outline-info">' +
      '<i class="bi bi-file-earmark-pdf me-1"></i>Atualizar por PDF</button>';
    newProductButton.before(area);
    area.appendChild(newProductButton);

    const modal = document.createElement('div');
    modal.innerHTML =
      '<div class="modal fade" id="priceImportModal" tabindex="-1">' +
      '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title">Atualização de custo e venda por PDF</h5>' +
      '<button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
      '<div class="modal-body"><p class="text-secondary">Use o relatório REL011 ou REL024 do ERP. Só os produtos selecionados serão atualizados após a confirmação. Quantidades de estoque não serão alteradas.</p>' +
      '<input id="pricePdfFile" type="file" accept=".pdf,application/pdf" class="form-control mb-3">' +
      '<div id="priceImportStatus" class="small text-secondary mb-2">Escolha o PDF para começar.</div>' +
      '<div id="priceImportCounts" class="small mb-3"></div>' +
      '<div class="d-flex gap-2 flex-wrap mb-2"><button id="priceSelectAll" type="button" class="btn btn-sm btn-outline-light">Selecionar todas</button>' +
      '<button id="priceSelectNone" type="button" class="btn btn-sm btn-outline-light">Desmarcar todas</button></div>' +
      '<div class="table-responsive"><table class="table inventory-table"><thead><tr>' +
      '<th></th><th>Produto</th><th>Custo anterior → novo</th><th>Venda anterior → novo</th></tr></thead>' +
      '<tbody id="pricePreviewBody"></tbody></table></div></div>' +
      '<div class="modal-footer"><button class="btn btn-outline-light" data-bs-dismiss="modal">Cancelar</button>' +
      '<button id="priceConfirmBtn" class="btn btn-success" type="button" disabled>Confirmar atualização</button></div>' +
      '</div></div></div>' +
      '<div class="modal fade" id="priceHistoryModal" tabindex="-1">' +
      '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title">Histórico de preços</h5>' +
      '<button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
      '<div class="modal-body"><p id="priceHistoryCount" class="text-secondary"></p>' +
      '<div class="table-responsive"><table class="table inventory-table"><thead><tr>' +
      '<th>Data</th><th>Produto</th><th>Custo</th><th>Venda</th><th>Origem</th><th>Usuário (ID)</th>' +
      '</tr></thead><tbody id="priceHistoryBody"></tbody></table></div></div>' +
      '<div class="modal-footer"><button class="btn btn-outline-light" data-bs-dismiss="modal">Fechar</button></div>' +
      '</div></div></div>';
    while (modal.firstChild) document.body.appendChild(modal.firstChild);

    $('openPriceImportBtn').onclick = () => {
      if (!isAdmin()) return;
      $('pricePdfFile').value = '';
      $('priceImportStatus').textContent = 'Escolha o PDF para começar.';
      $('priceImportCounts').textContent = '';
      priceCandidates = [];
      renderPricePreview();
      bootstrap.Modal.getOrCreateInstance($('priceImportModal')).show();
    };
    $('openPriceHistoryBtn').onclick = () => openPriceHistory();
    $('pricePdfFile').onchange = readPricePdf;
    $('priceConfirmBtn').onclick = confirmPriceImport;
    $('priceSelectAll').onclick = () => {
      priceCandidates.forEach(item => {item.selected = true;});
      renderPricePreview();
    };
    $('priceSelectNone').onclick = () => {
      priceCandidates.forEach(item => {item.selected = false;});
      renderPricePreview();
    };
    const footer = $('productForm')?.querySelector('.modal-footer');
    if (footer) {
      const button = document.createElement('button');
      button.id = 'productPriceHistoryBtn';
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-light d-none';
      button.textContent = 'Histórico de preços';
      footer.prepend(button);
      button.onclick = () => {
        const id = $('productId').value;
        if (!id) return;
        const productModal = $('productModal');
        const instance = bootstrap.Modal.getInstance(productModal);
        if (instance) {
          productModal.addEventListener('hidden.bs.modal', () => openPriceHistory(id), {once: true});
          instance.hide();
        } else {
          openPriceHistory(id);
        }
      };
      $('productModal').addEventListener('show.bs.modal', () => {
        button.classList.toggle('d-none', !isAdmin() || !$('productId').value);
      });
    }
  }
