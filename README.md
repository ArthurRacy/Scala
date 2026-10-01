# Sistema de Gestão e Escala de Anestesia

Sistema de gestão operacional e financeira para um grupo de 15 anestesistas,
construído sobre o esquema das **11 abas** da planilha em uso
(`Escala_Total_Anestesia.xlsx`), sem alterar nenhum nome de aba, rótulo de
coluna ou valor de domínio.

**Três caminhos, um só motor de regras:**

| Caminho | Onde roda | Para quê |
|---|---|---|
| **Web app** | Navegador, offline, sem instalação | Um computador: lançar cirurgias, fechar horas, ver indicadores |
| **Servidor da clínica** | Um computador da rede (Node), os outros pelo navegador | Vários computadores com os mesmos dados, login e LOG por pessoa |
| **Google Apps Script** | Na própria planilha | Para quem quer continuar na planilha, com as automações ativas |

As regras de negócio moram em `core/` e são **as mesmas nos três caminhos** —
não existe "a conta do site", "a conta do servidor" e "a conta da planilha".

**Demonstração online:** <https://arthurracy.github.io/Scala/> — abre com dados
fictícios de exemplo; o que cada pessoa lança fica só no navegador dela. **Não use
dado real de paciente nela.**

---

## Começar em 30 segundos

```bash
python tools/servir.py
```

Abre em <http://localhost:8080/webapp/> já com os 15 anestesistas e a
escala-base carregados da planilha. No Windows, basta dar dois cliques em
**`Abrir sistema.bat`**.

Para rodar a bateria de testes:

```bash
node qa
```

---

## O que o sistema faz

### Escala e rodízio
- Projeta a **ESCALA_BASE** (6 dias × 5 posições) sobre os meses do
  horizonte, aplicando o giro semanal do rodízio. O horizonte **não para em
  dezembro/2026**: acompanha o calendário (mês atual + 3) e se estende até a
  última cirurgia marcada; a virada do ano não quebra a sequência do rodízio.
- **Calendário no topo**: escolha mês e ano nas listas (ou pelas setas) e
  clique no dia para abrir o quadro daquele dia. Mostra quantas cirurgias há
  em cada dia e vai de out/2026 até 24 meses à frente — escolher um mês
  distante monta a escala dele na hora. Teclado: setas, PageUp/PageDown, Esc.
- Mês encerrado é histórico: mudar a escala-base não reescreve o passado.
- Permite **substituição** sem apagar o histórico: o valor calculado pelo
  rodízio fica preservado ao lado do efetivo.
- Monta a **ESCALA_CONSOLIDADA** com as duas chaves compostas
  (`DATA+POSIÇÃO` e `DATA+ANESTESISTA`) que a aba CIRURGIAS usa nas buscas.

### Cirurgias
- Lista suspensa de anestesista restrita ao cadastro.
- Preenche sozinho: ID do anestesista, posição no rodízio, tempo estimado,
  tempo real, dia da semana, escalados do dia, sugestão da posição 1, mês e ano.
- Avisa na hora quando o anestesista escolhido **não está na escala** daquela
  data, e quando a cirurgia tem **conflito de horário**.
- **Exames do paciente**: o formulário tem duas abas, *Dados da cirurgia* e
  *Exames do paciente*. Na segunda, arraste ou escolha os PDFs dos exames ainda
  na hora de lançar a cirurgia nova; o número de exames aparece na própria aba.
  Eles ficam presos à **avaliação pré-anestésica** (os mesmos da tela
  *Avaliações pré*):
  - com *Avaliação pré necessária? = Sim*, os arquivos esperam e vão para a
    avaliação que o sistema cria ao lançar. Se a avaliação estiver como "Não",
    a aba oferece marcá-la com um clique; cirurgia cancelada não gera avaliação,
    então não aceita exames;
  - em cirurgia que já tem avaliação, o PDF é guardado na hora, sem esperar o
    botão de salvar.

  Só PDF de verdade, até 25 MB cada: o arquivo errado (texto com extensão
  `.pdf`, vazio, grande demais) é recusado já na escolha, com o motivo. Fechar o
  formulário sem lançar descarta os PDFs que ainda esperavam, como descarta os
  campos.

