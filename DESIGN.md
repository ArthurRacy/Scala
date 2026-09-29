---
name: Sistema de Gestão e Escala de Anestesia
description: Interface operacional sóbria na paleta do THE ONE (esmeralda, verde-hospital e ouro), feita para conferir números e assinar documentos clínicos.
colors:
  fundo: "#f5f7f6"
  fundo-alt: "#ecf0ee"
  superficie: "#ffffff"
  superficie-2: "#f9fbfa"
  borda: "#e0e6e3"
  borda-forte: "#ccd5d1"
  texto: "#0e1a16"
  texto-medio: "#46554f"
  texto-suave: "#5b6862"
  acento: "#0d7c66"
  acento-forte: "#0e573f"
  acento-suave: "#e9f5f2"
  ok: "#2f7a3a"
  ok-suave: "#e6f4e8"
  alerta: "#9a6207"
  alerta-suave: "#fdf3e2"
  perigo: "#b4232a"
  perigo-suave: "#fdecec"
  info: "#14568a"
  info-suave: "#e8f1f9"
  neutro: "#566560"
  neutro-suave: "#ecf0ee"
  marca: "#15563f"
  ouro: "#c4a572"
  borda-campo: "#7d8b85"
typography:
  headline:
    fontFamily: "Inter, Segoe UI Variable, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.018em"
  title:
    fontFamily: "Inter, Segoe UI Variable, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.012em"
  body:
    fontFamily: "Inter, Segoe UI Variable, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, Segoe UI Variable, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "0.06em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.acento}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "7px 13px"
  button-primary-hover:
    backgroundColor: "{colors.acento-forte}"
  button-default:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.texto}"
    rounded: "{rounded.sm}"
    padding: "7px 13px"
  input:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.texto}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  card:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.lg}"
    padding: "24px"
  badge:
    backgroundColor: "{colors.neutro-suave}"
    textColor: "{colors.neutro}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  nav-item-active:
    backgroundColor: "{colors.acento-suave}"
    textColor: "{colors.acento-forte}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
---

# Design System: Sistema de Gestão e Escala de Anestesia

## Overview

**Creative North Star: "A Prancheta Clínica"**

Uma prancheta técnica bem organizada: papel claro, traço fino, número alinhado. A interface existe para conferir e registrar, e cada tela é lida por alguém que precisa bater o olho numa coluna de valores ou numa escala e confiar no que vê. A hierarquia vem do traço, do peso da fonte e do espaço, não de sombra ou cor.

A paleta vem do THE ONE Hospital Brasília: esmeralda `#0d7c66` (o mesmo da folha de estilo do site) na ação, verde-hospital `#15563f` no nome da instituição e ouro `#c4a572` como fio na barra da marca. O sistema é claro por padrão e tem tema escuro completo, escolhido pelo sistema operacional ou por escolha explícita da pessoa. A cor aparece pouco: um único acento esmeralda marca a ação principal, o item de navegação atual e o foco. Os demais tons são semânticos (ok, alerta, perigo, info) e só aparecem quando há um estado a comunicar.

Vale nos dois contextos de uso: computador de mesa da secretaria (denso, tabelas largas) e celular do anestesista (uma coluna, alvos de toque folgados).

