-- Atualização de preço segura e atômica para relatórios REL011 do ERP São Marcos.
-- Este arquivo é uma proposta: aplicar via migração após validação da interface.
-- A operação NÃO modifica stock, pista nem movimentos já registrados.

alter table public.price_history
  add column if not exists source text not null default 'manual';

alter table public.price_history
  add column if not exists import_batch_id uuid;

do $
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'price_history_source_check'
      and conrelid = 'public.price_history'::regclass
  ) then
    alter table public.price_history
      add constraint price_history_source_check
      check (source in ('manual', 'pdf'));
  end if;
end;
$;

create or replace function private.capture_price_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.cost is distinct from old.cost
     or new.sale_price is distinct from old.sale_price then
    insert into public.price_history(
      product_id, cost, sale_price, changed_by, source, import_batch_id
    )
    values (
      new.id,
      new.cost,
      new.sale_price,
      coalesce(new.updated_by, new.created_by, (select auth.uid())),
      coalesce(nullif(current_setting('app.price_change_source', true), ''), 'manual'),
      nullif(current_setting('app.price_import_batch', true), '')::uuid
    );
  end if;
  return new;
end;
$$;

create or replace function private.apply_price_import_core(p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_current public.products%rowtype;
  v_expected_cost numeric;
  v_expected_sale numeric;
  v_cost numeric;
  v_sale numeric;
  v_batch uuid := gen_random_uuid();
  v_seen uuid[] := array[]::uuid[];
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  if (select auth.uid()) is null or not private.is_admin() then
    raise exception 'Somente administradores podem atualizar preços';
  end if;

  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_array_length(p_changes) < 1
     or jsonb_array_length(p_changes) > 600 then
    raise exception 'A importação deve conter entre 1 e 600 produtos';
  end if;

  perform set_config('app.price_change_source', 'pdf', true);
  perform set_config('app.price_import_batch', v_batch::text, true);

  for v_item in select value from jsonb_array_elements(p_changes)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ? 'product_id')
       or not (v_item ? 'expected_cost')
       or not (v_item ? 'expected_sale_price')
       or not (v_item ? 'new_cost')
       or not (v_item ? 'new_sale_price') then
      raise exception 'Linha do arquivo contém dados incompletos';
    end if;

    v_product_id := (v_item->>'product_id')::uuid;
    v_expected_cost := (v_item->>'expected_cost')::numeric;
    v_expected_sale := (v_item->>'expected_sale_price')::numeric;
    v_cost := (v_item->>'new_cost')::numeric;
    v_sale := (v_item->>'new_sale_price')::numeric;

    if v_product_id is null or v_product_id = any(v_seen) then
      raise exception 'Produto repetido ou inválido na importação';
    end if;
    v_seen := array_append(v_seen, v_product_id);

    if v_cost is null or v_cost < 0 or v_sale is null or v_sale <= 0 then
      raise exception 'Custo ou venda inválidos para produto %', v_product_id;
    end if;

    select * into v_current
    from public.products
    where id = v_product_id and is_active = true
    for update;

    if not found then
      raise exception 'Produto desativado ou não encontrado: %', v_product_id;
    end if;

    if v_current.cost is distinct from v_expected_cost
       or v_current.sale_price is distinct from v_expected_sale then
      raise exception 'Os preços de % mudaram desde a leitura do PDF. Atualize a página e confira novamente.', v_current.code;
    end if;

    if v_current.cost is not distinct from v_cost
       and v_current.sale_price is not distinct from v_sale then
      v_skipped := v_skipped + 1;
    else
      update public.products
      set cost = v_cost,
          sale_price = v_sale,
          updated_by = (select auth.uid())
      where id = v_product_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'updated', v_updated,
    'unchanged', v_skipped,
    'import_batch_id', v_batch
  );
end;
$$;

create or replace function public.apply_price_import(p_changes jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.apply_price_import_core(p_changes);
$$;

revoke all on function public.apply_price_import(jsonb) from public, anon;
revoke all on function private.apply_price_import_core(jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.apply_price_import_core(jsonb) to authenticated;
grant execute on function public.apply_price_import(jsonb) to authenticated;
notify pgrst, 'reload schema';
