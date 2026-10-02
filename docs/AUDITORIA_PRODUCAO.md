# Auditoria para produção (com Supabase) — fases 0 a 3

Data: 02/10/2026. Estado verificado: `main`, commit `0f14429`, **667 testes passando**
(rodados também com o relógio do computador em UTC e na Nova Zelândia: continuam 667).

**Nada do projeto foi alterado** nesta rodada. Só leitura, mais scripts de teste que
ficaram fora do repositório. Este arquivo é o único acréscimo.

## Como ler as marcas

| Marca | Significa |
|---|---|
| **CONFIRMADO (rodei)** | Eu executei e vi o resultado. Está descrito como repetir. |
| **CONFIRMADO NO CÓDIGO** | Li o trecho e o comportamento é inequívoco, mas não executei. |
| **HIPÓTESE** | Suspeita razoável, sem prova. Diz o que falta para provar. |

---

## Fase 0 — O que o projeto é (mapa)

**Para que serve:** gestão de um grupo de 15 anestesistas de cirurgia plástica: escala e
rodízio, cirurgias, avaliação pré-anestésica, termo de consentimento, **boletim anestésico
assinado (prontuário)**, horas, **financeiro e repasse em dinheiro**, e um módulo de
qualidade e segurança. Tudo em português.

**Stack:** JavaScript puro, **zero dependências** (nenhum `npm install`), sem framework, sem
build. ~9.500 linhas de regras (`core/`), ~16.000 de telas (`webapp/`), ~1.200 de servidor
(`server/`), ~8.700 de testes (`qa/`). Python só para ferramentas.

**As regras de negócio rodam em três lugares com o mesmo código:** navegador, servidor Node e
Google Apps Script (planilha).

**Os três modos de uso hoje:**

| Modo | Onde ficam os dados |
|---|---|
| Um computador | IndexedDB do navegador, sem login |
| Servidor da clínica (Node) | Pasta `dados_servidor/`: `estado.json`, `diario.jsonl`, cópias, PDFs, usuários |
| Demonstração online (GitHub Pages) | No navegador de quem visita, dados fictícios |

### O fato mais importante da auditoria

> **Não existe Supabase, Postgres nem qualquer banco SQL neste projeto.** Não há uma única
> menção a Supabase no repositório. Todos os dados são **um único documento JSON** mantido
> em memória por um processo Node, gravado inteiro em arquivo.

Por isso "lançar com Supabase" **não é trocar a conexão do banco**. É uma decisão de
arquitetura. Isso muda quase tudo que o seu roteiro pede (RLS, constraints, índices,
migrations), porque essas coisas só existem depois que houver tabelas.

Três opções (a escolha é sua, ver "Perguntas" no fim):

| | O que é | Esforço | Risco | Observação |
|---|---|---|---|---|
| **A. Supabase por baixo, motor atual por cima** | Mantém o servidor Node e as regras de hoje (os 667 testes seguem valendo). Supabase vira o lugar onde ficam estado, diário de comandos, PDFs (Storage) e, se quiser, o login (Auth). RLS fecha todas as tabelas para o público; só o servidor acessa. | Semanas | Baixo-médio | **O servidor Node precisa de hospedagem própria** (VPS, Fly, Render…): o Supabase não roda um processo longo com estado em memória. |
| **B. Banco relacional de verdade** | Tabelas (`cirurgias`, `avaliacoes`, `boletins`…), constraints, RLS por usuário, regras reescritas em SQL/TypeScript. | Meses | Alto: reescrever 9.500 linhas de regra sem perder a fidelidade que os testes dão hoje | Só compensa com várias clínicas ou relatórios que o JSON não permite. Planilha e Apps Script deixam de acompanhar. |
| **C. Não migrar** | Servidor Node na clínica, com os conserto desta lista e cópia externa automática. | Dias | Médio: um computador é ponto único de falha | Não usa Supabase. |

**Minha recomendação, sem decidir por você:** **A** agora, escondendo o acesso a dados atrás
da camada `server/armazem.js` (que já existe), para **B** ficar possível depois sem
retrabalho. Detalhes e perguntas no fim.

---

## Fase 1 — Achados

Ordem: do mais grave ao menos grave. Todos dizem o que é, por que importa, **quando**
aparece e o impacto.

### Críticos

**F01 — Hospedar o servidor na nuvem (relógio em UTC) faz toda gravação da clínica ser recusada.**
*CONFIRMADO (rodei).*
- **O que é:** o computador da clínica manda a hora como texto local ("14:15:23") e o servidor
  confere se está dentro de 5 minutos da sua própria hora, lendo o texto no **fuso do servidor**.
  Servidor em UTC (o padrão de qualquer nuvem) enxerga 3 horas de diferença.
