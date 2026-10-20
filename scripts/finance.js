  'use strict';

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
      const qty =
        n(m.qty);

      const r =
        n(
          m.unitPrice
        ) *
        qty;

      const c =
        n(
          m.unitCost
        ) *
        qty;

      revenue +=
        r;

      cost +=
        c;

      units +=
        qty;

      const key =
        m.productId ||
        m.productCode;

      const row =
        byProduct.get(
          key
        ) || {
          name:
            m.productName,

          code:
            m.productCode,

          qty:0,
          revenue:0,
          cost:0
        };

      row.qty +=
        qty;

      row.revenue +=
        r;

      row.cost +=
        c;

      byProduct.set(
        key,
        row
      );
    });

    const profit =
      revenue -
      cost;

    const margin =
      revenue > 0
        ? (
            profit /
            revenue
          ) *
          100
        : 0;

    $('finRevenue').textContent =
      money(
        revenue
      );

    $('finCost').textContent =
      money(
        cost
      );

    $('finProfit').textContent =
      money(
        profit
      );

    $('finMargin').textContent =
      `${margin.toLocaleString(
        'pt-BR',
        {
          maximumFractionDigits:1
        }
      )}%`;

    $('finUnits').textContent =
      qtyText(
        units
      );

    $('finSalesCount').textContent =
      `${sales.length} venda${
        sales.length ===
          1
          ? ''
          : 's'
      }`;

    const missingCost =
      products.filter(
        p =>
          n(
            p.cost
          ) <= 0
      ).length;

    const missingSale =
      products.filter(
        p =>
          n(
            p.salePrice
          ) <= 0
      ).length;

    $('missingCost').textContent =
      missingCost;

    $('missingSale').textContent =
      missingSale;

    $('stockCostValue').textContent =
      money(
        products
          .reduce(
            (sum,p) =>
              sum +
              (
                n(
                  p.cost
                ) *
                total(p)
              ),
            0
          )
      );

    $('stockSaleValue').textContent =
      money(
        products
          .reduce(
            (sum,p) =>
              sum +
              (
                n(
                  p.salePrice
                ) *
                total(p)
              ),
            0
          )
      );

    const top =
      [
        ...byProduct
          .values()
      ]
        .sort(
          (a,b) =>
            b.revenue -
            a.revenue
        )
        .slice(
          0,
          8
        );

    $('topSalesTable').innerHTML =
      top
        .map(x => `
          <tr>
            <td>
              <b>
                ${esc(
                  x.name
                )}
              </b>

              <small class="d-block text-secondary">
                ${esc(
                  x.code
                )}
              </small>
            </td>

            <td>
              ${qtyText(
                x.qty
              )}
            </td>

            <td>
              ${money(
                x.revenue
              )}
            </td>

            <td>
              ${money(
                x.revenue -
                x.cost
              )}
            </td>
          </tr>
        `)
        .join('') ||
      `
        <tr>
          <td
            colspan="4"
            class="text-center py-4 text-secondary"
          >
            Nenhuma venda registrada neste mês.
          </td>
        </tr>
      `;

    $('financeSalesTable').innerHTML =
      sales
        .map(m => {
          const r =
            n(
              m.unitPrice
            ) *
            n(
              m.qty
            );

          const c =
            n(
              m.unitCost
            ) *
            n(
              m.qty
            );

          const p =
            r - c;

          const mg =
            r > 0
              ? (
                  p /
                  r
                ) *
                100
              : 0;

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
                ${qtyText(
                  m.qty
                )}
              </td>

              <td>
                ${money(
                  m.unitPrice
                )}
              </td>

              <td>
                ${
                  n(
                    m.unitCost
                  ) >
                  0
                    ? money(
                        m.unitCost
                      )
                    : '<span class="text-warning">Não informado</span>'
                }
              </td>

              <td>
                ${money(
                  r
                )}
              </td>

              <td>
                ${money(
                  p
                )}
              </td>

              <td>
                ${
                  mg
                    .toLocaleString(
                      'pt-BR',
                      {
                        maximumFractionDigits:1
                      }
                    )
                }%
              </td>
            </tr>
          `;
        })
        .join('') ||
      `
        <tr>
          <td
            colspan="8"
            class="text-center py-5 text-secondary"
          >
            Nenhuma venda registrada neste mês.
          </td>
        </tr>
      `;
  }

