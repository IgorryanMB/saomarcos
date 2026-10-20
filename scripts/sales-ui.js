  'use strict';

  function syncMovementQtyRules(){
    const product =
      products.find(
        x =>
          x.id ===
          $('movementProduct')
            .value
      );

    if(!product){
      return;
    }

    const liters =
      product.unit ===
      'L';

    $('movementQty').min =
      liters
        ? '0.01'
        : '1';

    $('movementQty').step =
      liters
        ? '0.01'
        : '1';

    if(
      n(
        $('movementQty')
          .value
      ) <= 0
    ){
      $('movementQty').value =
        liters
          ? '0.01'
          : '1';
    }
  }

  function updateSaleFields(){
    const type =
      $('movementType')
        .value;

    const product =
      products.find(
        x =>
          x.id ===
          $('movementProduct')
            .value
      );

    const qty =
      Math.max(
        0.01,
        n(
          $('movementQty')
            .value
        )
      );

    $('saleFields')
      .classList
      .toggle(
        'd-none',
        type !==
          'sale'
      );

    if(
      type !==
      'sale'
    ){
      return;
    }

    const price =
      nullableNumber(
        $('movementUnitPrice')
          .value
      );

    const cost =
      nullableNumber(
        product?.cost
      );

    $('movementUnitCost').textContent =
      cost &&
      cost > 0
        ? money(cost)
        : 'Não informado';

    if(
      price === null ||
      price <= 0
    ){
      $('movementSaleSummary').textContent =
        'Informe o preço de venda';

      return;
    }

    const revenue =
      price *
      qty;

    if(isSales()){
      $('movementSaleSummary').textContent =
        `${money(
          revenue
        )} total da venda`;

      return;
    }

    const grossCost =
      (
        cost &&
        cost > 0
          ? cost
          : 0
      ) *
      qty;

    const profit =
      revenue -
      grossCost;

    const margin =
      cost &&
      cost > 0
        ? marginPct(
            cost,
            price
          )
        : null;

    $('movementSaleSummary').textContent =
      `${money(
        revenue
      )} faturamento • ${
        cost &&
        cost > 0
          ? money(
              profit
            ) +
            ' lucro bruto' +
            (
              margin !== null
                ? ' • ' +
                  margin
                    .toLocaleString(
                      'pt-BR',
                      {
                        maximumFractionDigits:1
                      }
                    ) +
                  '%'
                : ''
            )
          : 'custo não informado'
      }`;
  }

  function openMovement(
    type,
    id = null
  ){
    if(!canSell()){
      return;
    }

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

    $('movementType').value =
      type;

    $('movementTitle').textContent =
      type ===
        'entry'
        ? 'Entrada de estoque'
        : type ===
            'sale'
          ? 'Registrar venda'
          : 'Saída de estoque';

    $('movementSubmit').className =
      `btn ${
        type ===
          'entry'
          ? 'btn-success'
          : type ===
              'sale'
            ? 'btn-warning'
            : 'btn-danger'
      }`;

    const movementProducts =
      isSales()
        ? products.filter(
            p =>
              n(p.pista) >
              0
          )
        : products.slice();

    if(
      isSales() &&
      !movementProducts.length
    ){
      toast(
        'Não há produtos disponíveis na pista para venda.'
      );

      return;
    }

    $('movementProduct').innerHTML =
      movementProducts
        .slice()
        .sort(
          (a,b) =>
            a.name
              .localeCompare(
                b.name
              )
        )
        .map(
          p =>
            `<option value="${esc(p.id)}">${esc(p.code)} — ${esc(p.name)} (${qtyText(
              isSales()
                ? p.pista
                : total(p),
              p.unit ===
                'L'
                ? 'L'
                : ''
            )})</option>`
        )
        .join('');

    if(id){
      if(
        isSales() &&
        !movementProducts.some(
          p => p.id === id
        )
      ){
        toast(
          'Este produto não está disponível na pista.'
        );

        return;
      }

      $('movementProduct').value =
        id;
    }

    $('movementQty').value =
      '1';

    $('movementTarget').value =
      isSales()
        ? 'pista'
        : 'stock';

    $('movementTarget').disabled =
      isSales();

    $('movementNote').value =
      '';

    syncMovementQtyRules();

    const product =
      products.find(
        x =>
          x.id ===
          $('movementProduct')
            .value
      );

    $('movementUnitPrice').value =
      n(
        product?.salePrice
      ) >
      0
        ? product.salePrice
        : '';

    $('movementUnitPrice').readOnly =
      isSales();

    const costWrap =
      $('movementUnitCost')
        ?.closest(
          '.col-6'
        );

    if(costWrap){
      costWrap.classList
        .toggle(
          'd-none',
          isSales()
        );
    }

    updateSaleFields();

    bootstrap.Modal
      .getOrCreateInstance(
        $('movementModal')
      )
      .show();
  }

  function renderMovements(){
    $('movementTable').innerHTML =
      movements
        .map(m => {
          const badge =
            m.type ===
              'entry'
              ? '<span class="badge text-bg-success">Entrada</span>'
              : m.type ===
                  'sale'
                ? '<span class="badge text-bg-warning">Venda</span>'
                : '<span class="badge text-bg-danger">Saída</span>';

          const value =
            m.type ===
              'sale'
              ? money(
                  n(
                    m.unitPrice
                  ) *
                  n(
                    m.qty
                  )
                )
              : '—';

          return `
            <tr>
              <td>
                ${
                  new Date(
                    m.date
                  )
                    .toLocaleString(
                      'pt-BR'
                    )
                }
              </td>

              <td>
                <b>
                  ${esc(
                    m.productName
                  )}
                </b>

                <small class="d-block text-secondary">
                  ${esc(
                    m.productCode
                  )}
                </small>
              </td>

              <td>
                ${badge}
              </td>

              <td>
                ${
                  m.type ===
                    'entry'
                    ? '+'
                    : '-'
                }${qtyText(
                  m.qty
                )}
              </td>

              <td>
                ${
                  m.target ===
                    'pista'
                    ? 'Pista'
                    : 'Estoque'
                }
              </td>

              <td>
                ${value}
              </td>

              <td>
                ${esc(
                  m.user ||
                  'Usuário'
                )}
              </td>
            </tr>
          `;
        })
        .join('') ||
      `
        <tr>
          <td
            colspan="7"
            class="text-center py-5 text-secondary"
          >
            Nenhuma movimentação registrada.
          </td>
        </tr>
      `;
  }

  function monthKey(date){
    const x =
      new Date(
        date
      );

    return (
      `${x.getFullYear()}-${
        String(
          x.getMonth() +
          1
        )
          .padStart(
            2,
            '0'
          )
      }`
    );
  }

  function selectedMonth(){
    return (
      $('financeMonth')
        .value ||
      monthKey(
        new Date()
      )
    );
  }

  function salesForMonth(){
    const key =
      selectedMonth();

    return movements
      .filter(
        m =>
          m.type ===
            'sale' &&
          monthKey(
            m.date
          ) ===
            key
      );
  }

