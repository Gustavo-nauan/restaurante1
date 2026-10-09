// Lógica do cliente: cardápio, carrinho e envio do pedido via RPC
let RESTAURANTE_ID = null; // definido após resolver o restaurante (slug ou uuid)
const MAX_QTD = 20;
const LIMITE_OBS = 200;
const AVISO_OBS = 160; // contador de caracteres aparece perto do limite

let carrinhoLocal = []; // [{ id_produto, qtd, obs }]  (preço NÃO vai: o servidor calcula)
const produtosPorId = new Map();
let enviando = false;

const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const $ = (id) => document.getElementById(id);

// ---------- Ícones e mensagens ----------
const icone = (nome, extra = '') =>
  `<svg class="icone ${extra}" aria-hidden="true" focusable="false"><use href="#i-${nome}"/></svg>`;

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

// ---------- Estados da tela (carregando, vazio, erro) ----------
function htmlSkeleton() {
  const cartao = `<div class="skeleton--cartao"><div><span class="skeleton skeleton__linha"></span><span class="skeleton skeleton__linha skeleton__linha--curta"></span></div><span class="skeleton skeleton__foto"></span></div>`;
  return `<div class="lista-produtos" style="padding-top: var(--space-6)" aria-hidden="true">${cartao.repeat(3)}</div><p class="sr-only">Carregando cardápio…</p>`;
}

function mostrarCarregando() {
  $('conteudo').setAttribute('aria-busy', 'true');
  $('cardapio-container').innerHTML = htmlSkeleton();
  $('abas-lista').innerHTML = '<span class="skeleton skeleton--aba"></span>'.repeat(3);
}

function mostrarErro(mensagem) {
  $('conteudo').setAttribute('aria-busy', 'false');
  $('abas-lista').innerHTML = '';
  $('cardapio-container').innerHTML = `
    <div class="estado estado--erro" role="alert">
      ${icone('alerta', 'icone--24')}
      <p class="estado__titulo">${esc(mensagem)}</p>
      <button type="button" class="btn btn--secundario" data-acao="tentar-de-novo">Tentar de novo</button>
    </div>`;
}

