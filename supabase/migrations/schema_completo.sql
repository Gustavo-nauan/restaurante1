-- =====================================================================
-- SCHEMA COMPLETO — Plataforma de pedidos para restaurantes
-- Estado: Etapa D concluída (migrations 001 ao 006 aplicadas em um banco vazio)
--
-- ⚠️  ATENÇÃO: este script APAGA e RECRIA as tabelas do projeto.
--     TODOS OS DADOS dessas tabelas serão perdidos.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- PARTE 0 — Limpeza
-- ---------------------------------------------------------------------
drop table if exists itens_pedido      cascade;
drop table if exists contadores_pedido cascade;
drop table if exists pedidos           cascade;
drop table if exists funcionarios      cascade;
drop table if exists produtos          cascade;
drop table if exists categorias        cascade;
drop table if exists restaurantes      cascade;

drop function if exists public.processar_pedido(uuid, jsonb) cascade;
drop function if exists public.consultar_pedido(uuid)        cascade;
drop function if exists public.eh_funcionario(uuid)          cascade;
drop function if exists public.eh_dono(uuid)                 cascade;
drop function if exists public.pedidos_validar_status()      cascade;

-- ---------------------------------------------------------------------
-- PARTE 1 — Tabelas
-- ---------------------------------------------------------------------
create table restaurantes (
  id       uuid primary key default gen_random_uuid(),
  nome     text not null,
  slug     text not null unique
           default ('loja-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  logo     text,
  endereco text,
  ativo    boolean not null default true,
  constraint restaurantes_slug_formato check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table categorias (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  nome           text not null,
  ordem          int  not null default 0,
  arquivada      boolean not null default false
);

create table produtos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  categoria_id   uuid not null references categorias(id) on delete cascade,
  nome           text not null,
  descricao      text,
  preco          numeric(10,2) not null check (preco >= 0),
  imagem         text,
  disponivel     boolean not null default true,
  ativo          boolean not null default true,
  arquivado      boolean not null default false
);

create table pedidos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  dia            date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  numero         int  not null,
  status         text not null default 'recebido',
  total          numeric(10,2) not null default 0,
  criado_em      timestamptz not null default now(),
  confirmado_em  timestamptz,
  em_preparo_em  timestamptz,
  pronto_em      timestamptz,
  finalizado_em  timestamptz,
  cancelado_em   timestamptz,
  constraint pedidos_status_check
    check (status in ('recebido','confirmado','em_preparo','pronto','finalizado','cancelado')),
  constraint pedidos_numero_dia_key unique (restaurante_id, dia, numero)
);

create table itens_pedido (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references pedidos(id) on delete cascade,
  produto_id     uuid not null references produtos(id),
  nome_produto   text not null,
  preco_unitario numeric(10,2) not null,
  quantidade     int not null check (quantidade between 1 and 20),
  observacao     text check (char_length(observacao) <= 200)
);

create table contadores_pedido (
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  dia            date not null,
  ultimo         int  not null default 0,
  primary key (restaurante_id, dia)
);

create table funcionarios (
  user_id        uuid not null references auth.users(id) on delete cascade,
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  papel          text not null default 'cozinha' check (papel in ('dono', 'cozinha')),
  primary key (user_id, restaurante_id)
);

create index idx_categorias_restaurante on categorias(restaurante_id);
create index idx_produtos_categoria     on produtos(categoria_id);
create index idx_pedidos_rest_status    on pedidos(restaurante_id, status, criado_em);
create index idx_pedidos_rest_dia_status on pedidos(restaurante_id, dia, status, criado_em desc);
create index idx_itens_pedido           on itens_pedido(pedido_id);

-- ---------------------------------------------------------------------
-- PARTE 2 — Funções e trigger
-- ---------------------------------------------------------------------
create function public.eh_funcionario(p_restaurante uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from funcionarios
    where user_id = auth.uid() and restaurante_id = p_restaurante
  );
$$;

create function public.eh_dono(p_restaurante uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from funcionarios
    where user_id = auth.uid() and restaurante_id = p_restaurante and papel = 'dono'
  );
$$;

create function public.pedidos_validar_status()
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

create trigger trg_pedidos_status
  before update of status on pedidos
  for each row
  when (old.status is distinct from new.status)
  execute function public.pedidos_validar_status();