- **Como repeti:** subi o servidor com `TZ=UTC` e mandei, como um computador de Brasília, o
  comando "lançar cirurgia". Resposta: `409 {"motivo":"relogio"}`. Controle com os dois em
  Brasília: `200 ok`.
- **Quando aparece:** **no primeiro minuto** em que o servidor sair do computador da clínica.
  Além disso, das 21h à meia-noite (horário de Brasília) o "dia" do servidor (UTC) já virou e
  todo comando é recusado como "virou o dia" (`servidor.js` linha 305). É justamente o horário
  de cirurgias noturnas e boletins.
- **Impacto:** o sistema abre, mostra tudo, e **nada grava**. A tela diz "Relógio deste
  computador fora da hora", e a pessoa vai achar que o problema é o computador dela.
- **Correção (pequena, mas mexe no determinismo):** o servidor passar a usar sempre
  `America/Sao_Paulo`, e o cliente enviar o instante em UTC (ISO) em vez de texto local.
  Teste novo rodando o servidor em dois fusos.

**F02 — O repasse de meses passados muda sozinho quando um anestesista é desativado, e um repasse já pago some da tela.**
***CORRIGIDO em 02/10/2026 (commit `8fc5e70`)*** *— estava CONFIRMADO (rodei).* O grupo do mês passou a
ser guardado; 8 testes novos (7 falhavam antes); conferido no navegador. O texto abaixo descreve o defeito original.
- **O que é:** `calcularRepasse` divide pelo grupo de anestesistas **ativos hoje**
  (`core/09b_repasse.js` linha 83). Não guarda quem participava naquele mês.
- **Como repeti (script do scratchpad `auditoria_calculos.js`, caso E1):** mês com R$ 1.500
  recebidos, 15 ativos, cota de R$ 100,00. Registrei um repasse de R$ 100 ao anestesista A15.
  Desativei A15. Resultado: cota passou de **R$ 100,00 para R$ 107,15** (14 participantes), a
  linha de A15 **desapareceu** e o total repassado caiu de **R$ 100 para R$ 0**.
- **Quando aparece:** na primeira vez que alguém sair do grupo ou for desativado por engano.
- **Impacto:** dinheiro. Um repasse já pago deixa de aparecer; os outros 14 passam a "ter
  direito" a mais do que receberam; a conferência do mês fechado deixa de bater.
- **Decisão sua (tomada):** guardar o grupo de cada mês. Feito. O que **não** foi decidido (F03,
  travar edição de mês já mexido) continua em aberto.

**F03 — Não existe "fechar o mês": editar uma cirurgia antiga muda o repasse de um mês já pago.**
*CONFIRMADO (rodei, caso E5).* **Você escolheu não travar por enquanto** ("só guardar os participantes"). Fica como
**risco aceito e registrado**; só o LOG mostra a edição tardia.
- **O que é:** a base do repasse é recalculada a cada abertura da tela a partir das cirurgias.
  Trocar valor, data, status ou "pago" de uma cirurgia antiga muda o bruto do mês.
- **Como repeti:** cirurgia de R$ 1.500 paga em 10/10. Editei o valor para R$ 3.000. O bruto de
  outubro foi de 1.500 para 3.000, sem aviso. Só o LOG registra a edição.
- **Quando aparece:** no dia em que alguém corrigir um valor "só para conferir" depois do repasse.
- **Impacto:** diferença entre o que foi repassado e o que o sistema diz que deveria ter sido.
  Hoje isso aparece como "diferença a repassar", sem dizer que a causa foi uma edição tardia.
- **Correção:** trava de mês fechado (somente admin reabre, com motivo, no LOG).
  **Muda o comportamento** — precisa da sua aprovação.

**F04 — O que pode dar perda de dados: backups ficam no mesmo disco do servidor.**
*CONFIRMADO NO CÓDIGO (`armazem.js`: `copias/` e `anexos/` dentro da pasta de dados).*
- **O que é:** o próprio sistema grava cópias diárias, mas na mesma pasta e no mesmo disco. O
  README manda "copiar a pasta de tempos em tempos", sem automação nem lembrete no modo servidor.
- **Quando aparece:** o dia em que o disco do computador falhar, for roubado, ou o Windows
  corromper a pasta.
- **Impacto:** perda total de prontuários e financeiro **e** das cópias.
- **Com Supabase:** o banco tem backup diário no plano Pro (retenção curta; recuperação para
  qualquer ponto exige o complemento PITR), mas, pelo que sei da documentação (**confirmar**),
  **os arquivos do Storage não entram no backup do banco**. Os PDFs de exame precisam de cópia
  própria.