// ---------- Cabeçalho da loja ----------
function iniciais(nome) {
  return String(nome ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function renderizarLoja(restaurante) {
  document.title = restaurante.nome;
  $('titulo').textContent = restaurante.nome;

  const logo = $('loja-logo');
  logo.textContent = '';
  if (restaurante.logo) {
    const img = document.createElement('img');
    img.src = restaurante.logo;
    img.alt = '';
    img.addEventListener('error', () => { img.remove(); logo.textContent = iniciais(restaurante.nome); });
    logo.appendChild(img);
  } else {
    logo.textContent = iniciais(restaurante.nome);
  }

  const end = $('loja-endereco');
  const texto = String(restaurante.endereco ?? '').trim();
  end.textContent = texto;
  end.hidden = !texto;
}

// ---------- Cardápio ----------
async function carregarCardapio(restauranteId) {
  const { data, error } = await db
    .from('categorias')
    .select(`id, nome, ordem, produtos ( id, nome, descricao, preco, imagem, disponivel )`)
    .eq('restaurante_id', restauranteId)
    .eq('produtos.ativo', true)
    .order('ordem');

  if (error) {
    console.error('Erro ao buscar cardápio:', error.message);
    mostrarErro('Não foi possível carregar o cardápio.');
    return;
  }
  renderizarNaTela(data);
}

function itemNoCarrinho(id) {
  return carrinhoLocal.find((i) => i.id_produto === id);
}

function htmlCartao(p, eager = false) {
  const indisp = !p.disponivel;
  const item = itemNoCarrinho(p.id);
  const noCarrinho = !!item && !indisp;
  const classes = ['produto', indisp ? 'produto--esgotado' : '', noCarrinho ? 'produto--no-carrinho' : '']
    .filter(Boolean)
    .join(' ');

  const obterUrlFoto = (src) => {
    if (!src) return null;
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    return db.storage.from('produtos').getPublicUrl(src).data.publicUrl;
  };
  const fotoUrl = obterUrlFoto(p.imagem);

  const midia = fotoUrl
    ? `<img class="produto__foto" src="${esc(fotoUrl)}" alt="${esc(p.nome)}" width="96" height="96" loading="${eager ? 'eager' : 'lazy'}">`
    : `<div class="produto__placeholder" aria-hidden="true">${icone('talheres', 'icone--24')}</div>`;

  const botaoAdd = `
    <button type="button" class="btn-redondo btn-redondo--brasa produto__add" data-acao="add" data-id="${esc(p.id)}"
      aria-label="${indisp ? `${esc(p.nome)} esgotado` : `Adicionar ${esc(p.nome)}`}"
      ${indisp ? 'disabled aria-disabled="true"' : ''}>${icone('mais', 'icone--24')}</button>`;

  const seletor = noCarrinho ? htmlSeletor(p, item) : '';

  return `
    <article class="${classes}" data-produto-id="${esc(p.id)}">
      <div class="produto__texto">
        <h3 class="produto__nome t-strong">${esc(p.nome)}</h3>
        ${p.descricao ? `<p class="produto__desc">${esc(p.descricao)}</p>` : ''}
        ${indisp ? '<span class="badge">Esgotado</span>' : ''}
        <span class="produto__preco">${moeda(p.preco)}</span>
      </div>
      <div class="produto__midia">${midia}${botaoAdd}</div>
      <div class="produto__acao">${seletor}</div>
    </article>`;
}

// Seletor − n + (usado no cartão e na folha do carrinho)
function htmlSeletor(p, item) {
  const noMax = item.qtd >= MAX_QTD;
  return `
    <div class="qtd" role="group" aria-label="Quantidade de ${esc(p.nome)}">
      <button type="button" class="btn-redondo" data-acao="menos" data-id="${esc(item.id_produto)}"
        aria-label="${item.qtd <= 1 ? `Remover ${esc(p.nome)} do carrinho` : `Diminuir quantidade de ${esc(p.nome)}`}">${icone('menos', 'icone--24')}</button>
      <span class="qtd__valor">${item.qtd}</span>
      <button type="button" class="btn-redondo btn-redondo--brasa" data-acao="mais" data-id="${esc(item.id_produto)}"
        aria-label="Aumentar quantidade de ${esc(p.nome)}" ${noMax ? 'disabled aria-disabled="true"' : ''}>${icone('mais', 'icone--24')}</button>
    </div>`;
}

function renderizarNaTela(categorias) {
  const container = $('cardapio-container');
  produtosPorId.clear();
  $('conteudo').setAttribute('aria-busy', 'false');

  if (!categorias.length) {
    $('abas-lista').innerHTML = '';
    container.innerHTML = `
      <div class="estado">
        ${icone('talheres', 'icone--24')}
        <p class="estado__titulo">Nenhum item cadastrado.</p>
        <p class="t-body-sm">O cardápio desta loja ainda está vazio.</p>
      </div>`;
    return;
  }

  let n = 0;
  container.innerHTML = categorias
    .map((cat) => {
      const produtos = cat.produtos || [];
      const cards = produtos
        .map((p) => {
          produtosPorId.set(p.id, p);
          return htmlCartao(p, n++ < 4);
        })
        .join('');
      return `
        <section class="secao" id="cat-${esc(cat.id)}" aria-labelledby="cat-titulo-${esc(cat.id)}">
          <h2 class="secao__titulo t-subheading" id="cat-titulo-${esc(cat.id)}">${esc(cat.nome)}</h2>
          ${cards
            ? `<div class="lista-produtos">${cards}</div>`
            : `<div class="estado">${icone('talheres', 'icone--24')}<p>Nenhum produto nesta categoria.</p></div>`}
        </section>`;
    })
    .join('');

  $('abas-lista').innerHTML = categorias
    .map(
      (cat, i) =>
        `<button type="button" class="aba" data-cat="${esc(cat.id)}" ${i === 0 ? 'aria-current="true"' : ''}><span class="chip">${esc(cat.nome)}</span></button>`
    )
    .join('');

  renderizarCarrinho();
  atualizarScrollspy();
}

// ---------- Abas + scrollspy ----------
function ativarAba(catId) {
  const lista = $('abas-lista');
  let ativa = null;
  lista.querySelectorAll('.aba').forEach((a) => {
    const on = a.dataset.cat === catId;
    if (on) { a.setAttribute('aria-current', 'true'); ativa = a; }
    else a.removeAttribute('aria-current');
  });
  if (ativa) {
    const alvo = ativa.offsetLeft - (lista.clientWidth - ativa.offsetWidth) / 2;
    lista.scrollTo({ left: Math.max(0, alvo) });
  }
}

let spyAgendado = false;
function atualizarScrollspy() {
  spyAgendado = false;
  const secoes = document.querySelectorAll('.secao');
  if (!secoes.length) return;
  const corte = $('abas').offsetHeight + 24;
  let atual = secoes[0];
  secoes.forEach((s) => { if (s.getBoundingClientRect().top <= corte) atual = s; });
  // no fim da página, a última categoria vira a ativa
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) atual = secoes[secoes.length - 1];
  const id = atual.id.replace(/^cat-/, '');
  const aba = $('abas-lista').querySelector('[aria-current="true"]');
  if (!aba || aba.dataset.cat !== id) ativarAba(id);
}

// ---------- Carrinho ----------
function adicionarAoCarrinho(id) {
  const p = produtosPorId.get(id);
  if (!p || !p.disponivel) return;
  const item = itemNoCarrinho(id);
  if (item) item.qtd = Math.min(item.qtd + 1, MAX_QTD);
  else carrinhoLocal.push({ id_produto: id, qtd: 1, obs: '' });
  atualizarTudo(id, 'mais');
}

function alterarQtd(id, delta, foco) {
  const item = itemNoCarrinho(id);
  if (!item) return;
  item.qtd = Math.min(item.qtd + delta, MAX_QTD);
  if (item.qtd <= 0) carrinhoLocal = carrinhoLocal.filter((i) => i.id_produto !== id);
  atualizarTudo(id, foco);
}

function acharBotao(raiz, acao, id) {
  return [...raiz.querySelectorAll('button[data-acao]')].find((b) => b.dataset.acao === acao && b.dataset.id === id);
}

// Atualiza cartão do produto, barra e folha; devolve o foco ao controle usado
function atualizarTudo(id, acaoFoco) {
  const container = $('cardapio-container');
  const cartao = [...container.querySelectorAll('.produto')].find((e) => e.dataset.produtoId === id);
  const p = produtosPorId.get(id);
  const folhaAberta = $('folha').classList.contains('aberta');
  const emFolha = folhaAberta && $('folha').contains(document.activeElement);

  if (cartao && p) {
    const tpl = document.createElement('template');
    tpl.innerHTML = htmlCartao(p, true).trim();
    const novo = tpl.content.firstElementChild;
    cartao.replaceWith(novo);
    if (!emFolha) {
      const naoNoCarrinho = !itemNoCarrinho(id);
      const alvo = acharBotao(novo, naoNoCarrinho ? 'add' : acaoFoco, id) || acharBotao(novo, 'mais', id) || acharBotao(novo, 'add', id);
      if (alvo && !alvo.disabled) alvo.focus();
    }
  }

  renderizarCarrinho();

  if (emFolha) {
    const alvo = acharBotao($('carrinho-itens'), acaoFoco, id) || acharBotao($('carrinho-itens'), 'mais', id) || $('btn-fechar-carrinho');
    (alvo && !alvo.disabled ? alvo : $('btn-fechar-carrinho')).focus();
  }
}

function totalCarrinho() {
  return carrinhoLocal.reduce((t, i) => {
    const p = produtosPorId.get(i.id_produto);
    return t + (p ? Number(p.preco) * i.qtd : 0);
  }, 0);
}

function renderizarCarrinho() {
  const total = totalCarrinho();
  const qtdItens = carrinhoLocal.reduce((t, i) => t + i.qtd, 0);

  if (carrinhoLocal.length === 0) {
    $('carrinho-itens').innerHTML = `
      <div class="estado estado--vazio" style="padding: var(--space-8) 0; text-align: center;">
        <div style="color: var(--color-fumaca); margin-bottom: var(--space-4);">
          ${icone('sacola', 'icone--24')}
        </div>
        <p class="t-strong" style="color: var(--color-fumaca); margin-bottom: var(--space-2);">Seu carrinho está vazio</p>
        <p style="color: var(--color-fumaca); font-size: var(--text-sm);">Adicione itens do cardápio para continuar</p>
      </div>`;
  } else {
    $('carrinho-itens').innerHTML = carrinhoLocal
      .map((i, idx) => {
        const p = produtosPorId.get(i.id_produto);
        if (!p) return '';
        const mostrarContador = i.obs.length >= AVISO_OBS;
        return `
          <li class="item-carrinho">
            <div class="item-carrinho__linha">
              <span class="item-carrinho__nome t-strong">${esc(p.nome)}</span>
              <span class="item-carrinho__subtotal">${moeda(Number(p.preco) * i.qtd)}</span>
            </div>
            <div class="item-carrinho__linha">
              ${htmlSeletor(p, i)}
            </div>
            <div class="campo">
              <label class="campo__rotulo" for="obs-${idx}">Observação</label>
              <input class="campo__entrada" id="obs-${idx}" data-acao="obs" data-id="${esc(i.id_produto)}" value="${esc(i.obs)}"
                     placeholder="Ex.: sem cebola" maxlength="${LIMITE_OBS}" autocomplete="off">
              <span class="campo__contador${i.obs.length >= LIMITE_OBS ? ' campo__contador--limite' : ''}" data-contador ${mostrarContador ? '' : 'hidden'}>${i.obs.length}/${LIMITE_OBS}</span>
            </div>
          </li>`;
      })
      .join('');
  }

  $('carrinho-total').textContent = moeda(total);
  $('barra-total').textContent = moeda(total);
  $('barra-itens').textContent = `Ver carrinho · ${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'}`;
  const btn = $('btn-finalizar');
  btn.disabled = carrinhoLocal.length === 0 || enviando;
}

// ---------- Folha do carrinho ----------
const REGIOES_DE_FUNDO = ['loja', 'abas', 'conteudo', 'barra-carrinho'];
let focoAnterior = null;

function abrirCarrinho() {
  focoAnterior = document.activeElement;
  REGIOES_DE_FUNDO.forEach((id) => $(id).setAttribute('inert', ''));
  $('overlay').classList.add('aberta');
  $('folha').classList.add('aberta');
  $('folha').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('btn-fechar-carrinho').focus();
}

function fecharCarrinho() {
  $('overlay').classList.remove('aberta');
  $('folha').classList.remove('aberta');
  $('folha').setAttribute('aria-hidden', 'true');
  $('folha').style.transform = '';
  REGIOES_DE_FUNDO.forEach((id) => $(id).removeAttribute('inert'));
  document.body.style.overflow = '';
  const alvo = focoAnterior && document.contains(focoAnterior) && !focoAnterior.closest('[hidden]') ? focoAnterior : $('conteudo');
  alvo.focus({ preventScroll: true });
  focoAnterior = null;
}

// Arrastar a alça para baixo fecha a folha
function iniciarArraste() {
  const topo = $('folha-topo');
  const folha = $('folha');
  let y0 = null;
  let dy = 0;
  topo.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    y0 = e.clientY; dy = 0;
    topo.setPointerCapture(e.pointerId);
    folha.classList.add('arrastando');
  });
  topo.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    folha.style.transform = `translateY(${dy}px)`;
  });
  const soltar = () => {
    if (y0 === null) return;
    y0 = null;
    folha.classList.remove('arrastando');
    if (dy > 100) fecharCarrinho();
    else folha.style.transform = '';
  };
  topo.addEventListener('pointerup', soltar);
  topo.addEventListener('pointercancel', soltar);
}

