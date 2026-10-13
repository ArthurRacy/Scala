# Contexto do projeto — leia antes de mexer

Documento de passagem entre conversas. Diz o que o sistema é, como está
montado, o que já foi feito, as regras que não podem ser quebradas e o que
ainda falta. Atualizado em **13/10/2026**.

- Estado atual: **855 testes, todos passando** (`node qa`; a suíte inteira leva alguns minutos).
- Versão online publicada: **versão 10** (com o módulo de qualidade e segurança).

---

## 1. O que é

Sistema de gestão operacional e financeira de um **grupo de 15 anestesistas**
(cirurgia plástica), feito sobre a planilha que eles já usavam
(`Escala_Total_Anestesia.xlsx`, 11 abas). Os nomes de aba, os rótulos de
coluna e os valores de domínio da planilha são **sagrados**: um teste de
fidelidade confere tudo a cada `node qa`.

Faz:
- **Escala e rodízio:** escala-base de 6 dias × 5 posições com giro semanal,
  substituições e horizonte móvel. O calendário escolhe dia, mês e ano, até
  24 meses à frente.
- **Cirurgias, avaliações e termo:** cirurgias e avaliações pré-anestésicas
  (criadas sozinhas). Os PDFs de exame ficam presos à avaliação e podem ser
  anexados na própria tela de cirurgia (aba *Exames do paciente*). O TCLE sai
  em PDF, pode ser assinado na tela e enviado por WhatsApp.
- **Boletim anestésico:** completo, com gráfico, assinatura, código SHA-256,
  PDF, reabertura com motivo e histórico de versões.
- **Gestão:** horas reais e estimadas, financeiro/ledger, indicadores
  (produção, sem valores por anestesista) e repasse com divisão igual e chave
  PIX.
- **Controle:** cadastro, LOG de auditoria append-only, integridade e backup.
- **Qualidade e segurança em anestesia** (set/2026): ficha de indicadores por
  atendimento (desfechos, processos, acompanhamento em 24 h/48 h/30 dias,
  transição de cuidado, satisfação, revisão clínica), estrutura por
  unidade/sala/turno (coordenação), painel com 36 indicadores, comparação por
  profissional estratificada por ASA e exportação (CSV, PDF, PPTX). Documentação
  em `docs/QUALIDADE.md` e `docs/QUALIDADE_INDICADORES.md`.

## 2. Como a pessoa usuária trabalha (preferências)

- Tudo **em português do Brasil**, na interface, no código e nos comentários.
- Pede "caveman mode" (`/anthropic-skills:caveman`), ou seja, respostas
  curtas e diretas. Manter enquanto ela não pedir o contrário.
- Delega decisões ("faça tudo que falta", "termine logo"). Decidir com bom
  senso, sem perguntar à toa, e relatar no fim.
- Quer tudo verificado: testes + navegador. Quer os dados guardados por
  **pelo menos 1 ano**.
- Não é git repo. Não há npm: o projeto é **zero dependências**.

## 3. Arquitetura (o essencial)

```
core/        regras de negócio — rodam IGUAIS em Node, navegador e Apps Script
webapp/      interface sem framework (index.html + js/ + css/app.css)
server/      modo servidor da clínica (Node puro)
apps-script/ ponte com o Google Sheets
qa/          bateria própria de testes (node qa  |  node qa 17)
tools/       Python: servir.py (local), gerar_versao_online.py, corrigir_planilha.py…
docs/        REGRAS_DE_NEGOCIO.md, QA.md, KANBAN.md
```

### Invariantes (não quebrar)

1. **Caminho único de escrita.** Toda mudança passa por `store.transacao()`,
   com snapshot, rollback, recálculo e LOG. As telas nunca mexem no estado
   direto.
2. **Core em escopo global, carregado por ordem.** A ordem está em
   `core/index.js` (ARQUIVOS) e nos `<script>` do `webapp/index.html`. Arquivo
   novo no core entra nos dois lugares; o teste 11 confere.
3. **IDs nunca são reaproveitados.** As sequências ficam em
   `config.sequencias` (cirurgia, avaliação, boletim). Formato `CIR0001`,
   `AVP0001`, `BOL0001`.