### Avaliações pré-anestésicas
- A linha é **criada sozinha** no momento em que a cirurgia é marcada com
  `AVALIAÇÃO PRÉ NECESSÁRIA? = "Sim"`, já vinculada pelo `ID_CIRURGIA`.
- Paciente, data, procedimento e anestesista da cirurgia são espelhados e se
  mantêm atualizados.
- Quem avalia pode ser diferente de quem operou — a receita da avaliação vai
  para quem a realizou.
- A secretaria anexa os **PDFs dos exames** do paciente na própria avaliação —
  ou já na aba *Exames do paciente* do formulário de cirurgia — (guardados no
  navegador, via IndexedDB). O backup pode sair **com ou sem** os PDFs.
- O sistema gera o **PDF do termo de consentimento (TCLE)** já preenchido,
  para baixar, enviar (WhatsApp) ou **assinar na tela** — a assinatura vira
  PDF anexado à avaliação, com código de conferência (SHA-256).
- O texto do termo e os dados da clínica se editam em **Clínica e termo**.
  O modelo de partida (`webapp/js/03c_tcle.js`) precisa de revisão
  jurídica da clínica antes do uso real.

### Tipos de cirurgia (TUSS)
- O procedimento continua texto livre, com sugestões da tabela TUSS.
- O tipo (mamoplastia, mastopexia, lipoaspiração, abdominoplastia, face,
  face completa, braquioplastia, rinoplastia, transplante capilar…) é
  deduzido do texto ou do código TUSS e alimenta o gráfico
  "Cirurgias por tipo" do Painel. Catálogo em `core/05b_procedimentos.js`.

### Boletim anestésico
- Um por cirurgia: paciente (idade, peso, altura, IMC), avaliação resumida
  (ASA, jejum, alergias, Mallampati), técnica, via aérea, acessos, posição,
  monitorização, ventilação e os seis horários (entrada na sala → saída),
  inclusive atravessando a meia-noite.
- Sinais vitais, fármacos, fluidos e intercorrências entram por uma linha de
  digitação (Enter adiciona; a próxima linha de sinais já vem 5 min depois).
  O gráfico de PA ("v"/"^") e FC se desenha na hora. Fármaco da lista já traz
  unidade e via (anestésico local, não — a via é escolhida); a dose é sempre
  digitada. Valores impossíveis (PA 1200, diastólica acima da sistólica,
  horário fora de ordem) são recusados na hora.
- Recuperação: destino, índice de Aldrete e Kroulik (9 ou mais = critério de
  alta), dor e hora da alta; balanço hídrico calculado.
- **Finalizar e assinar**: só com o checklist completo; assinatura na tela
  (vetor no PDF), CRM (vai para o cadastro se faltar) e **código de
  conferência** (SHA-256 do conteúdo). Finalizado não se edita; reabrir exige
  motivo, que fica no LOG e no histórico de versões do boletim. Conteúdo
  alterado por fora depois de assinado aparece em Integridade.
- Ao finalizar, cirurgia sem horário real ganha o início/fim da anestesia.
  Cirurgia com boletim não pode ser excluída (vira Cancelada).
- PDF para o prontuário com gráfico, tabelas, Aldrete, assinatura e código.
  O CSV de backup inclui uma linha por boletim.

### Qualidade e segurança
- **Ficha por atendimento** (aba *Qualidade*): identificação, avaliação
  pré-anestésica, intraoperatório, recuperação, acompanhamento em 24 h, 48 h e
  30 dias, transição de cuidado e satisfação — mais a revisão clínica. Cada campo
  grava sozinho; funciona no celular.