### Altos

**F05 — Quem assina o boletim anestésico é texto digitado; nada liga o login ao médico.**
*CONFIRMADO NO CÓDIGO (`core/12_store.js` linha 1031 a 1040, `finalizarBoletim`).*
- Qualquer usuário "equipe" pode finalizar um boletim digitando o nome e o CRM de **outro**
  médico, e pode reabri-lo (`reabrirBoletim` não é só do admin). O LOG registra o login de quem
  fez, mas a assinatura mostrada no PDF é a digitada.
- **Quando aparece:** primeira discussão sobre quem assinou um prontuário.
- **Impacto:** clínico e jurídico. O código SHA-256 prova que o conteúdo não mudou, não **quem**
  assinou. O próprio projeto já registra que não é assinatura ICP-Brasil.
- **Precisa de decisão:** ligar cada login a um anestesista do cadastro e só deixar assinar o
  próprio boletim? (Pergunta 5.)

**F06 — Sem HTTPS por padrão: senha e sessão trafegam em texto puro, e não há como gerar o certificado.**
*CONFIRMADO NO CÓDIGO (`servidor.js` linhas 51, 374, 604 a 609).*
- Sem os arquivos `.pem`, o servidor sobe em `http`. O cookie de sessão só ganha `Secure` com
  HTTPS. O README admite e manda usar "só na rede interna".
- **Quando aparece:** no Wi-Fi de uma clínica com visitantes, ou no segundo em que alguém
  expuser a porta à internet. **Na nuvem isso precisa ser resolvido antes de qualquer teste.**

**F07 — Exportar e restaurar backup "com PDFs" não funciona quando os exames crescem.**
*CONFIRMADO NO CÓDIGO (`servidor.js` linhas 59, 502 a 509 e 515).*
- O backup com PDFs monta **tudo em memória, em base64, num único texto**. A restauração recusa
  qualquer arquivo acima de **200 MB** (`LIMITE_BACKUP`, erro 413). O texto também esbarra no
  limite de tamanho de texto do Node (~512 MB).
- **Quando aparece:** quando os PDFs de exame passarem de algumas centenas. Aí o administrador
  baixa um backup que **depois não consegue restaurar**, sem saber.
- **Impacto:** falsa sensação de segurança. É o tipo de falha que só se descobre no pior dia.
- **Correção:** PDFs sempre copiados como arquivos (e no Supabase Storage), nunca embutidos.

**F08 — Qualquer usuário da equipe lê o financeiro inteiro e edita valor e "pago" de qualquer cirurgia.**
*CONFIRMADO NO CÓDIGO (`servidor.js` linha 422 devolve o estado completo a qualquer sessão;
`atualizarCirurgia` não está em `MUTACOES_SO_ADMIN`).*
- A tela esconde partes, mas **os dados chegam ao navegador**: chave PIX de todos, repasses,
  valores. Dá para ver pelo "inspecionar" do navegador.
- **Impacto:** depende de quem é a "equipe". Se for só anestesistas do grupo (que dividem o
  resultado igualmente), o risco é pequeno. Se incluir secretaria terceirizada, é relevante.
- **Com RLS:** é exatamente o tipo de regra que RLS resolve bem **se** as tabelas forem separadas
  (opção B). Na opção A, a regra precisa ser feita no servidor (cortar o que o papel não vê).

**F09 — LGPD: dados de saúde (sensíveis) sem a documentação mínima, e o LOG nunca esquece.**
*CONFIRMADO NO CÓDIGO (LOG guarda resumo de registros excluídos com o nome do paciente);
o resto é HIPÓTESE jurídica — não sou advogado.*
- O LOG é "só acrescenta" e guarda o nome do paciente de cirurgias excluídas
  (`core/11_log.js`), e as cópias repetem o dado. Não há rotina de exclusão ou anonimização a
  pedido do titular.
- Faltam (fora do código): base legal registrada, encarregado (DPO), relatório de impacto,
  política de privacidade, e **revisão jurídica do texto do termo** (já anotada no contexto do projeto).
- **Conflito a resolver com advogado:** prontuário tem prazo de guarda longo (a Lei 13.787/2018
  fala em 20 anos), enquanto o sistema apaga cópias com 24 meses e PDFs removidos com 400 dias.
  Você me disse "pelo menos 1 ano"; para prontuário o mínimo legal pode ser muito maior.
  **HIPÓTESE:** confirmar prazo e regra com assessoria jurídica da clínica.