4. **Vínculo dos PDFs de exame pelo `uid` da avaliação**, nunca pelo ID. A aba
   *Exames do paciente* da cirurgia respeita isso: cirurgia sem avaliação junta os
   PDFs numa fila em memória (`ANEXOS.novaFila`) e só os envia **depois** de a
   cirurgia gravada (no servidor, depois de o comando ser confirmado — é ele que
   faz a avaliação existir lá). Quem gera a avaliação é `cirurgiaPedeAvaliacao`
   (core/06): a tela não repete essa regra.
5. **Fronteira de confiança:** tudo que entra de fora passa por
   `DADOS.sanearEstado` (webapp/js/03_dados.js). Os boletins são saneados pelo
   próprio core (`sanearBoletins`).
6. **O store só aceita campos MANUAIS do schema** (`soCamposEditaveis`).
7. **Boletim guardado é imutável e congelado** (`congelarBoletim`). Toda
   mudança troca o objeto inteiro, e a transação guarda só a lista (rollback
   barato). Boletim **finalizado não se edita**: para corrigir, só reabrindo
   com motivo de 10 ou mais letras.
8. **Determinismo para o modo servidor:**
   - `agoraTexto()` e `novoUid()` respeitam o `CONTEXTO_EXECUCAO` de
     `executarComContexto(ctx, fn)`, em `core/02_util.js`.
   - O "hoje" do store vem por opção (`hoje`).
   - **Fuso:** o servidor trabalha sempre em Brasília (`process.env.TZ` no `server/servidor.js`)
     e a tela manda `agora` em Brasília (`agoraTextoBrasilia`); nunca ler a hora de um comando
     no fuso de quem a lê.
   - Não introduzir `Date.now()` nem `Math.random()` novos dentro de operações
     do store sem passar pelo contexto.
9. **Toda operação nova do store que muda dados** tem de entrar em
   `MUTACOES_STORE` e `MUTACOES_SEGURAS_EM_CONCORRENCIA` (fim de `core/12_store.js`, esta
   só se for o caso) **e ser classificada em `GRUPO_DA_MUTACAO` de `core/12b_permissoes.js`**
   (quem faz). Sem classificação, só o chefe a faz; o teste 25 recusa operação nova que
   não esteja na tabela dele. `MUTACOES_SO_ADMIN` agora sai dessa tabela (o que só o chefe
   faz). Sem estar em `MUTACOES_STORE`, a operação não chega ao servidor.
9b. **Perfis:** o corte do que cada perfil recebe (`projetarEstadoParaPerfil` e
   `redigirComandoParaPerfil`) é parte do protocolo: operação nova que mexa em dinheiro ou
   em dado de contato precisa entrar em `CAMPOS_FINANCEIROS` / `ARGUMENTO_RESTRITO`, e o
   teste de réplica (qa/25) tem de continuar igual.
9c. **LOG:** só cresce (append-only), com **uma única exceção**: `arquivarLogAte` (store),
   que o próprio servidor aplica depois de o arquivo mensal estar gravado e conferido
   (SHA-256) em `server/auditoria.js`, e que deixa uma linha "LOG ARQUIVADO" no lugar.
   Nenhuma linha sai sem estar num arquivo conferido; arquivo existente nunca é reescrito.
   Toda linha leva o `login` (o store carimba em `api.registrar`; a tela e o servidor
   precisam definir `store.login` para o estado ser idêntico). Operação interna: nenhum
   perfil a manda pela rede (`GRUPO_DA_MUTACAO`: 'interna').
10. **Downloads** passam por `UI.salvarArquivo(nome, dados)`. Na versão online,
    usa a capacidade `downloads` do Artifact.
