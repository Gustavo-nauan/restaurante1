// Painel da cozinha: login, pedidos em tempo real (Realtime), troca de status e histórico do dia.
// Regras de negócio (transição de status, permissões) são garantidas pelo banco; aqui só reorganizamos a interface.
const STATUS_COLUNAS = ['recebido', 'confirmado', 'em_preparo', 'pronto'];
const PROXIMO = { recebido: 'confirmado', confirmado: 'em_preparo', em_preparo: 'pronto', pronto: 'finalizado' };
const ROTULO_ACAO = { recebido: 'Aceitar', confirmado: 'Iniciar preparo', em_preparo: 'Marcar pronto', pronto: 'Finalizar' };
const ROTULO_STATUS = {
  recebido: 'Novo', confirmado: 'Aceito', em_preparo: 'Preparando',
  pronto: 'Pronto', finalizado: 'Finalizado', cancelado: 'Cancelado',
};
const SELECT_PEDIDO =
  'id, numero, dia, status, total, criado_em, finalizado_em, cancelado_em, restaurante_id, ' +
  'itens_pedido ( nome_produto, quantidade, observacao )';
const TZ = 'America/Sao_Paulo';
const LIMITE_HISTORICO = 500;
const CHAVE_SOM = 'cozinha:som';

// ---------- Estado ----------
let restauranteId = null;
let canal = null;
let painelAtivo = false;
let entrando = false;
let intervaloTempo = null;
let vistaAtual = 'pedidos';
let diaHistorico = null;
let jaCarregou = false;

const abertos = new Map();    // pedidos em andamento (id → pedido)
const historico = new Map();  // finalizados/cancelados (id → pedido)
const cartoes = new Map();    // id → elemento <article> já desenhado (evita duplicar e refazer a tela inteira)
const ocupados = new Set();   // pedidos com uma troca de status em andamento
const idsNovos = new Set();   // pedidos que acabaram de chegar (recebem o destaque pulsante)
const quando = new Map();     // id → instante (ms) em que o pedido foi aplicado na tela
const seqPedido = new Map();  // id → número da última busca aplicada (descarta respostas antigas)
let seqGlobal = 0;

// ---------- Utilitários ----------
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const icone = (nome, extra = '') =>
  `<svg class="icone ${extra}" aria-hidden="true" focusable="false"><use href="#i-${nome}"/></svg>`;
const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '';
const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hoje = () => formatoDia.format(new Date()); // "AAAA-MM-DD" no fuso de São Paulo

// Toast: sucesso some em 4s; erro fica até ser dispensado.
function mostrarToast(msg, erro = false) {
  const el = document.createElement('div');
  el.className = `toast${erro ? ' toast--erro' : ''}`;
  el.setAttribute('role', erro ? 'alert' : 'status');
  el.innerHTML = `${icone(erro ? 'alerta' : 'check', 'icone--24')}<p class="toast__texto"></p>`;
  el.querySelector('.toast__texto').textContent = msg; // texto sempre via textContent
  const fechar = () => el.remove();
  if (erro) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast__fechar';
    b.setAttribute('aria-label', 'Dispensar mensagem');
    b.innerHTML = icone('x');
    b.addEventListener('click', fechar);
    el.appendChild(b);
  } else {
    setTimeout(fechar, 4000);
  }
  $('toasts').appendChild(el);
}

// ---------- Telas: login / painel ----------
function mostrarLogin(mensagem = '') {
  $('tela-painel').hidden = true;
  $('tela-login').hidden = false;
  $('btn-entrar').disabled = false;
  $('btn-entrar').textContent = 'Entrar';
  erroLogin(mensagem);
  document.title = 'Cozinha';
}

function mostrarPainel() {
  $('tela-login').hidden = true;
  $('tela-painel').hidden = false;
}

function erroLogin(mensagem) {
  $('login-erro').hidden = !mensagem;
  $('login-erro-texto').textContent = mensagem || '';
  ['email', 'senha'].forEach((id) => (mensagem ? $(id).setAttribute('aria-invalid', 'true') : $(id).removeAttribute('aria-invalid')));
}