- Supabase: escolher região **São Paulo** (evita transferência internacional) e assinar o
  contrato de tratamento de dados com o fornecedor.

### Médios

**F10 — O estado inteiro é baixado por cada tela e regravado a cada alteração (não escala indefinidamente).**
*CONFIRMADO (rodei) a medição; a extrapolação é HIPÓTESE.*
- Medi com os dados de demonstração: **uma ficha de qualidade = ~14 KB; uma cirurgia = ~0,7 KB;
  um boletim da demo = ~3,5 KB** (boletim real, com sinais vitais a cada 5 minutos, é maior).
- Custo de **uma** edição (as regras recalculam tudo): 10 ms com 100 cirurgias, 43 ms com 1.000,
  108 ms com 3.000, 160 ms com 6.000 (sem contar boletins). Aceitável.
- O que pesa é o tamanho: `/api/estado` manda **tudo** para cada computador a cada recarga, e
  o servidor regrava o arquivo inteiro a cada alteração. Com ~1.500 atendimentos completos
  (boletim + ficha) o arquivo passa de dezenas de MB.
- **Quando aparece:** entre 1 e 3 anos de uso, conforme o volume (você ainda não me disse o
  volume — pergunta 4). Não impede o lançamento; impede o "para sempre".

**F11 — Valores em dinheiro: sem teto, sem limite de duas casas, guardados como decimal de computador.**
*CONFIRMADO (rodei, caso E3 e E2).*
- A cirurgia aceitou **R$ 1.000.000.000.000.000**, **1,005** (três casas), **"12,345"** e
  **"1e3"** (vira 1000). O teto de sanidade existe só no repasse (R$ 10 milhões).
- `"1.234"` vira **R$ 1.234** (milhar). É a regra de propósito para "1.500", mas quem digita
  "1.234" querendo 1,234 não recebe aviso.
- A soma de decimais acumula ruído (4,3900000000000015) e é escondida no fim por arredondamento.
  O repasse já trabalha em centavos inteiros (bom); o financeiro soma decimais e arredonda no
  final. Em 1.005 as duas telas podem divergir em 1 centavo (**HIPÓTESE**: não testei a divergência).
- **Correção:** guardar centavos inteiros ou `numeric(12,2)`; recusar mais de 2 casas e valores
  acima de um teto. **Muda o que é aceito** — aprovação.

**F12 — Despesas maiores que a entrada: o prejuízo some.**
*CONFIRMADO (rodei, caso E4).* Entrada R$ 1.000, despesas R$ 1.800: líquido vira R$ 0 e a cota
R$ 0. Os R$ 800 de déficit não passam para o mês seguinte nem aparecem como alerta.
**Decisão sua:** o déficit acumula, é só avisado, ou é ignorado de propósito?

**F13 — O aviso de conflito de horário não enxerga a virada do dia.**
*CONFIRMADO (rodei).* Cirurgia A de 10/10 22:00 a 02:00 e cirurgia B de 11/10 01:00 a 03:00 do
**mesmo** anestesista se sobrepõem de 01:00 a 02:00. Nenhum aviso (`detectarConflitos` agrupa
por data). Cirurgias na mesma data sobrepostas só **avisam**; gravam mesmo assim.
**Impacto:** a plástica faz cirurgias longas e noturnas. Dois lugares ao mesmo tempo não são
detectados.

**F14 — Duas cópias do servidor na mesma pasta de dados corrompem os dados.**
*CONFIRMADO NO CÓDIGO (não há arquivo de trava; só a porta protege).* Iniciar de novo com
`--porta` diferente grava por cima do mesmo `estado.json`. Na nuvem, qualquer "deploy sem
parada" liga duas cópias por alguns segundos.
**Correção:** trava de arquivo no servidor atual; no Supabase, trava otimista pela `revisao`.

**F15 — PDFs de exame: qualquer usuário baixa e apaga qualquer arquivo, e apagar não vai para o LOG.**
*CONFIRMADO NO CÓDIGO (`servidor.js` linhas 450 a 466).* O arquivo apagado vai para
`removidos/` (guardado 400 dias, depois some de vez), mas **sem registro de quem apagou e quando**.
Também não há limite de quantidade por usuário.

