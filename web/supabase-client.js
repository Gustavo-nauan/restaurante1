// Cliente Supabase compartilhado (carregue DEPOIS do SDK e ANTES dos outros scripts)
const SUPABASE_URL = 'https://nywozapczmjlateqnssy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zOcgGAxaT3H3A4HdMskzhw_2QHYlzBG'; // chave publicável (nunca use a sb_secret no front)

// Nome "db" evita conflito com o global window.supabase do SDK
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A loja vem da URL: index.html?r=meu-restaurante  (slug)  ou  ?r=<uuid>
async function resolverRestaurante() {
  const ref = new URLSearchParams(window.location.search).get('r');
  if (!ref) return null;
  let consulta = db.from('restaurantes').select('id, nome, slug, logo, endereco').eq('ativo', true);
  consulta = UUID_RE.test(ref) ? consulta.eq('id', ref) : consulta.eq('slug', ref.toLowerCase());
  const { data, error } = await consulta.maybeSingle();
  if (error) {
    console.error('Erro ao buscar restaurante:', error.message);
    return null;
  }
  return data; // null se não existe ou está inativo
}