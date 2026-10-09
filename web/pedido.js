// Script para tela de acompanhamento de pedido
const pedidoId = localStorage.getItem('pedidoId');

const $ = id => document.getElementById(id);
const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MENSAGENS = {
  recebido: "Pedido enviado. Aguardando a cozinha aceitar.",
  confirmado: "Pedido aceito! Já vai começar o preparo.",
  em_preparo: "Estamos preparando o seu pedido.",
  pronto: "Pronto! Retire no balcão.",
  finalizado: "Pedido retirado. Bom apetite!",
  cancelado: "Pedido cancelado. Fale com o balcão."
};

let statusAtual = null;
let pollTimeout = null;
let backoff = 4000; // Começa com 4s
let piscaInterval = null;
const ORIGINAL_TITLE = document.title;

function mostrarErroFatal(msg) {
  $('loading').style.display = 'none';
  $('conteudo').style.display = 'block';
  $('conteudo').innerHTML = `<div style="text-align: center; padding: 40px 20px;"><h2>Ops</h2><p>${msg}</p><a href="/" class="btn-primario" style="margin-top: 24px; display: inline-block; text-decoration: none;">Voltar ao início</a></div>`;
}

function piscarTitulo() {
  if (piscaInterval) return;
  let isOriginal = true;
  piscaInterval = setInterval(() => {
    document.title = isOriginal ? "🔴 PRONTO!" : ORIGINAL_TITLE;
    isOriginal = !isOriginal;
  }, 1000);
}

function pararPiscarTitulo() {
  if (piscaInterval) {
    clearInterval(piscaInterval);
    piscaInterval = null;
    document.title = ORIGINAL_TITLE;
  }
}

function atualizarTela(pedido) {
  $('loading').style.display = 'none';
  $('conteudo').style.display = 'block';

  $('loja-nome').textContent = pedido.restaurante_nome;
  $('pedido-numero').textContent = `#${pedido.numero}`;
  $('pedido-mensagem').textContent = MENSAGENS[pedido.status] || "Status desconhecido";

  // Preencher itens na primeira vez
  if (!statusAtual && pedido.itens) {
    const htmlItens = pedido.itens.map(item => `
      <div class="item-linha">
        <div class="item-qtd-nome">
          <span class="item-qtd">${item.qtd}×</span>
          <span>${esc(item.nome)}</span>
        </div>
        <div>${moeda(item.preco * item.qtd)}</div>
      </div>
      ${item.obs ? `<div class="item-obs">Obs: ${esc(item.obs)}</div>` : ''}
    `).join('');
    
    $('lista-itens').innerHTML = htmlItens + `
      <div style="display: flex; justify-content: space-between; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--color-linha); font-weight: bold;">
        <span>Total</span>
        <span>${moeda(pedido.total)}</span>
      </div>
    `;
  }

  // Se o status mudou
  if (statusAtual !== pedido.status) {
    const oldStatus = statusAtual;
    statusAtual = pedido.status;

    // Timeline
    const STATUS_ORDEM = ['recebido', 'confirmado', 'em_preparo', 'pronto'];
    const indexAtual = STATUS_ORDEM.indexOf(statusAtual);
    
    document.querySelectorAll('.etapa').forEach(el => {
      const step = el.dataset.step;
      const stepIndex = STATUS_ORDEM.indexOf(step);
      
      el.classList.remove('atual', 'concluida');
      
      if (statusAtual === 'finalizado') {
        el.classList.add('concluida');
      } else if (statusAtual !== 'cancelado') {
        if (stepIndex < indexAtual) el.classList.add('concluida');
        else if (stepIndex === indexAtual) el.classList.add('atual');
      }
    });

    // Temas globais
    document.body.classList.remove('tema-pronto', 'tema-cancelado');
    if (statusAtual === 'pronto') {
      document.body.classList.add('tema-pronto');
      if (oldStatus) { // Vibra só se transicionou e não na carga inicial
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        piscarTitulo();
      }
    } else if (statusAtual === 'cancelado') {
      document.body.classList.add('tema-cancelado');
      pararPiscarTitulo();
    } else {
      pararPiscarTitulo();
    }

    // Botão de novo pedido aparece se finalizado ou cancelado
    if (statusAtual === 'finalizado' || statusAtual === 'cancelado') {
      $('btn-novo').style.display = 'block';
      $('btn-novo').onclick = () => {
        localStorage.removeItem('pedidoId');
        window.location.href = '/';
      };
    }
  }
}

async function fetchStatus() {
  // Não faz polling se a aba estiver oculta
  if (document.visibilityState === 'hidden') {
    pollTimeout = setTimeout(fetchStatus, 1000); // Tenta de novo mais tarde rapidamente
    return;
  }

  try {
    const { data, error } = await db.rpc('consultar_pedido', {
      p_pedido_id: pedidoId
    });

    if (error) throw error;
    if (!data) throw new Error("Pedido não encontrado");

    atualizarTela(data);
    
    // Sucesso zera o backoff
    backoff = 4000;

    // Se ainda está ativo, continua polling
    if (data.status !== 'finalizado' && data.status !== 'cancelado') {
      pollTimeout = setTimeout(fetchStatus, backoff);
    }
  } catch (err) {
    console.error("Erro ao consultar pedido:", err);
    if (!statusAtual) {
      // Se deu erro na primeira carga e não tem status, pode ser erro 404
      mostrarErroFatal("Não foi possível encontrar o pedido.");
      return;
    }
    // Exponential backoff limitado a 30s
    backoff = Math.min(backoff * 1.5, 30000);
    pollTimeout = setTimeout(fetchStatus, backoff);
  }
}

// Retoma o polling instantaneamente quando a aba volta a ficar visível
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && statusAtual !== 'finalizado' && statusAtual !== 'cancelado') {
    clearTimeout(pollTimeout);
    fetchStatus();
  }
});

// Inicialização
if (!pedidoId) {
  mostrarErroFatal("Nenhum pedido ativo encontrado nesta sessão.");
} else {
  fetchStatus();
}