**F16 — Sem monitoramento, sem alerta, sem integração contínua, sem lint, sem tipos, sem ambientes.**
*CONFIRMADO (varredura do repositório).* Não há `.github/`, `package.json`, ESLint, TypeScript,
ambiente de teste separado, nem aviso se o servidor cair de madrugada. O servidor depende de
uma **janela do Windows aberta**: reiniciar o computador desliga o sistema da clínica.
Os 667 testes são bons, mas **só rodam se alguém lembrar de rodar**. O teste 19 do servidor, segundo
o próprio `docs/QA.md`, às vezes falha com "fetch failed" (**HIPÓTESE** sobre a causa: não falhou
em nenhuma das minhas 3 rodadas).

**F17 — Atrás de proxy ou nuvem, a trava de senha por IP pode bloquear todo mundo.**
***HIPÓTESE*** *(depende da hospedagem).* A trava usa `req.socket.remoteAddress`. Atrás de um
balanceador todos têm o mesmo IP, e 5 senhas erradas de qualquer pessoa travariam o login de
todos por 15 minutos. Para provar: subir atrás de um proxy e errar a senha 5 vezes.

### Baixos

**F18** — O vínculo cirurgia→anestesista é **pelo nome**, não por um identificador. Hoje a
troca de nome é propagada em cascata (testada) e o boletim assinado guarda uma cópia do nome (de
propósito). Em banco relacional isso vira chave estrangeira por ID: é trabalho de migração, não
defeito. *CONFIRMADO NO CÓDIGO.*

**F19** — O repositório do GitHub é **público** e contém os nomes dos 15 anestesistas e a escala-base
(`data/seed.json`). Sem telefone, e-mail, PIX, paciente ou segredo. Varredura por chaves, tokens e
senhas: nada. *CONFIRMADO (rodei).* Decidir se os nomes podem ficar públicos.

**F20** — O Apps Script (planilha) **nunca foi executado de verdade**, só contra uma planilha
simulada. Se continuar existindo, será um segundo caminho de escrita com regras que não conhece
boletins nem repasse. *CONFIRMADO (documentado pelo projeto).* Decidir se aposenta.

**F21** — "Motivo" para reabrir um boletim precisa de 10 letras, o que "aaaaaaaaaa" satisfaz.
*CONFIRMADO NO CÓDIGO.*

### Descartado (investiguei e **não** é problema)

- **Clique duplo em "Salvar" gerando cirurgia duplicada:** o salvar é síncrono e fecha a janela
  no mesmo clique (`cirurgias.js` 540 a 553). O segundo clique cai fora.
- **Uma pessoa gravando por cima da outra:** o servidor numera as alterações; criar, remover ou
  assinar com base velha é recusado (409), e editar campo é aceito com recarga. Projeto sólido.
- **Falha de energia no meio da gravação:** cada comando vai ao diário com `fsync` antes de
  responder, e o estado é gravado por arquivo novo + troca de nome. Bem feito.

### O que está bom (para não se perder)

- **XSS:** nenhum uso de `innerHTML` com dado do usuário (só ícones fixos), CSP restritiva
  (sem script inline, sem origem externa).
- **Entrada de fora** (backup, seed, estado do servidor) é reconstruída campo a campo pelo
  schema; chaves como `__proto__` são descartadas.
- **Senhas:** scrypt com sal por usuário, comparação em tempo constante, sessão por hash do
  token, cookie HttpOnly + SameSite=Strict, trava após 5 erros, cabeçalho anti-CSRF.
- **Dinheiro do repasse em centavos inteiros**, divisão fechando no centavo (15 pessoas × R$
  1.000: R$ 66,67 e R$ 66,66, soma exata).
- **Horas em minutos inteiros**, cirurgia que atravessa a meia-noite tratada, ID nunca reaproveitado.
- **Suíte própria de 667 testes**, sem dependência externa, verde também com o relógio em UTC.
- **Zero dependências** = zero vulnerabilidade de pacote.

---

## Fase 2 — Pré-mortem: "o lançamento deu errado"