11. **Qualidade (regras que não se negociam):**
    - Resposta de evento **nunca nasce preenchida**; vazio nunca é lido como
      "não houve evento". Dado ausente fica em *sem informação*, **fora do
      numerador e do denominador** (`core/09c`); "não se aplica" tira o atendimento
      da população elegível. Sem denominador a taxa é `null`, nunca 0%.
    - A atribuição à anestesia (`relacao`) é campo separado; nada presume causalidade.
    - Nenhum indicador nasce atribuído a SBA/ANVISA/Patient Safety: fonte, versão e
      data de revisão são registradas pela coordenação (`config.qualidade`).
    - Pendência **nunca bloqueia** o atendimento (`pendenciasFicha` só lista).
    - Ficha (`estado.fichasQualidade`) e registro de estrutura (`estado.estrutura`)
      são **objetos congelados**, como o boletim; toda mudança troca o objeto
      inteiro. O snapshot usa `imutaveisPorReferencia` (o nome antigo
      `boletinsPorReferencia` ainda é lido).
    - Operações novas estão em `MUTACOES_STORE`; `salvarRegistroEstrutura`,
      `removerRegistroEstrutura` e `salvarConfigQualidade` também em
      `MUTACOES_SO_ADMIN`; as que só mudam campo de ficha existente, em
      `MUTACOES_SEGURAS_EM_CONCORRENCIA` (apontar evento por índice **não**).
    - Cirurgia com ficha de qualidade não se exclui (mesma regra do boletim).

## 4. Três modos de rodar

