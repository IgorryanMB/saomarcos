  'use strict';

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
          .toggle(
            'open'
          );

    document
      .querySelectorAll(
        '[data-view]'
      )
      .forEach(
        button =>
          button
            .addEventListener(
              'click',
              () => {
                if(
                  button.dataset
                    .filter ===
                  'attention'
                ){
                  attentionOnly =
                    true;

                  missingPriceOnly =
                    false;

                  currentCategory =
                    '';

                  $('categoryFilter').value =
                    '';

                  $('statusFilter').value =
                    '';
                }

                showView(
                  button.dataset
                    .view
                );
              }
            )
      );

    document
      .querySelectorAll(
        '.category-link'
      )
      .forEach(
        button =>
          button
            .addEventListener(
              'click',
              () => {
                attentionOnly =
                  false;

                missingPriceOnly =
                  false;

                currentCategory =
                  button.dataset
                    .category;

                showView(
                  'inventory'
                );

                $('categoryFilter').value =
                  currentCategory;

                renderInventory();
              }
            )
      );

    document
      .querySelectorAll(
        '[data-action]'
      )
      .forEach(
        button =>
          button
            .addEventListener(
              'click',
              () => {
                if(
                  button.dataset
                    .action ===
                  'new'
                ){
                  openProduct();

                } else {
                  openMovement(
                    button.dataset
                      .action
                  );
                }
              }
            )
      );

    $('newProductBtn').onclick =
      () =>
        openProduct();

    if($('deleteProductBtn')){
      $('deleteProductBtn').onclick =
        deleteProduct;
    }

    $('inventorySearch')
      .addEventListener(
        'input',
        () => {
          attentionOnly =
            false;

          missingPriceOnly =
            false;

          renderInventory();
        }
      );

    $('categoryFilter')
      .addEventListener(
        'change',
        () => {
          currentCategory =
            '';

          attentionOnly =
            false;

          missingPriceOnly =
            false;

          renderInventory();
        }
      );

    $('statusFilter')
      .addEventListener(
        'change',
        () => {
          attentionOnly =
            false;

          missingPriceOnly =
            false;

          renderInventory();
        }
      );

    $('globalSearch')
      .addEventListener(
        'input',
        event => {
          if(
            event.target
              .value
          ){
            showView(
              'inventory'
            );

            $('inventorySearch').value =
              event.target
                .value;

            renderInventory();
          }
        }
      );

    document
      .addEventListener(
        'keydown',
        event => {
          if(
            event.ctrlKey &&
            event.key
              .toLowerCase() ===
              'k'
          ){
            event.preventDefault();

            $('globalSearch')
              .focus();
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
          if(
            $('productId')
              .value
          ){
            return;
          }

          $('productBrandCustomWrap')
            .classList
            .toggle(
              'd-none',
              $('productBrand')
                .value !==
                '__other__'
            );

          if(
            $('productBrand')
              .value ===
            '__other__'
          ){
            $('productBrandCustom').value =
              '';

            $('productBrandCustom')
              .focus();
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
          if(
            $('productId')
              .value
          ){
            return;
          }

          if(
            $('productCodeFamily')
              .value ===
            '__other__'
          ){
            $('productCodeFamilyCustom').value =
              '';

            $('productCodeFamilyCustomWrap')
              .classList
              .remove(
                'd-none'
              );

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
          if(
            $('productId')
              .value
          ){
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
            prefix ||
            '—';

          if(prefix){
            $('productReferenceArea')
              .classList
              .remove(
                'd-none'
              );

            $('productCodeReference').disabled =
              false;

          } else {
            $('productReferenceArea')
              .classList
              .add(
                'd-none'
              );

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
                $('movementProduct')
                  .value
            );

          syncMovementQtyRules();

          if(
            $('movementType')
              .value ===
            'sale'
          ){
            $('movementUnitPrice').value =
              n(
                product?.salePrice
              ) >
              0
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
      exportMovements;

    $('exportFinanceBtn').onclick =
      exportFinance;

    $('financeMonth')
      .addEventListener(
        'change',
        renderFinance
      );

    $('showMissingPrices').onclick =
      () => {
        missingPriceOnly =
          true;

        attentionOnly =
          false;

        currentCategory =
          '';

        showView(
          'inventory'
        );

        $('categoryFilter').value =
          '';

        $('statusFilter').value =
          '';

        $('inventorySearch').value =
          '';

        renderInventory();

        toast(
          'Mostrando produtos com custo ou preço de venda faltando.'
        );
      };

    $('resetDataBtn').onclick =
      async () => {
        if(!isOwner()){
          toast(
            'Somente o proprietário pode acessar esta configuração.'
          );

          return;
        }

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
          console.error(
            error
          );

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
    edit:
      id =>
        openProduct(
          products.find(
            p =>
              p.id ===
              decodeURIComponent(
                id
              )
          )
        ),

    move:
      (id,type) =>
        openMovement(
          type,
          decodeURIComponent(
            id
          )
        )
  };

  async function boot(){
    configureUi();
    setupPriceTools();
    bindEvents();

    try{
      const {
        createClient
      } =
        await import(
          'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
        );

      db =
        createClient(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY,
          {
            auth:{
              persistSession:true,
              autoRefreshToken:true,
              detectSessionInUrl:true
            }
          }
        );

      db.auth
        .onAuthStateChange(
          event => {
            if(
              event ===
                'SIGNED_OUT' &&
              session
            ){
              location.reload();
            }
          }
        );

      const {
        data,
        error
      } =
        await db.auth
          .getSession();

      if(error){
        throw error;
      }

      if(
        data.session
          ?.user
      ){
        try{
          await enterApp(
            data.session
              .user
          );

        } catch(error){
          console.error(
            error
          );

          await db.auth
            .signOut();

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

  void boot();