| Quando | Cenário | Probabilidade | Impacto | Como evitar | Ligado a |
|---|---|---|---|---|---|
| 1 semana | O servidor vai para a nuvem e **ninguém consegue gravar** (relógio em UTC) | **Quase certa** se for à nuvem sem a correção | Alto: sistema "abre mas não grava" | F01 antes do primeiro teste na nuvem | F01 |
| 1 semana | Cirurgias noturnas recusadas entre 21h e 00h ("virou o dia") | Alta (mesma causa) | Alto | Mesma correção | F01 |
| 1 semana | Alguém digita senha na rede da clínica sem HTTPS e um visitante captura | Baixa-média | Alto: acesso a prontuários | HTTPS obrigatório; sem HTTP | F06 |
| 1 semana | Um anestesista sai do grupo, é desativado, e o repasse do mês passado muda | Média | Alto: dinheiro | Trava de mês + lista de participantes por mês | F02, F03 |
| 3 meses | Disco do computador da clínica falha, e as cópias estavam nele | Baixa-média | **Catastrófico** | Cópia automática fora do computador; no Supabase, PDFs com cópia própria | F04 |
| 3 meses | A secretaria "só corrige um valor" depois do repasse | Alta | Médio-alto | Fechamento de mês | F03 |
| 3 meses | Discussão sobre quem assinou um boletim | Média | Alto: jurídico | Ligar login ao médico; avaliar ICP-Brasil | F05 |
| 3 meses | Servidor cai de madrugada ou o computador reinicia; ninguém sabe até a manhã | **Alta** | Médio | Rodar como serviço, monitor externo, alerta | F16 |
| 1 ano | Backup "com PDFs" não restaura (passou de 200 MB) no dia em que mais se precisa | Média-alta | **Catastrófico** | Testar restauração a cada trimestre; PDFs por arquivo | F07 |
| 1 ano | Lentidão: cada tela baixa dezenas de MB, e o servidor regrava tudo a cada gravação | Média (depende do volume) | Médio | Medir; dividir o estado; opção B | F10 |
| 1 ano | Titular pede exclusão de dados; o LOG e as cópias mantêm o nome | Média | Médio-alto: LGPD | Política de retenção definida com advogado | F09 |
| 1 ano | Custo do Supabase sobe por Storage de PDFs e tráfego | Média | Baixo-médio | Estimar com o volume real (pergunta 4); alertas de uso | — |
| Sempre | Vazamento por chave `service_role` no frontend | Baixa (hoje nem existe) | Catastrófico | Chave só no servidor; RLS "negar tudo" nas tabelas | — |

---

## Fase 3 — Plano priorizado

**Regra do roteiro:** tudo "Crítico" e "Alto" é resolvido **antes do lançamento**.

| # | Problema | Gravidade | Esforço | Status | Prazo | Precisa de decisão sua? |
|---|---|---|---|---|---|---|
| F01 | Fuso/UTC recusa todas as gravações na nuvem | **Crítico** (se for à nuvem) | Pequeno | CONFIRMADO (rodei) | Antes do lançamento | Não |
| F02 | Repasse passado muda ao desativar anestesista; repasse pago some | ~~Crítico~~ | Médio | **CORRIGIDO** (`8fc5e70`) | Feito | Decidido |
| F03 | Sem fechamento de mês (edição tardia muda o repasse) | Alto (era Crítico) | Médio | CONFIRMADO (rodei) | **Risco aceito por você**; reabrir quando quiser | Decidido: não travar por enquanto |
| F04 | Cópias no mesmo disco / PDFs fora do backup do banco | **Crítico** | Médio | CONFIRMADO NO CÓDIGO | Antes do lançamento | Parcial (onde guardar) |
| F05 | Assinatura do boletim não ligada ao login | Alto | Médio | CONFIRMADO NO CÓDIGO | Antes do lançamento | **Sim** |
| F06 | Sem HTTPS por padrão | Alto | Pequeno | CONFIRMADO NO CÓDIGO | Antes do lançamento | Não |
| F07 | Backup com PDFs não restaura acima de 200 MB | Alto | Médio | CONFIRMADO NO CÓDIGO | Antes do lançamento | Não |
| F08 | Equipe lê todo o financeiro e edita valor/pago | Alto | Médio | CONFIRMADO NO CÓDIGO | Antes do lançamento | **Sim** (quem vê o quê) |
| F09 | LGPD: retenção, exclusão, documentos, termo | Alto | Médio (fora do código) | CONFIRMADO NO CÓDIGO + HIPÓTESE jurídica | Antes do lançamento | **Sim** (advogado) |
| F11 | Dinheiro: teto, 2 casas, centavos inteiros | Médio | Médio | CONFIRMADO (rodei) | 30 dias (antes, se o valor real for alto) | Sim (o que recusar) |
| F12 | Déficit de despesas some | Médio | Pequeno | CONFIRMADO (rodei) | 30 dias | **Sim** |
| F13 | Conflito de horário na virada do dia | Médio | Pequeno | CONFIRMADO (rodei) | 30 dias | Não |
| F14 | Trava de instância única | Médio | Pequeno | CONFIRMADO NO CÓDIGO | Antes do lançamento (se for à nuvem) | Não |
| F15 | PDFs: apagar sem registro, sem limite | Médio | Pequeno | CONFIRMADO NO CÓDIGO | 30 dias | Não |
| F16 | Monitoramento, CI, serviço do Windows | Médio-alto | Médio | CONFIRMADO | Antes do lançamento (mínimo: alerta + CI) | Não |
| F10 | Estado inteiro por tela, escala no tempo | Médio | Grande | CONFIRMADO (medi) / HIPÓTESE (extrapolação) | Depois (medir aos 6 meses) | Depende do volume |
| F17 | Trava por IP atrás de proxy | Médio | Pequeno | HIPÓTESE | Antes do lançamento (se houver proxy) | Não |
| F18 | Vínculo por nome | Baixo | Grande | CONFIRMADO NO CÓDIGO | Só se for à opção B | Não |
| F19 | Repositório público com nomes | Baixo | Mínimo | CONFIRMADO | 30 dias | **Sim** |
| F20 | Apps Script nunca executado | Baixo | Pequeno (aposentar) | CONFIRMADO | Depois | **Sim** |
| F21 | Motivo de reabertura burlável | Baixo | Mínimo | CONFIRMADO NO CÓDIGO | Depois | Não |

