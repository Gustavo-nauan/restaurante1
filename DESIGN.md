# Plataforma de Autoatendimento para Restaurantes — Style Reference
> Cardápio de balcão em papel quente, cozinha em modo noturno. Uma única cor de ação (Brasa) conduz o pedido do toque ao "pronto"; o resto é papel, carvão e status.

**Tema:** claro (cliente e admin) + escuro (cozinha)
**Nome provisório:** troque pelo nome da marca quando existir.

Este documento é a fonte única de decisão visual. Referência de formato: um style reference de outra marca; os valores abaixo são **nossos** e foram pensados para o uso real: cliente no celular (praça de alimentação, luz forte, uma mão só, 4G instável), cozinha em tablet (gordura, pressa, leitura a 1,5 m) e administração no computador.

## Princípios

1. **Legibilidade antes de estilo.** Contraste mínimo AA (4,5:1 texto, 3:1 componentes); nada de texto abaixo de 12px.
2. **Uma cor de ação.** Brasa serve a ações e seleção. Status têm cores próprias e nunca são usados como decoração.
3. **Cor nunca sozinha.** Todo status tem texto e/ou ícone além da cor.
4. **Toque generoso.** Alvos de 48px no cliente e 64px na cozinha.
5. **Plano e rápido.** Sem gradientes, sem blur, sombra só onde algo flutua (barra do carrinho, folhas). Poucas fontes, poucos pesos: carrega bem em rede móvel.

## Tokens — Cores

### Tema claro (padrão, `:root`)

| Nome | Valor | Token | Papel |
|------|-------|-------|-------|
| Papel | `#FFF8F0` | `--color-papel` | Fundo da página |
| Prato | `#FFFFFF` | `--color-prato` | Cartões, folhas, campos de texto |
| Areia | `#F3E6D8` | `--color-areia` | Superfície secundária: chip inativo, placeholder de foto, skeleton |
| Linha | `#E4D3C2` | `--color-linha` | Divisores e bordas de 1px |
| Carvão | `#1F1A17` | `--color-carvao` | Texto principal, cabeçalho da cozinha |
| Fumaça | `#6B5F57` | `--color-fumaca` | Texto secundário (5,9:1 sobre Papel) |
| Brasa | `#D93A00` | `--color-brasa` | Botão primário, chip ativo, foco de ação (texto branco: 4,6:1) |
| Brasa Escura | `#B02E00` | `--color-brasa-escura` | Estado pressionado/hover do primário |
| Brasa Suave | `#FFE3D6` | `--color-brasa-suave` | Fundo de item selecionado ou aviso leve |

### Status do pedido (semântica; também servem de sucesso/aviso/erro)

| Status | Texto/borda | Fundo suave | Tokens |
|--------|-------------|-------------|--------|
| recebido | `#C62828` | `#FDE7E7` | `--status-recebido`, `--status-recebido-bg` |
| confirmado | `#8A5200` | `#FFF1D6` | `--status-confirmado`, `--status-confirmado-bg` |
| em_preparo | `#1565C0` | `#E3EFFC` | `--status-preparo`, `--status-preparo-bg` |
| pronto | `#166A31` | `#E1F5E8` | `--status-pronto`, `--status-pronto-bg` |
| finalizado | `#6B5F57` | `#EFE7DE` | `--status-finalizado`, `--status-finalizado-bg` |
| cancelado | `#8A7F77` | `#EFE7DE` | `--status-cancelado`, `--status-cancelado-bg` (texto riscado) |

Mapeamento semântico: **sucesso** = pronto, **aviso** = confirmado, **erro** = recebido (vermelho), **informação/foco** = em_preparo (azul). Não crie outras cores. Contrastes foram estimados por cálculo; valide com Lighthouse/axe ao implementar.

### Tema cozinha (`[data-tema="cozinha"]`)

| Nome | Valor | Token | Papel |
|------|-------|-------|-------|
| Fogão | `#14110F` | `--color-papel` | Fundo da página |
| Panela | `#211C19` | `--color-prato` | Cartões de pedido |
| Panela Alta | `#2C2622` | `--color-areia` | Superfície secundária |
| Borda Quente | `#3A322D` | `--color-linha` | Divisores |
| Creme | `#FFF8F0` | `--color-carvao` | Texto principal (os tokens mantêm o nome, o valor inverte) |
| Cinza Claro | `#B8ABA1` | `--color-fumaca` | Texto secundário |
| Brasa | `#D93A00` | `--color-brasa` | Igual ao tema claro (texto branco no botão) |