// ---------- Envio do pedido ----------
async function finalizarPedido(restauranteId) {
  if (enviando) return;
  if (carrinhoLocal.length === 0) {
    mostrarToast('O carrinho está vazio.', true);
    return;
  }
  const btn = $('btn-finalizar');
  enviando = true;
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  const itens = carrinhoLocal.map(({ id_produto, qtd, obs }) => ({ id_produto, qtd, obs }));
  const { data: resultado, error } = await db.rpc('processar_pedido', {
    p_restaurante_id: restauranteId,
    p_itens: itens,
  });

  enviando = false;
  btn.textContent = 'Enviar pedido';

  if (error) {
    console.error(error); // detalhe técnico fica só no console
    // P0001 = erro de regra de negócio levantado pelo banco (mensagem pensada para o cliente)
    mostrarToast(
      error.code === 'P0001' && error.message
        ? error.message
        : 'Não foi possível enviar o pedido. Confira a conexão e tente de novo.',
      true
    );
    btn.disabled = false;
    return;
  }

  carrinhoLocal = [];
  localStorage.removeItem('carrinho');
  localStorage.setItem('pedidoId', resultado.id);
  window.location.href = 'pedido.html';
}

// ---------- Inicialização ----------
async function iniciar() {
  mostrarCarregando();
  const restaurante = await resolverRestaurante();
  if (!restaurante) {
    mostrarErro('Restaurante não encontrado. Confira o link ou o QR Code.');
    return;
  }
  RESTAURANTE_ID = restaurante.id;
  renderizarLoja(restaurante);
  await carregarCardapio(RESTAURANTE_ID);
}