// ---------- Cartões ----------
function htmlItens(p) {
  return (p.itens_pedido || [])
    .map(
      (i) => `
      <li class="pedido__item">
        <p class="pedido__item-linha"><span class="pedido__qtd num">${esc(i.quantidade)}×</span> ${esc(i.nome_produto)}</p>
        ${i.observacao
          ? `<p class="obs">${icone('alerta', 'icone--24')}<span class="obs__corpo"><span class="obs__rotulo">Observação do cliente</span><span class="obs__texto">${esc(i.observacao)}</span></span></p>`
          : ''}
      </li>`
    )
    .join('');
}

function rotuloDia(p) {
  if (p.dia === hoje()) return '';
  const [, mes, dia] = String(p.dia).split('-');
  return `<span class="pedido__dia">Pedido de ${esc(dia)}/${esc(mes)}</span>`;
}

function htmlCartaoAberto(p) {
  const acao = PROXIMO[p.status]
    ? `<button type="button" class="btn-cozinha" data-acao="avancar">${esc(ROTULO_ACAO[p.status])}</button>`
    : '';
  const cancelar =
    p.status === 'recebido'
      ? '<button type="button" class="btn-cozinha btn-cozinha--perigo" data-acao="cancelar">Cancelar</button>'
      : '';
  return `
    <div class="pedido__topo">
      <div><span class="pedido__numero num">#${esc(p.numero)}</span>${rotuloDia(p)}</div>
      <span class="badge-status">${esc(ROTULO_STATUS[p.status])}</span>
    </div>
    <p class="pedido__meta">
      <span class="num">${esc(hora(p.criado_em))}</span>
      <span class="pedido__tempo" data-tempo>${icone('relogio')}<span data-tempo-texto></span></span>
    </p>
    <ul class="pedido__itens">${htmlItens(p)}</ul>
    <div class="pedido__rodape">${acao}${cancelar}</div>`;
}

function htmlCartaoHistorico(p) {
  const cancelado = p.status === 'cancelado';
  const fim = cancelado ? p.cancelado_em : p.finalizado_em;
  return `
    <article class="pedido" data-status="${esc(p.status)}">
      <div class="pedido__topo">
        <div><span class="pedido__numero num">#${esc(p.numero)}</span>${rotuloDia(p)}</div>
        <span class="badge-status">${esc(ROTULO_STATUS[p.status])}</span>
      </div>
      <p class="pedido__meta">
        <span class="num">Pedido às ${esc(hora(p.criado_em))}</span>
        ${fim ? `<span class="num">${cancelado ? 'Cancelado' : 'Finalizado'} às ${esc(hora(fim))}</span>` : ''}
      </p>
      <ul class="pedido__itens">${htmlItens(p)}</ul>
      <p class="pedido__total"><span>Total</span><span class="num">${esc(moeda(p.total))}</span></p>
    </article>`;
}

const assinatura = (p) =>
  [p.status, p.numero, p.dia, ...(p.itens_pedido || []).map((i) => `${i.quantidade}|${i.nome_produto}|${i.observacao ?? ''}`)].join('¦');

// Devolve o cartão do pedido, refazendo o conteúdo só quando algo mudou
function obterCartao(p) {
  let el = cartoes.get(p.id);
  if (!el) {
    el = document.createElement('article');
    el.dataset.id = p.id;
    cartoes.set(p.id, el);
  }
  const sig = assinatura(p);
  if (el.dataset.sig !== sig) {
    el.className = 'pedido';
    el.dataset.status = p.status;
    el.dataset.criado = p.criado_em;
    el.dataset.sig = sig;
    el.innerHTML = htmlCartaoAberto(p);
  }
  if (idsNovos.has(p.id)) {
    idsNovos.delete(p.id);
    el.classList.add('pedido--novo');
    setTimeout(() => el.classList.remove('pedido--novo'), 3000);
  }
  atualizarTempoCartao(el);
  return el;
}