Status no escuro: recebido `#FF6B5E`, confirmado `#FFB84D`, preparo `#5DB0FF`, pronto `#4ADE80`, finalizado `#B8ABA1`, cancelado `#8A7F77`. Fundos suaves = a cor do status a 16% de opacidade sobre Panela.

## Tokens — Tipografia

**Famílias** (Google Fonts, `display=swap`, só os pesos listados):
- `--font-display`: **Barlow Condensed** 600/700 — títulos, nomes de categoria, números de pedido. Fallback: `'Arial Narrow', ui-sans-serif, sans-serif`.
- `--font-ui`: **Inter** 400/500/600/700 — todo o resto. Fallback: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.

| Papel | Família | Peso | Tamanho | Altura de linha | Tracking | Token |
|-------|---------|------|---------|-----------------|----------|-------|
| caption | UI | 500 | 12px | 1.4 | 0.01em | `--text-caption` |
| body-sm | UI | 400 | 14px | 1.45 | 0 | `--text-body-sm` |
| body | UI | 400 | 16px | 1.5 | 0 | `--text-body` |
| body-strong | UI | 600 | 16px | 1.4 | 0 | `--text-body-strong` (nome de produto, preço) |
| label | UI | 600 | 14px MAIÚSCULAS | 1.2 | 0.04em | `--text-label` (status, botões pequenos) |
| subheading | Display | 700 | 22px MAIÚSCULAS | 1.1 | 0.02em | `--text-subheading` (categoria) |
| heading-sm | Display | 700 | 28px | 1.1 | 0.01em | `--text-heading-sm` |
| heading | Display | 700 | 36px | 1.05 | 0 | `--text-heading` (nome da loja) |
| numero-pedido | Display | 700 | 96px | 0.9 | 0 | `--text-numero-pedido` (tela do cliente) |
| cozinha-numero | Display | 700 | 48px | 1 | 0 | `--text-cozinha-numero` |
| cozinha-item | UI | 600 | 22px | 1.3 | 0 | `--text-cozinha-item` |
| cozinha-botao | UI | 700 | 20px MAIÚSCULAS | 1 | 0.03em | `--text-cozinha-botao` |

Regras: campos de texto sempre com **16px ou mais** (evita zoom automático no iPhone); números de preço usam `font-variant-numeric: tabular-nums`; moeda sempre `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})` → "R$ 22,90".

## Tokens — Espaçamento e formas

**Unidade base:** 4px. **Densidade:** confortável no cliente, ampla na cozinha.

| Nome | Valor | Token |
|------|-------|-------|
| 1 | 4px | `--space-1` |
| 2 | 8px | `--space-2` |
| 3 | 12px | `--space-3` |
| 4 | 16px | `--space-4` |
| 5 | 20px | `--space-5` |
| 6 | 24px | `--space-6` |
| 8 | 32px | `--space-8` |
| 10 | 40px | `--space-10` |
| 12 | 48px | `--space-12` |
| 16 | 64px | `--space-16` |

### Raios

| Elemento | Valor | Token |
|----------|-------|-------|
| badge | 8px | `--radius-badge` |
| botão, campo, foto de produto | 12px | `--radius-control` |
| cartão | 16px | `--radius-card` |
| folha (bottom sheet), topo | 20px | `--radius-sheet` |
| chip, botão redondo, toggle | 999px | `--radius-pill` |

### Alvos de toque e layout

- **Alvo mínimo:** cliente 48×48px; cozinha 64px de altura nos botões de status.
- **Largura máxima:** cliente 560px (centralizado, mobile-first); admin 1100px; cozinha usa a tela toda.
- **Grade da cozinha:** ≥1100px, 4 colunas por status; abaixo disso, abas com uma coluna visível.
- **Espaço entre seções:** 24–32px. **Padding de cartão:** 16px (cliente), 20px (cozinha). **Espaço entre elementos:** 8–12px.

## Superfícies e elevação

| Nível | Nome | Valor | Uso |
|-------|------|-------|-----|
| 0 | Fundo | Papel | Página |
| 1 | Cartão | Prato + borda 1px Linha | Produto, pedido, formulário. Sem sombra |
| 2 | Flutuante | Prato + `0 -2px 12px rgba(31,26,23,.10)` | **Só** barra do carrinho e folhas |
| 3 | Overlay | `rgba(31,26,23,.55)` | Fundo atrás de folhas e modais |

## Componentes

