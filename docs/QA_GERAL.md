# QA geral e revisão de arquitetura — 05/10/2026

Escrito para quem decide, em português simples. Cada afirmação diz de onde vem:
**CONFIRMADO (rodei)** = executei e vi o resultado · **CONFIRMADO NO CÓDIGO** = li o código ·
**HIPÓTESE** = suspeita sem prova.

Seus dois pedidos desta rodada:

1. *"Ter certeza de que não tem erro de matemática, código ou lógica."*
2. *"As informações devem ficar no sistema por pelo menos um ano."*

---

## Resposta curta

**Matemática.** Refiz as contas principais por um caminho que não usa o código do sistema (centavos
inteiros, o calendário do próprio JavaScript, as fórmulas escritas nos comentários) e comparei com o
que o sistema calcula, em estados aleatórios com cirurgias, avaliações, despesas e repasses. **Tudo
bateu, ao centavo.** Isso virou teste permanente (`qa/32`), então qualquer mudança futura que estrague
uma conta é pega na hora. **CONFIRMADO (rodei).**

**Código e lógica.** Um programa sorteou mais de 31 mil chamadas às operações do sistema (com dado
normal e dado absurdo) e conferiu o que nunca pode acontecer. Achou **8 problemas reais**; os 8 estão
corrigidos, cada um com teste que falha sem a correção e passa com ela. As duas decisões que ficaram
com você (Q5 e Q11) foram tomadas em 07/10/2026 e estão feitas. **CONFIRMADO (rodei).**

**Atualização de 07/10/2026.** Você informou até **2.500 cirurgias por mês**: isso **não cabe** no desenho de hoje
(`docs/ESCALA_E_BANCO.md`). Também foram feitos, com teste: login ligado a quem assina o boletim (F05), teto de
R$ 100 milhões por mês e 2 casas decimais (F11), conflito de horário na virada do dia (F13), uma só cópia do servidor por
pasta (F14), cookie `Secure` e IP real atrás de proxy (F06, F17), limite de exames por avaliação (F15), argumentos de
comando seguros (Q10), recuperação de senha do chefe, compressão das respostas, RUNBOOK e modelos de implantação.

**Um ano.** Nenhum dado de operação (cirurgias, avaliações, boletins, fichas, repasses) é apagado
sozinho. O que o sistema esconde ou apaga com o tempo é só o LOG na tela e as cópias de segurança
antigas, e agora ambos respeitam o mínimo de um ano (tabela na seção 4). **CONFIRMADO NO CÓDIGO e
(rodei) nos testes.**

**O que ainda impede dado real de paciente:** não é erro de conta. É (1) a persistência no Supabase,
que **ainda não foi construída** (hoje o sistema grava no disco do computador servidor); (2) a
parte jurídica (LGPD); (3) HTTPS, servidor que reabre sozinho, alerta e backup fora da máquina.
Tudo isso está em `docs/COLOCAR_NO_AR.md`.

---

## 1. O que foi conferido e como

| Área | Como foi conferido | Resultado |
|---|---|---|
| Calendário | Dia da semana, soma de dias e validade de data comparados com o `Date` do JavaScript, todos os dias de 2024 a 2044; ano bissexto (2028 e 2000 sim; 2100, 2026 e 1900 não) | Bate. |
| Dinheiro (formato) | `R$ 1.234,56` do sistema contra o `Intl` do pt-BR em 5.000 valores, e o texto volta ao mesmo número; os jeitos de digitar ("1.234,56", "1234,56", "1.500", "R$ 1.500,00") | Bate. |
| Financeiro do mês | Total, recebido, pendente (anestesias e avaliações), quantidades e faturado, refeitos em centavos a partir do estado cru, 4 estados aleatórios × 3 meses | Bate ao centavo. |
| Repasse | Bruto, líquido, cota de cada um, diferença, total repassado, nas duas bases (caixa e competência); a **soma das cotas fecha com o líquido** e ninguém recebe mais de 1 centavo a mais que outro | Bate ao centavo. |
| Rodízio | Quem está em cada posição de cada dia contra a fórmula do `core/04_rodizio.js`; com substituições (só a posição trocada muda); escala-base automática com 5 a 15 pessoas ativas | Bate. |
| Operações (código e lógica) | 31 mil chamadas sorteadas, com valores normais e absurdos (texto no lugar de número, `null`, `__proto__`, datas impossíveis, textos de 3.000 letras…). Conferido em cada chamada: nenhuma exceção escapa; nenhum "Erro interno"; **recusa não muda nada**; leitura não muda nada; o estado continua sendo JSON; refazer as operações aceitas numa réplica dá **exatamente o mesmo estado** (é o que faz o servidor e as telas concordarem) | 8 problemas achados e corrigidos (seção 2). |
| Backup e restauração | Um sistema cheio é exportado, importado e comparado; 360 backups estragados de todo jeito (campos trocados, listas viradas em texto, `__proto__`, repetidos, lixo) e 22 textos que nem são JSON | O sistema restaurado dá os mesmos resultados; nenhum backup estragado derruba o sistema (achado Q1 corrigido). |
| Nomes e variáveis | Programa que lê todo o código e acusa qualquer nome usado sem existir (o erro "X is not defined" que só aparece quando alguém clica) | Zero (e virou o teste `qa/30`). |
| Telas | As 17 telas abertas no navegador (modo demonstração) | Todas abrem, nenhum erro de JavaScript. Não fiz bateria de acessibilidade nem de celular nesta rodada. |
| Suíte | `node qa`, também em fusos diferentes, em clone limpo e com fim de linha do Windows | **829 testes, 829 aprovados** (07/10/2026; eram 800 em 05/10). |

