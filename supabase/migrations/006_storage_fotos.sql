-- =====================================================================
-- MIGRATION 006 — Storage de Fotos
-- =====================================================================
begin;

-- 1. Criação do bucket público "produtos"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'produtos', 
  'produtos', 
  true, 
  524288, -- Limite estrito de 512KB no servidor (200KB no client é recomendado)
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update 
set public = true, allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

-- 2. Permitir acesso público de leitura às imagens
create policy "Imagens publicas no bucket produtos" on storage.objects
  for select to public
  using (bucket_id = 'produtos');

-- 3. Restringir gestão ao Dono do restaurante
-- O caminho obrigatório para o upload será: restaurante_id/nome_do_arquivo.webp
create policy "Dono gerencia fotos do bucket produtos" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'produtos'
    and (select public.eh_dono((string_to_array(name, '/'))[1]::uuid))
  )
  with check (
    bucket_id = 'produtos'
    and (select public.eh_dono((string_to_array(name, '/'))[1]::uuid))
  );

commit;