### Cabeçalho da loja (cliente)
Logo da loja (ou iniciais em círculo Areia, 48px) + nome em *heading* + endereço em *body-sm* Fumaça. Fundo Papel, sem barra colorida. Se a loja estiver inativa ou não existir, mostrar estado de erro (veja Estados).

### Abas de categoria
Faixa horizontal fixa no topo ao rolar (sticky), rolagem lateral sem barra visível. Chip: 40px de altura (área de toque 48px), *label* em maiúsculas. Inativo: fundo Areia, texto Carvão. Ativo: fundo Brasa, texto branco. A categoria ativa acompanha a rolagem (scrollspy); tocar numa aba rola até a seção.

### Cartão de produto
Linha com texto à esquerda e foto à direita. Texto: nome (*body-strong*), descrição (*body-sm* Fumaça, no máximo 2 linhas), preço (*body-strong*, tabular). Foto 96×96px, raio 12px, `object-fit: cover`; sem foto, mostrar placeholder Areia com ícone de talheres. Botão **+** redondo de 48px sobre o canto inferior direito da foto (ou à direita, se não há foto). Depois de adicionado, o **+** vira o seletor de quantidade.

| Estado | Aparência |
|--------|-----------|
| normal | como acima |
| no carrinho | borda 1px Brasa, fundo Brasa Suave, seletor − 2 + no lugar do botão |
| **esgotado** | continua visível; foto em tons de cinza com 50% de opacidade, textos em Fumaça, selo ESGOTADO (*label*, fundo Areia, texto Carvão), botão desabilitado (`disabled` + `aria-disabled`), sem hover. **Não** aplique opacidade ao cartão inteiro |
| **oculto** (`ativo = false`) | não é renderizado |

### Botões
Altura 48px (cozinha 64px), raio 12px, *label* em maiúsculas, padding horizontal 20px.
- **Primário:** fundo Brasa, texto branco; pressionado Brasa Escura. Um por tela/região.
- **Secundário:** fundo transparente, borda 1px Carvão, texto Carvão.
- **Perigo (cancelar):** fundo transparente, borda e texto `--status-recebido`; sempre pede confirmação.
- **Desabilitado:** fundo Areia, texto Fumaça, sem sombra, cursor padrão. Durante envio, o primário mostra "Enviando…" e fica desabilitado (evita pedido duplicado).
- **Foco visível:** anel de 3px `--status-preparo` com 2px de afastamento, em todos os controles.

### Seletor de quantidade
Três partes: botão − (48px, redondo, borda Linha), número (*body-strong*, centralizado, largura mínima 32px), botão + (48px, redondo, fundo Brasa). Limite de 1 a 20; ao chegar em 20 o + fica desabilitado. − em 1 remove o item.

### Barra do carrinho
Fixa na parte de baixo, só aparece com ao menos 1 item. Nível 2 de elevação, altura 72px mais a área segura do aparelho (`env(safe-area-inset-bottom)`). Botão primário de largura total: "Ver carrinho · 2 itens" à esquerda e o total à direita (tabular).

### Folha do carrinho (bottom sheet)
Sobe da base, raio 20px no topo, alça de 4×40px, sobre overlay nível 3. Lista de itens: nome, seletor de quantidade, subtotal, campo "Observação" (16px, máximo 200 caracteres, contador aparece perto do limite). Rodapé fixo com total e botão primário "Enviar pedido". Fecha ao arrastar para baixo, tocar no overlay ou no X.

