-- =====================================================
-- Migration 002 — Etapa A: modelo de dados completo
-- Rode UMA vez no SQL Editor do Supabase (depois do schema inicial).
-- Tudo roda em uma transação: se algo falhar, nada é aplicado.
-- =====================================================
begin;

-- -----------------------------------------------------
-- 1) restaurantes: slug (URL amigável), logo, endereço, ativo
-- -----------------------------------------------------
alter table restaurantes
  add column if not exists slug     text,
  add column if not exists logo     text,
  add column if not exists endereco text,
  add column if not exists ativo    boolean not null default true;

-- Lojas já existentes ganham um slug provisório (troque depois, ex.: 'burger-do-ze')
update restaurantes set slug = 'loja-' || left(id::text, 8) where slug is null;

alter table restaurantes alter column slug set not null;
alter table restaurantes drop constraint if exists restaurantes_slug_formato;
alter table restaurantes add constraint restaurantes_slug_formato
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
create unique index if not exists restaurantes_slug_key on restaurantes (slug);

-- -----------------------------------------------------
-- 2) produtos: ativo (oculto) x disponivel (esgotado, continua visível)
-- -----------------------------------------------------
alter table produtos
  add column if not exists ativo boolean not null default true;

-- -----------------------------------------------------
-- 3) pedidos: número por restaurante/dia + horário de cada status
-- -----------------------------------------------------
alter table pedidos
  add column if not exists dia           date,
  add column if not exists numero        int,
  add column if not exists confirmado_em timestamptz,
  add column if not exists em_preparo_em timestamptz,
  add column if not exists pronto_em     timestamptz,
  add column if not exists finalizado_em timestamptz,
  add column if not exists cancelado_em  timestamptz;

-- Backfill dos pedidos que já existem
update pedidos
   set dia = (criado_em at time zone 'America/Sao_Paulo')::date
 where dia is null;

with n as (
  select id,
         row_number() over (partition by restaurante_id, dia order by criado_em, id) as rn
  from pedidos
)
update pedidos p set numero = n.rn from n where n.id = p.id and p.numero is null;

alter table pedidos alter column dia set default ((now() at time zone 'America/Sao_Paulo')::date);
alter table pedidos alter column dia set not null;
alter table pedidos alter column numero set not null;

create unique index if not exists pedidos_numero_dia_key on pedidos (restaurante_id, dia, numero);

-- Contador de números (reinicia a cada dia, por restaurante). Seguro contra pedidos simultâneos.
create table if not exists contadores_pedido (
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  dia            date not null,
  ultimo         int  not null default 0,
  primary key (restaurante_id, dia)
);
alter table contadores_pedido enable row level security;  -- sem policies: só a RPC (security definer) acessa

insert into contadores_pedido (restaurante_id, dia, ultimo)
select restaurante_id, dia, max(numero) from pedidos group by restaurante_id, dia
on conflict (restaurante_id, dia)
do update set ultimo = greatest(contadores_pedido.ultimo, excluded.ultimo);

-- -----------------------------------------------------
-- 4) Status: RECEBIDO → CONFIRMADO → EM PREPARO → PRONTO → FINALIZADO
--            RECEBIDO → CANCELADO
-- -----------------------------------------------------
alter table pedidos drop constraint if exists pedidos_status_check;
alter table pedidos add constraint pedidos_status_check
  check (status in ('recebido','confirmado','em_preparo','pronto','finalizado','cancelado'));
alter table pedidos alter column status set default 'recebido';

-- O banco garante o fluxo (ninguém pula etapa, nem pelo console) e carimba o horário
create or replace function public.pedidos_validar_status()
returns trigger
language plpgsql
as $$
begin
  if not (
       (old.status = 'recebido'   and new.status in ('confirmado', 'cancelado'))
    or (old.status = 'confirmado' and new.status = 'em_preparo')
    or (old.status = 'em_preparo' and new.status = 'pronto')
    or (old.status = 'pronto'     and new.status = 'finalizado')
  ) then
    raise exception 'Transição de status inválida: % -> %', old.status, new.status;
  end if;

  if    new.status = 'confirmado' then new.confirmado_em := now();
  elsif new.status = 'em_preparo' then new.em_preparo_em := now();
  elsif new.status = 'pronto'     then new.pronto_em     := now();
  elsif new.status = 'finalizado' then new.finalizado_em := now();
  elsif new.status = 'cancelado'  then new.cancelado_em  := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedidos_status on pedidos;