| Modo | Como | Dados |
|---|---|---|
| **Um computador** | `Abrir sistema.bat` ou `python tools/servir.py` → http://localhost:8080/webapp/ | IndexedDB do navegador (GUARDA, `03d_guarda.js`): cópias diárias/mensais/marcos, backup numa pasta, lembrete de backup |
| **Servidor da clínica** | `Abrir servidor da clínica.bat` ou `node server/servidor.js [--porta 8080] [--dados pasta]` | `dados_servidor/`: estado.json atômico, diario.jsonl, copias/*.json.gz, anexos/, usuarios.json (scrypt), sessoes.json, logs/ (acessos por usuário e arquivo mensal do LOG) |
| **Online (demonstração)** | Artifact publicado (seção 7) | No navegador de quem visita; cirurgias e boletins de EXEMPLO |

Mais o **Google Apps Script** (copiar `core/` + `apps-script/` para a
planilha, depois o menu "Instalar"). O instalador cria as colunas CHAVE PIX e
CRM no cadastro.

### Modo servidor em uma frase

A tela executa o comando localmente e manda para o servidor
`{nome, args, contexto:{agora, semente}, base, hoje}`. O servidor reexecuta o
comando e chega **exatamente** ao mesmo estado, depois avisa as outras telas
por SSE, que reexecutam também.

Regras de concorrência e de acesso:
- **Criar, remover, apontar por índice ou assinar** com base velha → **409**,
  a tela recarrega e avisa para refazer.
- **Só editar campo** com base velha → aceito com `concorrente`, e a tela
  recarrega.
- **Login:**
  - senha em scrypt, cookie HttpOnly + SameSite=Strict;
  - trava após 5 senhas erradas;
  - cabeçalho `X-Anestesia` obrigatório contra CSRF;
  - primeiro acesso por código mostrado na janela do servidor.
- **Perfis** (decididos pelo servidor; tabela única em `core/12b_permissoes.js`):
  - `chefe` (Anestesista chefe): poder total;
  - `anestesista`: painel de operação e painel de qualidade, **sem dinheiro**
    (o servidor corta valores, pagamentos, nota fiscal, repasses, LOG e PIX/telefone/e-mail
    dos colegas do estado e dos comandos que ele recebe);
  - `secretaria`: operação e gestão, sem painel de qualidade, sem criar/editar/assinar
    boletim e sem as telas de administração.
  - `admin` e `equipe` (nomes antigos) continuam entendidos: viram chefe e anestesista.
  - **Versão online (GitHub Pages):** desde 13/10/2026 pede login, com uma conta de demonstração por
    perfil (`chefe`/`chefe2026`, `anestesista`/`anestesista2026`, `secretaria`/`secretaria2026`, à vista
    na tela de entrada; `DEMO.CONTAS` em `webapp/js/demo_online.js`). A tela esconde pelo perfil e
    `conferirPerfil` (06_app) passa cada operação por `perfilPodeExecutar`, com a assinatura do boletim
    presa ao 1º (chefe) ou 2º (anestesista) anestesista ativo do cadastro. Não há corte de dados (tudo
    fica no navegador): é demonstração. Computador único continua sem login (chefe).
- O marcador `webapp/js/00_modo.js` diz `false` no arquivo; o servidor Node
  responde `true` nesse mesmo endereço.

## 5. Mapa dos arquivos que mais importam

- `core/12_store.js`: estado, transação, todas as operações de negócio,
  integridade e as listas de MUTACOES.
- `core/06b_boletim.js`: formato, validação, horários atravessando a
  meia-noite, checklist, Aldrete, código de conferência, finalização e
  reabertura.
- `core/06c_qualidade.js` (ficha: formato, eventos, validação, pendências,
  pertinência à técnica), `core/06d_estrutura.js` (estrutura e vínculo com o
  atendimento) e `core/09c_qualidade_painel.js` (catálogo de 36 indicadores,
  cálculo, filtros, comparação, `resultadosPorAtendimento`).
- `webapp/js/telas/qualidade.js` (ficha por etapa), `painel_qualidade.js`
  (indicadores, comparação, configuração clínica, exportação),
  `estrutura.js`; `03f_qualidade_pdf.js` (PDF da ficha e do relatório) e
  `03h_pptx.js` (PPTX à mão: zip de XML sobre `DADOS.zip`).
- `core/02_util.js`: utilidades; também `sha256Hex` e `jsonCanonico` (feitos
  à mão) e o contexto de execução.
- `core/02b_calendario.js` (horizonte móvel) e `core/10b_retencao.js` (regra
  de cópias, compartilhada entre navegador e servidor).
- `webapp/js/06_app.js`: casca, navegação, calendário do topo, partida
  local/servidor, `redesenharQuandoLivre`.
- `webapp/js/03g_servidor.js`: lado navegador do servidor (entrada, fila,
  sincronia, SSE, status, API de admin e de anexos).
- `webapp/js/03b_pdf.js`: gerador de PDF 1.4 sem biblioteca (texto, seções,
  pares, tabela com quebra de página, desenho vetorial).
- `webapp/js/03e_boletim_pdf.js` (PDF do boletim) e
  `webapp/js/03c_tcle.js` (termo de consentimento).
- `webapp/js/telas/*.js`: uma tela por arquivo, registrada em `TELAS`.
  `boletim.js` é a maior: lista + editor que salva campo a campo sem perder o
  foco.
- `server/servidor.js` (rotas, comandos, SSE), `server/armazem.js` (disco) e
  `server/contas.js` (usuários e sessões).
- `tools/gerar_versao_online.py`: gera a página única (tudo embutido,
  `MODO_ONLINE`, dados de exemplo) a partir dos `<script>` do index.html.

## 6. Como trabalhar aqui (dicas práticas)

- **Editar arquivos:** nesta máquina (Windows + Git Bash), heredoc com Python
  falha com aspas. O padrão usado foi escrever scripts `.py` no scratchpad com
  a função `troca(caminho, antes, depois)`, que faz substituição exata e exige
  1 ocorrência. Para arquivos pequenos, dá para usar Edit/Write direto.
- **Caracteres especiais:** alguns arquivos têm caracteres literais (BOM
  U+FEFF em `01_ui.js`, NBSP em regex). Cuidado com `\\u...` versus o
  caractere real.
- **Testes:** `node qa` (tudo) ou `node qa 19` (um arquivo). O runner aceita
  teste assíncrono: é só devolver uma Promise.
- **Arquivo novo na página:** script novo no webapp entra no `index.html`
  (senão o teste 11 falha) e sai automaticamente na versão online.
- **Navegador de teste:**
  - `.claude/launch.json` tem `anestesia-webapp` (Python, porta 8080);
  - para o servidor Node, uma config temporária foi criada e removida;
  - screenshots às vezes falham com a janela minimizada, então verificar via
    DOM/JS;
  - PDF no navegador interno vira download: não abrir PDF por lá; para ver,
    usar `scratchpad/render_pdf.py`, o mini-renderizador em Python + PIL, se
    ainda existir.
- **Contas de teste:** criar pela API (Node/fetch), nunca digitando senha em
  formulário do navegador.

## 7. Versão online (Artifact)

- **Link:** https://claude.ai/artifact/K6TWJLCegvn6dADDQKuPeh (versão 10,
  "qualquer pessoa com o link"). A demonstração agora traz 18 atendimentos
  fictícios de qualidade e 32 registros de estrutura (`demo_online.js`); "Tirar
  exemplos" remove tudo junto.
- **Capacidade declarada:** `downloads`, que se mantém ao republicar sem
  passar `capabilities`.
- **Para republicar:**
  1. `python tools/gerar_versao_online.py "<scratchpad>/online/gestao_anestesia.html"`
  2. Publicar com `url` = o link acima.
- **Formato:** fragmento HTML (sem doctype/head); o Artifact embrulha e
  coloca o charset.

## 8. Histórico do que foi feito (em ordem)

1. **Dez ajustes pedidos pelo grupo:**
   - tirou valores e a análise por anestesista dos indicadores;
   - "Cirurgias por tipo" pela TUSS;
   - dias fixos e PIX no cadastro;
   - espaço reservado para o boletim;
   - PDFs de exame e TCLE em PDF.
2. **Revisão de arquitetura e QA completo:**
   - CSP;
   - servidor local com lista de pastas permitidas;
   - saneamento da entrada;
   - IDs que não renascem;
   - componentes comuns.
3. **Revisão lógica profunda** (dinheiro em centavos, milhar pt-BR, horas
   negativas, nomes canônicos etc.) e a **guarda de 1 ano** (IndexedDB, cópias
   com retenção, backup em pasta).
4. **Repasse; clínica e termo** (assinatura na tela; texto do termo editável).
5. **Calendário** para escolher dia, mês e ano no topo.
6. **Boletim anestésico real** (tela, PDF, checklist, assinatura, código,
   reabertura, integridade, CSV).
7. **Downloads na versão online** + planilhas num `.zip`.
8. **Modo servidor com login**, sincronia por comandos e SSE, e tela de
   Usuários.
9. **Qualidade e segurança em anestesia** (29/09/2026): pedido em 10 partes
   (identificação, etapas do formulário, desfechos, processos, estrutura,
   satisfação/transição, regras de preenchimento, painel, configuração clínica,
   protótipo). Tudo entregue como **protótipo para aprovação**; ver `docs/KANBAN.md`
   (tabela item a item) e `docs/QUALIDADE.md`. Validado em navegador (desktop e
   375 px), no PowerPoint e no Excel de verdade (por automação COM).
10. **Exames do paciente na cirurgia nova** (01/10/2026): o formulário de cirurgia
    ganhou abas (*Dados da cirurgia* | *Exames do paciente*), com área de soltar
    PDFs, fila de espera para cirurgia sem avaliação e envio à avaliação criada ao
    lançar. `abrirModal` aceita `abas`; `COMP` ganhou `linhaExame`,
    `linhaExameGuardado`, `areaDeExames` e `impedirSoltarArquivo`; `.modal` ganhou
    `min-width: 0` (nome de arquivo comprido empurrava o modal para fora de uma
    tela de 375 px). Validado em navegador (computador, 375 px, tema claro e
    escuro, teclado) e no servidor da clínica. Testes em `qa/24_*`.
11. **Auditoria para produção** (02/10/2026, `docs/AUDITORIA_PRODUCAO.md`): relatório
    das fases 0 a 3 e correções. Feito: grupo do repasse por mês (F02), **três perfis**
    (chefe, anestesista, secretária; o servidor corta o dinheiro do que o anestesista
    recebe, F08), **fuso horário** (F01: servidor sempre em Brasília), **LOG por
    usuário** com arquivo mensal conferido e limpeza, e a intermitência do `qa/19`.
    Decisões do dono do produto: cada clínica terá o **seu próprio sistema** (um por
    clínica, sem multi-clínica); repasse sempre **igual**; hospedagem escolhida:
    **Supabase Pro por clínica** (a partir de US$ 25/mês por projeto, mais o servidor
    Node, que o Supabase não hospeda); dado real de paciente na nuvem **bloqueado até o
    jurídico** (LGPD, guarda de prontuário). Não migrado ainda: a persistência para o
    Supabase (ver auditoria, "Próximos passos").
12. **QA geral e revisão de arquitetura** (05/10/2026, `docs/QA_GERAL.md` e
    `docs/COLOCAR_NO_AR.md`): contas de dinheiro, repasse, rodízio e datas refeitas por
    um caminho independente (`qa/32`); sorteio de mais de 31 mil operações com dado
    absurdo (`tools/aleatorio_store.js`, `qa/33`); conferência de nomes indefinidos
    (`tools/verificar_nomes.js`, `qa/30`). Corrigido: dado com nome `constructor` /
    `__proto__` derrubava o recálculo (mapas sem prototype); disco cheio ou sem permissão
    (o comando é desfeito com erro 503, importar sem gravar é desfeito, o diário não fica
    com linha pela metade, a gravação falhando não derruba o servidor); **freios** contra
    relógio errado (não apaga cópias nem arquivos de LOG de uma vez); **LOG na tela
    com mínimo de 12 meses** (padrão 12, de 12 a 60) a pedido de "pelo menos um ano";
    aviso quando mudar a escala-base deixa a mesma pessoa em duas posições; trocar a
    escala-base deixa linha no LOG; `GET /api/saude` para monitoramento. Testes em
    `qa/31` (núcleo) e `qa/34` (disco e freios). **Regra para o futuro:** o laço de eventos
    do `node qa` fica preso durante os testes síncronos; teste que espera um processo filho
    deve contar só o tempo em que o laço esteve livre (ver `qa/27`).
13. **Decisões do dono do produto e endurecimento** (07/10/2026): **não travar o mês** (F03); **login ligado a quem assina o
    boletim** (cada chefe/anestesista é ligado a um anestesista do cadastro na tela Usuários; o servidor recusa assinatura em
    outro nome ou com CRM diferente do cadastro; `contextoDeAssinatura` em `core/12b_permissoes.js`); **teto de R$ 100 milhões
    por mês e no máximo 2 casas decimais** (`LIMITE_VALOR_MES`, `erroDeTetoMensal`); **mudança de escala-base (ou de cadastro com
    a base automática) que deixaria a mesma pessoa em duas posições no mesmo dia é recusada**; sem prejuízo no repasse (F12, nada a
    fazer); sem registro de rascunho de boletim no LOG. Conflito de horário **também na virada do dia** (F13). Servidor: **uma só
    cópia por pasta de dados** (`servidor.trava`, F14), `--atras-de-proxy`/`ATRAS_DE_PROXY=1` para cookie `Secure` e IP real (F06,
    F17), limite de 30 exames por avaliação (F15), argumentos de comando seguros, respostas em gzip, `tools/redefinir_senha.js`,
    `docs/RUNBOOK.md`, `deploy/` (modelos, não testados numa máquina) e `.github/workflows/testes.yml`. **Volume:** até 2.500
    cirurgias por mês não cabe no desenho de hoje (`docs/ESCALA_E_BANCO.md`): banco relacional, tela por mês e boletim/ficha por
    registro, **aguardando aprovação**.
14. **Três logins na versão online** (13/10/2026): a página do GitHub Pages abre numa tela de entrada com as contas
    Anestesista chefe, Anestesista e Secretária, cada uma com o seu nível de acesso (seção 4, "Perfis"). Testes em `qa/39`.
    O Artifact (seção 7) **não** foi republicado e continua sem login.

## 9. Pendências e ideias (nada bloqueando)

- **Versão online:** o GitHub Pages já tem a aba *Exames do paciente* (commit
  `e258d54`, 01/10/2026; testada na URL pública). O **Artifact** (link da seção 7)
  continua na versão 10, **sem** a aba: para atualizar, gerar a página (seção 7) e
  publicar no mesmo link.
- **Exames:** só PDF (decisão do grupo, desde os "dez ajustes"); foto de exame
  (JPG/PNG) exigiria mexer na conferência do arquivo (`ANEXOS.conferir`), no
  servidor (`receberAnexo`), no backup e na abertura em outra aba. Fechar o
  formulário de cirurgia sem lançar descarta os PDFs que ainda esperavam na fila,
  como já descarta os campos.
- **Testes de servidor**: a intermitência antiga do `qa/19` ("fetch failed") foi
  corrigida (`Connection: close` nos auxiliares, `docs/QA.md`). Os testes que sobem
  servidor devem usar `qa/_servidor_util.js`.

- **Qualidade — decisões da instituição, não do sistema** (detalhe em
  `docs/QUALIDADE.md`, seção *Decisões em aberto*):
  - o responsável técnico precisa **aprovar** definições, limiares, elegibilidade e
    metas (tela *Painel de qualidade → Configuração clínica*); sem aprovação o
    painel avisa;
  - limiares de partida que **não vieram do pedido**: PA sistólica de hipertensão
    grave 180 mmHg, jejum 8 h (sólidos) e 2 h (líquidos), TOF ≥ 0,9, antibiótico
    0 a 60 min antes da incisão (SpO₂ < 90, PAM < 65, T < 36 e dor > 7 vêm do pedido);
  - nenhuma **meta** nem **fonte normativa** vem preenchida;
  - a coordenação de qualidade é o Anestesista chefe (o anestesista vê o painel, sem a
    comparação entre profissionais; estrutura e configuração são só do chefe);
  - LGPD: base legal, prazo de guarda, controlador e encarregado são da
    instituição; a versão online é demonstração (não usar dado real);
  - a comparação por profissional é **estratificação por ASA**, não modelo de
    risco; não há importação de dados de monitor nem assinatura ICP-Brasil.
- **Qualidade — técnico:** o PPTX só foi aberto no PowerPoint desta máquina (não
  no Keynote/Google Slides); os PDFs foram conferidos com o mini-renderizador
  (`render_pdf.py`, no scratchpad da sessão), não em leitor comercial.

- **Termo de consentimento:** o texto-modelo do TCLE
  (`webapp/js/03c_tcle.js`) precisa de **revisão jurídica** da clínica.
- **Servidor:**
  - nunca foi testado na rede real da clínica, com vários PCs e firewall;
  - HTTPS existe como opção (`dados_servidor/https/chave.pem` +
    `certificado.pem`), mas não há gerador de certificado;
  - "Recarregar dados mestres (seed.json)" existe só no modo local;
  - não há reenvio automático do que foi recusado por concorrência: a pessoa
    refaz.
- **Boletim:**
  - não há importação automática de dados de monitor;
  - a assinatura é a desenhada na tela, não certificado digital ICP-Brasil.
    Se o grupo precisar de validade jurídica plena, isso é um projeto à parte.
- **Apps Script:**
  - não conhece boletins nem repasse (são dados só do sistema);
  - o Apps Script real nunca foi executado, só com o Sheets simulado.
- **Limpeza:**
  - o navegador interno de teste tem dados de teste antigos (localhost:8080 e
    8091). Não afeta o navegador da pessoa usuária;
  - a pasta de teste do servidor ficou no scratchpad.
- **Documentação** atualizada: README (seções de boletim, qualidade, servidor e
  segurança), docs/QA.md (tabela por arquivo, 855 testes), docs/KANBAN.md,
  docs/QUALIDADE.md e docs/QUALIDADE_INDICADORES.md (este é **gerado**: rode
  `node tools/gerar_docs_qualidade.js` depois de mudar o catálogo).

## 10. Primeiros passos sugeridos para o próximo chat

1. Rodar `node qa` e confirmar 855 de 855.
2. Ler `README.md` (visão de uso) e a seção 3 deste arquivo (invariantes).
3. Antes de mexer no store, conferir as listas `MUTACOES_*` e o contexto de
   execução.
4. Depois de qualquer mudança visível: testar no navegador, regenerar a
   versão online e republicar no mesmo link (antes, `Artifact read` na versão
   publicada e um diff por bloco `<script>`: só devem mudar os arquivos que você
   mexeu).
5. Exemplos exportados do módulo de qualidade: `node tools/gerar_exemplos_qualidade.js`
   grava em `saida/exemplos_qualidade/` (ficha e relatório em PDF, CSVs, PPTX).
6. Heredoc com Python falha nesta máquina quando o texto tem muitas aspas: escreva
   o script `.py` com Write no scratchpad e rode por arquivo.