// ---------- Tempo decorrido ----------
function textoTempo(min) {
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

function atualizarTempoCartao(el) {
  const alvo = el.querySelector('[data-tempo]');
  if (!alvo) return;
  const min = Math.max(0, (Date.now() - new Date(el.dataset.criado).getTime()) / 60000);
  alvo.querySelector('[data-tempo-texto]').textContent = textoTempo(Math.floor(min));
  alvo.classList.toggle('tempo--atencao', min >= 10 && min < 20); // normal até 10 min; âmbar de 10 a 20
  alvo.classList.toggle('tempo--critico', min >= 20);             // vermelho acima de 20 min
}

function tick() {
  document.querySelectorAll('#colunas .pedido').forEach(atualizarTempoCartao);
  if (vistaAtual === 'historico' && diaHistorico && diaHistorico !== hoje()) carregarHistorico(); // virou o dia
}

// ---------- Renderização ----------
function renderizar() {
  const porStatus = Object.fromEntries(STATUS_COLUNAS.map((s) => [s, []]));
  abertos.forEach((p) => porStatus[p.status]?.push(p));
  const vivos = new Set();

  STATUS_COLUNAS.forEach((s) => {
    const lista = $(`lista-${s}`);
    const ordenados = porStatus[s].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em) || a.numero - b.numero);
    let ref = lista.firstElementChild;
    ordenados.forEach((p) => {
      vivos.add(p.id);
      const el = obterCartao(p);
      if (el === ref) ref = ref.nextElementSibling;
      else lista.insertBefore(el, ref); // move o cartão (inclusive entre colunas) sem recriá-lo
    });
    $(`cont-${s}`).textContent = ordenados.length;
    $(`aba-cont-${s}`).textContent = ordenados.length;
  });

  cartoes.forEach((el, id) => {
    if (!vivos.has(id)) { el.remove(); cartoes.delete(id); }
  });

  const novos = porStatus.recebido.length;
  document.title = `${novos ? `(${novos}) ` : ''}Cozinha`;
  if (vistaAtual === 'historico') renderizarHistorico();
}

function renderizarHistorico() {
  const dia = hoje();
  const lista = [...historico.values()]
    .filter((p) => p.dia === dia)
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  const finalizados = lista.filter((p) => p.status === 'finalizado');
  const valor = finalizados.reduce((soma, p) => soma + Number(p.total), 0); // cancelados não entram no valor

  const item = (rotulo, valorTexto) =>
    `<div class="resumo__item"><span class="resumo__rotulo">${esc(rotulo)}</span><strong class="resumo__valor num">${esc(valorTexto)}</strong></div>`;
  $('historico-resumo').innerHTML =
    item('Pedidos', lista.length) +
    item('Finalizados', finalizados.length) +
    item('Cancelados', lista.length - finalizados.length) +
    item('Valor (sem cancelados)', moeda(valor));

  $('historico-lista').innerHTML = lista.length
    ? lista.map(htmlCartaoHistorico).join('')
    : `<div class="estado">${icone('check', 'icone--24')}<p class="estado__titulo">Nenhum pedido finalizado ou cancelado hoje.</p></div>`;
}

// ---------- Dados ----------
// Aplica no estado local um pedido completo vindo do banco. Respostas mais antigas que a já aplicada são descartadas.
function aplicarPedido(p, seq, inserido = false) {
  if (seq < (seqPedido.get(p.id) || 0)) return false;
  seqPedido.set(p.id, seq);
  quando.set(p.id, Date.now());
  const emAndamento = p.status !== 'finalizado' && p.status !== 'cancelado';
  let adicionado = false;
  if (emAndamento) {
    historico.delete(p.id);
    adicionado = !abertos.has(p.id);
    if (adicionado && inserido) idsNovos.add(p.id);
    abertos.set(p.id, p);
  } else {
    abertos.delete(p.id);
    historico.set(p.id, p);
  }
  renderizar();
  return adicionado;
}

// Busca o pedido completo (com itens: itens_pedido não está no Realtime) e o aplica na tela
async function atualizarPedido(id, inserido = false, tentativa = 1) {
  const seq = ++seqGlobal;
  const { data, error } = await db.from('pedidos').select(SELECT_PEDIDO).eq('id', id).maybeSingle();
  if (error) {
    console.error('Erro ao buscar pedido:', error.message);
    if (tentativa < 4 && painelAtivo) setTimeout(() => atualizarPedido(id, inserido, tentativa + 1), 3000 * tentativa);
    return false;
  }
  if (!data) {
    abertos.delete(id);
    historico.delete(id);
    renderizar();
    return false;
  }
  return aplicarPedido(data, seq, inserido);
}

function mostrarAviso(mensagem) {
  $('aviso-erro').hidden = !mensagem;
  if (mensagem) $('aviso-erro-texto').textContent = mensagem;
}

