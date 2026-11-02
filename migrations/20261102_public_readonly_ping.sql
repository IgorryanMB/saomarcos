-- Endpoint de atividade de somente leitura. Nunca acessa estoque, caixa ou usuários.
-- SEC INVOKER: não contorna as políticas RLS.
create or replace function public.sao_marcos_activity_ping()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $function$
  select now();
$function$;

revoke all on function public.sao_marcos_activity_ping() from public, anon, authenticated;
grant execute on function public.sao_marcos_activity_ping() to anon, authenticated;

notify pgrst, 'reload schema';
