const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const moeda = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const icone = (nome, extra = '') => `<svg class="icone ${extra}" aria-hidden="true" focusable="false"><use href="#i-${nome}"/></svg>`;

let restauranteId = null;
let lojaSlug = '';
let categorias = [];
let paginaHistorico = 0;
const LIMITE_HISTORICO = 15;

function mostrarToast(msg, erro = false) {
  const el = document.createElement('div');
  el.className = `toast${erro ? ' toast--erro' : ''}`;
  el.setAttribute('role', erro ? 'alert' : 'status');
  el.innerHTML = `${icone(erro ? 'alerta' : 'check', 'icone--24')}<p class="toast__texto">${esc(msg)}</p>`;
  const fechar = () => el.remove();
  if (erro) {
    const b = document.createElement('button');
    b.className = 'toast__fechar';
    b.innerHTML = icone('x');
    b.onclick = fechar;
    el.appendChild(b);
  } else {
    setTimeout(fechar, 4000);
  }
  $('toasts').appendChild(el);
}

// ---------- Autenticação ----------
async function checkAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return mostrarLogin();

  const { data: func, error } = await db.from('funcionarios').select('restaurante_id, papel').eq('user_id', session.user.id).single();
  if (error || !func || func.papel !== 'dono') {
    mostrarToast('Acesso negado. Apenas o dono pode acessar.', true);
    await db.auth.signOut();
    return mostrarLogin();
  }
  
  restauranteId = func.restaurante_id;
  await inicializarPainel();
}

function mostrarLogin() {
  $('tela-painel').hidden = true;
  $('tela-login').hidden = false;
}

$('form-login').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('btn-entrar');
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  
  const { error } = await db.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('senha').value
  });
  
  btn.disabled = false;
  btn.textContent = 'Acessar Painel';
  
  if (error) {
    $('login-erro').hidden = false;
    $('login-erro-texto').textContent = 'E-mail ou senha incorretos.';
  } else {
    checkAuth();
  }
};

$('btn-sair').onclick = async () => {
  await db.auth.signOut();
  window.location.reload();
};

// ---------- Navegação ----------
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav-item').forEach(b => b.removeAttribute('aria-current'));
    btn.setAttribute('aria-current', 'true');
    
    document.querySelectorAll('.vista-conteudo').forEach(v => v.hidden = true);
    $(`vista-${btn.dataset.vista}`).hidden = false;
    
    if (btn.dataset.vista === 'produtos') carregarProdutos();
    if (btn.dataset.vista === 'categorias') carregarCategorias();
    if (btn.dataset.vista === 'configuracoes') carregarLoja();
    if (btn.dataset.vista === 'historico') carregarHistorico();
    if (btn.dataset.vista === 'qrcode') gerarQRCode();
  };
});

async function inicializarPainel() {
  $('tela-login').hidden = true;
  $('tela-painel').hidden = false;
  await carregarCategoriasBase();
  carregarProdutos();
}

// ---------- Categorias ----------
async function carregarCategoriasBase() {
  const { data } = await db.from('categorias').select('*').eq('restaurante_id', restauranteId).eq('arquivada', false).order('ordem');
  categorias = data || [];
}

async function carregarCategorias() {
  await carregarCategoriasBase();
  const html = categorias.map((c, i) => `
    <tr>
      <td>${esc(c.nome)}</td>
      <td>${c.ordem}</td>
      <td class="acoes-td">
        <button class="btn-icon" onclick="editarCategoria('${c.id}', '${esc(c.nome)}')">${icone('edit')}</button>
        <button class="btn-icon" onclick="moverCategoria('${c.id}', -1)" ${i===0?'disabled':''}>${icone('seta-cima')}</button>
        <button class="btn-icon" onclick="moverCategoria('${c.id}', 1)" ${i===categorias.length-1?'disabled':''}>${icone('seta-baixo')}</button>
        <button class="btn-icon perigo" onclick="arquivarCategoria('${c.id}')">${icone('trash')}</button>
      </td>
    </tr>
  `).join('');
  $('lista-categorias').innerHTML = html;
}

$('btn-nova-categoria').onclick = () => {
  $('form-categoria').reset();
  $('cat-id').value = '';
  $('modal-categoria').showModal();
};

$('fechar-categoria').onclick = () => $('modal-categoria').close();

window.editarCategoria = (id, nome) => {
  $('cat-id').value = id;
  $('cat-nome').value = nome;
  $('modal-categoria').showModal();
};

$('form-categoria').onsubmit = async (e) => {
  e.preventDefault();
  const id = $('cat-id').value;
  const nome = $('cat-nome').value.trim();
  const ordem = categorias.length > 0 ? categorias[categorias.length - 1].ordem + 10 : 0;
  
  let res;
  if (id) {
    res = await db.from('categorias').update({ nome }).eq('id', id);
  } else {
    res = await db.from('categorias').insert({ restaurante_id: restauranteId, nome, ordem });
  }
  
  if (res.error) mostrarToast('Erro ao salvar categoria.', true);
  else {
    mostrarToast('Categoria salva!');
    $('modal-categoria').close();
    carregarCategorias();
  }
};

