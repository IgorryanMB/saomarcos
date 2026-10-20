  'use strict';

  function renderAll(){
    fillCategorySelects();
    renderDashboard();
    renderInventory();
    renderMovements();

    if(
      $('financeMonth') &&
      !$('financeMonth')
        .value
    ){
      $('financeMonth').value =
        monthKey(
          new Date()
        );
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
      `Olá, ${
        session?.name ||
        'Usuário'
      }!`;
  }

  async function exportMovements(){
    if(!isAdmin()){
      return;
    }

    const button =
      $('exportBtn');

    setBusy(
      button,
      true,
      'Gerando Excel...'
    );

    try{
      const XLSX =
        await import(
          'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'
        );

      const generatedAt =
        new Date();

      const counts = {
        entry:0,
        exit:0,
        sale:0
      };

      const detailRows =
        movements.map(m => {
          if(
            Object.prototype.hasOwnProperty.call(
              counts,
              m.type
            )
          ){
            counts[m.type]++;
          }

          const typeLabel =
            m.type === 'entry'
              ? 'Entrada'
              : m.type === 'sale'
                ? 'Venda'
                : 'Saída';

          const targetLabel =
            m.target === 'pista'
              ? 'Pista'
              : 'Estoque';

          const unitPrice =
            m.type === 'sale'
              ? nullableNumber(m.unitPrice)
              : null;

          const unitCost =
            nullableNumber(m.unitCost);

          const totalValue =
            m.type === 'sale' &&
            unitPrice !== null
              ? unitPrice * n(m.qty)
              : null;

          return [
            new Date(m.date),
            m.productCode || '',
            m.productName || '',
            typeLabel,
            n(m.qty),
            targetLabel,
            unitPrice,
            unitCost,
            totalValue,
            m.user || '',
            m.note || ''
          ];
        });

      const rows = [
        [
          'POSTO SÃO MARCOS — RELATÓRIO DE MOVIMENTAÇÕES',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          ''
        ],

        [
          `Gerado em: ${generatedAt.toLocaleString('pt-BR')}`,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          ''
        ],

        [],

        [
          'Total de movimentações',
          movements.length,
          '',
          'Entradas',
          counts.entry,
          '',
          'Saídas',
          counts.exit,
          '',
          'Vendas',
          counts.sale
        ],

        [],

        [
          'Data',
          'Código',
          'Produto',
          'Tipo',
          'Quantidade',
          'Local',
          'Preço unitário',
          'Custo unitário',
          'Valor da venda',
          'Usuário',
          'Observação'
        ],

        ...detailRows
      ];

      const workbook =
        XLSX.utils.book_new();

      const worksheet =
        XLSX.utils.aoa_to_sheet(
          rows,
          { cellDates:true }
        );

      worksheet['!merges'] = [
        {
          s:{ r:0, c:0 },
          e:{ r:0, c:10 }
        },
        {
          s:{ r:1, c:0 },
          e:{ r:1, c:10 }
        }
      ];

      worksheet['!cols'] = [
        { wch:21 },
        { wch:16 },
        { wch:42 },
        { wch:13 },
        { wch:13 },
        { wch:12 },
        { wch:17 },
        { wch:17 },
        { wch:17 },
        { wch:22 },
        { wch:36 }
      ];

      worksheet['!rows'] = [
        { hpt:25 },
        { hpt:20 },
        { hpt:8 },
        { hpt:22 },
        { hpt:8 },
        { hpt:24 }
      ];

      const firstDataRowIndex =
        6;

      const lastDataRowIndex =
        firstDataRowIndex +
        detailRows.length -
        1;

      for(
        let rowIndex = firstDataRowIndex;
        rowIndex <= lastDataRowIndex;
        rowIndex++
      ){
        const dateRef =
          XLSX.utils.encode_cell({
            r:rowIndex,
            c:0
          });

        if(worksheet[dateRef]){
          worksheet[dateRef].t = 'd';
          worksheet[dateRef].z =
            'dd/mm/yyyy hh:mm';
        }

        for(
          const colIndex of [6,7,8]
        ){
          const ref =
            XLSX.utils.encode_cell({
              r:rowIndex,
              c:colIndex
            });

          if(worksheet[ref]){
            worksheet[ref].z =
              'R$ #,##0.00';
          }
        }
      }

      worksheet['!autofilter'] = {
        ref:
          `A6:K${Math.max(
            6,
            lastDataRowIndex + 1
          )}`
      };

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        'Movimentações'
      );

      const writeFile =
        XLSX.writeFileXLSX ||
        XLSX.writeFile;

      const dateKey =
        generatedAt
          .toISOString()
          .slice(0,10);

      writeFile(
        workbook,
        `movimentacoes-sao-marcos-${dateKey}.xlsx`
      );

      toast(
        'Planilha de movimentações gerada com sucesso.'
      );

    } catch(error){
      console.error(
        'Erro técnico ao gerar planilha de movimentações:',
        error
      );

      toast(
        'Não foi possível gerar a planilha de movimentações agora.'
      );

    } finally {
      setBusy(
        button,
        false
      );
    }
  }

  async function exportFinance(){
    if(!isAdmin()){
      return;
    }

    const button =
      $('exportFinanceBtn');

    setBusy(
      button,
      true,
      'Gerando Excel...'
    );

    try{
      const XLSX =
        await import(
          'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'
        );

      const sales =
        salesForMonth();

      const period =
        selectedMonth();

      let revenue = 0;
      let cost = 0;
      let units = 0;

      const detailRows =
        sales.map(m => {
          const qty =
            n(
              m.qty
            );

          const unitPrice =
            n(
              m.unitPrice
            );

          const unitCost =
            n(
              m.unitCost
            );

          const rowRevenue =
            unitPrice *
            qty;

          const rowCost =
            unitCost *
            qty;

          const profit =
            rowRevenue -
            rowCost;

          const margin =
            rowRevenue >
            0
              ? profit /
                rowRevenue
              : 0;

          revenue +=
            rowRevenue;

          cost +=
            rowCost;

          units +=
            qty;

          return [
            new Date(
              m.date
            )
              .toLocaleString(
                'pt-BR'
              ),

            m.productCode ||
              '',

            m.productName ||
              '',

            qty,

            unitPrice,

            unitCost,

            rowRevenue,

            profit,

            margin
          ];
        });

      const profit =
        revenue -
        cost;

      const margin =
        revenue >
        0
          ? profit /
            revenue
          : 0;

      const rows = [
        [
          'POSTO SÃO MARCOS — FECHAMENTO FINANCEIRO',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          ''
        ],

        [
          `Período: ${period}`,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          ''
        ],

        [],

        [
          'Faturamento',
          revenue,
          '',
          'Custo vendido',
          cost,
          '',
          'Lucro bruto',
          profit,
          ''
        ],

        [
          'Margem',
          margin,
          '',
          'Itens vendidos',
          units,
          '',
          'Vendas',
          sales.length,
          ''
        ],

        [],

        [
          'Data',
          'Código',
          'Produto',
          'Qtd.',
          'Preço unitário',
          'Custo unitário',
          'Faturamento',
          'Lucro bruto',
          'Margem'
        ],

        ...detailRows
      ];

      if(
        detailRows.length
      ){
        rows.push([]);

        rows.push([
          '',
          '',
          'TOTAL',
          units,
          '',
          '',
          revenue,
          profit,
          margin
        ]);
      }

      const workbook =
        XLSX.utils
          .book_new();

      const worksheet =
        XLSX.utils
          .aoa_to_sheet(
            rows
          );

      worksheet['!merges'] = [
        {
          s:{
            r:0,
            c:0
          },

          e:{
            r:0,
            c:8
          }
        },

        {
          s:{
            r:1,
            c:0
          },

          e:{
            r:1,
            c:8
          }
        }
      ];

      worksheet['!cols'] = [
        { wch:21 },
        { wch:16 },
        { wch:42 },
        { wch:10 },
        { wch:18 },
        { wch:18 },
        { wch:18 },
        { wch:18 },
        { wch:13 }
      ];

      worksheet['!rows'] = [
        { hpt:25 },
        { hpt:20 },
        { hpt:8 },
        { hpt:22 },
        { hpt:22 },
        { hpt:8 },
        { hpt:24 }
      ];

      const currencyFormat =
        'R$ #,##0.00';

      const percentFormat =
        '0.0%';

      if(
        worksheet['B4']
      ){
        worksheet['B4'].z =
          currencyFormat;
      }

      if(
        worksheet['E4']
      ){
        worksheet['E4'].z =
          currencyFormat;
      }

      if(
        worksheet['H4']
      ){
        worksheet['H4'].z =
          currencyFormat;
      }

      if(
        worksheet['B5']
      ){
        worksheet['B5'].z =
          percentFormat;
      }

      const headerRowIndex =
        6;

      const firstDataRowIndex =
        7;

      const lastDataRowIndex =
        firstDataRowIndex +
        detailRows.length -
        1;

      for(
        let rowIndex =
          firstDataRowIndex;
        rowIndex <=
          lastDataRowIndex;
        rowIndex++
      ){
        for(
          const colIndex of [
            4,
            5,
            6,
            7
          ]
        ){
          const ref =
            XLSX.utils
              .encode_cell({
                r:rowIndex,
                c:colIndex
              });

          if(
            worksheet[
              ref
            ]
          ){
            worksheet[
              ref
            ].z =
              currencyFormat;
          }
        }

        const marginRef =
          XLSX.utils
            .encode_cell({
              r:rowIndex,
              c:8
            });

        if(
          worksheet[
            marginRef
          ]
        ){
          worksheet[
            marginRef
          ].z =
            percentFormat;
        }
      }

      if(
        detailRows.length
      ){
        const totalRowIndex =
          rows.length -
          1;

        for(
          const colIndex of [
            6,
            7
          ]
        ){
          const ref =
            XLSX.utils
              .encode_cell({
                r:totalRowIndex,
                c:colIndex
              });

          if(
            worksheet[
              ref
            ]
          ){
            worksheet[
              ref
            ].z =
              currencyFormat;
          }
        }

        const totalMarginRef =
          XLSX.utils
            .encode_cell({
              r:totalRowIndex,
              c:8
            });

        if(
          worksheet[
            totalMarginRef
          ]
        ){
          worksheet[
            totalMarginRef
          ].z =
            percentFormat;
        }
      }

      worksheet[
        '!autofilter'
      ] = {
        ref:
          `A${
            headerRowIndex +
            1
          }:I${
            Math.max(
              headerRowIndex +
                1,
              lastDataRowIndex +
                1
            )
          }`
      };

      XLSX.utils
        .book_append_sheet(
          workbook,
          worksheet,
          'Fechamento'
        );

      const writeFile =
        XLSX.writeFileXLSX ||
        XLSX.writeFile;

      writeFile(
        workbook,
        `fechamento-${period}-sao-marcos.xlsx`
      );

      toast(
        'Planilha do fechamento gerada com sucesso.'
      );

    } catch(error){
      console.error(
        'Erro técnico ao gerar planilha:',
        error
      );

      toast(
        'Não foi possível gerar a planilha agora.'
      );

    } finally {
      setBusy(
        button,
        false
      );
    }
  }