// Carga inicial e recarga ao reconectar. Mescla (não zera) para não perder pedido que chegou durante a consulta.
async function carregarPedidos() {
  const t0 = Date.now();
  const { data, error } = await db
    .from('pedidos')
    .select(SELECT_PEDIDO)
    .eq('restaurante_id', restauranteId)
    .in('status', STATUS_COLUNAS)
    .order('criado_em');
  if (!painelAtivo) return;
  if (error) {
    console.error('Erro ao carregar pedidos:', error.message);
    mostrarAviso('Não foi possível carregar os pedidos.');
    return;
  }
  mostrarAviso('');

  const ids = new Set(data.map((p) => p.id));
  const descobertos = [];
  data.forEach((p) => {
    if ((quando.get(p.id) || 0) >= t0) return; // um evento mais novo já atualizou este pedido
    if (!abertos.has(p.id)) descobertos.push(p);
    quando.set(p.id, Date.now());
    historico.delete(p.id);
    abertos.set(p.id, p);
  });
  [...abertos.keys()].forEach((id) => {
    if (!ids.has(id) && (quando.get(id) || 0) < t0) abertos.delete(id); // saiu da fila em outro lugar
  });

  // Pedidos que chegaram enquanto estávamos desconectados: destaque e som, uma única vez
  const novos = descobertos.filter((p) => p.status === 'recebido');
  if (jaCarregou && novos.length) {
    novos.forEach((p) => idsNovos.add(p.id));
    tocarAlerta();
  }
  jaCarregou = true;
  $('colunas').setAttribute('aria-busy', 'false');
  renderizar();
}

async function carregarHistorico() {
  const t0 = Date.now();
  const dia = hoje();
  const { data, error, count } = await db
    .from('pedidos')
    .select(SELECT_PEDIDO, { count: 'exact' })
    .eq('restaurante_id', restauranteId)
    .eq('dia', dia)
    .in('status', ['finalizado', 'cancelado'])
    .order('criado_em', { ascending: false })
    .limit(LIMITE_HISTORICO);
  if (!painelAtivo) return;
  if (error) {
    console.error('Erro ao carregar histórico:', error.message);
    mostrarToast('Não foi possível carregar o histórico do dia.', true);
    return;
  }
  const ids = new Set(data.map((p) => p.id));
  data.forEach((p) => {
    if ((quando.get(p.id) || 0) >= t0) return;
    quando.set(p.id, Date.now());
    historico.set(p.id, p);
  });
  historico.forEach((p, id) => {
    if (p.dia === dia && !ids.has(id) && (quando.get(id) || 0) < t0) historico.delete(id);
  });
  diaHistorico = dia;
  const nota = $('historico-nota');
  nota.hidden = !(count > data.length);
  if (!nota.hidden) nota.textContent = `Mostrando os ${data.length} pedidos mais recentes de ${count} no dia.`;
  renderizarHistorico();
}

// ---------- Troca de status ----------
async function mudarStatus(id, novoStatus) {
  if (ocupados.has(id)) return;
  ocupados.add(id);
  const botoes = cartoes.get(id)?.querySelectorAll('button') || [];
  botoes.forEach((b) => (b.disabled = true));

  const seq = ++seqGlobal;
  const { data, error } = await db.from('pedidos').update({ status: novoStatus }).eq('id', id).select(SELECT_PEDIDO).maybeSingle();
  ocupados.delete(id);

  if (error || !data) {
    if (error) console.error('Erro ao atualizar status:', error.message); // detalhe técnico só no console
    botoes.forEach((b) => (b.disabled = false));
    mostrarToast(
      error && /Transição de status inválida/i.test(error.message)
        ? 'Este pedido já foi atualizado em outro lugar. A lista foi atualizada.'
        : 'Não foi possível atualizar o pedido. Confira a conexão e tente de novo.',
      true
    );
    atualizarPedido(id);
    return;
  }
  aplicarPedido(data, seq); // muda de coluna na hora; o evento do Realtime chega depois e é idempotente
}

function avancar(id) {
  const p = abertos.get(id);
  if (p && PROXIMO[p.status]) mudarStatus(id, PROXIMO[p.status]);
}

let cancelamentoPendente = null;
function pedirCancelamento(id) {
  const p = abertos.get(id);
  if (!p || p.status !== 'recebido') return; // cancelar só vale para pedido novo
  cancelamentoPendente = id;
  const dlg = $('dlg-cancelar');
  $('dlg-numero').textContent = `#${p.numero}`;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else if (window.confirm(`Cancelar pedido #${p.numero}?`)) { cancelamentoPendente = null; mudarStatus(id, 'cancelado'); }
}