**O que NÃO foi conferido de forma independente (honestidade):**

- **Indicadores do módulo de qualidade** (taxas de eventos, medianas, metas). Estão cobertos pelos
  testes que já existiam (`qa/20`, `qa/21`, `qa/23`) e pelo sorteio (que prova que não quebram), mas
  eu não refiz as fórmulas por outro caminho. A conferência que falta é **clínica**: quem usa deve
  ler `docs/QUALIDADE_INDICADORES.md` e dizer se cada definição está certa.
- **Carga com muita gente ao mesmo tempo** e **navegadores diferentes** (só o do preview).
- **Apps Script (Google Planilhas)**: nunca foi executado de verdade (F20 da auditoria).
- Nenhum teste substitui uma **revisão de segurança por uma pessoa** antes de abrir com dado real.

---

## 2. Achados e o que foi feito

| # | O que era | Quando apareceria / impacto | Situação |
|---|---|---|---|
| Q1 | Dado com nome de propriedade do JavaScript (`constructor`, `__proto__`, `toString`…) como data, dia, nome ou ID, vindo de um backup estragado ou adulterado, **derrubava o recálculo**: toda gravação passava a falhar, e até dava para sujar o `Object` do programa. | Só com arquivo adulterado/estragado (o sistema nunca gera isso sozinho), mas o efeito era "sistema preso". **CONFIRMADO (rodei).** | **Corrigido** (mapas sem prototype). Teste `qa/31`. |
| Q2 | **Disco cheio ou sem permissão.** (a) O comando já tinha mudado a memória, mas não ia para o diário: o usuário via erro, tentava de novo (duplicava) e, se o servidor caísse, o comando sumia; (b) importar ou restaurar um backup sem conseguir gravar "valia" na memória e o estado velho voltava na próxima partida, sem ninguém saber; (c) a gravação agendada podia derrubar o servidor; (d) uma linha do diário gravada pela metade grudava na seguinte e as duas se perdiam. | Em PC com pouco espaço ou VPS pequena. Impacto: dado perdido ou duplicado. **CONFIRMADO (rodei)**, com disco "recusando" de mentira. | **Corrigido.** O comando é desfeito e devolve erro claro (503); a troca do estado inteiro é desfeita; a falha de gravação não derruba o servidor (tenta de novo em 10 s); o diário volta ao tamanho de antes. Teste `qa/34`. |
| Q3 | **Relógio errado apagando cópias.** A limpeza de cópias e de arquivos do LOG usa a data do computador. Com a data muito à frente, apagaria quase tudo de uma vez. | Pilha de CMOS, VM restaurada, ajuste de data errado. **CONFIRMADO NO CÓDIGO**; o freio foi testado. | **Corrigido.** Freio: querer apagar quase tudo de uma vez (cópias) ou mais de 4 arquivos de LOG de uma vez não apaga nada e deixa aviso. Teste `qa/34`. |
| Q4 | O LOG na tela guardava 6 meses por padrão e aceitava de 1 a 36. | Contra o seu pedido ("pelo menos um ano"). | **Corrigido.** Padrão 12, **mínimo 12**, máximo 60. O que sai da tela só sai depois de virar arquivo conferido (SHA-256), guardado 5 anos (0 = nunca apagar). Testes `qa/28` e `qa/29`. |
| Q5 | **Mudar a escala-base com substituição já registrada** podia deixar a mesma pessoa em duas posições no mesmo dia (acontece também ao ativar/desativar alguém com a escala-base automática ligada). A tela aceitava sem avisar; só a tela Integridade acusava depois. | Qualquer mudança de base no meio do mês. Efeito: a busca de posição do rodízio fica ambígua naquele dia. **CONFIRMADO (rodei).** | **Decidido por você em 07/10/2026: recusar.** Agora a mudança que deixaria a mesma pessoa em duas posições no mesmo dia é recusada, diz quais dias e nada muda (o que já estava duplicado antes não trava nada). Teste `qa/31`. |
| Q6 | Trocar um posto da escala-base **não deixava linha no LOG** (só ligar/desligar o modo automático deixava). | Falha na trilha por usuário. **CONFIRMADO (rodei).** | **Corrigido** (`ESCALA-BASE`, com quem trocou e de→para). |
| Q7 | `horas()` com argumento que não é lista lançava exceção; `aplicarRemanejamento([null])` dava "Erro interno". | Só com chamada fora do contrato; a transação desfazia tudo. | **Corrigido** (recusa com mensagem). |
| Q8 | Sem rota para um monitor externo saber se o sistema está de pé e gravando. | Cair sem ninguém ver. | **Corrigido:** `GET /api/saude` (sem login, sem dado nenhum; 503 se o disco recusa gravar). |
| Q9 | Restaurar um backup transforma `null` em `""` em campos de texto livre. | As contas ficam iguais (conferido). Só a representação difere. | **Aceito (baixo).** |
| Q10 | O cadastro aceita, **só por chamada direta à rede**, nomes absurdos (objeto vira `[object Object]`, `__proto__` como nome). A tela só manda texto. | Exige alguém já logado como chefe/secretária. | **Corrigido em 07/10/2026.** Objeto ou lista no lugar de texto vira vazio (e a validação cobra o obrigatório); o servidor recusa argumentos com `__proto__`, `constructor`, `prototype`, fundos demais ou grandes demais. Testes `qa/36` e `qa/37`. |
| Q11 | Editar o **rascunho** do boletim não escreve no LOG a cada edição (criar, assinar, reabrir e descartar escrevem). | Possivelmente por desenho: o documento assinado é protegido por código de conferência. | **Decidido por você em 07/10/2026: não registrar rascunho.** Nada a fazer. |
| Q12 | Cada gravação fica mais lenta com o volume (tabela abaixo). | Sem problema até uns 3.000 cirurgias no sistema; quanto tempo isso dura depende do volume (100 por mês ≈ 2,7 anos; 400 por mês ≈ 8 meses). | **Você informou até 2.500 cirurgias por mês: isso não cabe no desenho de hoje.** Ver `docs/ESCALA_E_BANCO.md` (medições, como resolver, alternativas ao Supabase). Ganho imediato já feito: respostas comprimidas (gzip). |