**Key Characteristics:**
- Um acento só, esmeralda (#0d7c66), sobre neutros levemente esverdeados. Verde-hospital e ouro só assinam a marca.
- Superfícies planas com borda de 1px; sombra é reserva.
- Inter em corpo pequeno (14px), números tabulares em toda coluna de dado.
- Movimento curto e funcional, com respeito a `prefers-reduced-motion`.
- Tema claro e escuro com o mesmo vocabulário de tokens.

## Colors

Neutros levemente esverdeados sustentam a leitura. O esmeralda é o único acento de ação; os semânticos existem para estado, não para decoração. Verde-hospital e ouro são identidade, nunca ação nem estado.

### Primary
- **Esmeralda** (`#0d7c66`): ação primária, foco, link, item de navegação atual e primeira série dos gráficos.
- **Verde profundo** (`#0e573f`): hover da ação primária e texto sobre o fundo suave do acento.
- **Névoa esmeralda** (`#e9f5f2`): fundo do item ativo, anel de foco dos campos, seleção de texto.

### Marca
- **Verde-hospital** (`#15563f`, o verde do logotipo; `#8fd3bf` no texto do tema escuro): o topo inteiro da barra lateral (logo e nome do sistema em branco, com o fio dourado embaixo) e o bloco do logotipo na tela de entrada.
- **Ouro** (`#c4a572`): fio de 1px sob a marca, misturado a 55% com o traço. Contraste 2,3:1 contra branco, por isso é decoração e nunca texto.

### Neutral
- **Papel esverdeado** (`#f5f7f6`): fundo da página. **Cinza de bancada** (`#ecf0ee`): hover e áreas rebaixadas.
- **Superfície branca** (`#ffffff`): cartões, campos, barra lateral. **Superfície 2** (`#f9fbfa`): hover de linha de tabela.
- **Tinta** (`#0e1a16`): texto principal. **Tinta média** (`#46554f`): texto secundário. **Tinta suave** (`#5b6862`): rótulos e dicas, no limite do AA (4,5:1).
- **Traço** (`#e0e6e3`) para bordas de cartão e divisores; **Traço forte** (`#ccd5d1`) para botões; **Borda de campo** (`#7d8b85`, 3:1 contra a superfície) para campos de formulário.

### Semantic
- **Ok** (`#2f7a3a`), **Alerta** (`#9a6207`), **Perigo** (`#b4232a`), **Info** (`#14568a`) e **Neutro** (`#566560`), cada um com uma versão `-suave` para fundo de selo e aviso.
- Gráficos usam oito séries em ordem fixa (`--s1` a `--s8`), começando pelo esmeralda.

### Tema escuro
Fundos verde-noite (`#0a0f0e`, superfície `#111a17`), texto `#e6eeea` e acento clareado (`#34b394`) para manter contraste. Os mesmos nomes de token, valores diferentes.

### Fixos nos dois temas
- **Véu** (`--veu`, `rgba(10,14,19,.5)`): fundo atrás de modal e gaveta, sem desfoque.
- **Papel de assinatura** (`--papel` `#ffffff`, `--papel-traco` `#9aa6b2`, `--papel-texto` `#6b7682`): a moldura da assinatura fica branca mesmo no tema escuro, porque é o suporte da tinta.

### Named Rules
**The One Voice Rule.** O esmeralda é o único acento de ação; nenhuma tela introduz um segundo. Verde-hospital e ouro ficam na barra da marca.
**The State-Only Color Rule.** Ok, alerta, perigo e info só aparecem para comunicar estado real (selo de status, aviso, erro de campo), nunca como enfeite.

## Typography

**Display/Body Font:** Inter variável, hospedada em `public/fonts` (subconjunto latino, licença OFL, funciona offline), com reserva de métrica compatível ("Inter Reserva") e Segoe UI Variable / system-ui depois
**Label/Mono Font:** a mesma Inter; `ui-monospace` só para códigos de conferência

**Character:** Uma família só, sóbria e neutra, em tamanhos pequenos e pesos médios. A distinção vem de peso e caixa alta nos rótulos, não de troca de fonte.

### Hierarchy
- **Headline** (600, 22px, 1.5, tracking −0,018em, `text-wrap: balance`): título da página no topo.
- **Title** (600, 17px): título de cartão e seção. Há também 15px e 13px para subseções.
- **Body** (400, 14px, 1.5): texto corrido, campos (13,5px) e tabelas (13px).
- **Label** (650, 11px, +0,06em, caixa alta): rótulos de grupo da navegação e cabeçalhos de seção.
- **Texto compacto** (400–500, escala `--t-1` a `--t-4` = 11,5 / 12 / 12,5 / 13px): tabelas, notas, dicas, selos e mensagens de campo. Entre 13,5px (campos e navegação) e 14px (corpo) fecha a escala. Nada fora dela sem motivo.
- **Celular:** corpo em 15px e campos em 16px, para o iOS não dar zoom ao focar.
- **Código de conferência:** `ui-monospace` (SF Mono, Menlo) só para hashes e códigos.

### Named Rules
**The Tabular Numbers Rule.** Todo valor financeiro, hora ou contagem em coluna usa `font-variant-numeric: tabular-nums`. Número desalinhado é erro visual.

## Layout

Casca de duas colunas: barra lateral fixa de 248px à esquerda, área principal com topo fixo de 60px e conteúdo de até 1500px. O ritmo de espaço segue uma escala de 4, 8, 12, 16, 24, 32 e 48px.

Breakpoints em 1100, 1040, 860, 720 e 560px. Abaixo de 860px a barra lateral vira gaveta e formulários de duas ou três colunas colapsam em uma. O topo respeita `safe-area-inset-top` no celular. No computador, tabelas rolam na horizontal dentro do próprio contêiner em vez de quebrar a página; no celular (até 720px) cada linha vira um cartão de rótulo e valor em duas colunas, com as ações da linha sempre à vista. Os KPIs ficam dois a dois no celular a partir de 360px.

## Elevation & Depth

Híbrido, mas com peso no traço: cartões repousam com borda de 1px e uma sombra quase invisível. Sombra maior aparece só em camadas que flutuam (modal, menus, torradas). O topo usa translucidez com desfoque leve sobre o fundo.

### Shadow Vocabulary
- **Repouso** (`0 1px 2px rgba(16,24,40,.05)`): cartões.
- **Elevada** (`0 2px 8px rgba(16,24,40,.07), 0 1px 2px rgba(16,24,40,.04)`): itens levantados.
- **Flutuante** (`0 12px 32px rgba(16,24,40,.13), 0 2px 8px rgba(16,24,40,.06)`): modais e painéis sobre a página.

### Quadro vivo: o arrasto
No Quadro do dia, o bloco se arrasta com mouse, caneta ou toque (no celular, segurando ~280ms; deslizar antes disso rola o quadro). O bloco original vira uma marca tracejada do lugar de onde saiu; um clone flutuante levanta (sombra flutuante, inclinação de até 2,5° com a velocidade, amortecida por mola; assenta desacelerando, sem quique) e a pista mostra o passo de 15 minutos em que o horário gruda. Um encaixe indica onde vai pousar e uma dica acima do bloco diz o horário ou o aviso: cruzar outra cirurgia do mesmo anestesista aparece ao vivo em âmbar, mas **não bloqueia** (conflito é aviso operacional no core); coluna sem anestesista e soltar fora do quadro devolvem o bloco. Arrasto na vertical só passa de 10px de zona morta e só vale para blocos com horário; Esc cancela; soltar mostra um toast com **Desfazer**. Cirurgias que se cruzam na mesma coluna ficam lado a lado em raias. O menu do bloco (clique ou Enter) continua o caminho de teclado. Com movimento reduzido, sem inclinação e sem a animação de assentar.

### Comemoração: o visto
O sistema tem um único gesto de comemoração, o **visto**: o traço de conferido numa ficha de papel, que se desenha uma vez (aro em 420ms, traço em 300ms) e depois fica parado. Aparece só quando algo fecha de verdade: boletim assinado (junto com a assinatura, que se escreve de novo sobre o papel `--papel`, na tinta `--papel-tinta`), horas do mês sem pendência e repasse quitado. Salvar, editar e lançar seguem sem cerimônia. A torrada de marco (`UI.marco`) fica 7s; o visto parado marca o estado nas telas. Com movimento reduzido ele aparece já desenhado.

### Movimento
Curto e funcional. Troca de tela usa View Transitions (só o conteúdo, 160ms saindo e 220ms entrando) e cai numa entrada por CSS onde não há suporte; com movimento reduzido, troca seca. O modal cresce do ponto onde se clicou (`transform-origin` no gatilho). Edição e busca não animam a tela.

### Named Rules
**The Line-First Rule.** Hierarquia se resolve com borda, espaço e peso de fonte antes de qualquer sombra.

## Shapes

Cantos pequenos e consistentes: 6px em botões, campos e itens de navegação; 14px em cartões; 20px em painéis grandes; cápsula total (999px) em selos e contadores. Divisores e bordas têm sempre 1px.

## Components

### Buttons
- **Shape:** cantos discretos (6px), 13px/500, padding 7px 13px, ícone de 15px com espaço de 7px.
- **Primary:** fundo esmeralda, texto branco, peso 600. Hover escurece para `#0e573f`, sem brilho.
- **Default:** fundo branco com borda forte. **Plano:** sem borda, fundo aparece só no hover. **Perigo:** texto vermelho com borda tingida.
- **Estados:** pressionado reduz a 97% em 60ms; desabilitado cai a 50% de opacidade.

### Chips / Selos
- **Style:** cápsula de 11,5px/600 com ponto de 5px na cor do texto. Fundo `-suave` e texto na cor cheia do mesmo estado (agendada = info, confirmada = acento, realizada = ok, cancelada = perigo).

### Cards / Containers
- **Corner Style:** 14px. **Background:** superfície branca. **Border:** 1px `#e0e6e3`. **Shadow:** repouso.
- **Internal Padding:** 24px no corpo, 16px na versão compacta; cabeçalho de cartão com título, subtítulo e ações.

### Inputs / Fields
- **Style:** borda de 1px em traço forte, fundo branco, 6px, padding 7px 10px, texto 13,5px.
- **Focus:** borda em esmeralda e anel de 3px em névoa esmeralda.
- **Error / Disabled:** erro pinta a borda de vermelho, com anel suave e mensagem de 11,5px/500 abaixo; desabilitado usa fundo rebaixado e cursor bloqueado.

### Navigation
Barra lateral branca com rótulos de grupo em caixa alta. Item de 13,5px/500; o atual usa fundo em névoa esmeralda e texto verde profundo. Contadores em cápsula à direita; contador de pendência usa o tom de alerta.

### Escala de hoje (Painel)
Cartão no topo do Painel com a escala do dia (ou do próximo dia com rodízio): cinco postos numerados em linha, ação primária "Abrir quadro do dia". Com o sistema vazio, um rodapé discreto leva à primeira cirurgia. É o primeiro valor do sistema, sem tour nem modal.

### Tabelas
Cabeçalho discreto, linhas com divisor de 1px, hover em Superfície 2. Colunas numéricas alinhadas à direita com números tabulares. Linhas com pendência ganham fundo de alerta suave. Ações da linha ficam a 55% até o hover (sempre visíveis em toque), com o mesmo peso de botão em todas as linhas: nunca uma coluna de botões primários. Horas e datas usam `tabular-nums` da Inter; `ui-monospace` fica para IDs e códigos.

### Gráficos
Desenhados na largura em que aparecem (um ResizeObserver redesenha ao mudar a largura), então o texto do eixo tem sempre 11px. O valor no centro da rosca encolhe até caber no furo.

## Do's and Don'ts

### Do:
- **Do** usar o esmeralda só na ação primária, no foco, no item atual e em links.
- **Do** manter texto secundário em `#5b6862` ou mais escuro (mínimo AA, 4,5:1).
- **Do** alinhar toda coluna numérica à direita com `tabular-nums`.
- **Do** manter alvos de toque de 44px no celular (`[data-dispositivo="celular"]`) e respeitar `prefers-reduced-motion`.
- **Do** marcar estado de aviso com borda tingida de 1px e ícone colorido, nunca com faixa lateral.
- **Do** usar os tokens (`var(--acento)`, `var(--r1)`, `var(--e4)`) em vez de valores soltos.

### Don't:
- **Don't** usar borda lateral colorida em cartões como marcador de estado; use selo ou fundo `-suave`.
- **Don't** animar largura, altura, margem ou padding; anime `transform` e `opacity`.
- **Don't** introduzir gradientes decorativos, listras ou um segundo acento de marca.
- **Don't** usar sombra para criar hierarquia que o traço e o espaço já resolvem.
- **Don't** usar o ouro ou o verde-hospital em botão, link, estado ou texto pequeno; são identidade, não interface.