// ---------- Realtime ----------
function definirConexao(ok) {
  $('conexao').classList.toggle('conexao--offline', !ok);
  $('conexao-texto').textContent = ok ? 'Ao vivo' : 'Reconectando…';
}

function iniciarCanal() {
  if (canal) db.removeChannel(canal);
  canal = db
    .channel('cozinha-canal')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos', filter: `restaurante_id=eq.${restauranteId}` },
      async (payload) => {
        if (payload.eventType === 'DELETE') {
          abertos.delete(payload.old.id);
          historico.delete(payload.old.id);
          return renderizar();
        }
        const inserido = payload.eventType === 'INSERT';
        const adicionado = await atualizarPedido(payload.new.id, inserido);
        if (inserido && adicionado) tocarAlerta();
      }
    )
    // Recarrega a lista ao conectar E ao reconectar (não perde pedidos durante quedas)
    .subscribe((status) => {
      if (!painelAtivo) return;
      if (status === 'SUBSCRIBED') {
        definirConexao(true);
        carregarPedidos();
        if (vistaAtual === 'historico') carregarHistorico();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        definirConexao(false);
      }
    });
}

// ---------- Som ----------
let somLigado = false;
let audioCtx = null;
try { somLigado = localStorage.getItem(CHAVE_SOM) === '1'; } catch { /* armazenamento indisponível */ }

const audioRodando = () => !!audioCtx && audioCtx.state === 'running';

function salvarSom() {
  try { localStorage.setItem(CHAVE_SOM, somLigado ? '1' : '0'); } catch { /* ignora */ }
}

function atualizarBotaoSom() {
  const btn = $('btn-som');
  const preso = somLigado && !audioRodando(); // escolha lembrada, mas o navegador ainda exige um toque para liberar o áudio
  const ligado = somLigado && audioRodando();
  $('btn-som-texto').textContent = ligado ? 'Som ligado' : preso ? 'Toque para ativar o som' : 'Som desligado';
  $('btn-som-icone').innerHTML = `<use href="#i-${ligado || preso ? 'sino' : 'sino-off'}"/>`;
  btn.setAttribute('aria-pressed', String(ligado));
  btn.classList.toggle('btn-cab--destaque', preso);
}

async function liberarAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state !== 'running') await audioCtx.resume();
  } catch (e) {
    console.warn('Áudio indisponível:', e);
  }
  atualizarBotaoSom();
}

function bip() {
  const t = audioCtx.currentTime;
  [0, 0.3].forEach((atraso) => {
    const osc = audioCtx.createOscillator();
    const ganho = audioCtx.createGain();
    osc.frequency.value = 880;
    ganho.gain.setValueAtTime(0.25, t + atraso);
    ganho.gain.exponentialRampToValueAtTime(0.001, t + atraso + 0.25);
    osc.connect(ganho).connect(audioCtx.destination);
    osc.start(t + atraso);
    osc.stop(t + atraso + 0.25);
  });
}

function tocarAlerta() {
  if (somLigado && audioRodando()) bip(); // só toca depois de ativado (e liberado pelo navegador)
}

// ---------- Tela sempre acesa (Wake Lock) ----------
let wakeLock = null;
async function pedirWakeLock() {
  if (!('wakeLock' in navigator) || !painelAtivo || document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) {
    console.warn('Wake Lock indisponível:', e.message);
  }
}
function soltarWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

