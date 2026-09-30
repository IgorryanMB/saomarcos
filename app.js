(async () => {
  'use strict';

  const SUPABASE_URL = 'https://voxyialbhxsaqewcwtyo.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XsLS0csjBTFR3YNgg0mNgA_QKUop5oq';

  const categories = ['Óleos','Filtro de óleo','Filtro de combustível','Ar do motor','Ar-condicionado','Aditivos'];
  const referenceCategories = new Set(['Filtro de óleo','Filtro de combustível','Ar do motor','Ar-condicionado']);
  const sequenceRules = {
    'Óleos': { prefix:'OLEO-', pad:3 },
    'Aditivos': { prefix:'ADIT-', pad:3 }
  };

  let db = null;
  let products = [];
  let movements = [];
  let session = null;
  let currentCategory = '';
  let attentionOnly = false;
  let missingPriceOnly = false;
  let realtimeChannel = null;
  let realtimeReloadTimer = null;

  const $ = id => document.getElementById(id);
  const norm = s => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function n(v){
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  function nullableNumber(v){
    if(v === null || v === undefined || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }

  function esc(s){
    return (s ?? '').toString().replace(/[&<>'"]/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[c]));
  }

  function total(p){
    return n(p.stock) + n(p.pista);
  }

  function status(p){
    const t = total(p);
    if(t <= 0) return 'zero';
    if(t <= n(p.minStock)) return 'low';
    return 'normal';
  }

  function statusLabel(s){
    return s === 'zero' ? 'Sem estoque' : s === 'low' ? 'Estoque baixo' : 'Normal';
  }

  function pill(s){
    return `<span class="status-pill status-${s}">${statusLabel(s)}</span>`;
  }

  function money(v){
    if(v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return '—';
    return Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  function qtyText(v, unit = ''){
    const number = Number(v);
    if(!Number.isFinite(number)) return '0';
    const text = number.toLocaleString('pt-BR', { maximumFractionDigits:3 });
    return unit ? `${text} ${unit}` : text;
  }

  function marginPct(cost, price){
    cost = nullableNumber(cost);
    price = nullableNumber(price);
    if(cost === null || price === null || price <= 0) return null;
    return ((price - cost) / price) * 100;
  }

  function marginText(p){
    const m = marginPct(p.cost, p.salePrice);
    return m === null ? '—' : `${m.toLocaleString('pt-BR',{ maximumFractionDigits:1 })}%`;
  }

  function toast(msg){
    if(!$('toastText') || !$('appToast')) return;
    $('toastText').textContent = msg;
    bootstrap.Toast.getOrCreateInstance($('appToast')).show();
  }

  function isAdmin(){
    return session?.role === 'admin';
  }

  function isSales(){
    return session?.role === 'sales';
  }

  function canSell(){
    return isAdmin() || isSales();
  }

  function setBusy(button, busy, busyText = 'Aguarde...'){
    if(!button) return;
    if(busy){
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${busyText}`;
    } else {
      button.disabled = false;
      if(button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  function setLoginMessage(message = '', type = 'danger'){
    const box = $('loginError');
    if(!box) return;
    box.classList.remove('alert-danger','alert-success','alert-warning','d-none');
    box.classList.add(`alert-${type}`);
    box.textContent = message;
    if(!message) box.classList.add('d-none');
  }

  function friendlyAuthError(error){
    const msg = String(error?.message || error || '');
    if(/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if(/email not confirmed/i.test(msg)) return 'Confirme o e-mail antes de entrar.';
    if(/user already registered/i.test(msg)) return 'Esse e-mail já possui cadastro. Use Entrar.';
    if(/password/i.test(msg) && /characters|least|short/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if(/database error saving new user/i.test(msg) || /not authorized|não autorizado|nao autorizado/i.test(msg)) return 'Esse e-mail não está autorizado para o sistema São Marcos.';
    if(/rate limit/i.test(msg)) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
    return msg || 'Não foi possível concluir a autenticação.';
  }

  function configureUi(){
    const loginUser = $('loginUser');
    if(loginUser){
      const label = loginUser.closest('.mb-3')?.querySelector('label');
      if(label) label.textContent = 'E-mail';
      loginUser.type = 'email';
      loginUser.autocomplete = 'email';
      loginUser.placeholder = 'seuemail@exemplo.com';
    }

    const demo = document.querySelector('.demo-box');
    if(demo){
      demo.innerHTML = '<strong>Acesso seguro:</strong> use um e-mail autorizado no sistema.';
    }

    const form = $('loginForm');
    if(form && !$('signupBtn')){
      const loginButton = form.querySelector('button[type="submit"]');
      const signupButton = document.createElement('button');
      signupButton.type = 'button';
      signupButton.id = 'signupBtn';
      signupButton.className = 'btn btn-outline-light w-100 mt-2';
      signupButton.innerHTML = '<i class="bi bi-person-plus me-2"></i>Primeiro acesso';
      loginButton?.insertAdjacentElement('afterend', signupButton);
      signupButton.addEventListener('click', handleSignup);
    }

    const settingsView = $('settingsView');
    if(settingsView){
      const title = settingsView.querySelector('.panel h5');
      const text = settingsView.querySelector('.panel p.text-secondary');
      if(title) title.textContent = 'Sincronização em nuvem';
      if(text) text.textContent = 'Produtos e movimentações agora ficam salvos no Supabase e sincronizam entre computador e celular.';
    }

    const resetButton = $('resetDataBtn');
    if(resetButton){
      resetButton.className = 'btn btn-outline-light';
      resetButton.innerHTML = '<i class="bi bi-cloud-arrow-down me-1"></i>Recarregar dados do Supabase';
    }

    ['productStock','productPista','productMin'].forEach(id => {
      const el = $(id);
      if(el){
        el.step = '0.01';
        el.min = '0';
      }
    });
  }

  function mapProduct(row){
    return {
      id: row.id,
      legacyId: row.legacy_id || '',
      erpCode: row.erp_code || '',
      barcode: row.barcode || '',
      code: row.code || '',
      name: row.name || '',
      brand: row.brand || '',
      category: row.category || '',
      type: row.type || '',
      stock: n(row.stock),
      pista: n(row.pista),
      minStock: n(row.min_stock),
      cost: nullableNumber(row.cost),
      salePrice: nullableNumber(row.sale_price),
      location: row.location || '',
      unit: row.unit || 'UN',
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function mapMovement(row){
    return {
      id: row.id,
      productId: row.product_id,
      productCode: row.product_code || '',
      productName: row.product_name || '',
      type: row.movement_type || 'exit',
      qty: n(row.qty),
      target: row.target || 'stock',
      unitPrice: nullableNumber(row.unit_price),
      unitCost: nullableNumber(row.unit_cost),
      note: row.note || '',
      user: row.created_by_name || '',
      date: row.created_at
    };
  }

  async function loadData(){
    const [productsResult, movementsResult] = await Promise.all([
      db.from('products')
        .select('id,legacy_id,erp_code,barcode,code,name,brand,category,type,stock,pista,min_stock,cost,sale_price,location,unit,is_active,created_at,updated_at')
        .eq('is_active', true)
        .order('name', { ascending:true }),
      db.from('movements')
        .select('id,product_id,product_code,product_name,movement_type,qty,target,unit_price,unit_cost,note,created_by_name,created_at')
        .order('created_at', { ascending:false })
        .limit(1000)
    ]);

    if(productsResult.error) throw productsResult.error;
    if(movementsResult.error) throw movementsResult.error;

    products = (productsResult.data || []).map(mapProduct);
    movements = (movementsResult.data || []).map(mapMovement);
  }

  async function fetchProfile(user){
    const { data, error } = await db
      .from('profiles')
      .select('display_name,role')
      .eq('id', user.id)
      .single();

    if(error) throw error;
    return data;
  }

  function applyRole(){
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('d-none', !isAdmin()));

    $('userName').textContent = session?.name || 'Usuário';
    $('userRole').textContent = isAdmin() ? 'Administrador' : isSales() ? 'Caixa / Vendas' : 'Somente consulta';
    $('userAvatar').textContent = (session?.name || 'U')[0].toUpperCase();

    const dashboardNav = document.querySelector('.sidebar .nav-link[data-view="dashboard"]');
    if(dashboardNav) dashboardNav.classList.toggle('d-none', isSales());

    if(isSales()){
      document.querySelectorAll('#inventoryView thead th.admin-only').forEach(th => {
        const label = th.textContent.trim();
        if(label === 'Venda' || label === 'Ações') th.classList.remove('d-none');
      });
    }
  }

  async function enterApp(user){
    const profile = await fetchProfile(user);

    session = {
      id: user.id,
      email: user.email || '',
      name: profile.display_name || user.email || 'Usuário',
      role: profile.role || 'viewer'
    };

    await loadData();

    $('loginScreen').classList.add('d-none');
    $('app').classList.remove('d-none');

    applyRole();
    renderAll();

    if(isSales()) showView('inventory');

    setupRealtime();
  }

  async function handleLogin(event){
    event.preventDefault();
    setLoginMessage();

    const email = $('loginUser').value.trim().toLowerCase();
    const password = $('loginPass').value;
    const button = event.submitter || $('loginForm').querySelector('button[type="submit"]');

    if(!email || !password){
      setLoginMessage('Informe o e-mail e a senha.');
      return;
    }

    setBusy(button, true, 'Entrando...');

    try{
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if(error) throw error;

      await enterApp(data.user);
    } catch(error){
      setLoginMessage(friendlyAuthError(error));
    } finally {
      setBusy(button, false);
    }
  }

  async function handleSignup(){
    setLoginMessage();

    const email = $('loginUser').value.trim().toLowerCase();
    const password = $('loginPass').value;
    const button = $('signupBtn');

    if(!email || !password){
      setLoginMessage('Digite o e-mail e uma senha para fazer o primeiro acesso.');
      return;
    }

    if(password.length < 6){
      setLoginMessage('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setBusy(button, true, 'Criando acesso...');

    try{
      const { data, error } = await db.auth.signUp({
        email,
        password
      });

      if(error) throw error;

      if(data.session && data.user){
        await enterApp(data.user);
      } else {
        setLoginMessage(
          'Cadastro criado. Confirme o e-mail recebido e depois clique em Entrar.',
          'success'
        );
      }
    } catch(error){
      setLoginMessage(friendlyAuthError(error));
    } finally {
      setBusy(button, false);
    }
  }

  async function logout(){
    try{
      if(realtimeChannel){
        await db.removeChannel(realtimeChannel);
      }

      await db.auth.signOut();
    } finally {
      location.reload();
    }
  }

  function showView(name){
    if(
      (name === 'movements' || name === 'finance' || name === 'settings') &&
      !isAdmin()
    ){
      return;
    }

    document.querySelectorAll('.view-section').forEach(v => {
      v.classList.add('d-none');
    });

    $(name + 'View').classList.remove('d-none');

    document.querySelectorAll('.sidebar .nav-link').forEach(b => {
      b.classList.remove('active');
    });

    const button = document.querySelector(
      `.sidebar .nav-link[data-view="${name}"]`
    );

    if(button){
      button.classList.add('active');
    }

    $('sidebar').classList.remove('open');

    if(name === 'inventory'){
      renderInventory();
    }

    if(name === 'movements'){
      renderMovements();
    }

    if(name === 'finance'){
      renderFinance();
    }
  }

  function renderDashboard(){
    const stats = {
      normal: 0,
      low: 0,
      zero: 0
    };

    products.forEach(p => {
      stats[status(p)]++;
    });

    $('statProducts').textContent = products.length;
    $('statNormal').textContent = stats.normal;
    $('statLow').textContent = stats.low;
    $('statZero').textContent = stats.zero;

    const attention = products
      .filter(p => status(p) !== 'normal')
      .sort((a,b) => total(a) - total(b))
      .slice(0,8);

    $('attentionTable').innerHTML = attention.map(p => `
      <tr>
        <td>
          <b>${esc(p.name)}</b>
          <small class="d-block text-secondary">${esc(p.code)}</small>
        </td>
        <td>${esc(p.category)}</td>
        <td>${qtyText(p.stock, p.unit === 'L' ? 'L' : '')}</td>
        <td>${qtyText(p.pista, p.unit === 'L' ? 'L' : '')}</td>
        <td><b>${qtyText(total(p), p.unit === 'L' ? 'L' : '')}</b></td>
        <td>${pill(status(p))}</td>
      </tr>
    `).join('') ||
    '<tr><td colspan="6" class="text-center py-4 text-secondary">Nenhum alerta.</td></tr>';

    const totals = categories.map(category => ({
      c: category,
      n: products
        .filter(p => p.category === category)
        .reduce((sum,p) => sum + total(p), 0)
    }));

    const max = Math.max(1, ...totals.map(x => x.n));

    $('categoryBars').innerHTML = totals.map(x => `
      <div class="category-row">
        <span>${esc(x.c)}</span>

        <div class="bar-bg">
          <div
            class="bar-fill"
            style="width:${Math.max(2, x.n / max * 100)}%"
          ></div>
        </div>

        <b class="text-end">
          ${Number(x.n.toFixed(2)).toLocaleString('pt-BR',{
            maximumFractionDigits:2
          })}${x.c === 'Óleos' ? ' L' : ''}
        </b>
      </div>
    `).join('');

    renderRecent();
  }

  function movementTypeLabel(movement){
    if(movement.type === 'entry'){
      return 'Entrada';
    }

    if(movement.type === 'sale'){
      return 'Venda';
    }

    return 'Saída';
  }

  function renderRecent(){
    $('recentMovements').innerHTML = movements.slice(0,5).map(m => `
      <div class="movement-item">
        <div>
          <b>${esc(m.productName)}</b>

          <small>
            ${new Date(m.date).toLocaleString('pt-BR')}
            •
            ${esc(m.target === 'pista' ? 'Pista' : 'Estoque')}
            •
            ${movementTypeLabel(m)}
          </small>
        </div>

        <b class="movement-value ${m.type}">
          ${m.type === 'entry' ? '+' : '-'}${qtyText(m.qty)}
        </b>
      </div>
    `).join('') ||
    '<div class="text-secondary text-center py-4">Sem movimentações ainda.</div>';
  }

  function fillCategorySelects(){
    const selectedFilter = $('categoryFilter').value;
    const selectedProductCategory = $('productCategory').value;

    $('categoryFilter').innerHTML =
      '<option value="">Todas as categorias</option>' +
      categories
        .map(c => `<option>${c}</option>`)
        .join('');

    $('productCategory').innerHTML =
      '<option value="">Selecione a categoria primeiro</option>' +
      categories
        .map(c => `<option>${c}</option>`)
        .join('');

    if(categories.includes(selectedFilter)){
      $('categoryFilter').value = selectedFilter;
    }

    if(categories.includes(selectedProductCategory)){
      $('productCategory').value = selectedProductCategory;
    }
  }

  function generateSequentialCode(category){
    const rule = sequenceRules[category];

    if(!rule){
      return '';
    }

    const prefix = rule.prefix.toUpperCase();

    const numbers = products
      .map(p => (p.code || '').toUpperCase())
      .filter(code => code.startsWith(prefix))
      .map(code => {
        const match = code.slice(prefix.length).match(/^(\d+)/);
        return match ? Number(match[1]) : 0;
      })
      .filter(number => number > 0);

    const next = numbers.length
      ? Math.max(...numbers) + 1
      : 1;

    return rule.prefix +
      (
        rule.pad
          ? String(next).padStart(rule.pad,'0')
          : next
      );
  }

  function extractCodeParts(code){
    const value = (code || '').trim().toUpperCase();
    const index = value.search(/\d/);

    if(index < 0){
      return {
        prefix:value,
        reference:''
      };
    }

    if(index === 0){
      return {
        prefix:'',
        reference:value
      };
    }

    return {
      prefix:value.slice(0,index),
      reference:value.slice(index)
    };
  }

  function brandsForCategory(category){
    return [...new Set(
      products
        .filter(p =>
          p.category === category &&
          String(p.brand || '').trim()
        )
        .map(p => String(p.brand).trim())
    )].sort((a,b) =>
      a.localeCompare(
        b,
        'pt-BR',
        { sensitivity:'base' }
      )
    );
  }

  function prefixesFor(category, brand){
    if(!category || !brand){
      return [];
    }

    const wanted = norm(brand);

    const values = products
      .filter(p =>
        p.category === category &&
        norm(p.brand) === wanted
      )
      .map(p => extractCodeParts(p.code).prefix)
      .filter(Boolean);

    return [...new Set(values)].sort((a,b) =>
      a.localeCompare(
        b,
        'pt-BR',
        { sensitivity:'base' }
      )
    );
  }

  function selectedProductBrand(){
    const value = $('productBrand').value;

    if(value === '__other__'){
      return $('productBrandCustom').value.trim();
    }

    return value.trim();
  }

  function selectedCodePrefix(){
    const value = $('productCodeFamily').value;

    if(value === '__other__'){
      return $('productCodeFamilyCustom').value.toUpperCase();
    }

    return value;
  }

  function fillBrandOptions(category, selected = ''){
    const brands = brandsForCategory(category);

    $('productBrand').innerHTML =
      '<option value="">Selecione a marca</option>' +
      brands
        .map(brand =>
          `<option value="${esc(brand)}">${esc(brand)}</option>`
        )
        .join('') +
      '<option value="__other__">Outra marca...</option>';

    if(selected){
      const found = brands.find(
        brand => norm(brand) === norm(selected)
      );

      if(found){
        $('productBrand').value = found;
      } else {
        $('productBrand').value = '__other__';
        $('productBrandCustom').value = selected;
        $('productBrandCustomWrap').classList.remove('d-none');
      }
    } else {
      $('productBrandCustom').value = '';
      $('productBrandCustomWrap').classList.add('d-none');
    }
  }

  function fillFamilyOptions(category, brand, selected = ''){
    const prefixes = prefixesFor(category, brand);

    $('productCodeFamily').innerHTML =
      '<option value="">Selecione a família/prefixo</option>' +
      prefixes
        .map(prefix =>
          `<option value="${esc(prefix)}">${esc(prefix.trim() || prefix)}</option>`
        )
        .join('') +
      '<option value="__other__">Outro prefixo...</option>';

    if(selected){
      const found = prefixes.find(prefix => prefix === selected);

      if(found){
        $('productCodeFamily').value = found;
      } else {
        $('productCodeFamily').value = '__other__';
        $('productCodeFamilyCustom').value = selected;
        $('productCodeFamilyCustomWrap').classList.remove('d-none');
      }
    } else {
      $('productCodeFamilyCustom').value = '';
      $('productCodeFamilyCustomWrap').classList.add('d-none');
    }
  }

  function setProductDetailFieldsEnabled(enabled){
    [
      'productName',
      'productType',
      'productStock',
      'productPista',
      'productMin',
      'productCost',
      'productSalePrice',
      'productLocation'
    ].forEach(id => {
      const el = $(id);

      if(el){
        el.disabled = !enabled;
      }
    });
  }

  function resetProductCodeFlow(){
    $('productCode').value = '';

    $('productBrand').disabled = true;
    $('productBrand').innerHTML =
      '<option value="">Selecione a categoria primeiro</option>';

    $('productBrandCustom').value = '';
    $('productBrandCustomWrap').classList.add('d-none');

    $('productCodeFamilyArea').classList.add('d-none');
    $('productCodeFamily').disabled = true;
    $('productCodeFamily').innerHTML =
      '<option value="">Selecione a marca primeiro</option>';

    $('productCodeFamilyCustom').value = '';
    $('productCodeFamilyCustomWrap').classList.add('d-none');

    $('productReferenceArea').classList.add('d-none');
    $('productCodeReference').value = '';
    $('productCodeReference').disabled = true;

    $('productCodePrefix').textContent = '';

    setProductDetailFieldsEnabled(false);
  }

  function updateFinalReferenceCode(){
    if(!referenceCategories.has($('productCategory').value)){
      return;
    }

    const prefix = selectedCodePrefix();
    const reference =
      $('productCodeReference').value
        .trim()
        .toUpperCase();

    $('productCodeReference').value = reference;
    $('productCodePrefix').textContent = prefix || '—';

    $('productCode').value =
      prefix && reference
        ? `${prefix}${reference}`
        : '';

    setProductDetailFieldsEnabled(
      Boolean(prefix && reference)
    );
  }

  function prepareBrandStep(){
    if($('productId').value){
      return;
    }

    const category = $('productCategory').value;

    resetProductCodeFlow();

    if(!category){
      return;
    }

    fillBrandOptions(category);
    $('productBrand').disabled = false;
  }

  function prepareCodeStep(){
    if($('productId').value){
      return;
    }

    const category = $('productCategory').value;
    const brand = selectedProductBrand();

    $('productCode').value = '';
    $('productCodeFamilyArea').classList.add('d-none');
    $('productReferenceArea').classList.add('d-none');

    $('productCodeFamily').disabled = true;
    $('productCodeReference').disabled = true;

    setProductDetailFieldsEnabled(false);

    if(!brand){
      return;
    }

    if(referenceCategories.has(category)){
      $('productCodeFamilyArea').classList.remove('d-none');

      fillFamilyOptions(category, brand);

      $('productCodeFamily').disabled = false;

      return;
    }

    const code = generateSequentialCode(category);

    $('productCode').value = code;

    setProductDetailFieldsEnabled(Boolean(code));
  }

  function prepareReferenceStep(){
    if($('productId').value){
      return;
    }

    const prefix = selectedCodePrefix();

    $('productCode').value = '';
    $('productCodeReference').value = '';

    setProductDetailFieldsEnabled(false);

    $('productCodeFamilyCustomWrap').classList.toggle(
      'd-none',
      $('productCodeFamily').value !== '__other__'
    );

    if(!prefix){
      $('productReferenceArea').classList.add('d-none');
      return;
    }

    $('productReferenceArea').classList.remove('d-none');
    $('productCodePrefix').textContent = prefix;
    $('productCodeReference').disabled = false;
    $('productCodeReference').focus();
  }

  function renderInventory(){
    const q = norm($('inventorySearch').value);
    const category = $('categoryFilter').value || currentCategory;

    let stateFilter = $('statusFilter').value;

    if(attentionOnly && !stateFilter){
      stateFilter = 'low';
    }

    const list = products.filter(p =>
      (!category || p.category === category) &&
      (
        !stateFilter ||
        (
          stateFilter === 'low'
            ? status(p) !== 'normal'
            : status(p) === stateFilter
        )
      ) &&
      (
        !missingPriceOnly ||
        nullableNumber(p.cost) === null ||
        n(p.cost) <= 0 ||
        nullableNumber(p.salePrice) === null ||
        n(p.salePrice) <= 0
      ) &&
      (
        !q ||
        norm([
          p.code,
          p.name,
          p.brand,
          p.category,
          p.type,
          p.location,
          p.erpCode,
          p.barcode
        ].join(' ')).includes(q)
      )
    );

    $('resultCount').textContent =
      `${list.length} produto${list.length === 1 ? '' : 's'}`;

    $('inventoryTable').innerHTML = list.map(p => `
      <tr>
        <td>
          <b>${esc(p.code)}</b>
        </td>

        <td>
          ${esc(p.name)}
        </td>

        <td>
          ${esc(p.brand)}
        </td>

        <td>
          ${esc(p.category)}
        </td>

        <td>
          ${qtyText(
            p.stock,
            p.unit === 'L' ? 'L' : ''
          )}
        </td>

        <td>
          ${qtyText(
            p.pista,
            p.unit === 'L' ? 'L' : ''
          )}
        </td>

        <td>
          <b>
            ${qtyText(
              total(p),
              p.unit === 'L' ? 'L' : ''
            )}
          </b>
        </td>

        <td>
          ${esc(p.location)}
        </td>

        <td>
          ${pill(status(p))}
        </td>

        <td class="admin-only ${isAdmin() ? '' : 'd-none'}">
          ${
            n(p.cost) > 0
              ? money(p.cost)
              : '<span class="text-warning">Não informado</span>'
          }
        </td>

        <td class="${canSell() ? '' : 'd-none'}">
          ${
            n(p.salePrice) > 0
              ? money(p.salePrice)
              : '<span class="text-warning">Não informado</span>'
          }
        </td>

        <td class="admin-only ${isAdmin() ? '' : 'd-none'}">
          ${marginText(p)}
        </td>

        <td class="${canSell() ? '' : 'd-none'}">
          <div class="action-btns">

            <button
              class="btn btn-sm btn-outline-warning"
              onclick="SM.move('${encodeURIComponent(p.id)}','sale')"
              title="Venda"
            >
              <i class="bi bi-cart-check"></i>
            </button>

            ${isAdmin() ? `
              <button
                class="btn btn-sm btn-outline-success"
                onclick="SM.move('${encodeURIComponent(p.id)}','entry')"
                title="Entrada"
              >
                <i class="bi bi-plus-lg"></i>
              </button>

              <button
                class="btn btn-sm btn-outline-danger"
                onclick="SM.move('${encodeURIComponent(p.id)}','exit')"
                title="Saída"
              >
                <i class="bi bi-dash-lg"></i>
              </button>

              <button
                class="btn btn-sm btn-outline-secondary"
                onclick="SM.edit('${encodeURIComponent(p.id)}')"
                title="Editar"
              >
                <i class="bi bi-pencil"></i>
              </button>
            ` : ''}

          </div>
        </td>
      </tr>
    `).join('') ||
    '<tr><td colspan="13" class="text-center py-5 text-secondary">Nenhum produto encontrado.</td></tr>';
  }

  function updateProductMarginPreview(){
    const cost =
      nullableNumber($('productCost').value);

    const price =
      nullableNumber($('productSalePrice').value);

    const margin =
      marginPct(cost, price);

    $('productMarginPreview').textContent =
      margin === null
        ? '—'
        : `${money(price - cost)} de lucro • ${margin.toLocaleString(
            'pt-BR',
            { maximumFractionDigits:1 }
          )}%`;
  }

  function openProduct(p = null){
    if(!isAdmin()){
      return;
    }

    const editing = Boolean(p);

    $('productModalTitle').textContent =
      editing
        ? 'Editar produto'
        : 'Novo produto';

    $('productId').value = p?.id || '';

    $('productCategory').disabled = false;
    $('productCategory').value = p?.category || '';

    $('productName').value = p?.name || '';
    $('productType').value = p?.type || '';
    $('productStock').value = p?.stock ?? 0;
    $('productPista').value = p?.pista ?? 0;
    $('productMin').value = p?.minStock ?? 3;

    $('productCost').value =
      n(p?.cost) > 0
        ? p.cost
        : '';

    $('productSalePrice').value =
      n(p?.salePrice) > 0
        ? p.salePrice
        : '';

    $('productLocation').value =
      p?.location || '';

    resetProductCodeFlow();

    if(editing){
      $('productCategory').disabled = true;

      fillBrandOptions(
        p.category,
        p.brand || ''
      );

      $('productBrand').disabled = true;
      $('productBrandCustom').disabled = true;

      const parts =
        extractCodeParts(p.code);

      if(referenceCategories.has(p.category)){
        $('productCodeFamilyArea').classList.remove('d-none');

        fillFamilyOptions(
          p.category,
          p.brand || '',
          parts.prefix
        );

        $('productCodeFamily').disabled = true;
        $('productCodeFamilyCustom').disabled = true;

        $('productReferenceArea').classList.remove('d-none');

        $('productCodePrefix').textContent =
          parts.prefix || '—';

        $('productCodeReference').value =
          parts.reference;

        $('productCodeReference').disabled = true;
      } else {
        $('productCodeFamilyArea').classList.add('d-none');
        $('productReferenceArea').classList.add('d-none');
      }

      $('productCode').value =
        p.code || '';

      setProductDetailFieldsEnabled(true);
    } else {
      $('productBrandCustom').disabled = false;
      $('productCodeFamilyCustom').disabled = false;
    }

    updateProductMarginPreview();

    bootstrap.Modal
      .getOrCreateInstance($('productModal'))
      .show();
  }

  function syncMovementQtyRules(){
    const product =
      products.find(
        x => x.id === $('movementProduct').value
      );

    if(!product){
      return;
    }

    const liters =
      product.unit === 'L';

    $('movementQty').min =
      liters ? '0.01' : '1';

    $('movementQty').step =
      liters ? '0.01' : '1';

    if(n($('movementQty').value) <= 0){
      $('movementQty').value =
        liters ? '0.01' : '1';
    }
  }

  function updateSaleFields(){
    const type =
      $('movementType').value;

    const product =
      products.find(
        x => x.id === $('movementProduct').value
      );

    const qty =
      Math.max(
        0.01,
        n($('movementQty').value)
      );

    $('saleFields').classList.toggle(
      'd-none',
      type !== 'sale'
    );

    if(type !== 'sale'){
      return;
    }

    const price =
      nullableNumber(
        $('movementUnitPrice').value
      );

    const cost =
      nullableNumber(product?.cost);

    $('movementUnitCost').textContent =
      cost && cost > 0
        ? money(cost)
        : 'Não informado';

    if(price === null || price <= 0){
      $('movementSaleSummary').textContent =
        'Informe o preço de venda';
      return;
    }

    const revenue =
      price * qty;

    if(isSales()){
      $('movementSaleSummary').textContent =
        `${money(revenue)} total da venda`;

      return;
    }

    const grossCost =
      (cost && cost > 0 ? cost : 0) * qty;

    const profit =
      revenue - grossCost;

    const margin =
      cost && cost > 0
        ? marginPct(cost, price)
        : null;

    $('movementSaleSummary').textContent =
      `${money(revenue)} faturamento • ${
        cost && cost > 0
          ? money(profit) +
            ' lucro bruto' +
            (
              margin !== null
                ? ' • ' +
                  margin.toLocaleString(
                    'pt-BR',
                    { maximumFractionDigits:1 }
                  ) +
                  '%'
                : ''
            )
          : 'custo não informado'
      }`;
  }

  function openMovement(type, id = null){
    if(!canSell()){
      return;
    }

    if(isSales() && type !== 'sale'){
      toast(
        'Este acesso permite somente registrar vendas.'
      );

      return;
    }

    $('movementType').value = type;

    $('movementTitle').textContent =
      type === 'entry'
        ? 'Entrada de estoque'
        : type === 'sale'
          ? 'Registrar venda'
          : 'Saída de estoque';

    $('movementSubmit').className =
      `btn ${
        type === 'entry'
          ? 'btn-success'
          : type === 'sale'
            ? 'btn-warning'
            : 'btn-danger'
      }`;

    $('movementProduct').innerHTML =
      products
        .slice()
        .sort((a,b) =>
          a.name.localeCompare(b.name)
        )
        .map(p =>
          `<option value="${esc(p.id)}">${
            esc(p.code)
          } — ${
            esc(p.name)
          } (${
            qtyText(
              total(p),
              p.unit === 'L'
                ? 'L'
                : ''
            )
          })</option>`
        )
        .join('');

    if(id){
      $('movementProduct').value = id;
    }

    $('movementQty').value = '1';
    $('movementTarget').value = 'stock';
    $('movementNote').value = '';

    syncMovementQtyRules();

    const product =
      products.find(
        x => x.id === $('movementProduct').value
      );

    $('movementUnitPrice').value =
      n(product?.salePrice) > 0
        ? product.salePrice
        : '';

    $('movementUnitPrice').readOnly =
      isSales();

    const costWrap =
      $('movementUnitCost')
        ?.closest('.col-6');

    if(costWrap){
      costWrap.classList.toggle(
        'd-none',
        isSales()
      );
    }

    updateSaleFields();

    bootstrap.Modal
      .getOrCreateInstance($('movementModal'))
      .show();
  }

  function renderMovements(){
    $('movementTable').innerHTML =
      movements.map(m => {

        const badge =
          m.type === 'entry'
            ? '<span class="badge text-bg-success">Entrada</span>'
            : m.type === 'sale'
              ? '<span class="badge text-bg-warning">Venda</span>'
              : '<span class="badge text-bg-danger">Saída</span>';

        const value =
          m.type === 'sale'
            ? money(
                n(m.unitPrice) *
                n(m.qty)
              )
            : '—';

        return `
          <tr>
            <td>
              ${new Date(m.date).toLocaleString('pt-BR')}
            </td>

            <td>
              <b>${esc(m.productName)}</b>
              <small class="d-block text-secondary">
                ${esc(m.productCode)}
              </small>
            </td>

            <td>
              ${badge}
            </td>

            <td>
              ${
                m.type === 'entry'
                  ? '+'
                  : '-'
              }${qtyText(m.qty)}
            </td>

            <td>
              ${
                m.target === 'pista'
                  ? 'Pista'
                  : 'Estoque'
              }
            </td>

            <td>
              ${value}
            </td>

            <td>
              ${esc(m.user || 'Usuário')}
            </td>
          </tr>
        `;
      }).join('') ||
      '<tr><td colspan="7" class="text-center py-5 text-secondary">Nenhuma movimentação registrada.</td></tr>';
  }

  function monthKey(date){
    const x = new Date(date);

    return `${x.getFullYear()}-${String(
      x.getMonth() + 1
    ).padStart(2,'0')}`;
  }

  function selectedMonth(){
    return $('financeMonth').value ||
      monthKey(new Date());
  }

  function salesForMonth(){
    const key = selectedMonth();

    return movements.filter(m =>
      m.type === 'sale' &&
      monthKey(m.date) === key
    );
  }

  function renderFinance(){
    if(!isAdmin()){
      return;
    }

    const sales =
      salesForMonth();

    let revenue = 0;
    let cost = 0;
    let units = 0;

    const byProduct =
      new Map();

    sales.forEach(m => {
      const qty = n(m.qty);

      const r =
        n(m.unitPrice) *
        qty;

      const c =
        n(m.unitCost) *
        qty;

      revenue += r;
      cost += c;
      units += qty;

      const key =
        m.productId ||
        m.productCode;

      const row =
        byProduct.get(key) || {
          name:m.productName,
          code:m.productCode,
          qty:0,
          revenue:0,
          cost:0
        };

      row.qty += qty;
      row.revenue += r;
      row.cost += c;

      byProduct.set(
        key,
        row
      );
    });

    const profit =
      revenue - cost;

    const margin =
      revenue > 0
        ? (profit / revenue) * 100
        : 0;

    $('finRevenue').textContent =
      money(revenue);

    $('finCost').textContent =
      money(cost);

    $('finProfit').textContent =
      money(profit);

    $('finMargin').textContent =
      `${margin.toLocaleString(
        'pt-BR',
        { maximumFractionDigits:1 }
      )}%`;

    $('finUnits').textContent =
      qtyText(units);

    $('finSalesCount').textContent =
      `${sales.length} venda${
        sales.length === 1 ? '' : 's'
      }`;

    const missingCost =
      products.filter(
        p => n(p.cost) <= 0
      ).length;

    const missingSale =
      products.filter(
        p => n(p.salePrice) <= 0
      ).length;

    $('missingCost').textContent =
      missingCost;

    $('missingSale').textContent =
      missingSale;

    $('stockCostValue').textContent =
      money(
        products.reduce(
          (sum,p) =>
            sum +
            (
              n(p.cost) *
              total(p)
            ),
          0
        )
      );

    $('stockSaleValue').textContent =
      money(
        products.reduce(
          (sum,p) =>
            sum +
            (
              n(p.salePrice) *
              total(p)
            ),
          0
        )
      );

    const top =
      [...byProduct.values()]
        .sort(
          (a,b) =>
            b.revenue -
            a.revenue
        )
        .slice(0,8);

    $('topSalesTable').innerHTML =
      top.map(x => `
        <tr>
          <td>
            <b>${esc(x.name)}</b>
            <small class="d-block text-secondary">
              ${esc(x.code)}
            </small>
          </td>

          <td>
            ${qtyText(x.qty)}
          </td>

          <td>
            ${money(x.revenue)}
          </td>

          <td>
            ${money(x.revenue - x.cost)}
          </td>
        </tr>
      `).join('') ||
      '<tr><td colspan="4" class="text-center py-4 text-secondary">Nenhuma venda registrada neste mês.</td></tr>';

    $('financeSalesTable').innerHTML =
      sales.map(m => {
        const r =
          n(m.unitPrice) *
          n(m.qty);

        const c =
          n(m.unitCost) *
          n(m.qty);

        const p =
          r - c;

        const mg =
          r > 0
            ? (p / r) * 100
            : 0;

        return `
          <tr>
            <td>
              ${new Date(m.date).toLocaleString('pt-BR')}
            </td>

            <td>
              <b>${esc(m.productName)}</b>
              <small class="d-block text-secondary">
                ${esc(m.productCode)}
              </small>
            </td>

            <td>
              ${qtyText(m.qty)}
            </td>

            <td>
              ${money(m.unitPrice)}
            </td>

            <td>
              ${
                n(m.unitCost) > 0
                  ? money(m.unitCost)
                  : '<span class="text-warning">Não informado</span>'
              }
            </td>

            <td>
              ${money(r)}
            </td>

            <td>
              ${money(p)}
            </td>

            <td>
              ${mg.toLocaleString(
                'pt-BR',
                { maximumFractionDigits:1 }
              )}%
            </td>
          </tr>
        `;
      }).join('') ||
      '<tr><td colspan="8" class="text-center py-5 text-secondary">Nenhuma venda registrada neste mês.</td></tr>';
  }

  function renderAll(){
    fillCategorySelects();
    renderDashboard();
    renderInventory();
    renderMovements();

    if(
      $('financeMonth') &&
      !$('financeMonth').value
    ){
      $('financeMonth').value =
        monthKey(new Date());
    }

    renderFinance();

    const now =
      new Date();

    $('todayDate').textContent =
      now.toLocaleDateString(
        'pt-BR',
        {
          weekday:'long',
          day:'2-digit',
          month:'long'
        }
      );

    $('todayTime').textContent =
      now.toLocaleTimeString(
        'pt-BR',
        {
          hour:'2-digit',
          minute:'2-digit'
        }
      );

    $('greeting').textContent =
      `Olá, ${session?.name || 'Usuário'}!`;
  }

  function csvDownload(rows, name){
    const csv =
      '\ufeff' +
      rows
        .map(row =>
          row
            .map(value =>
              '"' +
              String(value ?? '')
                .replaceAll('"','""') +
              '"'
            )
            .join(';')
        )
        .join('\n');

    const link =
      document.createElement('a');

    link.href =
      URL.createObjectURL(
        new Blob(
          [csv],
          { type:'text/csv' }
        )
      );

    link.download = name;

    link.click();

    setTimeout(
      () =>
        URL.revokeObjectURL(
          link.href
        ),
      500
    );
  }

  function exportCSV(){
    const rows = [
      [
        'Data',
        'Código',
        'Produto',
        'Tipo',
        'Quantidade',
        'Destino',
        'Preço Unitário',
        'Custo Unitário',
        'Usuário',
        'Observação'
      ],

      ...movements.map(m => [
        new Date(m.date)
          .toLocaleString('pt-BR'),
        m.productCode,
        m.productName,
        m.type,
        m.qty,
        m.target,
        m.unitPrice ?? '',
        m.unitCost ?? '',
        m.user,
        m.note || ''
      ])
    ];

    csvDownload(
      rows,
      'movimentacoes-sao-marcos.csv'
    );
  }

  function exportFinance(){
    const sales =
      salesForMonth();

    const rows = [
      [
        'Fechamento',
        selectedMonth()
      ],

      [],

      [
        'Data',
        'Código',
        'Produto',
        'Qtd',
        'Preço unitário',
        'Custo unitário',
        'Faturamento',
        'Custo',
        'Lucro bruto'
      ],

      ...sales.map(m => {

        const revenue =
          n(m.unitPrice) *
          n(m.qty);

        const cost =
          n(m.unitCost) *
          n(m.qty);

        return [
          new Date(m.date)
            .toLocaleString('pt-BR'),

          m.productCode,
          m.productName,
          m.qty,

          n(m.unitPrice)
            .toFixed(2),

          n(m.unitCost)
            .toFixed(2),

          revenue.toFixed(2),
          cost.toFixed(2),

          (revenue - cost)
            .toFixed(2)
        ];
      })
    ];

    csvDownload(
      rows,
      `fechamento-${selectedMonth()}-sao-marcos.csv`
    );
  }

  async function saveProduct(event){
    event.preventDefault();

    if(!isAdmin()){
      return;
    }

    const submitButton =
      event.submitter ||
      $('productForm')
        .querySelector(
          'button[type="submit"]'
        );

    const oldId =
      $('productId').value;

    const category =
      $('productCategory').value;

    const brand =
      selectedProductBrand();

    if(!category){
      toast(
        'Selecione a categoria primeiro.'
      );

      return;
    }

    if(!brand){
      toast(
        'Selecione ou informe a marca.'
      );

      $('productBrand').focus();

      return;
    }

    if(
      referenceCategories.has(category) &&
      !selectedCodePrefix()
    ){
      toast(
        'Selecione a família/prefixo do código.'
      );

      $('productCodeFamily').focus();

      return;
    }

    if(
      referenceCategories.has(category) &&
      !$('productCodeReference')
        .value
        .trim()
    ){
      toast(
        'Informe a referência/encaixe do produto.'
      );

      $('productCodeReference').focus();

      return;
    }

    const code =
      $('productCode')
        .value
        .trim();

    if(!code){
      toast(
        'Não foi possível montar o código do produto.'
      );

      return;
    }

    if(
      !oldId &&
      products.some(
        p =>
          norm(p.code) ===
          norm(code)
      )
    ){
      toast(
        'Já existe um produto com esse código.'
      );

      return;
    }

    const existing =
      oldId
        ? products.find(
            p => p.id === oldId
          )
        : null;

    const payload = {
      code,

      name:
        $('productName')
          .value
          .trim(),

      brand,

      category,

      type:
        $('productType')
          .value
          .trim(),

      stock:
        n(
          $('productStock').value
        ),

      pista:
        n(
          $('productPista').value
        ),

      min_stock:
        n(
          $('productMin').value
        ),

      cost:
        nullableNumber(
          $('productCost').value
        ),

      sale_price:
        nullableNumber(
          $('productSalePrice').value
        ),

      location:
        $('productLocation')
          .value
          .trim(),

      unit:
        existing?.unit || 'UN',

      updated_by:
        session.id
    };

    if(!oldId){
      payload.created_by =
        session.id;
    }

    setBusy(
      submitButton,
      true,
      'Salvando...'
    );

    try{
      let result;

      if(oldId){
        result =
          await db
            .from('products')
            .update(payload)
            .eq('id', oldId)
            .select('id')
            .single();
      } else {
        result =
          await db
            .from('products')
            .insert(payload)
            .select('id')
            .single();
      }

      if(result.error){
        throw result.error;
      }

      await loadData();

      bootstrap.Modal
        .getInstance(
          $('productModal')
        )
        ?.hide();

      renderAll();

      toast(
        'Produto salvo com sucesso.'
      );
    } catch(error){
      console.error(error);

      toast(
        error?.message ||
        'Não foi possível salvar o produto.'
      );
    } finally {
      setBusy(
        submitButton,
        false
      );
    }
  }

  async function saveMovement(event){
    event.preventDefault();

    if(!canSell()){
      return;
    }

    const button =
      event.submitter ||
      $('movementSubmit');

    const type =
      $('movementType').value;

    if(
      isSales() &&
      type !== 'sale'
    ){
      toast(
        'Este acesso permite somente registrar vendas.'
      );

      return;
    }

    const id =
      $('movementProduct').value;

    const qty =
      n(
        $('movementQty').value
      );

    const target =
      $('movementTarget').value;

    const product =
      products.find(
        p => p.id === id
      );

    if(
      !product ||
      qty <= 0
    ){
      return;
    }

    const available =
      n(product[target]);

    if(
      type !== 'entry' &&
      qty > available
    ){
      toast(
        `Quantidade insuficiente em ${
          target === 'pista'
            ? 'pista'
            : 'estoque'
        } (${
          qtyText(
            available,
            product.unit === 'L'
              ? 'L'
              : ''
          )
        } disponível).`
      );

      return;
    }

    const unitPrice =
      type === 'sale'
        ? nullableNumber(
            $('movementUnitPrice').value
          )
        : null;

    if(
      type === 'sale' &&
      (
        unitPrice === null ||
        unitPrice <= 0
      )
    ){
      toast(
        'Informe o preço de venda desta venda.'
      );

      return;
    }

    setBusy(
      button,
      true,
      'Salvando...'
    );

    try{
      const { error } =
        await db.rpc(
          'register_movement',
          {
            p_product_id: id,
            p_movement_type: type,
            p_qty: qty,
            p_target: target,
            p_unit_price: unitPrice,
            p_note:
              $('movementNote')
                .value
                .trim()
          }
        );

      if(error){
        throw error;
      }

      await loadData();

      bootstrap.Modal
        .getInstance(
          $('movementModal')
        )
        ?.hide();

      renderAll();

      toast(
        type === 'entry'
          ? 'Entrada registrada.'
          : type === 'sale'
            ? 'Venda registrada.'
            : 'Saída registrada.'
      );

    } catch(error){
      console.error(error);

      toast(
        error?.message ||
        'Não foi possível registrar a movimentação.'
      );

    } finally {
      setBusy(
        button,
        false
      );
    }
  }

  function queueRealtimeReload(){
    clearTimeout(
      realtimeReloadTimer
    );

    realtimeReloadTimer =
      setTimeout(
        async () => {
          try{
            await loadData();
            renderAll();
          } catch(error){
            console.error(
              'Erro ao atualizar dados em tempo real:',
              error
            );
          }
        },
        250
      );
  }

  function setupRealtime(){
    if(realtimeChannel){
      db.removeChannel(
        realtimeChannel
      );
    }

    realtimeChannel =
      db
        .channel('sao-marcos-live')

        .on(
          'postgres_changes',
          {
            event:'*',
            schema:'public',
            table:'products'
          },
          queueRealtimeReload
        )

        .on(
          'postgres_changes',
          {
            event:'*',
            schema:'public',
            table:'movements'
          },
          queueRealtimeReload
        )

        .subscribe();
  }

  function bindEvents(){
    $('loginForm')
      .addEventListener(
        'submit',
        handleLogin
      );

    $('logoutBtn').onclick =
      logout;

    $('menuBtn').onclick =
      () =>
        $('sidebar')
          .classList
          .toggle('open');

    document
      .querySelectorAll('[data-view]')
      .forEach(button =>
        button.addEventListener(
          'click',
          () => {

            if(
              button.dataset.filter ===
              'attention'
            ){
              attentionOnly = true;
              missingPriceOnly = false;
              currentCategory = '';

              $('categoryFilter').value = '';
              $('statusFilter').value = '';
            }

            showView(
              button.dataset.view
            );
          }
        )
      );

    document
      .querySelectorAll('.category-link')
      .forEach(button =>
        button.addEventListener(
          'click',
          () => {

            attentionOnly = false;
            missingPriceOnly = false;

            currentCategory =
              button.dataset.category;

            showView('inventory');

            $('categoryFilter').value =
              currentCategory;

            renderInventory();
          }
        )
      );

    document
      .querySelectorAll('[data-action]')
      .forEach(button =>
        button.addEventListener(
          'click',
          () => {

            if(
              button.dataset.action ===
              'new'
            ){
              openProduct();
            } else {
              openMovement(
                button.dataset.action
              );
            }

          }
        )
      );

    $('newProductBtn').onclick =
      () => openProduct();

    $('inventorySearch')
      .addEventListener(
        'input',
        () => {
          attentionOnly = false;
          missingPriceOnly = false;

          renderInventory();
        }
      );

    $('categoryFilter')
      .addEventListener(
        'change',
        () => {
          currentCategory = '';
          attentionOnly = false;
          missingPriceOnly = false;

          renderInventory();
        }
      );

    $('statusFilter')
      .addEventListener(
        'change',
        () => {
          attentionOnly = false;
          missingPriceOnly = false;

          renderInventory();
        }
      );

    $('globalSearch')
      .addEventListener(
        'input',
        event => {

          if(event.target.value){
            showView('inventory');

            $('inventorySearch').value =
              event.target.value;

            renderInventory();
          }

        }
      );

    document.addEventListener(
      'keydown',
      event => {

        if(
          event.ctrlKey &&
          event.key.toLowerCase() === 'k'
        ){
          event.preventDefault();

          $('globalSearch').focus();
        }

      }
    );

    $('productCategory')
      .addEventListener(
        'change',
        prepareBrandStep
      );

    $('productBrand')
      .addEventListener(
        'change',
        () => {

          if($('productId').value){
            return;
          }

          $('productBrandCustomWrap')
            .classList
            .toggle(
              'd-none',
              $('productBrand').value !==
              '__other__'
            );

          if(
            $('productBrand').value ===
            '__other__'
          ){
            $('productBrandCustom').value =
              '';

            $('productBrandCustom').focus();
          }

          prepareCodeStep();
        }
      );

    $('productBrandCustom')
      .addEventListener(
        'input',
        prepareCodeStep
      );

    $('productCodeFamily')
      .addEventListener(
        'change',
        () => {

          if($('productId').value){
            return;
          }

          if(
            $('productCodeFamily').value ===
            '__other__'
          ){
            $('productCodeFamilyCustom').value =
              '';

            $('productCodeFamilyCustomWrap')
              .classList
              .remove('d-none');

            $('productCodeFamilyCustom')
              .focus();
          }

          prepareReferenceStep();
        }
      );

    $('productCodeFamilyCustom')
      .addEventListener(
        'input',
        () => {

          if($('productId').value){
            return;
          }

          const prefix =
            $('productCodeFamilyCustom')
              .value
              .trim()
              .toUpperCase();

          $('productCodeFamilyCustom').value =
            prefix;

          $('productCodePrefix').textContent =
            prefix || '—';

          if(prefix){
            $('productReferenceArea')
              .classList
              .remove('d-none');

            $('productCodeReference').disabled =
              false;
          } else {
            $('productReferenceArea')
              .classList
              .add('d-none');

            $('productCodeReference').value =
              '';

            $('productCode').value =
              '';

            setProductDetailFieldsEnabled(
              false
            );
          }

          updateFinalReferenceCode();
        }
      );

    $('productCodeReference')
      .addEventListener(
        'input',
        updateFinalReferenceCode
      );

    $('productCost')
      .addEventListener(
        'input',
        updateProductMarginPreview
      );

    $('productSalePrice')
      .addEventListener(
        'input',
        updateProductMarginPreview
      );

    $('productForm')
      .addEventListener(
        'submit',
        saveProduct
      );

    $('movementProduct')
      .addEventListener(
        'change',
        () => {

          const product =
            products.find(
              p =>
                p.id ===
                $('movementProduct').value
            );

          syncMovementQtyRules();

          if(
            $('movementType').value ===
            'sale'
          ){
            $('movementUnitPrice').value =
              n(product?.salePrice) > 0
                ? product.salePrice
                : '';
          }

          $('movementUnitPrice').readOnly =
            isSales();

          updateSaleFields();
        }
      );

    $('movementQty')
      .addEventListener(
        'input',
        updateSaleFields
      );

    $('movementUnitPrice')
      .addEventListener(
        'input',
        updateSaleFields
      );

    $('movementForm')
      .addEventListener(
        'submit',
        saveMovement
      );

    $('exportBtn').onclick =
      exportCSV;

    $('exportFinanceBtn').onclick =
      exportFinance;

    $('financeMonth')
      .addEventListener(
        'change',
        renderFinance
      );

    $('showMissingPrices').onclick =
      () => {

        missingPriceOnly = true;
        attentionOnly = false;
        currentCategory = '';

        showView('inventory');

        $('categoryFilter').value = '';
        $('statusFilter').value = '';
        $('inventorySearch').value = '';

        renderInventory();

        toast(
          'Mostrando produtos com custo ou preço de venda faltando.'
        );
      };

    $('resetDataBtn').onclick =
      async () => {

        const button =
          $('resetDataBtn');

        setBusy(
          button,
          true,
          'Atualizando...'
        );

        try{
          await loadData();

          renderAll();

          toast(
            'Dados atualizados pelo Supabase.'
          );

        } catch(error){
          console.error(error);

          toast(
            'Não foi possível recarregar os dados.'
          );

        } finally {
          setBusy(
            button,
            false
          );
        }
      };
  }

  window.SM = {
    edit: id =>
      openProduct(
        products.find(
          p =>
            p.id ===
            decodeURIComponent(id)
        )
      ),

    move: (id,type) =>
      openMovement(
        type,
        decodeURIComponent(id)
      )
  };

  async function boot(){
    configureUi();
    bindEvents();

    try{
      const { createClient } =
        await import(
          'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
        );

      db =
        createClient(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          }
        );

      db.auth.onAuthStateChange(
        event => {

          if(
            event === 'SIGNED_OUT' &&
            session
          ){
            location.reload();
          }

        }
      );

      const { data, error } =
        await db.auth.getSession();

      if(error){
        throw error;
      }

      if(data.session?.user){
        try{
          await enterApp(
            data.session.user
          );

        } catch(error){
          console.error(error);

          await db.auth.signOut();

          setLoginMessage(
            'Não foi possível carregar seu perfil. Tente entrar novamente.'
          );
        }
      }

    } catch(error){
      console.error(
        'Falha ao iniciar Supabase:',
        error
      );

      setLoginMessage(
        'Não foi possível conectar ao servidor agora. Recarregue a página e tente novamente.',
        'warning'
      );
    }
  }

  await boot();
})();
