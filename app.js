(() => {

  const STORAGE='sm_inventory_v1', MOV='sm_movements_v1', SESSION='sm_session_v1';
  const USERS={
    admin:{
      password:'saomarcos2026',name:'Administrador',role:'admin'
    },consulta:{
      password:'consulta',name:'Consulta',role:'viewer'
    }
  };
  const categories=['Óleos','Filtro de óleo','Filtro de combustível','Ar do motor','Ar-condicionado','Aditivos'];
  const referenceCategories=new Set(['Filtro de óleo','Filtro de combustível','Ar do motor','Ar-condicionado']);
  const sequenceRules={
    'Óleos':{prefix:'OLEO-',pad:3},
    'Aditivos':{prefix:'ADIT-',pad:3}
  };
  let products=[],movements=[],session=null,currentCategory='',attentionOnly=false,missingPriceOnly=false;
  const $=id=>document.getElementById(id);
  const norm=s=>(s??'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function n(v){
    const x=Number(v);return Number.isFinite(x)?x:0
  }

  function nullableNumber(v){
    if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null
  }

  function save(){
    localStorage.setItem(STORAGE,JSON.stringify(products));localStorage.setItem(MOV,JSON.stringify(movements));
  }

  function migrate(){
    products=products.map(p=>({
      ...p,cost:(p.cost===undefined?null:p.cost),salePrice:(p.salePrice===undefined?null:p.salePrice)
    }));movements=movements.map(m=>({
      ...m,type:m.type||'exit'
    }));
  }

  function load(){
    products=JSON.parse(localStorage.getItem(STORAGE)||'null')||structuredClone(window.SEED_PRODUCTS||[]);movements=JSON.parse(localStorage.getItem(MOV)||'null')||[];session=JSON.parse(sessionStorage.getItem(SESSION)||'null');migrate();
  }

  function total(p){
    return n(p.stock)+n(p.pista)
  }

  function status(p){
    const t=total(p);if(t<=0)return'zero';if(t<=n(p.minStock))return'low';return'normal'
  }

  function statusLabel(s){
    return s==='zero'?'Sem estoque':s==='low'?'Estoque baixo':'Normal'
  }

  function pill(s){
    return `<span class="status-pill status-${s}">${statusLabel(s)}</span>`
  }

  function money(v){
    if(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))return'—';return Number(v).toLocaleString('pt-BR',{
      style:'currency',currency:'BRL'
    })
  }

  function marginPct(cost,price){
    cost=nullableNumber(cost);price=nullableNumber(price);if(cost===null||price===null||price<=0)return null;return ((price-cost)/price)*100
  }

  function marginText(p){
    const m=marginPct(p.cost,p.salePrice);return m===null?'—':`${m.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`
  }

  function toast(msg){
    $('toastText').textContent=msg;bootstrap.Toast.getOrCreateInstance($('appToast')).show()
  }

  function esc(s){
    return (s??'').toString().replace(/[&<>'"]/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }
    [c]))
  }

  function isAdmin(){
    return session?.role==='admin'
  }

  function applyRole(){
    document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('d-none',!isAdmin()));$('userName').textContent=session.name;$('userRole').textContent=isAdmin()?'Administrador':'Somente consulta';$('userAvatar').textContent=session.name[0].toUpperCase()
  }

  function login(user){
    session={
      ...USERS[user],user
    };sessionStorage.setItem(SESSION,JSON.stringify(session));$('loginScreen').classList.add('d-none');$('app').classList.remove('d-none');applyRole();renderAll()
  }

  function logout(){
    sessionStorage.removeItem(SESSION);location.reload()
  }

  function showView(name){
    if((name==='movements'||name==='finance'||name==='settings')&&!isAdmin())return;document.querySelectorAll('.view-section').forEach(v=>v.classList.add('d-none'));$(name+'View').classList.remove('d-none');document.querySelectorAll('.sidebar .nav-link').forEach(b=>b.classList.remove('active'));const b=document.querySelector(`.sidebar .nav-link[data-view="${name}"]`);if(b)b.classList.add('active');$('sidebar').classList.remove('open');if(name==='inventory')renderInventory();if(name==='movements')renderMovements();if(name==='finance')renderFinance()
  }

  function renderDashboard(){
    const stats={
      normal:0,low:0,zero:0
    };products.forEach(p=>stats[status(p)]++);$('statProducts').textContent=products.length;$('statNormal').textContent=stats.normal;$('statLow').textContent=stats.low;$('statZero').textContent=stats.zero;const att=products.filter(p=>status(p)!=='normal').sort((a,b)=>total(a)-total(b)).slice(0,8);$('attentionTable').innerHTML=att.map(p=>`<tr><td><b>${esc(p.name)}</b><small class="d-block text-secondary">${esc(p.code)}</small></td><td>${esc(p.category)}</td><td>${p.stock}</td><td>${p.pista}</td><td><b>${total(p)}</b></td><td>${pill(status(p))}</td></tr>`).join('')||'<tr><td colspan="6" class="text-center py-4 text-secondary">Nenhum alerta.</td></tr>';const totals=categories.map(c=>({
      c,n:products.filter(p=>p.category===c).reduce((s,p)=>s+total(p),0)
    }));const max=Math.max(1,...totals.map(x=>x.n));$('categoryBars').innerHTML=totals.map(x=>`<div class="category-row"><span>${esc(x.c)}</span><div class="bar-bg"><div class="bar-fill" style="width:${Math.max(2,x.n/max*100)}%"></div></div><b class="text-end">${Number(x.n.toFixed(2)).toLocaleString('pt-BR',{maximumFractionDigits:2})}${x.c==='Óleos'?' L':''}</b></div>`).join('');renderRecent()
  }

  function movementTypeLabel(m){
    if(m.type==='entry')return'Entrada';if(m.type==='sale')return'Venda';return'Saída'
  }

  function renderRecent(){
    $('recentMovements').innerHTML=movements.slice(0,5).map(m=>`<div class="movement-item"><div><b>${esc(m.productName)}</b><small>${new Date(m.date).toLocaleString('pt-BR')} • ${esc(m.target==='pista'?'Pista':'Estoque')} • ${movementTypeLabel(m)}</small></div><b class="movement-value ${m.type}">${m.type==='entry'?'+':'-'}${m.qty}</b></div>`).join('')||'<div class="text-secondary text-center py-4">Sem movimentações ainda.</div>'
  }

  function fillCategorySelects(){
    $('categoryFilter').innerHTML='<option value="">Todas as categorias</option>'+categories.map(c=>`<option>${c}</option>`).join('');
    $('productCategory').innerHTML='<option value="">Selecione a categoria primeiro</option>'+categories.map(c=>`<option>${c}</option>`).join('')
  }

  function generateSequentialCode(category){
    const rule=sequenceRules[category];if(!rule)return'';const prefix=rule.prefix.toUpperCase();const numbers=products.map(p=>(p.code||'').toUpperCase()).filter(code=>code.startsWith(prefix)).map(code=>{const match=code.slice(prefix.length).match(/^(\d+)/);return match?Number(match[1]):0}).filter(number=>number>0);const next=numbers.length?Math.max(...numbers)+1:1;return rule.prefix+(rule.pad?String(next).padStart(rule.pad,'0'):next)
  }

  function extractCodeParts(code){
    const value=(code||'').trim().toUpperCase();const index=value.search(/\d/);if(index<0)return{prefix:value,reference:''};if(index===0)return{prefix:'',reference:value};return{prefix:value.slice(0,index),reference:value.slice(index)}
  }

  function brandsForCategory(category){
    return [...new Set(products.filter(p=>p.category===category&&String(p.brand||'').trim()).map(p=>String(p.brand).trim()))].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}))
  }

  function prefixesFor(category,brand){
    if(!category||!brand)return[];const wanted=norm(brand);const values=products.filter(p=>p.category===category&&norm(p.brand)===wanted).map(p=>extractCodeParts(p.code).prefix).filter(Boolean);return [...new Set(values)].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}))
  }

  function selectedProductBrand(){
    const value=$('productBrand').value;if(value==='__other__')return $('productBrandCustom').value.trim();return value.trim()
  }

  function selectedCodePrefix(){
    const value=$('productCodeFamily').value;if(value==='__other__')return $('productCodeFamilyCustom').value.toUpperCase();return value
  }

  function fillBrandOptions(category,selected=''){
    const brands=brandsForCategory(category);$('productBrand').innerHTML='<option value="">Selecione a marca</option>'+brands.map(brand=>`<option value="${esc(brand)}">${esc(brand)}</option>`).join('')+'<option value="__other__">Outra marca...</option>';if(selected){const found=brands.some(brand=>norm(brand)===norm(selected));if(found){$('productBrand').value=brands.find(brand=>norm(brand)===norm(selected))}else{$('productBrand').value='__other__';$('productBrandCustom').value=selected;$('productBrandCustomWrap').classList.remove('d-none')}}else{$('productBrandCustom').value='';$('productBrandCustomWrap').classList.add('d-none')}
  }

  function fillFamilyOptions(category,brand,selected=''){
    const prefixes=prefixesFor(category,brand);$('productCodeFamily').innerHTML='<option value="">Selecione a família/prefixo</option>'+prefixes.map(prefix=>`<option value="${esc(prefix)}">${esc(prefix.trim()||prefix)}</option>`).join('')+'<option value="__other__">Outro prefixo...</option>';if(selected){const found=prefixes.find(prefix=>prefix===selected);if(found){$('productCodeFamily').value=found}else{$('productCodeFamily').value='__other__';$('productCodeFamilyCustom').value=selected;$('productCodeFamilyCustomWrap').classList.remove('d-none')}}else{$('productCodeFamilyCustom').value='';$('productCodeFamilyCustomWrap').classList.add('d-none')}
  }

  function setProductDetailFieldsEnabled(enabled){
    ['productName','productType','productStock','productPista','productMin','productCost','productSalePrice','productLocation'].forEach(id=>{const el=$(id);if(el)el.disabled=!enabled})
  }

  function resetProductCodeFlow(){
    $('productCode').value='';$('productBrand').disabled=true;$('productBrand').innerHTML='<option value="">Selecione a categoria primeiro</option>';$('productBrandCustom').value='';$('productBrandCustomWrap').classList.add('d-none');$('productCodeFamilyArea').classList.add('d-none');$('productCodeFamily').disabled=true;$('productCodeFamily').innerHTML='<option value="">Selecione a marca primeiro</option>';$('productCodeFamilyCustom').value='';$('productCodeFamilyCustomWrap').classList.add('d-none');$('productReferenceArea').classList.add('d-none');$('productCodeReference').value='';$('productCodeReference').disabled=true;$('productCodePrefix').textContent='';setProductDetailFieldsEnabled(false)
  }

  function updateFinalReferenceCode(){
    if(!referenceCategories.has($('productCategory').value))return;const prefix=selectedCodePrefix(),reference=$('productCodeReference').value.trim().toUpperCase();$('productCodeReference').value=reference;$('productCodePrefix').textContent=prefix||'—';$('productCode').value=prefix&&reference?`${prefix}${reference}`:'';setProductDetailFieldsEnabled(Boolean(prefix&&reference))
  }

  function prepareBrandStep(){
    if($('productId').value)return;const category=$('productCategory').value;resetProductCodeFlow();if(!category)return;fillBrandOptions(category);$('productBrand').disabled=false
  }

  function prepareCodeStep(){
    if($('productId').value)return;const category=$('productCategory').value,brand=selectedProductBrand();$('productCode').value='';$('productCodeFamilyArea').classList.add('d-none');$('productReferenceArea').classList.add('d-none');$('productCodeFamily').disabled=true;$('productCodeReference').disabled=true;setProductDetailFieldsEnabled(false);if(!brand)return;if(referenceCategories.has(category)){$('productCodeFamilyArea').classList.remove('d-none');fillFamilyOptions(category,brand);$('productCodeFamily').disabled=false;return}const code=generateSequentialCode(category);$('productCode').value=code;setProductDetailFieldsEnabled(Boolean(code))
  }

  function prepareReferenceStep(){
    if($('productId').value)return;const prefix=selectedCodePrefix();$('productCode').value='';$('productCodeReference').value='';setProductDetailFieldsEnabled(false);$('productCodeFamilyCustomWrap').classList.toggle('d-none',$('productCodeFamily').value!=='__other__');if(!prefix){$('productReferenceArea').classList.add('d-none');return}$('productReferenceArea').classList.remove('d-none');$('productCodePrefix').textContent=prefix;$('productCodeReference').disabled=false;$('productCodeReference').focus()
  }

  function renderInventory(){
    let q=norm($('inventorySearch').value);let cat=$('categoryFilter').value||currentCategory;let sf=$('statusFilter').value;if(attentionOnly&&!sf)sf='low';let list=products.filter(p=>(!cat||p.category===cat)&&(!sf||(sf==='low'?(status(p)!=='normal'):status(p)===sf))&&(!missingPriceOnly||nullableNumber(p.cost)===null||n(p.cost)<=0||nullableNumber(p.salePrice)===null||n(p.salePrice)<=0)&&(!q||norm([p.code,p.name,p.brand,p.category,p.type,p.location].join(' ')).includes(q)));$('resultCount').textContent=`${list.length} produto${list.length===1?'':'s'}`;$('inventoryTable').innerHTML=list.map(p=>`<tr><td><b>${esc(p.code)}</b></td><td>${esc(p.name)}</td><td>${esc(p.brand)}</td><td>${esc(p.category)}</td><td>${p.stock}</td><td>${p.pista}</td><td><b>${total(p)}</b></td><td>${esc(p.location)}</td><td>${pill(status(p))}</td><td class="admin-only ${isAdmin()?'':'d-none'}">${n(p.cost)>0?money(p.cost):'<span class="text-warning">Não informado</span>'}</td><td class="admin-only ${isAdmin()?'':'d-none'}">${n(p.salePrice)>0?money(p.salePrice):'<span class="text-warning">Não informado</span>'}</td><td class="admin-only ${isAdmin()?'':'d-none'}">${marginText(p)}</td><td class="admin-only ${isAdmin()?'':'d-none'}"><div class="action-btns"><button class="btn btn-sm btn-outline-warning" onclick="SM.move('${encodeURIComponent(p.id)}','sale')" title="Venda"><i class="bi bi-cart-check"></i></button><button class="btn btn-sm btn-outline-success" onclick="SM.move('${encodeURIComponent(p.id)}','entry')" title="Entrada"><i class="bi bi-plus-lg"></i></button><button class="btn btn-sm btn-outline-danger" onclick="SM.move('${encodeURIComponent(p.id)}','exit')" title="Saída"><i class="bi bi-dash-lg"></i></button><button class="btn btn-sm btn-outline-secondary" onclick="SM.edit('${encodeURIComponent(p.id)}')" title="Editar"><i class="bi bi-pencil"></i></button></div></td></tr>`).join('')||`<tr><td colspan="13" class="text-center py-5 text-secondary">Nenhum produto encontrado.</td></tr>`
  }

  function updateProductMarginPreview(){
    const c=nullableNumber($('productCost').value),p=nullableNumber($('productSalePrice').value),m=marginPct(c,p);$('productMarginPreview').textContent=m===null?'—':`${money(p-c)} de lucro • ${m.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`
  }

  function openProduct(p=null){
    if(!isAdmin())return;const editing=Boolean(p);$('productModalTitle').textContent=editing?'Editar produto':'Novo produto';$('productId').value=p?.id||'';$('productCategory').disabled=false;$('productCategory').value=p?.category||'';$('productName').value=p?.name||'';$('productType').value=p?.type||'';$('productStock').value=p?.stock??0;$('productPista').value=p?.pista??0;$('productMin').value=p?.minStock??3;$('productCost').value=n(p?.cost)>0?p.cost:'';$('productSalePrice').value=n(p?.salePrice)>0?p.salePrice:'';$('productLocation').value=p?.location||'';resetProductCodeFlow();if(editing){$('productCategory').disabled=true;fillBrandOptions(p.category,p.brand||'');$('productBrand').disabled=true;$('productBrandCustom').disabled=true;const parts=extractCodeParts(p.code);if(referenceCategories.has(p.category)){$('productCodeFamilyArea').classList.remove('d-none');fillFamilyOptions(p.category,p.brand||'',parts.prefix);$('productCodeFamily').disabled=true;$('productCodeFamilyCustom').disabled=true;$('productReferenceArea').classList.remove('d-none');$('productCodePrefix').textContent=parts.prefix||'—';$('productCodeReference').value=parts.reference;$('productCodeReference').disabled=true}else{$('productCodeFamilyArea').classList.add('d-none');$('productReferenceArea').classList.add('d-none')}$('productCode').value=p.code||'';setProductDetailFieldsEnabled(true)}else{$('productBrandCustom').disabled=false;$('productCodeFamilyCustom').disabled=false}updateProductMarginPreview();bootstrap.Modal.getOrCreateInstance($('productModal')).show()
  }

  function updateSaleFields(){
    const type=$('movementType').value,p=products.find(x=>x.id===$('movementProduct').value),qty=Math.max(1,n($('movementQty').value));$('saleFields').classList.toggle('d-none',type!=='sale');if(type!=='sale')return;const price=nullableNumber($('movementUnitPrice').value),cost=nullableNumber(p?.cost);$('movementUnitCost').textContent=cost&&cost>0?money(cost):'Não informado';if(price===null||price<=0){
      $('movementSaleSummary').textContent='Informe o preço de venda';return
    }
    const revenue=price*qty, grossCost=(cost&&cost>0?cost:0)*qty,profit=revenue-grossCost,m=cost&&cost>0?marginPct(cost,price):null;$('movementSaleSummary').textContent=`${money(revenue)} faturamento • ${cost&&cost>0?money(profit)+' lucro bruto'+(m!==null?' • '+m.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':''):'custo não informado'}`
  }

  function openMovement(type,id=null){
    if(!isAdmin())return;$('movementType').value=type;$('movementTitle').textContent=type==='entry'?'Entrada de estoque':type==='sale'?'Registrar venda':'Saída de estoque';$('movementSubmit').className=`btn ${type==='entry'?'btn-success':type==='sale'?'btn-warning':'btn-danger'}`;$('movementProduct').innerHTML=products.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.id)}">${esc(p.code)} — ${esc(p.name)} (${total(p)})</option>`).join('');if(id)$('movementProduct').value=id;$('movementQty').value=1;$('movementTarget').value='stock';$('movementNote').value='';const p=products.find(x=>x.id===$('movementProduct').value);$('movementUnitPrice').value=n(p?.salePrice)>0?p.salePrice:'';updateSaleFields();bootstrap.Modal.getOrCreateInstance($('movementModal')).show()
  }

  function renderMovements(){
    $('movementTable').innerHTML=movements.map(m=>{
      const badge=m.type==='entry'?'<span class="badge text-bg-success">Entrada</span>':m.type==='sale'?'<span class="badge text-bg-warning">Venda</span>':'<span class="badge text-bg-danger">Saída</span>';const val=m.type==='sale'?money(n(m.unitPrice)*n(m.qty)):'—';return `<tr><td>${new Date(m.date).toLocaleString('pt-BR')}</td><td><b>${esc(m.productName)}</b><small class="d-block text-secondary">${esc(m.productCode)}</small></td><td>${badge}</td><td>${m.type==='entry'?'+':'-'}${m.qty}</td><td>${m.target==='pista'?'Pista':'Estoque'}</td><td>${val}</td><td>${esc(m.user)}</td></tr>`
    }).join('')||'<tr><td colspan="7" class="text-center py-5 text-secondary">Nenhuma movimentação registrada.</td></tr>'
  }

  function monthKey(d){
    const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`
  }

  function selectedMonth(){
    return $('financeMonth').value||monthKey(new Date())
  }

  function salesForMonth(){
    const key=selectedMonth();return movements.filter(m=>m.type==='sale'&&monthKey(m.date)===key)
  }

  function renderFinance(){
    if(!isAdmin())return;const sales=salesForMonth();let revenue=0,cost=0,units=0;const byProduct=new Map();sales.forEach(m=>{
      const qty=n(m.qty),r=n(m.unitPrice)*qty,c=n(m.unitCost)*qty;revenue+=r;cost+=c;units+=qty;const k=m.productId||m.productCode;const row=byProduct.get(k)||{
        name:m.productName,code:m.productCode,qty:0,revenue:0,cost:0
      };row.qty+=qty;row.revenue+=r;row.cost+=c;byProduct.set(k,row)
    });const profit=revenue-cost,margin=revenue>0?profit/revenue*100:0;$('finRevenue').textContent=money(revenue);$('finCost').textContent=money(cost);$('finProfit').textContent=money(profit);$('finMargin').textContent=`${margin.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;$('finUnits').textContent=units;$('finSalesCount').textContent=`${sales.length} venda${sales.length===1?'':'s'}`;const missingCost=products.filter(p=>n(p.cost)<=0).length,missingSale=products.filter(p=>n(p.salePrice)<=0).length;$('missingCost').textContent=missingCost;$('missingSale').textContent=missingSale;$('stockCostValue').textContent=money(products.reduce((s,p)=>s+(n(p.cost)*total(p)),0));$('stockSaleValue').textContent=money(products.reduce((s,p)=>s+(n(p.salePrice)*total(p)),0));const top=[...byProduct.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,8);$('topSalesTable').innerHTML=top.map(x=>`<tr><td><b>${esc(x.name)}</b><small class="d-block text-secondary">${esc(x.code)}</small></td><td>${x.qty}</td><td>${money(x.revenue)}</td><td>${money(x.revenue-x.cost)}</td></tr>`).join('')||'<tr><td colspan="4" class="text-center py-4 text-secondary">Nenhuma venda registrada neste mês.</td></tr>';$('financeSalesTable').innerHTML=sales.map(m=>{
      const r=n(m.unitPrice)*n(m.qty),c=n(m.unitCost)*n(m.qty),p=r-c,mg=r>0?p/r*100:0;return `<tr><td>${new Date(m.date).toLocaleString('pt-BR')}</td><td><b>${esc(m.productName)}</b><small class="d-block text-secondary">${esc(m.productCode)}</small></td><td>${m.qty}</td><td>${money(m.unitPrice)}</td><td>${n(m.unitCost)>0?money(m.unitCost):'<span class="text-warning">Não informado</span>'}</td><td>${money(r)}</td><td>${money(p)}</td><td>${mg.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</td></tr>`
    }).join('')||'<tr><td colspan="8" class="text-center py-5 text-secondary">Nenhuma venda registrada neste mês.</td></tr>'
  }

  function renderAll(){
    fillCategorySelects();renderDashboard();renderInventory();renderMovements();if($('financeMonth')&&!$('financeMonth').value)$('financeMonth').value=monthKey(new Date());renderFinance();const now=new Date();$('todayDate').textContent=now.toLocaleDateString('pt-BR',{
      weekday:'long',day:'2-digit',month:'long'
    });$('todayTime').textContent=now.toLocaleTimeString('pt-BR',{
      hour:'2-digit',minute:'2-digit'
    });$('greeting').textContent=`Olá, ${session.name}!`
  }

  function csvDownload(rows,name){
    const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{
      type:'text/csv'
    }));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)
  }

  function exportCSV(){
    const rows=[['Data','Código','Produto','Tipo','Quantidade','Destino','Preço Unitário','Custo Unitário','Usuário','Observação'],...movements.map(m=>[new Date(m.date).toLocaleString('pt-BR'),m.productCode,m.productName,m.type,m.qty,m.target,m.unitPrice??'',m.unitCost??'',m.user,m.note||''])];csvDownload(rows,'movimentacoes-sao-marcos.csv')
  }

  function exportFinance(){
    const sales=salesForMonth();const rows=[['Fechamento',selectedMonth()],[],['Data','Código','Produto','Qtd','Preço unitário','Custo unitário','Faturamento','Custo','Lucro bruto'],...sales.map(m=>{
      const r=n(m.unitPrice)*n(m.qty),c=n(m.unitCost)*n(m.qty);return[new Date(m.date).toLocaleString('pt-BR'),m.productCode,m.productName,m.qty,n(m.unitPrice).toFixed(2),n(m.unitCost).toFixed(2),r.toFixed(2),c.toFixed(2),(r-c).toFixed(2)]
    })];csvDownload(rows,`fechamento-${selectedMonth()}-sao-marcos.csv`)
  }

  $('loginForm').addEventListener('submit',e=>{
    e.preventDefault();const u=$('loginUser').value.trim().toLowerCase(),p=$('loginPass').value;if(USERS[u]?.password===p)login(u);else $('loginError').classList.remove('d-none')
  });
  $('logoutBtn').onclick=logout;$('menuBtn').onclick=()=>$('sidebar').classList.toggle('open');
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.filter==='attention'){
      attentionOnly=true;missingPriceOnly=false;currentCategory='';$('categoryFilter').value='';$('statusFilter').value='';
    }
    showView(b.dataset.view)
  }));
  document.querySelectorAll('.category-link').forEach(b=>b.addEventListener('click',()=>{
    attentionOnly=false;missingPriceOnly=false;currentCategory=b.dataset.category;showView('inventory');$('categoryFilter').value=currentCategory;renderInventory()
  }));
  document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>b.dataset.action==='new'?openProduct():openMovement(b.dataset.action)));
  $('newProductBtn').onclick=()=>openProduct();
  $('inventorySearch').addEventListener('input',()=>{
    attentionOnly=false;missingPriceOnly=false;renderInventory()
  });$('categoryFilter').addEventListener('change',()=>{
    currentCategory='';attentionOnly=false;missingPriceOnly=false;renderInventory()
  });$('statusFilter').addEventListener('change',()=>{
    attentionOnly=false;missingPriceOnly=false;renderInventory()
  });
  $('globalSearch').addEventListener('input',e=>{
    if(e.target.value){
      showView('inventory');$('inventorySearch').value=e.target.value;renderInventory()
    }
  });document.addEventListener('keydown',e=>{
    if(e.ctrlKey&&e.key.toLowerCase()==='k'){
      e.preventDefault();$('globalSearch').focus()
    }
  });
  $('productCategory').addEventListener('change',prepareBrandStep);
  $('productBrand').addEventListener('change',()=>{if($('productId').value)return;$('productBrandCustomWrap').classList.toggle('d-none',$('productBrand').value!=='__other__');if($('productBrand').value==='__other__'){$('productBrandCustom').value='';$('productBrandCustom').focus()}prepareCodeStep()});
  $('productBrandCustom').addEventListener('input',prepareCodeStep);
  $('productCodeFamily').addEventListener('change',()=>{if($('productId').value)return;if($('productCodeFamily').value==='__other__'){$('productCodeFamilyCustom').value='';$('productCodeFamilyCustomWrap').classList.remove('d-none');$('productCodeFamilyCustom').focus()}prepareReferenceStep()});
  $('productCodeFamilyCustom').addEventListener('input',()=>{
    if($('productId').value)return;
    const prefix=$('productCodeFamilyCustom').value.trim().toUpperCase();
    $('productCodeFamilyCustom').value=prefix;
    $('productCodePrefix').textContent=prefix||'—';
    if(prefix){
      $('productReferenceArea').classList.remove('d-none');
      $('productCodeReference').disabled=false;
    }else{
      $('productReferenceArea').classList.add('d-none');
      $('productCodeReference').value='';
      $('productCode').value='';
      setProductDetailFieldsEnabled(false);
    }
    updateFinalReferenceCode();
  });
  $('productCodeReference').addEventListener('input',updateFinalReferenceCode);
  $('productCost').addEventListener('input',updateProductMarginPreview);$('productSalePrice').addEventListener('input',updateProductMarginPreview);
  $('productForm').addEventListener('submit',e=>{
    e.preventDefault();const oldId=$('productId').value,category=$('productCategory').value,brand=selectedProductBrand();if(!category){toast('Selecione a categoria primeiro.');return}if(!brand){toast('Selecione ou informe a marca.');$('productBrand').focus();return}if(referenceCategories.has(category)&&!selectedCodePrefix()){toast('Selecione a família/prefixo do código.');$('productCodeFamily').focus();return}if(referenceCategories.has(category)&&!$('productCodeReference').value.trim()){toast('Informe a referência/encaixe do produto.');$('productCodeReference').focus();return}const code=$('productCode').value.trim();if(!code){toast('Não foi possível montar o código do produto.');return}if(!oldId&&products.some(p=>norm(p.code)===norm(code))){toast('Já existe um produto com esse código.');return}const obj={
      id:oldId||('P-'+Date.now()),code,name:$('productName').value.trim(),brand,category,type:$('productType').value.trim(),stock:+$('productStock').value,pista:+$('productPista').value,minStock:+$('productMin').value,cost:nullableNumber($('productCost').value),salePrice:nullableNumber($('productSalePrice').value),location:$('productLocation').value.trim()
    };if(oldId){
      const i=products.findIndex(p=>p.id===oldId);products[i]=obj
    }else products.push(obj);save();bootstrap.Modal.getInstance($('productModal')).hide();renderAll();toast('Produto salvo com sucesso.')
  });
  $('movementProduct').addEventListener('change',()=>{
    const p=products.find(x=>x.id===$('movementProduct').value);if($('movementType').value==='sale')$('movementUnitPrice').value=n(p?.salePrice)>0?p.salePrice:'';updateSaleFields()
  });$('movementQty').addEventListener('input',updateSaleFields);$('movementUnitPrice').addEventListener('input',updateSaleFields);
  $('movementForm').addEventListener('submit',e=>{
    e.preventDefault();const type=$('movementType').value,id=$('movementProduct').value,qty=+$('movementQty').value,target=$('movementTarget').value,p=products.find(x=>x.id===id);if(!p||qty<1)return;const available=n(p[target]);if(type!=='entry'&&qty>available){
      toast(`Quantidade insuficiente em ${target==='pista'?'pista':'estoque'} (${available} disponível).`);return
    }
    if(type==='sale'){
      const unitPrice=nullableNumber($('movementUnitPrice').value);if(unitPrice===null||unitPrice<=0){
        toast('Informe o preço de venda desta venda.');return
      }
      p[target]=available-qty;movements.unshift({
        date:new Date().toISOString(),productId:p.id,productCode:p.code,productName:p.name,type:'sale',qty,target,unitPrice,unitCost:n(p.cost)>0?n(p.cost):0,user:session.name,note:$('movementNote').value.trim()
      });
    }else{
      p[target]=available+(type==='entry'?qty:-qty);movements.unshift({
        date:new Date().toISOString(),productId:p.id,productCode:p.code,productName:p.name,type,qty,target,user:session.name,note:$('movementNote').value.trim()
      });
    }
    save();bootstrap.Modal.getInstance($('movementModal')).hide();renderAll();toast(type==='entry'?'Entrada registrada.':type==='sale'?'Venda registrada.':'Saída registrada.')
  });
  $('exportBtn').onclick=exportCSV;$('exportFinanceBtn').onclick=exportFinance;$('financeMonth').addEventListener('change',renderFinance);$('showMissingPrices').onclick=()=>{
    missingPriceOnly=true;attentionOnly=false;currentCategory='';showView('inventory');$('categoryFilter').value='';$('statusFilter').value='';$('inventorySearch').value='';renderInventory();toast('Mostrando produtos com custo ou preço de venda faltando.')
  };
  $('resetDataBtn').onclick=()=>{
    if(confirm('Restaurar os dados iniciais importados do PDF? As alterações locais serão perdidas.')){
      products=structuredClone(window.SEED_PRODUCTS||[]);movements=[];migrate();save();renderAll();toast('Dados restaurados.')
    }
  };
  window.SM={
    edit:id=>openProduct(products.find(p=>p.id===decodeURIComponent(id))),move:(id,type)=>openMovement(type,decodeURIComponent(id))
  };
  load();if(session&&session.user&&USERS[session.user]){
    session={
      ...USERS[session.user],user:session.user
    };$('loginScreen').classList.add('d-none');$('app').classList.remove('d-none');applyRole();renderAll()
  }else save();
})();