- **Do boletim para a ficha**: o botão *Do boletim* compara a ficha com o boletim
  anestésico da mesma cirurgia (idade, peso, altura, ASA, técnica, horários, destino,
  menor SpO₂, menor PAM, maior PA sistólica) e copia só o que a pessoa marcar. Resposta
  Sim/Não nunca é copiada; cada campo copiado fica no histórico com a origem.
- **Perguntas de evento com quatro respostas** (Sim, Não, Não se aplica, Não
  avaliado/sem informação) que **nascem sem resposta**: campo em branco nunca é
  lido como "não houve evento". "Sim" abre data e horário, descrição, gravidade,
  conduta, evolução, relação com a anestesia e situação da investigação. Só
  aparece o que é pertinente à técnica (bloqueador neuromuscular, via aérea e
  despertar só na anestesia geral).
- **Painel** (aba *Painel de qualidade*): 36 indicadores com eventos, elegíveis,
  taxa, definição, fórmula, sem informação, sem acompanhamento e evolução mês a
  mês; filtros por período, unidade, especialidade, procedimento, técnica, ASA e
  profissional; comparação por profissional estratificada por ASA.
  **Dado ausente nunca entra como resultado negativo.**
- **Estrutura** (aba *Estrutura*, coordenação): equipamentos, carro de parada,
  equipe, sangue e treinamentos por unidade, sala e turno — ligada ao atendimento
  sozinha, sem o anestesista repetir nada.
- **Configuração clínica**: limiares, metas e referências (fonte, versão, data) e
  a aprovação do responsável técnico. Nenhum indicador nasce atribuído a SBA,
  ANVISA ou outra entidade.
- **Exportação** agregada e sem identificação: Excel/CSV, PDF e PPTX; o PDF da
  ficha é prontuário e identifica o paciente.
- Detalhes, regras e checklist de aprovação em
  [docs/QUALIDADE.md](docs/QUALIDADE.md).

### Horas
- **Horas reais e estimadas nunca se somam** — vivem em colunas separadas.
- Cirurgia realizada sem horário real entra no contador
  `CIRURGIAS SEM HORÁRIO REAL PREENCHIDO`, e o tempo estimado é adotado
  provisoriamente numa coluna própria (`A confirmar`), sem contaminar as reais.
- Lista nominal das cirurgias que estão travando o fechamento do mês.

### Financeiro e indicadores
- Ledger unificado: anestesias + avaliações, com recebido e pendente separados.
- Indicadores mensais e dashboard com gráficos filtráveis por mês/ano.
- O comparativo entre anestesistas mostra só **produção** (cirurgias,
  avaliações, horas estimadas e reais): o grupo divide o resultado igualmente,
  então valores por anestesista saíram da tela.

### Repasse
- Divisão igual do resultado do mês entre os participantes, pela base de
  **caixa** (o que entrou) ou **competência** (o que foi produzido), com
  despesas do mês descontadas e centavos distribuídos sem sobra.
- Registro de cada pagamento feito (PIX do cadastro ao lado) e a diferença
  que falta repassar a cada um.

### Cadastro
- Dias fixos de cada anestesista (derivados da escala-base), chave PIX e CRM.
  `CHAVE PIX` e `CRM` são colunas novas (`extra: true` no schema): ficam fora
  da conferência de fidelidade com a planilha original, e a instalação do
  Apps Script cria os cabeçalhos no fim da aba, sem mexer no resto.

### Auditoria
- Trilha **append-only** de alterações críticas: quem, quando, qual campo,
  valor antes e depois. Observação e sala não poluem o log.

---

## Como rodar

### 1. Web app num computador só

```bash
python tools/servir.py
```

Precisa de servidor (não basta duplo clique) porque a página carrega os
módulos de `core/`, e alguns navegadores bloqueiam isso em `file://`.