window.arquivarCategoria = async (id) => {
  if (!confirm('Deseja realmente remover esta categoria?')) return;
  const { error } = await db.from('categorias').update({ arquivada: true }).eq('id', id);
  if (error) mostrarToast('Erro ao remover.', true);
  else {
    mostrarToast('Categoria removida.');
    carregarCategorias();
  }
};

window.moverCategoria = async (id, dir) => {
  const idx = categorias.findIndex(c => c.id === id);
  if (idx < 0) return;
  const outro = categorias[idx + dir];
  if (!outro) return;
  
  // Swap ordens
  const tempOrdem = categorias[idx].ordem;
  await db.from('categorias').update({ ordem: outro.ordem }).eq('id', id);
  await db.from('categorias').update({ ordem: tempOrdem }).eq('id', outro.id);
  carregarCategorias();
};

// ---------- Produtos ----------
async function carregarProdutos() {
  await carregarCategoriasBase();
  const { data, error } = await db.from('produtos').select('*').eq('restaurante_id', restauranteId).eq('arquivado', false).order('nome');
  if (error) return;
  
  const catsMap = new Map(categorias.map(c => [c.id, c.nome]));
  
  const html = data.map(p => `
    <tr>
      <td>${p.imagem ? `<img src="${db.storage.from('produtos').getPublicUrl(p.imagem).data.publicUrl}" width="40" height="40" style="object-fit:cover; border-radius:4px;">` : ''}</td>
      <td><strong>${esc(p.nome)}</strong><br><small>${esc(catsMap.get(p.categoria_id) || '')}</small></td>
      <td><input type="number" step="0.01" value="${p.preco}" class="campo__entrada" style="padding: 4px;" onchange="alterarPreco('${p.id}', this.value)"></td>
      <td style="text-align: center;">
        <label class="toggle"><input type="checkbox" class="toggle__input sr-only" ${p.disponivel?'checked':''} onchange="toggleProd('${p.id}', 'disponivel', this.checked)"><span class="toggle__trilho"></span></label>
      </td>
      <td style="text-align: center;">
        <label class="toggle"><input type="checkbox" class="toggle__input sr-only" ${p.ativo?'checked':''} onchange="toggleProd('${p.id}', 'ativo', this.checked)"><span class="toggle__trilho"></span></label>
      </td>
      <td class="acoes-td">
        <button class="btn-icon" onclick='editarProduto(${JSON.stringify(p)})'>${icone('edit')}</button>
        <button class="btn-icon perigo" onclick="arquivarProduto('${p.id}')">${icone('trash')}</button>
      </td>
    </tr>
  `).join('');
  $('lista-produtos').innerHTML = html;
  
  // Atualiza options no select de categoria
  $('prod-cat').innerHTML = categorias.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
}

window.alterarPreco = async (id, val) => {
  const { error } = await db.from('produtos').update({ preco: parseFloat(val) }).eq('id', id);
  if (error) mostrarToast('Erro ao atualizar preço.', true);
  else mostrarToast('Preço atualizado.');
};

window.toggleProd = async (id, campo, val) => {
  const { error } = await db.from('produtos').update({ [campo]: val }).eq('id', id);
  if (error) mostrarToast('Erro ao atualizar status.', true);
};

window.arquivarProduto = async (id) => {
  if (!confirm('Deseja remover este produto?')) return;
  await db.from('produtos').update({ arquivado: true, ativo: false }).eq('id', id);
  carregarProdutos();
};

$('btn-novo-produto').onclick = () => {
  $('form-produto').reset();
  $('prod-id').value = '';
  $('prod-preview').style.display = 'none';
  $('modal-produto').showModal();
};

$('fechar-produto').onclick = () => $('modal-produto').close();

window.editarProduto = (p) => {
  $('prod-id').value = p.id;
  $('prod-nome').value = p.nome;
  $('prod-cat').value = p.categoria_id;
  $('prod-preco').value = p.preco;
  $('prod-desc').value = p.descricao || '';
  if (p.imagem) {
    $('prod-preview').src = db.storage.from('produtos').getPublicUrl(p.imagem).data.publicUrl;
    $('prod-preview').style.display = 'block';
  } else {
    $('prod-preview').style.display = 'none';
  }
  $('modal-produto').showModal();
};

