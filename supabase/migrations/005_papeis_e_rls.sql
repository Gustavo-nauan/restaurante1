-- =====================================================================
-- MIGRATION 005 — Papéis (Dono/Cozinha) e RLS de Administração
-- =====================================================================
begin;

-- 1. Adicionar papel e as colunas de arquivamento (soft delete)
alter table funcionarios add column papel text not null default 'cozinha' check (papel in ('dono', 'cozinha'));

-- Todos os funcionários que já estavam no sistema viram donos
update funcionarios set papel = 'dono';

alter table categorias add column arquivada boolean not null default false;
alter table produtos add column arquivado boolean not null default false;

-- 2. Função para verificar permissão máxima
create or replace function public.eh_dono(p_restaurante uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from funcionarios
    where user_id = auth.uid() and restaurante_id = p_restaurante and papel = 'dono'
  );
$$;

-- 3. Atualizar políticas públicas do cardápio para ocultar arquivados
drop policy if exists "cardapio_publico_categorias" on categorias;
drop policy if exists "cardapio_publico_produtos" on produtos;

create policy "cardapio_publico_categorias" on categorias
  for select to anon, authenticated using (not arquivada);

create policy "cardapio_publico_produtos" on produtos
  for select to anon, authenticated using (ativo and not arquivado);

-- As permissões de select para a equipe (eh_funcionario) continuam intactas, 
-- assim eles podem ver produtos arquivados no painel se necessário.

-- 4. RLS para o Dono gerenciar o restaurante
create policy "restaurantes_update_dono" on restaurantes
  for update to authenticated
  using (eh_dono(id)) with check (eh_dono(id));

-- Segurança: Impedir troca de chaves primárias
revoke update (id) on restaurantes from authenticated;

-- 5. RLS para Categorias
create policy "categorias_insert_dono" on categorias
  for insert to authenticated
  with check (eh_dono(restaurante_id));

create policy "categorias_update_dono" on categorias
  for update to authenticated
  using (eh_dono(restaurante_id)) with check (eh_dono(restaurante_id));

revoke update (id, restaurante_id) on categorias from authenticated;

-- 6. RLS para Produtos
create policy "produtos_insert_dono" on produtos
  for insert to authenticated
  with check (eh_dono(restaurante_id));

create policy "produtos_update_dono" on produtos
  for update to authenticated
  using (eh_dono(restaurante_id)) with check (eh_dono(restaurante_id));

revoke update (id, restaurante_id) on produtos from authenticated;

commit;