create trigger trg_pedidos_status
  before update of status on pedidos
  for each row
  when (old.status is distinct from new.status)
  execute function public.pedidos_validar_status();

-- -----------------------------------------------------
-- 5) RPC processar_pedido v2: devolve {id, numero}, cria como 'recebido',
--    recusa loja inativa e produto inativo/esgotado
-- -----------------------------------------------------
drop function if exists public.processar_pedido(uuid, jsonb);

create function public.processar_pedido(p_restaurante_id uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_numero    int;
  v_dia       date := (now() at time zone 'America/Sao_Paulo')::date;
  v_item      jsonb;
  v_prod      produtos%rowtype;
  v_qtd       int;
  v_total     numeric(10,2) := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio ou inválido';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'Itens demais no pedido';
  end if;
  if not exists (select 1 from restaurantes where id = p_restaurante_id and ativo) then
    raise exception 'Restaurante indisponível';
  end if;

  -- 1ª passada: valida tudo e soma o total (for share trava o produto contra mudança de preço)
  for v_item in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Item inválido';
    end if;
    v_qtd := (v_item->>'qtd')::int;
    if v_qtd is null or v_qtd < 1 or v_qtd > 20 then
      raise exception 'Quantidade inválida';
    end if;

    select * into v_prod
      from produtos
     where id = (v_item->>'id_produto')::uuid
       and restaurante_id = p_restaurante_id
       and ativo
       for share;
    if not found then
      raise exception 'Produto inválido ou removido do cardápio';
    end if;
    if not v_prod.disponivel then
      raise exception 'Produto esgotado: %', v_prod.nome;
    end if;

    v_total := v_total + v_prod.preco * v_qtd;
  end loop;

  -- Número do pedido (#1, #2, ... por restaurante e por dia)
  insert into contadores_pedido (restaurante_id, dia, ultimo)
  values (p_restaurante_id, v_dia, 1)
  on conflict (restaurante_id, dia)
  do update set ultimo = contadores_pedido.ultimo + 1
  returning ultimo into v_numero;

  insert into pedidos (restaurante_id, dia, numero, status, total)
  values (p_restaurante_id, v_dia, v_numero, 'recebido', v_total)
  returning id into v_pedido_id;

  -- 2ª passada: grava os itens com nome e preço "congelados"
  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos where id = (v_item->>'id_produto')::uuid;

    insert into itens_pedido (pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao)
    values (v_pedido_id, v_prod.id, v_prod.nome, v_prod.preco, (v_item->>'qtd')::int,
            nullif(left(coalesce(v_item->>'obs', ''), 200), ''));
  end loop;

  return jsonb_build_object('id', v_pedido_id, 'numero', v_numero);
end;
$$;

revoke all on function public.processar_pedido(uuid, jsonb) from public;
grant execute on function public.processar_pedido(uuid, jsonb) to anon, authenticated;

-- -----------------------------------------------------
-- 6) Políticas: cliente só vê loja/produto ativos; equipe vê tudo da própria loja
-- -----------------------------------------------------
drop policy if exists "cardapio_publico_restaurantes" on restaurantes;
drop policy if exists "cardapio_publico_produtos"     on produtos;
drop policy if exists "restaurantes_select_funcionario" on restaurantes;
drop policy if exists "produtos_select_funcionario"     on produtos;

create policy "cardapio_publico_restaurantes" on restaurantes
  for select to anon, authenticated using (ativo);
create policy "cardapio_publico_produtos" on produtos
  for select to anon, authenticated using (ativo);

create policy "restaurantes_select_funcionario" on restaurantes
  for select to authenticated using (eh_funcionario(id));
create policy "produtos_select_funcionario" on produtos
  for select to authenticated using (eh_funcionario(restaurante_id));

commit;

-- =====================================================
-- Conferência (rode depois, opcional):
--   select id, nome, slug, ativo from restaurantes;
--   select numero, status, criado_em from pedidos order by criado_em desc limit 5;
--   -- para dar um slug bonito à sua loja:
--   update restaurantes set slug = 'meu-restaurante' where id = '<uuid-da-loja>';
-- =====================================================