Os dados ficam no **navegador** (IndexedDB), salvos a cada alteração, com
cópias automáticas guardadas por **mais de um ano** (35 diárias, 24 mensais
e marcos de 400 dias) e pedido de armazenamento persistente ao navegador.
Em **Dados e backup** dá para escolher uma pasta (Chrome/Edge; ex.: OneDrive) que recebe
um backup por dia, restaurar qualquer cópia, e exportar `.json` (com ou sem
PDFs) ou as planilhas (um `.zip` com um `.csv` por aba). O sistema lembra quando o último backup externo
ficou velho.

> Sem servidor Python à mão? Qualquer servidor estático na raiz do projeto
> serve: `npx serve .`, `php -S localhost:8080`, etc.

### 2. Servidor da clínica (vários computadores, com login)

Um computador da clínica guarda os dados; os outros entram pelo navegador e
veem tudo igual, na hora. Precisa de [Node.js](https://nodejs.org) (versão
LTS) **só no computador do servidor** — nenhum `npm install`.

```bash
node server/servidor.js
```

Ou dois cliques em **`Abrir servidor da clínica.bat`**. A janela mostra os
endereços (ex.: `http://192.168.0.10:8080/`) — é por ele que os outros
computadores entram. Deixe a janela aberta; Ctrl+C grava tudo e desliga.
Na primeira vez, o Windows pergunta sobre o firewall: permita só em
**redes privadas**.

- **Primeiro acesso**: sem nenhum usuário, a janela mostra um código de uso
  único (também em `dados_servidor/PRIMEIRO_ACESSO.txt`). Com ele, a tela de
  entrada cria o administrador.
- **Usuários e papéis** (Cadastro › Usuários, só administrador):
  *administrador* faz tudo, inclusive usuários, cadastro e CHAVE PIX,
  escala-base, dados da clínica, repasse e backup; *equipe* faz a operação do
  dia a dia (cirurgias, avaliações, substituições, boletins). Quem sai do
  grupo é desativado — o nome continua no LOG. O LOG registra cada alteração
  com o nome de quem entrou.
- **Como fica tudo igual**: cada tela aplica a alteração na hora e manda o
  *comando* ao servidor, que o reexecuta com o mesmo core, a mesma hora e a
  mesma semente de identificadores — e chega ao mesmo estado; as outras telas
  são avisadas na hora (SSE) e reexecutam também. Se duas pessoas criarem ou
  apagarem algo no mesmo instante, a segunda é avisada para refazer (nada é
  gravado por cima do trabalho de outra pessoa em silêncio). Sem rede, a tela
  guarda as alterações numa fila e envia quando o servidor volta.
- **Onde ficam os dados** (`dados_servidor/`, ou `--dados D:\pasta`):
  `estado.json` (gravação atômica), `diario.jsonl` (cada comando é gravado
  antes de ser confirmado — uma queda de luz não perde nada), `copias/`
  (uma por dia por 35 dias, a primeira de cada mês por 24 meses, marcos de
  antes de importar/restaurar por 400 dias), `anexos/` (PDFs de exame;
  removidos ficam 400 dias em `removidos/`), `usuarios.json` (senhas em
  scrypt), `acessos.log`. Copie essa pasta para fora do computador de tempos
  em tempos, ou use Dados e backup › Exportar com PDFs.
- **Levar os dados de um navegador para o servidor**: no modo de um
  computador só, *Exportar com PDFs*; no servidor, o administrador usa
  *Importar backup*.

### 3. Google Apps Script (na planilha)

1. Abra a planilha no Google Sheets.
2. **Extensões → Apps Script**.
3. Copie, nesta ordem, cada arquivo de `core/` (`00_config.js` até
   `12_store.js`, incluindo `02b_calendario.js`, `05b_procedimentos.js`,
   `06b_boletim.js` e `09b_repasse.js`) e depois cada arquivo de `apps-script/` (`90_` a `92_`).
   A ordem importa: o Apps Script concatena os arquivos por nome.
4. Salve, recarregue a planilha e use o menu **⚕ Anestesia →
   Instalar / atualizar sistema**.

O que a instalação faz:

