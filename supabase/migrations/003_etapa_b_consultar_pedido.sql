-- =====================================================================
-- MIGRATION 003 — Consultar Pedido (Etapa B)
-- =====================================================================

create function public.consultar_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido record;
  v_itens jsonb;
begin
  select p.id, p.numero, p.status, p.criado_em, p.total, r.nome as restaurante_nome
  into v_pedido
  from pedidos p
  join restaurantes r on r.id = p.restaurante_id
  where p.id = p_pedido_id;

  if not found then
    return null;
  end if;

  select jsonb_agg(jsonb_build_object(
    'nome', i.nome_produto,
    'qtd', i.quantidade,
    'obs', i.observacao,
    'preco', i.preco_unitario
  )) into v_itens
  from itens_pedido i
  where i.pedido_id = p_pedido_id;

  return jsonb_build_object(
    'id', v_pedido.id,
    'numero', v_pedido.numero,
    'status', v_pedido.status,
    'criado_em', v_pedido.criado_em,
    'total', v_pedido.total,
    'restaurante_nome', v_pedido.restaurante_nome,
    'itens', coalesce(v_itens, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.consultar_pedido(uuid) from public;
grant execute on function public.consultar_pedido(uuid) to anon, authenticated;
