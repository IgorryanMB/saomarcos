  'use strict';

  const SUPABASE_URL = 'https://voxyialbhxsaqewcwtyo.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XsLS0csjBTFR3YNgg0mNgA_QKUop5oq';

  const categories = [
    'Óleos',
    'Filtro de óleo',
    'Filtro de combustível',
    'Ar do motor',
    'Ar-condicionado',
    'Aditivos'
  ];

  const referenceCategories = new Set([
    'Filtro de óleo',
    'Filtro de combustível',
    'Ar do motor',
    'Ar-condicionado'
  ]);

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

  const norm = s =>
    (s ?? '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,' ')
      .trim();

  function n(v){
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  function nullableNumber(v){
    if(v === null || v === undefined || v === ''){
      return null;
    }

    const x = Number(v);

    return Number.isFinite(x)
      ? x
      : null;
  }

  function esc(s){
    return (s ?? '')
      .toString()
      .replace(
        /[&<>'"]/g,
        c => ({
          '&':'&amp;',
          '<':'&lt;',
          '>':'&gt;',
          "'":'&#39;',
          '"':'&quot;'
        }[c])
      );
  }

  function total(p){
    return n(p.stock) + n(p.pista);
  }

  function status(p){
    const t = total(p);

    if(t <= 0){
      return 'zero';
    }

    if(t <= n(p.minStock)){
      return 'low';
    }

    return 'normal';
  }

  function statusLabel(s){
    return s === 'zero'
      ? 'Sem estoque'
      : s === 'low'
        ? 'Estoque baixo'
        : 'Normal';
  }

  function pill(s){
    return `
      <span class="status-pill status-${s}">
        ${statusLabel(s)}
      </span>
    `;
  }

  function money(v){
    if(
      v === null ||
      v === undefined ||
      v === '' ||
      !Number.isFinite(Number(v))
    ){
      return '—';
    }

    return Number(v).toLocaleString(
      'pt-BR',
      {
        style:'currency',
        currency:'BRL'
      }
    );
  }

  function qtyText(v, unit = ''){
    const number = Number(v);

    if(!Number.isFinite(number)){
      return '0';
    }

    const text = number.toLocaleString(
      'pt-BR',
      {
        maximumFractionDigits:3
      }
    );

    return unit
      ? `${text} ${unit}`
      : text;
  }

  function marginPct(cost, price){
    cost = nullableNumber(cost);
    price = nullableNumber(price);

    if(
      cost === null ||
      price === null ||
      price <= 0
    ){
      return null;
    }

    return (
      (price - cost) /
      price
    ) * 100;
  }

  function marginText(p){
    const m = marginPct(
      p.cost,
      p.salePrice
    );

    return m === null
      ? '—'
      : `${m.toLocaleString(
          'pt-BR',
          {
            maximumFractionDigits:1
          }
        )}%`;
  }

  function toast(msg){
    if(
      !$('toastText') ||
      !$('appToast')
    ){
      return;
    }

    $('toastText').textContent = msg;

    bootstrap.Toast
      .getOrCreateInstance(
        $('appToast')
      )
      .show();
  }

  function isAdmin(){
    return session?.role === 'admin';
  }

  function isOwner(){
    return (
      session?.email
        ?.toLowerCase() ===
      'igorrian888@gmail.com'
    );
  }

  function isSales(){
    return session?.role === 'sales';
  }

  function canSell(){
    return (
      isAdmin() ||
      isSales()
    );
  }

  function setBusy(
    button,
    busy,
    busyText = 'Aguarde...'
  ){
    if(!button){
      return;
    }

    if(busy){
      button.dataset.originalHtml =
        button.innerHTML;

      button.disabled = true;

      button.innerHTML = `
        <span
          class="spinner-border spinner-border-sm me-2"
          aria-hidden="true"
        ></span>
        ${busyText}
      `;
    } else {
      button.disabled = false;

      if(button.dataset.originalHtml){
        button.innerHTML =
          button.dataset.originalHtml;
      }
    }
  }

  function setLoginMessage(
    message = '',
    type = 'danger'
  ){
    const box = $('loginError');

    if(!box){
      return;
    }

    box.classList.remove(
      'alert-danger',
      'alert-success',
      'alert-warning',
      'd-none'
    );

    box.classList.add(
      `alert-${type}`
    );

    box.textContent =
      message;

    if(!message){
      box.classList.add(
        'd-none'
      );
    }
  }

  function friendlyAuthError(error){
    const msg =
      String(
        error?.message ||
        error ||
        ''
      );

    if(
      /invalid login credentials/i
        .test(msg)
    ){
      return 'E-mail ou senha incorretos.';
    }

    if(
      /email not confirmed/i
        .test(msg)
    ){
      return 'Confirme o e-mail antes de entrar.';
    }

    if(
      /user already registered/i
        .test(msg)
    ){
      return 'Esse e-mail já possui cadastro. Use Entrar.';
    }

    if(
      /password/i.test(msg) &&
      /characters|least|short/i.test(msg)
    ){
      return 'A senha precisa ter pelo menos 6 caracteres.';
    }

    if(
      /database error saving new user/i.test(msg) ||
      /not authorized|não autorizado|nao autorizado/i.test(msg)
    ){
      return 'Esse e-mail não está autorizado para o sistema São Marcos.';
    }

    if(
      /rate limit/i.test(msg)
    ){
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
    }

    return 'Não foi possível concluir a autenticação. Tente novamente.';
  }

  function friendlyDataError(
    error,
    fallback =
      'Não foi possível concluir esta operação.'
  ){
    const msg =
      String(
        error?.message ||
        error ||
        ''
      );

    if(
      /permission denied|row-level security|row level security|rls|permiss[aã]o insuficiente|sem acesso|not authorized|unauthorized|forbidden/i
        .test(msg)
    ){
      return 'Você não tem permissão para realizar esta ação.';
    }

    if(
      /insufficient|quantidade insuficiente|estoque insuficiente/i
        .test(msg)
    ){
      return 'Quantidade insuficiente para concluir a operação.';
    }

    if(
      /produto n[aã]o encontrado|product not found/i
        .test(msg)
    ){
      return 'Produto não encontrado ou indisponível.';
    }

    if(
      /duplicate|unique constraint|already exists|já existe|ja existe/i
        .test(msg)
    ){
      return 'Já existe um registro com essas informações.';
    }

    if(
      /network|fetch|failed to fetch|timeout|connection/i
        .test(msg)
    ){
      return 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
    }

    return fallback;
  }

  function configureUi(){
    const loginUser =
      $('loginUser');

    if(loginUser){
      const label =
        loginUser
          .closest('.mb-3')
          ?.querySelector('label');

      if(label){
        label.textContent =
          'E-mail';
      }

      loginUser.type =
        'email';

      loginUser.autocomplete =
        'email';

      loginUser.placeholder =
        'seuemail@exemplo.com';
    }

    const demo =
      document.querySelector(
        '.demo-box'
      );

    if(demo){
      demo.innerHTML =
        '<strong>Acesso seguro:</strong> use um e-mail autorizado no sistema.';
    }

    const form =
      $('loginForm');

    if(
      form &&
      !$('signupBtn')
    ){
      const loginButton =
        form.querySelector(
          'button[type="submit"]'
        );

      const signupButton =
        document.createElement(
          'button'
        );

      signupButton.type =
        'button';

      signupButton.id =
        'signupBtn';

      signupButton.className =
        'btn btn-outline-light w-100 mt-2';

      signupButton.innerHTML =
        '<i class="bi bi-person-plus me-2"></i>Primeiro acesso';

      loginButton
        ?.insertAdjacentElement(
          'afterend',
          signupButton
        );

      signupButton
        .addEventListener(
          'click',
          handleSignup
        );
    }

    const settingsView =
      $('settingsView');

    if(settingsView){
      const title =
        settingsView
          .querySelector(
            '.panel h5'
          );

      const text =
        settingsView
          .querySelector(
            '.panel p.text-secondary'
          );

      if(title){
        title.textContent =
          'Sincronização em nuvem';
      }

      if(text){
        text.textContent =
          'Produtos e movimentações ficam salvos no servidor e sincronizam entre os dispositivos autorizados.';
      }
    }

    const resetButton =
      $('resetDataBtn');

    if(resetButton){
      resetButton.className =
        'btn btn-outline-light';

      resetButton.innerHTML =
        '<i class="bi bi-cloud-arrow-down me-1"></i>Recarregar dados do Supabase';
    }

    const exportButton =
      $('exportBtn');

    if(exportButton){
      exportButton.innerHTML =
        '<i class="bi bi-file-earmark-excel me-1"></i>Exportar Excel';
    }

    const exportFinanceButton =
      $('exportFinanceBtn');

    if(exportFinanceButton){
      exportFinanceButton.innerHTML =
        '<i class="bi bi-file-earmark-excel me-1"></i>Exportar Excel';
    }

    const productFooter =
      $('productForm')
        ?.querySelector(
          '.modal-footer'
        );

    if(
      productFooter &&
      !$('deleteProductBtn')
    ){
      const deleteButton =
        document.createElement(
          'button'
        );

      deleteButton.type =
        'button';

      deleteButton.id =
        'deleteProductBtn';

      deleteButton.className =
        'btn btn-outline-danger me-auto d-none';

      deleteButton.innerHTML =
        '<i class="bi bi-trash me-1"></i>Excluir produto';

      productFooter.prepend(
        deleteButton
      );
    }

    [
      'productStock',
      'productPista',
      'productMin'
    ].forEach(id => {
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
      legacyId:
        row.legacy_id || '',
      erpCode:
        row.erp_code || '',
      barcode:
        row.barcode || '',
      code:
        row.code || '',
      name:
        row.name || '',
      brand:
        row.brand || '',
      category:
        row.category || '',
      type:
        row.type || '',
      stock:
        n(row.stock),
      pista:
        n(row.pista),
      minStock:
        n(row.min_stock),
      cost:
        nullableNumber(
          row.cost
        ),
      salePrice:
        nullableNumber(
          row.sale_price
        ),
      location:
        row.location || '',
      unit:
        row.unit || 'UN',
      isActive:
        row.is_active !== false,
      createdAt:
        row.created_at,
      updatedAt:
        row.updated_at
    };
  }

  function mapMovement(row){
    return {
      id:
        row.id,

      productId:
        row.product_id,

      productCode:
        row.product_code || '',

      productName:
        row.product_name || '',

      type:
        row.movement_type ||
        'exit',

      qty:
        n(row.qty),

      target:
        row.target ||
        'stock',

      unitPrice:
        nullableNumber(
          row.unit_price
        ),

      unitCost:
        nullableNumber(
          row.unit_cost
        ),

      note:
        row.note || '',

      user:
        row.created_by_name ||
        '',

      date:
        row.created_at
    };
  }

