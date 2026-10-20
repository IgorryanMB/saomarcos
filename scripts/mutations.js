  'use strict';

  async function deleteProduct(){
    if(!isAdmin()){
      return;
    }

    const id =
      $('productId')
        .value;

    if(!id){
      return;
    }

    const product =
      products.find(
        p =>
          p.id ===
          id
      );

    if(!product){
      toast(
        'Produto não encontrado.'
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Excluir "${product.name}" do estoque?\n\nEle deixará de aparecer no sistema, mas o histórico de movimentações e vendas será preservado.`
      );

    if(!confirmed){
      return;
    }

    const button =
      $('deleteProductBtn');

    setBusy(
      button,
      true,
      'Excluindo...'
    );

    try{
      const {
        error
      } =
        await db
          .from(
            'products'
          )
          .update({
            is_active:false,
            updated_by:session.id
          })
          .eq(
            'id',
            id
          );

      if(error){
        throw error;
      }

      await loadData();

      bootstrap.Modal
        .getInstance(
          $('productModal')
        )
        ?.hide();

      renderAll();

      toast(
        'Produto excluído do estoque.'
      );

    } catch(error){
      console.error(
        'Erro técnico ao excluir produto:',
        error
      );

      toast(
        friendlyDataError(
          error,
          'Não foi possível excluir o produto.'
        )
      );

    } finally {
      setBusy(
        button,
        false
      );
    }
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
      $('productId')
        .value;

    const category =
      $('productCategory')
        .value;

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

      $('productBrand')
        .focus();

      return;
    }

    if(
      referenceCategories
        .has(
          category
        ) &&
      !selectedCodePrefix()
    ){
      toast(
        'Selecione a família/prefixo do código.'
      );

      $('productCodeFamily')
        .focus();

      return;
    }

    if(
      referenceCategories
        .has(
          category
        ) &&
      !$('productCodeReference')
        .value
        .trim()
    ){
      toast(
        'Informe a referência/encaixe do produto.'
      );

      $('productCodeReference')
        .focus();

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
          norm(
            p.code
          ) ===
          norm(
            code
          )
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
            p =>
              p.id ===
              oldId
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
          $('productStock')
            .value
        ),

      pista:
        n(
          $('productPista')
            .value
        ),

      min_stock:
        n(
          $('productMin')
            .value
        ),

      cost:
        nullableNumber(
          $('productCost')
            .value
        ),

      sale_price:
        nullableNumber(
          $('productSalePrice')
            .value
        ),

      location:
        $('productLocation')
          .value
          .trim(),

      unit:
        existing?.unit ||
        'UN',

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
            .from(
              'products'
            )
            .update(
              payload
            )
            .eq(
              'id',
              oldId
            )
            .select(
              'id'
            )
            .single();

      } else {
        result =
          await db
            .from(
              'products'
            )
            .insert(
              payload
            )
            .select(
              'id'
            )
            .single();
      }

      if(
        result.error
      ){
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
      console.error(
        'Erro técnico ao salvar produto:',
        error
      );

      toast(
        friendlyDataError(
          error,
          'Não foi possível salvar o produto.'
        )
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
      $('movementType')
        .value;

    if(
      isSales() &&
      type !==
        'sale'
    ){
      toast(
        'Este acesso permite somente registrar vendas.'
      );

      return;
    }

    const id =
      $('movementProduct')
        .value;

    const qty =
      n(
        $('movementQty')
          .value
      );

    const target =
      $('movementTarget')
        .value;

    if(
      isSales() &&
      target !==
        'pista'
    ){
      toast(
        'O caixa só pode vender produtos da pista.'
      );

      return;
    }

    const product =
      products.find(
        p =>
          p.id ===
          id
      );

    if(
      !product ||
      qty <= 0
    ){
      return;
    }

    const available =
      n(
        product[
          target
        ]
      );

    if(
      type !==
        'entry' &&
      qty >
        available
    ){
      toast(
        `Quantidade insuficiente em ${
          target ===
            'pista'
            ? 'pista'
            : 'estoque'
        } (${
          qtyText(
            available,
            product.unit ===
              'L'
              ? 'L'
              : ''
          )
        } disponível).`
      );

      return;
    }

    const unitPrice =
      type ===
        'sale'
        ? nullableNumber(
            $('movementUnitPrice')
              .value
          )
        : null;

    if(
      type ===
        'sale' &&
      (
        unitPrice ===
          null ||
        unitPrice <=
          0
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
      const {
        error
      } =
        await db.rpc(
          'register_movement',
          {
            p_product_id:
              id,

            p_movement_type:
              type,

            p_qty:
              qty,

            p_target:
              target,

            p_unit_price:
              unitPrice,

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
        type ===
          'entry'
          ? 'Entrada registrada.'
          : type ===
              'sale'
            ? 'Venda registrada.'
            : 'Saída registrada.'
      );

    } catch(error){
      console.error(
        'Erro técnico ao registrar movimentação:',
        error
      );

      toast(
        friendlyDataError(
          error,
          'Não foi possível registrar a movimentação.'
        )
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

    const channel =
      db
        .channel(
          'sao-marcos-live'
        )
        .on(
          'postgres_changes',
          {
            event:'*',
            schema:'public',
            table:'products'
          },
          queueRealtimeReload
        );

    if(isAdmin()){
      channel.on(
        'postgres_changes',
        {
          event:'*',
          schema:'public',
          table:'movements'
        },
        queueRealtimeReload
      );
    }

    realtimeChannel =
      channel.subscribe();
  }