**Fora do código, só você consegue** (entram no checklist de go-live da fase 5): conta e projeto
Supabase de produção (região São Paulo, plano Pro), domínio, certificado, quem recebe os alertas,
contrato de tratamento de dados, aprovação clínica das definições do módulo de qualidade (já
listadas em `docs/QUALIDADE.md`).

---

## Decisões registradas e o que muda por "vender para várias clínicas"

Suas respostas de 02/10/2026:

| Pergunta | Resposta | Consequência |
|---|---|---|
| Caminho técnico | "Vamos vender para mais clínicas, o que seria melhor?" | **Pergunta de volta para mim: resposta abaixo.** Nada de migração é feito antes da sua aprovação. |
| Escala | Várias clínicas no futuro | Puxa para o modelo multi-clínica (opção B). |
| Dado real na nuvem | Sim, mas **ainda não definido** | **Dado real de paciente fica bloqueado** até o jurídico fechar (F09). Tudo o que for técnico eu preparo com dado fictício. |
| Fechar mês (F02/F03) | Só guardar os participantes | F02 feito. F03 fica como risco aceito. |

### Resposta à pergunta "para várias clínicas, o que é melhor?"

**Minha recomendação: opção B (banco relacional com várias clínicas), feita em etapas, e pular a A.**

Por quê:
- A opção A guarda **um documento JSON por clínica** e um processo Node com todos em memória. Para
  uma clínica funciona. Para várias, a separação entre clínicas depende só do código do servidor (um
  descuido mostra o prontuário de uma clínica para outra), o RLS do Supabase vira enfeite, o consumo
  de memória soma o estado de todas, e cada gravação regrava o documento inteiro da clínica.
- Fazer A agora e B depois seria **duas migrações**. Com B desde já, só há uma: o JSON de hoje é uma
  boa origem de importação (já existe saneador campo a campo, `DADOS.sanearEstado`).
- Dado de saúde de várias clínicas é onde "isolamento garantido pelo banco" (RLS + chaves
  estrangeiras + restrições) vale mais que "isolamento garantido por disciplina".

O que **se aproveita** do que existe: as funções puras do `core/` (validações, rodízio, horas, repasse,
indicadores) e os testes que as cobrem. O que **se reescreve**: `core/12_store.js` (2.076 linhas, a parte
com estado) e a camada do servidor. O desenho que eu proporia, sem implementar nada ainda:

- **Quem é quem:** `clinicas`; `membros(usuario, clinica, papel, anestesista_id)`. Todo dado tem
  `clinica_id`. Login pelo Supabase Auth; RLS por clínica **e** por papel; cada login ligado a um
  anestesista (resolve F05).
- **Dinheiro** em `numeric(12,2)` com restrições (resolve F11); vínculo por **ID**, não por nome (F18).
- **Gravações** por funções no banco ou servidor, sempre em transação, com trava de linha (resolve
  F14 e a concorrência sem o "replay de comandos"). LOG em tabela só de inserção.
- **PDFs** no Storage com pasta por clínica e RLS no bucket, com cópia própria (F04, F07).
- **Mês fechado** e **grupo por mês** viram colunas/tabelas (F02, F03, se você quiser).

Etapas e prazo (**estimativa minha, HIPÓTESE, pode errar por 2×**; uma pessoa em tempo integral):

