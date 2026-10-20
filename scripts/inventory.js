  'use strict';

  function renderDashboard(){
    const stats = {
      normal:0,
      low:0,
      zero:0
    };

    products.forEach(
      p => {
        stats[
          status(p)
        ]++;
      }
    );

    $('statProducts')
      .textContent =
      products.length;

    $('statNormal')
      .textContent =
      stats.normal;

    $('statLow')
      .textContent =
      stats.low;

    $('statZero')
      .textContent =
      stats.zero;

    const attention =
      products
        .filter(
          p =>
            status(p) !==
            'normal'
        )
        .sort(
          (a,b) =>
            total(a) -
            total(b)
        )
        .slice(
          0,
          8
        );

    $('attentionTable')
      .innerHTML =
      attention
        .map(p => `
          <tr>
            <td>
              <b>${esc(p.name)}</b>
              <small class="d-block text-secondary">
                ${esc(p.code)}
              </small>
            </td>
            <td>
              ${esc(p.category)}
            </td>
            <td>
              ${qtyText(
                p.stock,
                p.unit === 'L'
                  ? 'L'
                  : ''
              )}
            </td>
            <td>
              ${qtyText(
                p.pista,
                p.unit === 'L'
                  ? 'L'
                  : ''
              )}
            </td>
            <td>
              <b>
                ${qtyText(
                  total(p),
                  p.unit === 'L'
                    ? 'L'
                    : ''
                )}
              </b>
            </td>
            <td>
              ${pill(
                status(p)
              )}
            </td>
          </tr>
        `)
        .join('') ||
      `
        <tr>
          <td
            colspan="6"
            class="text-center py-4 text-secondary"
          >
            Nenhum alerta.
          </td>
        </tr>
      `;

    const totals =
      categories.map(
        category => ({
          c:category,

          n:
            products
              .filter(
                p =>
                  p.category ===
                  category
              )
              .reduce(
                (sum,p) =>
                  sum +
                  total(p),
                0
              )
        })
      );

    const max =
      Math.max(
        1,
        ...totals.map(
          x => x.n
        )
      );

    $('categoryBars')
      .innerHTML =
      totals
        .map(x => `
          <div class="category-row">
            <span>
              ${esc(x.c)}
            </span>

            <div class="bar-bg">
              <div
                class="bar-fill"
                style="width:${
                  Math.max(
                    2,
                    x.n /
                    max *
                    100
                  )
                }%"
              ></div>
            </div>

            <b class="text-end">
              ${
                Number(
                  x.n
                    .toFixed(2)
                )
                  .toLocaleString(
                    'pt-BR',
                    {
                      maximumFractionDigits:2
                    }
                  )
              }${
                x.c === 'Óleos'
                  ? ' L'
                  : ''
              }
            </b>
          </div>
        `)
        .join('');

    renderRecent();
  }

  function movementTypeLabel(movement){
    if(
      movement.type ===
      'entry'
    ){
      return 'Entrada';
    }

    if(
      movement.type ===
      'sale'
    ){
      return 'Venda';
    }

    return 'Saída';
  }

  function renderRecent(){
    $('recentMovements')
      .innerHTML =
      movements
        .slice(
          0,
          5
        )
        .map(m => `
          <div class="movement-item">
            <div>
              <b>
                ${esc(
                  m.productName
                )}
              </b>

              <small>
                ${
                  new Date(
                    m.date
                  )
                    .toLocaleString(
                      'pt-BR'
                    )
                }
                •
                ${
                  esc(
                    m.target ===
                      'pista'
                      ? 'Pista'
                      : 'Estoque'
                  )
                }
                •
                ${
                  movementTypeLabel(
                    m
                  )
                }
              </small>
            </div>

            <b
              class="movement-value ${m.type}"
            >
              ${
                m.type ===
                  'entry'
                  ? '+'
                  : '-'
              }${
                qtyText(
                  m.qty
                )
              }
            </b>
          </div>
        `)
        .join('') ||
      `
        <div class="text-secondary text-center py-4">
          Sem movimentações ainda.
        </div>
      `;
  }

  function fillCategorySelects(){
    const selectedFilter =
      $('categoryFilter')
        .value;

    const selectedProductCategory =
      $('productCategory')
        .value;

    $('categoryFilter')
      .innerHTML =
      '<option value="">Todas as categorias</option>' +
      categories
        .map(
          c =>
            `<option>${c}</option>`
        )
        .join('');

    $('productCategory')
      .innerHTML =
      '<option value="">Selecione a categoria primeiro</option>' +
      categories
        .map(
          c =>
            `<option>${c}</option>`
        )
        .join('');

    if(
      categories.includes(
        selectedFilter
      )
    ){
      $('categoryFilter').value =
        selectedFilter;
    }

    if(
      categories.includes(
        selectedProductCategory
      )
    ){
      $('productCategory').value =
        selectedProductCategory;
    }
  }

  function generateSequentialCode(category){
    const rule =
      sequenceRules[
        category
      ];

    if(!rule){
      return '';
    }

    const prefix =
      rule.prefix
        .toUpperCase();

    const numbers =
      products
        .map(
          p =>
            (
              p.code ||
              ''
            )
              .toUpperCase()
        )
        .filter(
          code =>
            code.startsWith(
              prefix
            )
        )
        .map(code => {
          const match =
            code
              .slice(
                prefix.length
              )
              .match(
                /^(\d+)/
              );

          return match
            ? Number(
                match[1]
              )
            : 0;
        })
        .filter(
          number =>
            number > 0
        );

    const next =
      numbers.length
        ? Math.max(
            ...numbers
          ) + 1
        : 1;

    return (
      rule.prefix +
      (
        rule.pad
          ? String(next)
              .padStart(
                rule.pad,
                '0'
              )
          : next
      )
    );
  }

  function extractCodeParts(code){
    const value =
      (
        code ||
        ''
      )
        .trim()
        .toUpperCase();

    const index =
      value.search(
        /\d/
      );

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
      prefix:
        value.slice(
          0,
          index
        ),

      reference:
        value.slice(
          index
        )
    };
  }

  function brandsForCategory(category){
    return [
      ...new Set(
        products
          .filter(
            p =>
              p.category ===
                category &&
              String(
                p.brand ||
                ''
              )
                .trim()
          )
          .map(
            p =>
              String(
                p.brand
              )
                .trim()
          )
      )
    ]
      .sort(
        (a,b) =>
          a.localeCompare(
            b,
            'pt-BR',
            {
              sensitivity:
                'base'
            }
          )
      );
  }

  function prefixesFor(
    category,
    brand
  ){
    if(
      !category ||
      !brand
    ){
      return [];
    }

    const wanted =
      norm(brand);

    const values =
      products
        .filter(
          p =>
            p.category ===
              category &&
            norm(p.brand) ===
              wanted
        )
        .map(
          p =>
            extractCodeParts(
              p.code
            ).prefix
        )
        .filter(Boolean);

    return [
      ...new Set(
        values
      )
    ]
      .sort(
        (a,b) =>
          a.localeCompare(
            b,
            'pt-BR',
            {
              sensitivity:
                'base'
            }
          )
      );
  }

  function selectedProductBrand(){
    const value =
      $('productBrand')
        .value;

    if(
      value ===
      '__other__'
    ){
      return $('productBrandCustom')
        .value
        .trim();
    }

    return value.trim();
  }

  function selectedCodePrefix(){
    const value =
      $('productCodeFamily')
        .value;

    if(
      value ===
      '__other__'
    ){
      return $('productCodeFamilyCustom')
        .value
        .toUpperCase();
    }

    return value;
  }

  function fillBrandOptions(
    category,
    selected = ''
  ){
    const brands =
      brandsForCategory(
        category
      );

    $('productBrand')
      .innerHTML =
      '<option value="">Selecione a marca</option>' +
      brands
        .map(
          brand =>
            `<option value="${esc(brand)}">${esc(brand)}</option>`
        )
        .join('') +
      '<option value="__other__">Outra marca...</option>';

    if(selected){
      const found =
        brands.find(
          brand =>
            norm(brand) ===
            norm(selected)
        );

      if(found){
        $('productBrand').value =
          found;
      } else {
        $('productBrand').value =
          '__other__';

        $('productBrandCustom').value =
          selected;

        $('productBrandCustomWrap')
          .classList
          .remove(
            'd-none'
          );
      }
    } else {
      $('productBrandCustom').value =
        '';

      $('productBrandCustomWrap')
        .classList
        .add(
          'd-none'
        );
    }
  }

  function fillFamilyOptions(
    category,
    brand,
    selected = ''
  ){
    const prefixes =
      prefixesFor(
        category,
        brand
      );

    $('productCodeFamily')
      .innerHTML =
      '<option value="">Selecione a família/prefixo</option>' +
      prefixes
        .map(
          prefix =>
            `<option value="${esc(prefix)}">${esc(prefix.trim() || prefix)}</option>`
        )
        .join('') +
      '<option value="__other__">Outro prefixo...</option>';

    if(selected){
      const found =
        prefixes.find(
          prefix =>
            prefix ===
            selected
        );

      if(found){
        $('productCodeFamily').value =
          found;
      } else {
        $('productCodeFamily').value =
          '__other__';

        $('productCodeFamilyCustom').value =
          selected;

        $('productCodeFamilyCustomWrap')
          .classList
          .remove(
            'd-none'
          );
      }
    } else {
      $('productCodeFamilyCustom').value =
        '';

      $('productCodeFamilyCustomWrap')
        .classList
        .add(
          'd-none'
        );
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
    ]
      .forEach(id => {
        const el =
          $(id);

        if(el){
          el.disabled =
            !enabled;
        }
      });
  }

  function resetProductCodeFlow(){
    $('productCode').value =
      '';

    $('productBrand').disabled =
      true;

    $('productBrand').innerHTML =
      '<option value="">Selecione a categoria primeiro</option>';

    $('productBrandCustom').value =
      '';

    $('productBrandCustomWrap')
      .classList
      .add(
        'd-none'
      );

    $('productCodeFamilyArea')
      .classList
      .add(
        'd-none'
      );

    $('productCodeFamily').disabled =
      true;

    $('productCodeFamily').innerHTML =
      '<option value="">Selecione a marca primeiro</option>';

    $('productCodeFamilyCustom').value =
      '';

    $('productCodeFamilyCustomWrap')
      .classList
      .add(
        'd-none'
      );

    $('productReferenceArea')
      .classList
      .add(
        'd-none'
      );

    $('productCodeReference').value =
      '';

    $('productCodeReference').disabled =
      true;

    $('productCodePrefix').textContent =
      '';

    setProductDetailFieldsEnabled(
      false
    );
  }

  function updateFinalReferenceCode(){
    if(
      !referenceCategories
        .has(
          $('productCategory')
            .value
        )
    ){
      return;
    }

    const prefix =
      selectedCodePrefix();

    const reference =
      $('productCodeReference')
        .value
        .trim()
        .toUpperCase();

    $('productCodeReference').value =
      reference;

    $('productCodePrefix').textContent =
      prefix || '—';

    $('productCode').value =
      prefix &&
      reference
        ? `${prefix}${reference}`
        : '';

    setProductDetailFieldsEnabled(
      Boolean(
        prefix &&
        reference
      )
    );
  }

  function prepareBrandStep(){
    if(
      $('productId').value
    ){
      return;
    }

    const category =
      $('productCategory')
        .value;

    resetProductCodeFlow();

    if(!category){
      return;
    }

    fillBrandOptions(
      category
    );

    $('productBrand').disabled =
      false;
  }

  function prepareCodeStep(){
    if(
      $('productId').value
    ){
      return;
    }

    const category =
      $('productCategory')
        .value;

    const brand =
      selectedProductBrand();

    $('productCode').value =
      '';

    $('productCodeFamilyArea')
      .classList
      .add(
        'd-none'
      );

    $('productReferenceArea')
      .classList
      .add(
        'd-none'
      );

    $('productCodeFamily').disabled =
      true;

    $('productCodeReference').disabled =
      true;

    setProductDetailFieldsEnabled(
      false
    );

    if(!brand){
      return;
    }

    if(
      referenceCategories
        .has(
          category
        )
    ){
      $('productCodeFamilyArea')
        .classList
        .remove(
          'd-none'
        );

      fillFamilyOptions(
        category,
        brand
      );

      $('productCodeFamily').disabled =
        false;

      return;
    }

    const code =
      generateSequentialCode(
        category
      );

    $('productCode').value =
      code;

    setProductDetailFieldsEnabled(
      Boolean(
        code
      )
    );
  }

  function prepareReferenceStep(){
    if(
      $('productId').value
    ){
      return;
    }

    const prefix =
      selectedCodePrefix();

    $('productCode').value =
      '';

    $('productCodeReference').value =
      '';

    setProductDetailFieldsEnabled(
      false
    );

    $('productCodeFamilyCustomWrap')
      .classList
      .toggle(
        'd-none',
        $('productCodeFamily').value !==
        '__other__'
      );

    if(!prefix){
      $('productReferenceArea')
        .classList
        .add(
          'd-none'
        );

      return;
    }

    $('productReferenceArea')
      .classList
      .remove(
        'd-none'
      );

    $('productCodePrefix').textContent =
      prefix;

    $('productCodeReference').disabled =
      false;

    $('productCodeReference')
      .focus();
  }

  function renderInventory(){
    const q =
      norm(
        $('inventorySearch')
          .value
      );

    const category =
      $('categoryFilter')
        .value ||
      currentCategory;

    let stateFilter =
      $('statusFilter')
        .value;

    if(
      attentionOnly &&
      !stateFilter
    ){
      stateFilter =
        'low';
    }

    const list =
      products.filter(
        p =>
          (
            !category ||
            p.category ===
              category
          ) &&
          (
            !stateFilter ||
            (
              stateFilter ===
                'low'
                ? status(p) !==
                  'normal'
                : status(p) ===
                  stateFilter
            )
          ) &&
          (
            !missingPriceOnly ||
            nullableNumber(
              p.cost
            ) === null ||
            n(p.cost) <= 0 ||
            nullableNumber(
              p.salePrice
            ) === null ||
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
            ].join(' '))
              .includes(q)
          )
      );

    $('resultCount').textContent =
      `${list.length} produto${
        list.length ===
          1
          ? ''
          : 's'
      }`;

    $('inventoryTable').innerHTML =
      list.map(p => `
        <tr>

          <td>
            <b>
              ${esc(
                p.code
              )}
            </b>
          </td>

          <td>
            ${esc(
              p.name
            )}
          </td>

          <td>
            ${esc(
              p.brand
            )}
          </td>

          <td>
            ${esc(
              p.category
            )}
          </td>

          <td>
            ${qtyText(
              p.stock,
              p.unit ===
                'L'
                ? 'L'
                : ''
            )}
          </td>

          <td>
            ${qtyText(
              p.pista,
              p.unit ===
                'L'
                ? 'L'
                : ''
            )}
          </td>

          <td>
            <b>
              ${qtyText(
                total(p),
                p.unit ===
                  'L'
                  ? 'L'
                  : ''
              )}
            </b>
          </td>

          <td>
            ${esc(
              p.location
            )}
          </td>

          <td>
            ${pill(
              status(p)
            )}
          </td>

          <td class="admin-only ${isAdmin() ? '' : 'd-none'}">
            ${
              n(p.cost) >
                0
                ? money(
                    p.cost
                  )
                : '<span class="text-warning">Não informado</span>'
            }
          </td>

          <td class="${canSell() ? '' : 'd-none'}">
            ${
              n(p.salePrice) >
                0
                ? money(
                    p.salePrice
                  )
                : '<span class="text-warning">Não informado</span>'
            }
          </td>

          <td class="admin-only ${isAdmin() ? '' : 'd-none'}">
            ${marginText(
              p
            )}
          </td>

          <td class="${canSell() ? '' : 'd-none'}">
            <div class="action-btns">

              ${
                !isSales() ||
                n(p.pista) > 0
                  ? `
                    <button
                      class="btn btn-sm btn-outline-warning"
                      onclick="SM.move('${encodeURIComponent(p.id)}','sale')"
                      title="Venda"
                    >
                      <i class="bi bi-cart-check"></i>
                    </button>
                  `
                  : `
                    <button
                      class="btn btn-sm btn-outline-secondary"
                      type="button"
                      disabled
                      title="Sem unidades disponíveis na pista"
                    >
                      <i class="bi bi-cart-x"></i>
                    </button>
                  `
              }

              ${
                isAdmin()
                  ? `
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
                  `
                  : ''
              }

            </div>
          </td>

        </tr>
      `)
      .join('') ||
      `
        <tr>
          <td
            colspan="13"
            class="text-center py-5 text-secondary"
          >
            Nenhum produto encontrado.
          </td>
        </tr>
      `;
  }

  function updateProductMarginPreview(){
    const cost =
      nullableNumber(
        $('productCost')
          .value
      );

    const price =
      nullableNumber(
        $('productSalePrice')
          .value
      );

    const margin =
      marginPct(
        cost,
        price
      );

    $('productMarginPreview').textContent =
      margin === null
        ? '—'
        : `${money(
            price -
            cost
          )} de lucro • ${
            margin
              .toLocaleString(
                'pt-BR',
                {
                  maximumFractionDigits:1
                }
              )
          }%`;
  }

  function openProduct(p = null){
    if(!isAdmin()){
      return;
    }

    const editing =
      Boolean(p);

    const deleteButton =
      $('deleteProductBtn');

    if(deleteButton){
      deleteButton.classList
        .toggle(
          'd-none',
          !editing ||
          !isAdmin()
        );
    }

    $('productModalTitle').textContent =
      editing
        ? 'Editar produto'
        : 'Novo produto';

    $('productId').value =
      p?.id || '';

    $('productCategory').disabled =
      false;

    $('productCategory').value =
      p?.category || '';

    $('productName').value =
      p?.name || '';

    $('productType').value =
      p?.type || '';

    $('productStock').value =
      p?.stock ?? 0;

    $('productPista').value =
      p?.pista ?? 0;

    $('productMin').value =
      p?.minStock ?? 3;

    $('productCost').value =
      n(p?.cost) >
        0
        ? p.cost
        : '';

    $('productSalePrice').value =
      n(p?.salePrice) >
        0
        ? p.salePrice
        : '';

    $('productLocation').value =
      p?.location || '';

    resetProductCodeFlow();

    if(editing){
      $('productCategory').disabled =
        true;

      fillBrandOptions(
        p.category,
        p.brand || ''
      );

      $('productBrand').disabled =
        true;

      $('productBrandCustom').disabled =
        true;

      const parts =
        extractCodeParts(
          p.code
        );

      if(
        referenceCategories
          .has(
            p.category
          )
      ){
        $('productCodeFamilyArea')
          .classList
          .remove(
            'd-none'
          );

        fillFamilyOptions(
          p.category,
          p.brand || '',
          parts.prefix
        );

        $('productCodeFamily').disabled =
          true;

        $('productCodeFamilyCustom').disabled =
          true;

        $('productReferenceArea')
          .classList
          .remove(
            'd-none'
          );

        $('productCodePrefix').textContent =
          parts.prefix ||
          '—';

        $('productCodeReference').value =
          parts.reference;

        $('productCodeReference').disabled =
          true;

      } else {
        $('productCodeFamilyArea')
          .classList
          .add(
            'd-none'
          );

        $('productReferenceArea')
          .classList
          .add(
            'd-none'
          );
      }

      $('productCode').value =
        p.code || '';

      setProductDetailFieldsEnabled(
        true
      );

    } else {
      $('productBrandCustom').disabled =
        false;

      $('productCodeFamilyCustom').disabled =
        false;
    }

    updateProductMarginPreview();

    bootstrap.Modal
      .getOrCreateInstance(
        $('productModal')
      )
      .show();
  }