**Desempenho medido (CONFIRMADO, rodei, 15 gravações, com 1 avaliação por cirurgia):**

| Cirurgias no sistema | 50 | 200 | 800 | 1.600 | 3.200 |
|---|---|---|---|---|---|
| Uma gravação demora | 17 ms | 22 ms | 58 ms | 89 ms | 191 ms |
| Tamanho do estado | 261 KB | 393 KB | 923 KB | 1,6 MB | 3 MB |

"Gravação" é cada vez que alguém salva algo (cirurgia nova, avaliação, boletim…): o sistema recalcula
escala, posições, avaliações e financeiro de tudo, e esse recálculo cresce com o volume. Até uns
3.000 cirurgias leva cerca de 0,2 s, que a pessoa não sente; depois disso fica mais lento. Quanto tempo
isso dura depende do volume, que eu não sei: 100 por mês ≈ 2,7 anos; 400 por mês ≈ 8 meses. Esta medida
**não inclui boletins nem fichas de qualidade**: com ~1.500 atendimentos completos (boletim + ficha) o
estado chega a dezenas de MB, e cada tela baixa tudo (F10). Se o volume for alto, vale otimizar antes
(o mais pesado é recalcular tudo a cada gravação). Pergunta pendente: quantas cirurgias por mês?

---

## 3. Revisão da arquitetura