// ---------- Vistas e abas ----------
function mostrarVista(vista) {
  vistaAtual = vista;
  $('vista-pedidos').hidden = vista !== 'pedidos';
  $('vista-historico').hidden = vista !== 'historico';
  document.querySelectorAll('.visao').forEach((b) => {
    if (b.dataset.vista === vista) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
  if (vista === 'historico') {
    renderizarHistorico();
    carregarHistorico();
  }
}

function selecionarColuna(status) {
  STATUS_COLUNAS.forEach((s) => {
    $(`col-${s}`).classList.toggle('coluna--ativa', s === status);
    const aba = $(`aba-${s}`);
    if (s === status) aba.setAttribute('aria-current', 'true');
    else aba.removeAttribute('aria-current');
  });
}

// ---------- Entrar / sair ----------
function encerrarPainel() {
  painelAtivo = false;
  if (canal) { db.removeChannel(canal); canal = null; }
  clearInterval(intervaloTempo);
  soltarWakeLock();
  [abertos, historico, quando, seqPedido].forEach((m) => m.clear());
  idsNovos.clear();
  ocupados.clear();
  cartoes.forEach((el) => el.remove());
  cartoes.clear();
  jaCarregou = false;
  diaHistorico = null;
  mostrarAviso('');
  mostrarVista('pedidos');
}

async function entrarNoPainel() {
  if (painelAtivo || entrando) return;
  entrando = true;
  const { data: func, error } = await db.from('funcionarios').select('restaurante_id').limit(1).maybeSingle();
  if (error) {
    console.error('Erro ao buscar vínculo:', error.message);
    mostrarLogin('Não foi possível conectar. Confira a internet e tente de novo.');
    entrando = false;
    return;
  }
  if (!func) {
    mostrarLogin('Este usuário não está vinculado a nenhum restaurante.');
    await db.auth.signOut();
    entrando = false;
    return;
  }
  restauranteId = func.restaurante_id;
  const { data: loja } = await db.from('restaurantes').select('nome').eq('id', restauranteId).maybeSingle();
  $('loja-nome').textContent = loja?.nome || 'Cozinha';

  mostrarPainel();
  painelAtivo = true;
  entrando = false;
  definirConexao(false);
  atualizarBotaoSom();
  iniciarCanal();
  intervaloTempo = setInterval(tick, 30000);
  pedirWakeLock();
}

async function sair() {
  encerrarPainel();
  await db.auth.signOut();
  mostrarLogin();
}

// ---------- Eventos ----------
document.addEventListener('DOMContentLoaded', () => {
  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    erroLogin('');
    const email = $('email').value.trim();
    const senha = $('senha').value;
    if (!email || !senha) return erroLogin('Informe e-mail e senha.');
    const btn = $('btn-entrar');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    const { error } = await db.auth.signInWithPassword({ email, password: senha });
    if (error) {
      console.error('Erro de login:', error.message);
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return erroLogin(error.status === 400 ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Confira a conexão e tente de novo.');
    }
    $('senha').value = '';
    liberarAudio(); // o envio do formulário é um toque do usuário: libera o áudio se o som estiver ligado
    entrarNoPainel();
  });

  $('btn-sair').addEventListener('click', sair);

  $('btn-som').addEventListener('click', async () => {
    if (somLigado && audioRodando()) {
      somLigado = false;
      salvarSom();
      atualizarBotaoSom();
      return;
    }
    somLigado = true;
    salvarSom();
    await liberarAudio();
    if (audioRodando()) bip(); // toque de teste
  });
  // Escolha lembrada: o primeiro toque em qualquer lugar libera o áudio
  document.addEventListener('pointerdown', (e) => {
    if (somLigado && !audioRodando() && !e.target.closest('#btn-som')) liberarAudio();
  });

  document.querySelectorAll('.visao').forEach((b) => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));
  document.querySelectorAll('.aba-status').forEach((b) => b.addEventListener('click', () => selecionarColuna(b.dataset.coluna)));

  $('colunas').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-acao]');
    if (!btn || btn.disabled) return;
    const id = btn.closest('.pedido')?.dataset.id;
    if (!id) return;
    if (btn.dataset.acao === 'avancar') avancar(id);
    else if (btn.dataset.acao === 'cancelar') pedirCancelamento(id);
  });

  $('dlg-voltar').addEventListener('click', () => { cancelamentoPendente = null; $('dlg-cancelar').close(); });
  $('dlg-confirmar').addEventListener('click', () => {
    const id = cancelamentoPendente;
    cancelamentoPendente = null;
    $('dlg-cancelar').close();
    if (id) mudarStatus(id, 'cancelado');
  });
  $('dlg-cancelar').addEventListener('close', () => { cancelamentoPendente = null; });

  $('btn-recarregar').addEventListener('click', carregarPedidos);

  window.addEventListener('offline', () => painelAtivo && definirConexao(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !painelAtivo) return;
    pedirWakeLock(); // a trava de tela é liberada quando a aba some; pede de novo ao voltar
    carregarPedidos(); // o tablet pode ter ficado em espera: garante que nada se perdeu
  });

  // Sessão encerrada (por exemplo, em outra aba): volta ao login. Sem await aqui dentro (regra do SDK).
  db.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT' && painelAtivo) {
      encerrarPainel();
      mostrarLogin('Sessão encerrada. Entre novamente.');
    }
  });

  // Se já houver sessão salva, entra direto
  db.auth.getSession().then(({ data }) => { if (data.session) entrarNoPainel(); });
});