document.addEventListener('DOMContentLoaded', () => {
  const container = $('cardapio-container');
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-acao]');
    if (!btn || btn.disabled) return;
    const { acao, id } = btn.dataset;
    if (acao === 'add') adicionarAoCarrinho(id);
    else if (acao === 'mais') alterarQtd(id, 1, 'mais');
    else if (acao === 'menos') alterarQtd(id, -1, 'menos');
    else if (acao === 'tentar-de-novo') iniciar();
  });
  // foto que falha ao carregar vira o placeholder
  container.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('produto__foto')) return;
    const ph = document.createElement('div');
    ph.className = 'produto__placeholder';
    ph.setAttribute('aria-hidden', 'true');
    ph.innerHTML = icone('talheres', 'icone--24');
    img.replaceWith(ph);
  }, true);

  $('abas-lista').addEventListener('click', (e) => {
    const aba = e.target.closest('.aba');
    if (!aba) return;
    const secao = document.getElementById(`cat-${aba.dataset.cat}`);
    if (secao) secao.scrollIntoView({ block: 'start' });
    ativarAba(aba.dataset.cat);
  });
  window.addEventListener('scroll', () => {
    if (spyAgendado) return;
    spyAgendado = true;
    requestAnimationFrame(atualizarScrollspy);
  }, { passive: true });

  const lista = $('carrinho-itens');
  lista.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-acao]');
    if (!btn || btn.disabled) return;
    alterarQtd(btn.dataset.id, btn.dataset.acao === 'mais' ? 1 : -1, btn.dataset.acao);
  });
  lista.addEventListener('input', (e) => {
    if (e.target.dataset.acao !== 'obs') return;
    const item = itemNoCarrinho(e.target.dataset.id);
    if (!item) return;
    item.obs = e.target.value;
    const cont = e.target.closest('.campo').querySelector('[data-contador]');
    cont.textContent = `${item.obs.length}/${LIMITE_OBS}`;
    cont.hidden = item.obs.length < AVISO_OBS;
    cont.classList.toggle('campo__contador--limite', item.obs.length >= LIMITE_OBS);
  });

  $('btn-abrir-carrinho').addEventListener('click', abrirCarrinho);
  $('btn-fechar-carrinho').addEventListener('click', fecharCarrinho);
  $('overlay').addEventListener('click', (e) => {
    if (e.target === $('overlay')) fecharCarrinho();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('folha').classList.contains('aberta')) fecharCarrinho();
  });
  iniciarArraste();

  $('btn-finalizar').addEventListener('click', () => finalizarPedido(RESTAURANTE_ID));

  renderizarCarrinho();
  iniciar();
});