| Camada | Como está | Avaliação |
|---|---|---|
| **Regras (`core/`)** | Código puro, igual no navegador, no Node e no Google Apps Script; nenhuma biblioteca externa; 24 arquivos | **Bom.** É o maior ativo: por ser puro, dá para testar tudo e refazer as contas por fora. |
| **Gravar (`transacao`)** | Um único caminho para gravar; cópia e desfaz em caso de erro; ID nunca é reaproveitado; boletim/ficha assinados são objetos congelados | **Bom.** O sorteio confirmou: recusa não muda nada. |
| **Servidor (Node)** | Estado em memória + diário (cada comando vai ao disco antes de responder) + cópias; o servidor **refaz** o comando de forma determinística; números de revisão e erro 409 para base velha; perfis decididos no servidor; dinheiro cortado do que o anestesista recebe | **Bom, e agora à prova de disco cheio.** Faltam: HTTPS, serviço que reabre sozinho, trava de instância única, monitor e backup fora da máquina (lista em `COLOCAR_NO_AR.md`). |
| **Fronteira de confiança** | O "saneador" de tudo que entra de fora (`DADOS.sanearEstado`) mora em `webapp/js/03_dados.js`, e o servidor o carrega de lá | **Dívida técnica, sem risco hoje.** A regra de segurança está numa pasta de tela. O certo é morar no `core/`. Mudança média, sem mudar comportamento; recomendo fazer junto com a persistência no Supabase. |
| **Persistência** | Disco do servidor. Supabase **não foi construído** | **Pendente** e depende da sua aprovação do desenho. |
| **Escala de volume** | Cada tela baixa o estado inteiro; cada gravação recalcula tudo | **Aceitável até ~3.000 cirurgias** (tabela acima). Com 2.500 por mês **não cabe**: ver `docs/ESCALA_E_BANCO.md`. |
| **Observabilidade** | LOG por usuário, eventos de acesso, arquivo mensal conferido, `/api/saude` | **Bom para começar**; falta o monitor externo e o aviso por e-mail/WhatsApp. |
| **Testes** | Suíte própria sem dependências, mais conferência de nomes, contas independentes e sorteio | **Muito bom** para um projeto sem CI. Falta rodar sozinho a cada alteração no GitHub. |

Itens de arquitetura que **não** mexi (precisam de decisão ou são grandes): migração para Supabase
(F-plano), mover o saneador para o `core/`, vínculo por ID em vez de nome (F18), e o fechamento de mês
(F03, risco que você aceitou).

---

## 4. As informações ficam um ano? (tabela de retenção)

| O que | Onde fica | Quanto tempo | O que pode apagar | Proteção |
|---|---|---|---|---|
| Cirurgias, avaliações, boletins, fichas de qualidade, estrutura, repasses, escalas, cadastro | Estado do sistema | **Para sempre** | Só ação da pessoa (remover cirurgia, descartar rascunho…), sempre com confirmação e linha no LOG. Boletim assinado e ficha com desfecho não saem. | Cópia antes de importar/apagar/restaurar |
| LOG de alterações na tela | Estado do sistema | **12 a 60 meses (padrão 12)** | Só depois de virar arquivo mensal conferido | Mínimo de 12 meses travado no código |
| LOG de alterações e de acessos, arquivo mensal | `logs/` (um arquivo por mês, com SHA-256 conferido) | **5 anos (ajustável; 0 = nunca apagar)** | O que passou do prazo, no máximo 4 arquivos por vez | Freio contra relógio errado |
| Cópia diária do estado | `copias/` | Últimos 35 dias | As mais antigas que 35 dias | Freio (não apaga quase tudo de uma vez) |
| Primeira cópia de cada mês | `copias/` | **24 meses** | A que passou de 24 meses | Idem |
| Cópia "antes de importar/apagar/restaurar" | `copias/` | 400 dias | As de mais de 400 dias | Idem |
| PDFs de exame removidos pela pessoa | `anexos/removidos/` | 400 dias | Os de mais de 400 dias | — |

**Atenção:** a cópia mora **no mesmo disco** do sistema. Se o disco morrer, as cópias morrem junto.
Para "um ano de verdade" é preciso **cópia fora da máquina** (lista de tarefas, etapa 2).

---

## 5. Como repetir esta conferência

```bash
node qa                                   # a suíte inteira
node qa 32                                # só as contas independentes (use o número do arquivo)
node tools/aleatorio_store.js 12 800      # sorteio longo (leva minutos); INICIO=100 muda as sementes
node --expose-internals tools/verificar_nomes.js   # nomes usados sem existir
```

Arquivos novos desta rodada: `qa/30` (nomes), `qa/31` (robustez do núcleo), `qa/32` (contas
independentes), `qa/33` (sorteio curto), `qa/34` (disco e freios), `tools/aleatorio_store.js`,
`tools/verificar_nomes.js`.