### Tela de acompanhamento do pedido (cliente)
Topo: "Seu pedido" (*body-sm* Fumaça) e o **número em *numero-pedido*** (ex.: #104) em Carvão. Abaixo, linha do tempo vertical de 4 etapas (círculos de 24px ligados por linha de 2px): etapa concluída em `--status-pronto` com ✓, etapa atual em `--status-preparo` com anel e texto em negrito, futuras em Linha. Mensagem grande do estado atual (veja Vocabulário). Quando **pronto**: bloco inteiro em `--status-pronto-bg`, texto "Pronto! Retire no balcão", vibração curta, título da aba piscando. **Cancelado:** bloco em `--status-cancelado-bg` com texto "Pedido cancelado" e orientação para falar com o balcão.

### Badge de status
Altura 28px (cozinha 32px), raio 8px, *label* em maiúsculas, ponto de 8px + texto, fundo `--status-*-bg`, texto `--status-*`. Cancelado vem com texto riscado.

### Cartão de pedido (cozinha)
Nível 1, borda esquerda de 8px na cor do status. Cabeçalho: **#número** (*cozinha-numero*), horário "14:32" e tempo decorrido ("há 7 min"). O tempo muda de cor: normal até 10 min, `--status-confirmado` de 10 a 20 min, `--status-recebido` acima de 20 min. Itens em *cozinha-item*, com a quantidade em negrito antes do nome ("2× X-Burger"). **Observação** em bloco `--status-confirmado-bg` com ícone de alerta e texto integral (nunca cortada). Rodapé: botão de ação de 64px em largura total (Aceitar → Iniciar preparo → Marcar pronto → Finalizar). Em `recebido` há também o botão perigo "Cancelar" (48px). Pedido novo entra com destaque pulsante duas vezes (desligado com `prefers-reduced-motion`).

### Cabeçalho da cozinha
Barra Carvão (no tema escuro, Panela Alta) com nome da loja, indicador de conexão (ponto verde "Ao vivo" / âmbar "Reconectando…"), botão de som (ligado/desligado, o estado é lembrado) e "Sair". Em tela larga, 4 colunas com contador por status ("Novos 3").

### Campo de texto e formulários
Altura 48px, fundo Prato, borda 1px Linha, raio 12px, texto 16px. Foco: borda 2px `--status-preparo`. Erro: borda `--status-recebido` e mensagem em *body-sm* logo abaixo (não use só a cor). Todo campo tem rótulo visível acima.

### Mensagens (toast e avisos)
Toast no topo, largura total no celular, 4 segundos, fecha sozinho (erros ficam até serem dispensados). Fundo `--status-*-bg`, borda esquerda de 4px e ícone. Use `role="status"` (sucesso) ou `role="alert"` (erro).

### Estados vazios, de carregamento e de erro
- **Carregando:** skeleton em Areia no formato dos cartões (sem spinner girando sozinho por mais de 1 s).
- **Vazio:** ícone em Fumaça, frase curta e ação ("Nenhum produto nesta categoria.").
- **Erro:** mensagem humana + botão "Tentar de novo". Nunca mostrar mensagem técnica crua ao cliente (ela vai para o console).

### Painel administrativo (Etapa D)
Tema claro, largura 1100px, menu lateral (vira abas no celular). Tabelas com linha de 56px; **toggles** de 48×28px (raio pill) para "Disponível" e "Ativo" — ligado = Brasa. Preço editável na própria linha (campo de 120px, formato BRL). Upload de foto com pré-visualização 96px.

## Vocabulário (texto por status)

| Status interno | Cliente (mensagem) | Cozinha (rótulo) | Botão de ação na cozinha |
|----------------|--------------------|------------------|---------------------------|
| recebido | "Pedido enviado. Aguardando a cozinha aceitar." | NOVO | Aceitar |
| confirmado | "Pedido aceito! Já vai começar o preparo." | ACEITO | Iniciar preparo |
| em_preparo | "Estamos preparando o seu pedido." | PREPARANDO | Marcar pronto |
| pronto | "Pronto! Retire no balcão." | PRONTO | Finalizar |
| finalizado | "Pedido retirado. Bom apetite!" | FINALIZADO | — |
| cancelado | "Pedido cancelado." | CANCELADO | — |

**Tom de voz:** português do Brasil, direto e amigável. Frases curtas, verbo no imperativo nos botões ("Adicionar", "Enviar pedido"), sem gíria, sem excesso de exclamação, no máximo uma por mensagem.

## Movimento
Transições de 150ms `ease-out` (cor, borda, elevação) e folha do carrinho em 220ms. Nada de animação decorativa contínua. Com `prefers-reduced-motion: reduce`, tudo vira troca instantânea e o pulso do pedido novo é substituído por um destaque fixo de 3 segundos.

## Ícones e imagens
- Ícones em SVG inline, traço de 2px, pontas arredondadas, 20/24px, cor herdada do texto (estilo Lucide). Não use emoji como ícone de interface.
- Foto de produto: quadrada, 96px na lista, enviada em até 800px de lado, WebP, abaixo de 200KB. Sempre com `alt` = nome do produto e `loading="lazy"` (exceto as primeiras).
- Logo da loja: quadrado, mínimo 96px.

## Faça e não faça

### Faça
- Use **Brasa** só para ação e seleção: botão primário, chip ativo, item no carrinho, toggle ligado.
- Mantenha **um** botão primário por região da tela.
- Deixe produto esgotado visível e claramente inativo (cinza + selo + botão desabilitado).
- Dê a todo status texto e cor juntos.
- Use 48px de alvo no cliente e 64px nos botões da cozinha.
- Escape qualquer texto vindo do banco antes de colocar na tela (nome, descrição, observação).
- Respeite a área segura do aparelho (`env(safe-area-inset-*)`) na barra do carrinho.
- Troque só os valores dos tokens para mudar a identidade: componentes nunca devem ter cor "solta".

### Não faça
- Não use gradientes, glow, blur, nem sombra fora do nível 2.
- Não crie cores novas fora das tabelas acima.
- Não use vermelho/âmbar/verde/azul como decoração: eles pertencem aos status.
- Não use opacidade no cartão inteiro para indicar esgotado.
- Não corte a observação do cliente na cozinha, nem use texto menor que o tamanho `cozinha-item` para itens.
- Não use fonte abaixo de 12px, nem campos com menos de 16px.
- Não use texto Brasa sobre Papel para parágrafos (use Carvão); Brasa é fundo de botão, não cor de texto longo.
- Não dependa de hover: o produto principal é usado no toque.

## Início rápido

### Variáveis CSS (`web/css/tokens.css`)

```css
:root {
  /* Cores — tema claro */
  --color-papel: #FFF8F0;
  --color-prato: #FFFFFF;
  --color-areia: #F3E6D8;
  --color-linha: #E4D3C2;
  --color-carvao: #1F1A17;
  --color-fumaca: #6B5F57;
  --color-brasa: #D93A00;
  --color-brasa-escura: #B02E00;
  --color-brasa-suave: #FFE3D6;
  --color-branco: #FFFFFF;

  /* Status */
  --status-recebido: #C62828;   --status-recebido-bg: #FDE7E7;
  --status-confirmado: #8A5200; --status-confirmado-bg: #FFF1D6;
  --status-preparo: #1565C0;    --status-preparo-bg: #E3EFFC;
  --status-pronto: #166A31;     --status-pronto-bg: #E1F5E8;
  --status-finalizado: #6B5F57; --status-finalizado-bg: #EFE7DE;
  --status-cancelado: #8A7F77;  --status-cancelado-bg: #EFE7DE;

  /* Tipografia */
  --font-display: 'Barlow Condensed', 'Arial Narrow', ui-sans-serif, sans-serif;
  --font-ui: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --text-caption: 12px;
  --text-body-sm: 14px;
  --text-body: 16px;
  --text-body-strong: 16px;
  --text-label: 14px;
  --text-subheading: 22px;
  --text-heading-sm: 28px;
  --text-heading: 36px;
  --text-numero-pedido: 96px;
  --text-cozinha-numero: 48px;
  --text-cozinha-item: 22px;
  --text-cozinha-botao: 20px;

  /* Espaçamento (base 4px) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px;

  /* Raios */
  --radius-badge: 8px;
  --radius-control: 12px;
  --radius-card: 16px;
  --radius-sheet: 20px;
  --radius-pill: 999px;

  /* Alvos e layout */
  --target-cliente: 48px;
  --target-cozinha: 64px;
  --width-cliente: 560px;
  --width-admin: 1100px;

  /* Elevação e movimento */
  --shadow-flutuante: 0 -2px 12px rgba(31, 26, 23, 0.10);
  --overlay: rgba(31, 26, 23, 0.55);
  --motion-fast: 150ms ease-out;
  --motion-sheet: 220ms ease-out;
}

/* Tema escuro da cozinha: mesmos nomes, valores invertidos */
[data-tema="cozinha"] {
  --color-papel: #14110F;
  --color-prato: #211C19;
  --color-areia: #2C2622;
  --color-linha: #3A322D;
  --color-carvao: #FFF8F0;
  --color-fumaca: #B8ABA1;

  --status-recebido: #FF6B5E;   --status-recebido-bg: rgba(255, 107, 94, 0.16);
  --status-confirmado: #FFB84D; --status-confirmado-bg: rgba(255, 184, 77, 0.16);
  --status-preparo: #5DB0FF;    --status-preparo-bg: rgba(93, 176, 255, 0.16);
  --status-pronto: #4ADE80;     --status-pronto-bg: rgba(74, 222, 128, 0.16);
  --status-finalizado: #B8ABA1; --status-finalizado-bg: rgba(184, 171, 161, 0.16);
  --status-cancelado: #8A7F77;  --status-cancelado-bg: rgba(138, 127, 119, 0.16);
}

@media (prefers-reduced-motion: reduce) {
  :root { --motion-fast: 0ms; --motion-sheet: 0ms; }
}
```

O projeto usa HTML, CSS e JavaScript puros (sem Tailwind): por isso só há variáveis CSS. Se um dia migrar para Tailwind v4, estes mesmos nomes entram em um bloco `@theme`.