- cria as duas listas suspensas que faltavam (anestesista em CIRURGIAS e em
  AVALIAÇÕES PRÉ);
- reescreve as fórmulas das colunas `(auto)`;
- corrige dois erros de fórmula da aba INDICADORES (veja
  [docs/REGRAS_DE_NEGOCIO.md](docs/REGRAS_DE_NEGOCIO.md));
- instala o gatilho que cria a linha da avaliação automaticamente.

A instalação **não apaga dado nenhum** e pode ser repetida à vontade.

### 4. Só corrigir a planilha atual

Se você quer apenas a planilha consertada, sem sistema:

```bash
python tools/corrigir_planilha.py "caminho/Escala_Total_Anestesia.xlsx"
```

Gera um arquivo `_corrigida.xlsx` ao lado do original (que não é tocado).
Use `--conferir` para só ver o relatório, sem gravar.

---

## Estrutura do projeto

```
core/                 Regras de negócio — roda em Node, navegador e Apps Script
  00_config.js          Parâmetros ajustáveis (meses, rodízio, prefixos de ID)
  01_schema.js          As 11 abas, coluna por coluna, com os rótulos exatos
  02_util.js            Datas, horas, durações, dinheiro, chaves compostas
  02b_calendario.js     Meses do sistema: os da planilha e o horizonte móvel
  03_dominios.js        Listas fechadas e validação de registros
  04_rodizio.js         ESCALA_BASE → escalas mensais → consolidada
  05_cirurgias.js       Colunas calculadas da aba CIRURGIAS
  05b_procedimentos.js  Tipos de cirurgia e catálogo TUSS
  06_avaliacoes.js      Integração CIRURGIAS → AVALIAÇÕES PRÉ
  06b_boletim.js        Boletim anestésico: formato, validação, assinatura
  06c_qualidade.js      Ficha de qualidade: eventos, validação, pendências, acompanhamento
  06d_estrutura.js      Estrutura por unidade/sala/turno e vínculo com o atendimento
  07_horas.js           Balanço de horas e contador de pendência
  08_financeiro.js      Indicadores mensais e ledger unificado
  09_indicadores.js     Consolidação por anestesista e comparativo
  09b_repasse.js        Divisão do resultado e pagamentos do repasse
  09c_qualidade_painel.js Indicadores de qualidade: definição, cálculo, filtros, comparação
  10_dashboard.js       KPIs e séries de gráfico
  10b_retencao.js       Quanto tempo cada cópia de segurança fica
  11_log.js             Trilha de auditoria
  12_store.js           Estado, transações e integridade
  index.js              Carregador (só no Node)

webapp/               Interface — sem framework, sem build, sem CDN
  index.html
  css/app.css           Design system (claro e escuro)
  js/00_bootstrap.js    Ponte com o core + verificação de carga
  js/01_ui.js           DOM, ícones, modal, torradas, tabelas, formulários
  js/01b_componentes.js Peças de tela comuns (KPI, cartão, filtros, área e linha de exames) + registro TELAS
  js/02_graficos.js     Gráficos em SVG escritos à mão
  js/03_dados.js        Persistência, import/export, saneamento da entrada, CSV
  js/03a_anexos.js      PDFs de exames (IndexedDB), presos ao uid da avaliação; fila da cirurgia nova
  js/03b_pdf.js         Gerador de PDF mínimo, sem biblioteca
  js/03c_tcle.js        Texto e montagem do termo de consentimento
  js/03d_guarda.js      Guarda dos dados: IndexedDB, cópias, backup em pasta
  js/03e_boletim_pdf.js PDF do boletim anestésico (gráfico em vetor)
  js/03f_qualidade_pdf.js PDF da ficha de qualidade e do relatório do painel
  js/03h_pptx.js        Apresentação .pptx do painel, sem biblioteca
  js/03g_servidor.js    Modo servidor: entrada, fila de comandos, sincronia
  js/00_modo.js         false aqui; o servidor da clínica responde true
  js/telas/*.js         Uma tela por arquivo; cada uma se registra em TELAS
  js/06_app.js          Casca: navegação, calendário, ciclo de vida, auto-save
  js/demo_online.js     Cirurgias de EXEMPLO para a versão publicada online
  js/seed.js            Dados mestres da planilha (gerado)

apps-script/          Camada Google Sheets
  90_planilha.gs        Leitura/escrita casando por rótulo de cabeçalho
  91_instalar.gs        Validações, fórmulas, correções, gatilho
  92_gatilhos.gs        Menu, onEdit (criação automática), ações manuais
  appsscript.json

qa/                   667 testes, sem dependência externa
  index.js              Executor  —  node qa  |  node qa 05
  _runner.js            Arnês de testes
  _mock_sheets.js       Google Sheets de mentira, para testar a ponte
  01..24_*.test.js

server/               Modo servidor (Node puro, sem npm install)
  servidor.js           HTTP, login, comandos, SSE, anexos, backup
  armazem.js            Disco: estado atômico, diário, cópias, PDFs
  contas.js             Usuários (scrypt), sessões, trava por tentativas

tools/                Utilitários Python
  servir.py             Sobe o web app
  gerar_versao_online.py Página única (tudo embutido) para publicar online
  extrair_cabecalhos.py Impressão digital da planilha (para a QA de fidelidade)
  extrair_dados.py      Exporta dados mestres e escalas de referência
  gerar_seed_js.py       Embute os dados mestres no web app
  verificar_schema.js   Confere o schema contra a planilha
  gerar_exemplos_qualidade.js  Ficha, relatório, planilhas e PPTX de exemplo (saida/exemplos_qualidade/)
  gerar_docs_qualidade.js      Catálogo de indicadores para a aprovação clínica
  corrigir_planilha.py  Aplica as correções no .xlsx

data/                 Dados extraídos da planilha (gerados)
docs/                 Documentação
saida/                Arquivos gerados para uso (planilha corrigida)
Abrir sistema.bat     Atalho do Windows: um computador só (Python)
Abrir servidor da clínica.bat  Atalho do Windows: servidor em rede (Node)
```