async function redimensionarImagem(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > 800 || h > 800) {
          if (w > h) { h *= 800 / w; w = 800; }
          else { w *= 800 / h; h = 800; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        
        let qualidade = 0.9;
        const tentarWebp = () => {
          canvas.toBlob(blob => {
            if (blob.size > 200 * 1024 && qualidade > 0.1) {
              qualidade -= 0.1;
              tentarWebp();
            } else {
              resolve(blob);
            }
          }, 'image/webp', qualidade);
        };
        tentarWebp();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

$('form-produto').onsubmit = async (e) => {
  e.preventDefault();
  const id = $('prod-id').value;
  const p = {
    nome: $('prod-nome').value.trim(),
    categoria_id: $('prod-cat').value,
    preco: parseFloat($('prod-preco').value),
    descricao: $('prod-desc').value.trim() || null,
    restaurante_id: restauranteId
  };
  
  const fileInput = $('prod-foto');
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) return mostrarToast('Imagem muito grande (máx 5MB).', true);
    
    const blob = await redimensionarImagem(file);
    const path = `${restauranteId}/${Date.now()}.webp`;
    const { error: errUpload } = await db.storage.from('produtos').upload(path, blob, { contentType: 'image/webp', upsert: true });
    
    if (errUpload) return mostrarToast('Erro no upload da imagem.', true);
    p.imagem = path;
  }
  
  let res;
  if (id) res = await db.from('produtos').update(p).eq('id', id);
  else res = await db.from('produtos').insert(p);
  
  if (res.error) mostrarToast('Erro ao salvar produto.', true);
  else {
    mostrarToast('Produto salvo!');
    $('modal-produto').close();
    carregarProdutos();
  }
};

// ---------- Configurações Loja ----------
async function carregarLoja() {
  const { data } = await db.from('restaurantes').select('*').eq('id', restauranteId).single();
  if (!data) return;
  lojaSlug = data.slug;
  $('loja-nome').textContent = data.nome;
  $('loja-nome-input').value = data.nome;
  $('loja-slug').value = data.slug;
  $('loja-endereco').value = data.endereco || '';
  $('loja-ativa').checked = data.ativo;
}

$('form-loja').onsubmit = async (e) => {
  e.preventDefault();
  const dados = {
    nome: $('loja-nome-input').value.trim(),
    slug: $('loja-slug').value.trim(),
    endereco: $('loja-endereco').value.trim(),
    ativo: $('loja-ativa').checked
  };
  
  const { error } = await db.from('restaurantes').update(dados).eq('id', restauranteId);
  if (error) mostrarToast('Erro ao salvar loja.', true);
  else {
    mostrarToast('Configurações salvas!');
    carregarLoja();
  }
};

// ---------- Histórico ----------
async function carregarHistorico(delta = 0) {
  paginaHistorico += delta;
  if (paginaHistorico < 0) paginaHistorico = 0;
  
  const dataRef = $('filtro-data').value || new Date().toISOString().split('T')[0];
  const qStatus = $('filtro-status').value;
  
  let q = db.from('pedidos').select('numero, status, total, criado_em, itens_pedido(quantidade, nome_produto)', { count: 'exact' })
    .eq('restaurante_id', restauranteId)
    .eq('dia', dataRef)
    .order('criado_em', { ascending: false })
    .range(paginaHistorico * LIMITE_HISTORICO, (paginaHistorico + 1) * LIMITE_HISTORICO - 1);
    
  if (qStatus) q = q.eq('status', qStatus);
  else q = q.in('status', ['finalizado', 'cancelado']); // Por padrão só os concluídos
  
  const { data, count, error } = await q;
  if (error) return mostrarToast('Erro ao carregar histórico.', true);
  
  $('lista-historico').innerHTML = data.map(p => `
    <tr>
      <td>${new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td><strong>#${p.numero}</strong></td>
      <td>${p.status}</td>
      <td>${moeda(p.total)}</td>
      <td><small>${p.itens_pedido.map(i => `${i.quantidade}x ${i.nome_produto}`).join(', ')}</small></td>
    </tr>
  `).join('');
  
  $('txt-paginacao').textContent = `Página ${paginaHistorico + 1}`;
  $('btn-ant').disabled = paginaHistorico === 0;
  $('btn-prox').disabled = (paginaHistorico + 1) * LIMITE_HISTORICO >= count;
}

$('filtro-data').onchange = () => { paginaHistorico = 0; carregarHistorico(); };
$('filtro-status').onchange = () => { paginaHistorico = 0; carregarHistorico(); };
$('btn-ant').onclick = () => carregarHistorico(-1);
$('btn-prox').onclick = () => carregarHistorico(1);

// ---------- QR Code ----------
function gerarQRCode() {
  $('qrcode-container').innerHTML = '';
  const url = `${window.location.origin}/?r=${lojaSlug}`;
  $('link-loja').textContent = url;
  
  const canvas = document.createElement('canvas');
  QRCode.toCanvas(canvas, url, { width: 300, margin: 2, color: { dark: '#1F1A17', light: '#FFFFFF' } }, function (error) {
    if (error) console.error(error);
    $('qrcode-container').appendChild(canvas);
  });
  
  $('btn-baixar-qr').onclick = () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL("image/png");
    a.download = `qrcode_${lojaSlug}.png`;
    a.click();
  };
  
  $('btn-imprimir-qr').onclick = () => {
    const win = window.open();
    win.document.write(`<html><body style="display:flex;flex-direction:column;align-items:center;margin-top:50px;font-family:sans-serif;"><img src="${canvas.toDataURL()}"><h1 style="margin-top:20px;">Faça seu pedido</h1><p>${url}</p><script>window.print();window.close();</script></body></html>`);
  };
}

// Inicia
checkAuth();