| Etapa | O que entrega | Estimativa |
|---|---|---|
| 0 | Prova de que o `core` roda numa Edge Function (ou no servidor), e modelo de dados desenhado e revisto | 1 a 2 semanas |
| 1 | Várias clínicas + login + RLS + **testes automáticos de isolamento** (clínica A nunca lê a B) | 2 a 3 semanas |
| 2 | Cadastro, escala, cirurgias, avaliações | 3 a 4 semanas |
| 3 | Financeiro e repasse | 2 semanas |
| 4 | Boletim, qualidade, PDFs | 3 a 4 semanas |
| 5 | Migração dos dados, teste de carga, backup e restauração ensaiados, go-live | 2 semanas |

Total em torno de **3 a 4 meses**. Para o **lançamento antes disso** sem dado real, a clínica atual
continua no servidor Node endurecido (F01, F04, F06, F14, F16), em ambiente de teste, até as etapas 1 a 3
ficarem prontas. **Só vendo para a segunda clínica depois da etapa 1 estar provada.**

Riscos desta rota que você deve conhecer: é o caminho mais longo; reescrever regras de negócio em outro
lugar pode introduzir diferenças (por isso a etapa 0 e a regra de manter as funções puras do `core`);
e **uma revisão de segurança por engenheiro humano antes da segunda clínica é obrigatória** (Fase 5, item 5).

**O que preciso para começar a etapa 0:** sua aprovação desta rota (ou outra), o orçamento mensal
aproximado (Supabase Pro + hospedagem) e o volume esperado por clínica.

## Perguntas

### Bloqueantes (sem elas eu não começo a fase 4)

1. ~~Caminho técnico~~ — **Respondida:** várias clínicas. Recomendação: B em etapas (seção acima). **Falta sua aprovação.**
2. ~~Quem usa e quanto~~ — **Respondida:** várias clínicas no futuro.
3. ~~Dado real na nuvem~~ — **Respondida:** sim, ainda não definido. Fica **bloqueado** até o jurídico (F09).
4. **Volume:** quantas cirurgias por mês? Quantos boletins? Quantos PDFs de exame por mês (e o
   tamanho típico)? Decide custo, lentidão (F10) e o plano do Supabase.
5. **Regras de negócio que eu não vou decidir sozinho:**
   - (a) ~~Fechar o mês e travar o repasse?~~ **Respondida:** só guardar o grupo (feito, F02). F03 é risco aceito.
   - (b) O déficit de despesas acumula? (F12)
   - (c) Cada login passa a ser um anestesista e só assina o **próprio** boletim? (F05)
   - (d) A "equipe" enxerga financeiro e PIX dos colegas, e pode editar valor/pago? (F08)
   - (e) O que recusar em valor: teto e duas casas decimais? (F11)

### Não bloqueantes

6. Orçamento mensal e prazo desejado de lançamento.
7. **O que não pode falhar jamais**, na sua opinião. Minha leitura: (1) boletim assinado e dado
   clínico, (2) dinheiro e repasse, (3) nunca perder dado. Está certo?
8. Já existe **dado real em uso**? O contexto do projeto diz que o servidor nunca rodou na rede
   real da clínica. Se não há dado real, a migração de dados é trivial.
9. Aposentar o modo "um computador só" (IndexedDB, sem login) e o Apps Script em produção? Cada
   caminho de escrita a mais é uma superfície a mais.
10. Quem recebe os alertas (e-mail, WhatsApp) e quem faz o papel de administrador técnico?
11. Domínio próprio? O repositório público pode manter os nomes dos 15 anestesistas?

---

## O que eu **não** consegui verificar (limites desta rodada)

- **As 36 fórmulas do módulo de qualidade** (`core/09c`) e a lógica interna de cada ficha: confiei
  nos testes existentes e não as reconferi com exemplos independentes. Os limiares clínicos ainda
  precisam de aprovação do responsável técnico (já registrado no projeto).
- **Servidor na rede real** (vários computadores, firewall, Wi-Fi), **carga com muitos usuários
  simultâneos** e **HTTPS de verdade**: não testados.
- **Qualquer comportamento do Supabase** (limites do plano, backup, Storage, região): não há
  projeto Supabase aqui; o que digo vem do que conheço da documentação e **deve ser conferido**
  na conta antes de decidir.
- **Aspectos jurídicos** (LGPD, prontuário, ICP-Brasil): são hipóteses para um advogado confirmar.

## Como repetir o que eu rodei

Scripts em um diretório temporário da sessão (não entram no projeto). Se quiser, eu os transformo
em testes permanentes em `qa/` **na fase 4**, já com a correção correspondente (um teste que
falha antes e passa depois). A lista: repasse com anestesista desativado (F02), edição tardia
(F03), valores extremos (F11), déficit (F12), conflito na virada do dia (F13), servidor com
`TZ=UTC` contra cliente em Brasília (F01).
