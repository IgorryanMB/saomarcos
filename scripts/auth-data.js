  'use strict';

  async function loadData(){
    const [
      productsResult,
      movementsResult,
      sensitiveResult
    ] = await Promise.all([
      db
        .from('products')
        .select(
          'id,legacy_id,erp_code,barcode,code,name,brand,category,type,stock,pista,min_stock,sale_price,location,unit,is_active,created_at,updated_at'
        )
        .eq(
          'is_active',
          true
        )
        .order(
          'name',
          {
            ascending:true
          }
        ),

      isAdmin()
        ? db
            .from('movements')
            .select(
              'id,product_id,product_code,product_name,movement_type,qty,target,unit_price,note,created_by_name,created_at'
            )
            .order(
              'created_at',
              {
                ascending:false
              }
            )
            .limit(1000)
        : session?.role === 'viewer'
          ? db.rpc('get_dashboard_recent_movements')
          : Promise.resolve({
              data:[],
              error:null
            }),

      isAdmin()
        ? db.rpc('get_admin_sensitive_data')
        : Promise.resolve({
            data:null,
            error:null
          })
    ]);

    if(productsResult.error){
      throw productsResult.error;
    }

    if(movementsResult.error){
      throw movementsResult.error;
    }

    if(sensitiveResult.error){
      throw sensitiveResult.error;
    }

    const sensitiveData =
      sensitiveResult.data || {};

    const productCosts =
      new Map(
        (
          sensitiveData.product_costs ||
          []
        ).map(row => [
          row.id,
          nullableNumber(row.cost)
        ])
      );

    const movementCosts =
      new Map(
        (
          sensitiveData.movement_costs ||
          []
        ).map(row => [
          row.id,
          nullableNumber(row.unit_cost)
        ])
      );

    products =
      (
        productsResult.data ||
        []
      ).map(row => {
        const product =
          mapProduct(row);

        if(isAdmin()){
          product.cost =
            productCosts.get(row.id) ??
            null;
        }

        return product;
      });

    movements =
      (
        movementsResult.data ||
        []
      ).map(row => {
        const movement =
          mapMovement(row);

        if(isAdmin()){
          movement.unitCost =
            movementCosts.get(row.id) ??
            null;
        }

        return movement;
      });
  }

  async function fetchProfile(user){
    const {
      data,
      error
    } =
      await db
        .from('profiles')
        .select(
          'display_name,role'
        )
        .eq(
          'id',
          user.id
        )
        .single();

    if(error){
      throw error;
    }

    return data;
  }

  function applyRole(){
    document
      .querySelectorAll(
        '.admin-only'
      )
      .forEach(el => {
        el.classList.toggle(
          'd-none',
          !isAdmin()
        );
      });

    $('userName').textContent =
      session?.name ||
      'Usuário';

    $('userRole').textContent =
      isAdmin()
        ? 'Administrador'
        : isSales()
          ? 'Caixa / Vendas'
          : 'Somente consulta';

    $('userAvatar').textContent =
      (
        session?.name ||
        'U'
      )[0]
        .toUpperCase();

    const dashboardNav =
      document.querySelector(
        '.sidebar .nav-link[data-view="dashboard"]'
      );

    if(dashboardNav){
      dashboardNav
        .classList
        .toggle(
          'd-none',
          isSales()
        );
    }

    const settingsNav =
      document.querySelector(
        '.sidebar .nav-link[data-view="settings"]'
      );

    if(settingsNav){
      settingsNav
        .classList
        .toggle(
          'd-none',
          !isOwner()
        );
    }

    if(isSales()){
      document
        .querySelectorAll(
          '#inventoryView thead th.admin-only'
        )
        .forEach(th => {
          const label =
            th.textContent
              .trim();

          if(
            label ===
              'Venda' ||
            label ===
              'Ações'
          ){
            th.classList
              .remove(
                'd-none'
              );
          }
        });
    }
  }

  async function enterApp(user){
    const profile =
      await fetchProfile(user);

    session = {
      id:
        user.id,

      email:
        user.email || '',

      name:
        profile.display_name ||
        user.email ||
        'Usuário',

      role:
        profile.role ||
        'viewer'
    };

    await loadData();

    $('loginScreen')
      .classList
      .add(
        'd-none'
      );

    $('app')
      .classList
      .remove(
        'd-none'
      );

    applyRole();
    renderAll();

    if(isSales()){
      showView(
        'inventory'
      );
    }

    setupRealtime();
  }

  async function handleLogin(event){
    event.preventDefault();

    setLoginMessage();

    const email =
      $('loginUser')
        .value
        .trim()
        .toLowerCase();

    const password =
      $('loginPass')
        .value;

    const button =
      event.submitter ||
      $('loginForm')
        .querySelector(
          'button[type="submit"]'
        );

    if(
      !email ||
      !password
    ){
      setLoginMessage(
        'Informe o e-mail e a senha.'
      );

      return;
    }

    setBusy(
      button,
      true,
      'Entrando...'
    );

    try{
      const {
        data,
        error
      } =
        await db.auth
          .signInWithPassword({
            email,
            password
          });

      if(error){
        throw error;
      }

      await enterApp(
        data.user
      );

    } catch(error){
      setLoginMessage(
        friendlyAuthError(
          error
        )
      );

    } finally {
      setBusy(
        button,
        false
      );
    }
  }

  async function handleSignup(){
    setLoginMessage();

    const email =
      $('loginUser')
        .value
        .trim()
        .toLowerCase();

    const password =
      $('loginPass')
        .value;

    const button =
      $('signupBtn');

    if(
      !email ||
      !password
    ){
      setLoginMessage(
        'Digite o e-mail e uma senha para fazer o primeiro acesso.'
      );

      return;
    }

    if(
      password.length <
      6
    ){
      setLoginMessage(
        'A senha precisa ter pelo menos 6 caracteres.'
      );

      return;
    }

    setBusy(
      button,
      true,
      'Criando acesso...'
    );

    try{
      const {
        data,
        error
      } =
        await db.auth
          .signUp({
            email,
            password
          });

      if(error){
        throw error;
      }

      if(
        data.session &&
        data.user
      ){
        await enterApp(
          data.user
        );
      } else {
        setLoginMessage(
          'Cadastro criado. Confirme o e-mail recebido e depois clique em Entrar.',
          'success'
        );
      }

    } catch(error){
      setLoginMessage(
        friendlyAuthError(
          error
        )
      );

    } finally {
      setBusy(
        button,
        false
      );
    }
  }

  async function logout(){
    try{
      if(realtimeChannel){
        await db.removeChannel(
          realtimeChannel
        );
      }

      await db.auth
        .signOut();

    } finally {
      location.reload();
    }
  }

  function showView(name){
    if(
      (
        name ===
          'movements' ||
        name ===
          'finance'
      ) &&
      !isAdmin()
    ){
      return;
    }

    if(
      name ===
        'settings' &&
      !isOwner()
    ){
      return;
    }

    document
      .querySelectorAll(
        '.view-section'
      )
      .forEach(v => {
        v.classList
          .add(
            'd-none'
          );
      });

    const view =
      $(name + 'View');

    if(!view){
      return;
    }

    view.classList
      .remove(
        'd-none'
      );

    document
      .querySelectorAll(
        '.sidebar .nav-link'
      )
      .forEach(b => {
        b.classList
          .remove(
            'active'
          );
      });

    const button =
      document.querySelector(
        `.sidebar .nav-link[data-view="${name}"]`
      );

    if(button){
      button.classList
        .add(
          'active'
        );
    }

    $('sidebar')
      .classList
      .remove(
        'open'
      );

    if(
      name ===
      'inventory'
    ){
      renderInventory();
    }

    if(
      name ===
      'movements'
    ){
      renderMovements();
    }

    if(
      name ===
      'finance'
    ){
      renderFinance();
    }
  }