---

## Decisões de projeto

**Zero dependências.** Nenhum `npm install`, nenhum CDN, nenhum build. O
sistema tem de abrir numa máquina de consultório, offline, anos depois. Isso
custou escrever os gráficos em SVG à mão e um arnês de testes próprio — em
troca, não há nada que possa quebrar por uma versão publicada de terceiros.

**Um modelo de runtime.** O core vive no escopo global e é carregado por
ordem de nome. É assim que o Apps Script funciona, é assim que uma sequência
de `<script>` funciona, e `core/index.js` recria o mesmo ambiente no Node.
Não existe divergência entre "passou no teste" e "roda na planilha".

**A planilha manda no vocabulário.** Todo rótulo de coluna, nome de aba e
valor de domínio foi extraído do arquivo em uso e é conferido a cada execução
da QA (`tools/extrair_cabecalhos.py` + teste de fidelidade). Mudar um acento
no código faz o teste falhar antes de chegar perto da planilha.

**Um caminho único de escrita.** Nenhuma tela mexe no estado direto: tudo
passa por `store.transacao()`, que valida, aplica, recalcula, sincroniza e
registra no log — e desfaz tudo se algo falhar.

**Minutos, não horas fracionárias.** Toda duração é acumulada em minutos
inteiros e convertida uma única vez no fim. Somar `10/60` vinte vezes acumula
erro; somar `10` vinte vezes não.

---

## Publicação no GitHub Pages

A página de demonstração é o `index.html` da raiz (tudo embutido), servido pelo
GitHub Pages a partir da branch `main`. Depois de mudar qualquer arquivo do
sistema, gere de novo e envie:

```bash
python tools/gerar_versao_online.py index.html --completo
git add -A && git commit -m "Atualiza a página online" && git push
```