create function public.processar_pedido(p_restaurante_id uuid, p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = public
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

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Item inválido'; end if;
    v_qtd := (v_item->>'qtd')::int;
    if v_qtd is null or v_qtd < 1 or v_qtd > 20 then raise exception 'Quantidade inválida'; end if;

    select * into v_prod from produtos
     where id = (v_item->>'id_produto')::uuid and restaurante_id = p_restaurante_id and ativo for share;
    if not found then raise exception 'Produto inválido ou removido do cardápio'; end if;
    if not v_prod.disponivel then raise exception 'Produto esgotado: %', v_prod.nome; end if;
    v_total := v_total + v_prod.preco * v_qtd;
  end loop;

  insert into contadores_pedido (restaurante_id, dia, ultimo)
  values (p_restaurante_id, v_dia, 1) on conflict (restaurante_id, dia)
  do update set ultimo = contadores_pedido.ultimo + 1 returning ultimo into v_numero;

  insert into pedidos (restaurante_id, dia, numero, status, total)
  values (p_restaurante_id, v_dia, v_numero, 'recebido', v_total) returning id into v_pedido_id;

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

create function public.consultar_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_pedido record;
  v_itens jsonb;
begin
  select p.id, p.numero, p.status, p.criado_em, p.total, r.nome as restaurante_nome
  into v_pedido from pedidos p join restaurantes r on r.id = p.restaurante_id where p.id = p_pedido_id;

  if not found then return null; end if;

  select jsonb_agg(jsonb_build_object(
    'nome', i.nome_produto, 'qtd', i.quantidade, 'obs', i.observacao, 'preco', i.preco_unitario
  )) into v_itens from itens_pedido i where i.pedido_id = p_pedido_id;

  return jsonb_build_object(
    'id', v_pedido.id, 'numero', v_pedido.numero, 'status', v_pedido.status, 'criado_em', v_pedido.criado_em,
    'total', v_pedido.total, 'restaurante_nome', v_pedido.restaurante_nome, 'itens', coalesce(v_itens, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.consultar_pedido(uuid) from public;
grant execute on function public.consultar_pedido(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- PARTE 3 — Segurança (RLS)
-- ---------------------------------------------------------------------
alter table restaurantes      enable row level security;
alter table categorias        enable row level security;
alter table produtos          enable row level security;
alter table pedidos           enable row level security;
alter table itens_pedido      enable row level security;
alter table funcionarios      enable row level security;
alter table contadores_pedido enable row level security;

-- Público (somente leitura para o que não está arquivado/inativo)
create policy "cardapio_publico_restaurantes" on restaurantes for select to anon, authenticated using (ativo);
create policy "cardapio_publico_categorias" on categorias for select to anon, authenticated using (not arquivada);
create policy "cardapio_publico_produtos" on produtos for select to anon, authenticated using (ativo and not arquivado);

-- Equipe: select geral
create policy "restaurantes_select_funcionario" on restaurantes for select to authenticated using (eh_funcionario(id));
create policy "produtos_select_funcionario" on produtos for select to authenticated using (eh_funcionario(restaurante_id));
create policy "pedidos_select_funcionario" on pedidos for select to authenticated using (eh_funcionario(restaurante_id));
create policy "itens_select_funcionario" on itens_pedido for select to authenticated using (eh_funcionario((select p.restaurante_id from pedidos p where p.id = pedido_id)));
create policy "funcionarios_ve_proprio" on funcionarios for select to authenticated using (user_id = auth.uid());

-- Cozinha: update status do pedido
revoke update on pedidos from authenticated;
grant update (status) on pedidos to authenticated;
create policy "pedidos_update_funcionario" on pedidos for update to authenticated using (eh_funcionario(restaurante_id)) with check (eh_funcionario(restaurante_id));

-- Dono: gestão do cardápio e restaurante
create policy "restaurantes_update_dono" on restaurantes for update to authenticated using (eh_dono(id)) with check (eh_dono(id));
revoke update (id) on restaurantes from authenticated;

create policy "categorias_insert_dono" on categorias for insert to authenticated with check (eh_dono(restaurante_id));
create policy "categorias_update_dono" on categorias for update to authenticated using (eh_dono(restaurante_id)) with check (eh_dono(restaurante_id));
revoke update (id, restaurante_id) on categorias from authenticated;

create policy "produtos_insert_dono" on produtos for insert to authenticated with check (eh_dono(restaurante_id));
create policy "produtos_update_dono" on produtos for update to authenticated using (eh_dono(restaurante_id)) with check (eh_dono(restaurante_id));
revoke update (id, restaurante_id) on produtos from authenticated;

-- ---------------------------------------------------------------------
-- PARTE 4 — Tempo real (a tabela precisa estar na publicação)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.pedidos;

-- ---------------------------------------------------------------------
-- PARTE 5 — Storage (Fotos)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 524288, ARRAY['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

create policy "Imagens publicas no bucket produtos" on storage.objects for select to public using (bucket_id = 'produtos');

create policy "Dono gerencia fotos do bucket produtos" on storage.objects
  for all to authenticated
  using (bucket_id = 'produtos' and (select public.eh_dono((string_to_array(name, '/'))[1]::uuid)))
  with check (bucket_id = 'produtos' and (select public.eh_dono((string_to_array(name, '/'))[1]::uuid)));

commit;
