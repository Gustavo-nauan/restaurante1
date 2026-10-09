-- =====================================================
-- Migration 004 — Cozinha: índice para o "Histórico do dia"
-- Rode UMA vez no SQL Editor do Supabase (depois do schema_completo.sql).
-- Não altera dados, regras de status nem políticas de RLS.
-- =====================================================
begin;

-- A tela de histórico busca, para uma loja, os pedidos finalizados/cancelados de um dia
-- (coluna "dia" = data em America/Sao_Paulo), do mais novo para o mais antigo.
-- O índice atende exatamente esse filtro e a ordenação.
create index if not exists idx_pedidos_rest_dia_status
  on public.pedidos (restaurante_id, dia, status, criado_em desc);

commit;