`saida/*.xlsx`, `dados_servidor/` e chaves `.pem` ficam fora do repositório
(`.gitignore`): planilha real, dados de pacientes e certificados nunca sobem.

---

## Documentação

- [docs/REGRAS_DE_NEGOCIO.md](docs/REGRAS_DE_NEGOCIO.md) — como o rodízio
  funciona de verdade, e as divergências encontradas na planilha
- [docs/KANBAN.md](docs/KANBAN.md) — situação de cada tarefa e onde ela mora
- [docs/QA.md](docs/QA.md) — o que a bateria de testes cobre
- [docs/QUALIDADE.md](docs/QUALIDADE.md) — módulo de qualidade e segurança:
  regras, permissões, proteção de dados, checklist de aprovação
- [docs/QUALIDADE_INDICADORES.md](docs/QUALIDADE_INDICADORES.md) — definição,
  fórmula e população elegível de cada indicador (gerado do código)

---

## Segurança e proteção de dados

- **Servidor local** (`tools/servir.py`): escuta só em `127.0.0.1`, serve só
  `webapp/` e `core/` (a planilha em `saida/` e os dados em `data/` ficam de
  fora), e manda Content-Security-Policy, `nosniff`, `X-Frame-Options`.
- **Página**: CSP também no `<meta>` — só scripts do próprio sistema, nenhum
  CDN, nenhum script inline, nenhum envio de dado para outro endereço.
- **Entrada**: backup e seed importados são reconstruídos campo a campo pelo
  schema (`DADOS.sanearEstado`); o store só aceita campos MANUAIS numa
  gravação — ID e colunas "(auto)" nunca vêm da tela.
- **CSV**: célula que começa com `=`, `+`, `-` ou `@` é neutralizada (evita
  fórmula ativa ao abrir no Excel).
- **IDs** nunca são reaproveitados; os PDFs de exame se prendem ao `uid` da
  avaliação, não ao ID sequencial — um backup importado não mostra exame de
  um paciente na avaliação de outro.
- **Duas abas abertas**: se uma grava, a outra para de salvar e pede recarga.
- **Versão online** (página publicada): abre com cirurgias e boletins de
  EXEMPLO; o que cada pessoa lança fica só no navegador dela — não vai para
  servidor nem para os outros visitantes. Não use dados reais de pacientes
  nela. PDFs, planilhas (.zip) e backup saem pela capacidade "downloads" da
  página, que pede confirmação a quem está usando.
- **Auditoria**: troca de CHAVE PIX e de CRM entra no LOG.
- **Boletim assinado**: código de conferência (SHA-256 do conteúdo) e objeto
  congelado na memória; a transação desfaz qualquer gravação que falhe.
- **Qualidade e segurança**: ficha e registro de estrutura também são objetos
  congelados, com histórico campo a campo (autor, data, hora). No servidor, a
  equipe preenche fichas, mas estrutura e configuração clínica são só do
  administrador (o servidor responde 403). As exportações agregadas não trazem
  paciente; a planilha por atendimento traz só ID da ficha e mês.

- **Servidor da clínica**: login com senha (scrypt, sal por usuário), sessão
  em cookie HttpOnly + SameSite=Strict que cai após 12 h sem uso, trava de 15
  minutos depois de 5 senhas erradas, cabeçalho próprio + mesma origem em
  toda gravação (CSRF), papéis admin/equipe conferidos no servidor, pasta de
  dados nunca servida, registro de entradas em `acessos.log`. **Use só na
  rede interna** — nunca abra a porta para a internet. Para HTTPS, coloque
  `chave.pem` e `certificado.pem` em `dados_servidor/https/`.

**O que continua sob responsabilidade de quem usa:** no modo de um
computador só, os dados de pacientes ficam no navegador sem criptografia e
sem login. Use o sistema em computador
com usuário próprio do sistema operacional, bloqueio de tela e disco
criptografado (BitLocker), e guarde os backups `.json` em local protegido.
