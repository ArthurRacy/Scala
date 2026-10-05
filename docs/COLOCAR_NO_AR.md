# Colocar o sistema no ar — lista do que fazer

Atualizada em 05/10/2026, depois do QA geral (`docs/QA_GERAL.md`). Escrita em português simples.
Cada item diz **quem faz**: **[VOCÊ]** só você consegue ou decide · **[EU]** eu faço (no código) depois do
seu "pode seguir" · **[JUNTOS]** eu preparo e você executa ou confere.

---

## Onde estamos, em cinco linhas

1. O sistema funciona e passa na suíte de testes inteira; as contas de dinheiro, repasse, escala e
   datas foram refeitas por fora e batem ao centavo.
2. Hoje ele guarda os dados **no disco do computador servidor** (estado, diário de comandos, cópias).
   Ele **ainda não usa o Supabase**: essa parte **não foi construída** e precisa da sua aprovação.
3. **Não coloque dado real de paciente na nuvem** antes de fechar o item "Jurídico" (etapa 1).
4. Para uso de teste, com **dado fictício**, ele já pode rodar hoje num computador da clínica.
5. O que separa "funciona" de "pode abrir com dado real" não é erro de conta: é **decisão, jurídico,
   conta no Supabase, HTTPS, servidor que reabre sozinho, alerta e backup fora da máquina**.

---

## Etapa 1 — Decisões (só você pode)

| # | Decisão | Por que importa | Quem |
|---|---|---|---|
| 1 | **Aprovar o desenho do armazenamento no Supabase**: um servidor Node numa máquina pequena + Supabase guardando estado, diário e PDFs, com a chave de serviço **só no servidor** (nunca no navegador). Custo de referência: ≈ US$ 32–37 por clínica por mês (Supabase Pro US$ 25 + servidor US$ 7–12), acima dos US$ 20 que você citou; você já sabia e escolheu assim. | Sem isso eu não começo a parte maior. É a única mudança "grande" que falta. | [VOCÊ] |
| 2 | **Jurídico / LGPD.** Prazo de guarda do prontuário (hipótese: 20 anos), contrato com o fornecedor (Supabase) e com a hospedagem, quem é o encarregado de dados, termo de uso, o que fazer quando um paciente pede para apagar. | Dado de saúde é dado sensível. Sem isso, **nada de dado real na nuvem**. | [VOCÊ] com advogado |
| 3 | **Confirmar a matriz de perfis** (4 suposições minhas): (a) Anestesista não vê Horas nem Indicadores; (b) Secretária preenche a ficha de qualidade inteira, inclusive a revisão clínica; (c) Secretária edita cadastro e escala-base; (d) usuário antigo "equipe" vira Anestesista. | Quem vê dinheiro e quem assina é regra de negócio. | [VOCÊ] |
| 4 | **Quem assina o boletim.** Hoje a pessoa digita nome e CRM. Ligar o login ao cadastro do anestesista, para só quem entrou poder assinar por si? (F05) | Assinatura é documento médico. | [VOCÊ] |
| 5 | **Dinheiro:** teto de valor por lançamento? no máximo 2 casas decimais? e quando as despesas passam da entrada do mês, mostrar o prejuízo? (F11, F12) | Hoje o sistema aceita R$ 1.000.000.000.000.000 e some com o prejuízo. | [VOCÊ] |
| 6 | **Volume**: quantas cirurgias por mês? | Define custo e quando a lentidão aparece (QA_GERAL, tabela de desempenho). | [VOCÊ] |
| 7 | **Escala-base com substituição antiga** (Q5): quando uma mudança de base deixaria a mesma pessoa duas vezes no dia, **avisar** (como está) ou **recusar**? | Hoje avisa e deixa passar. | [VOCÊ] |
| 8 | **LOG**: 12 meses na tela (mínimo) e arquivo mensal conferido por 5 anos (0 = nunca apagar). Confirmar com o jurídico. | Você pediu "pelo menos um ano". | [VOCÊ] |
| 9 | Registrar no LOG cada edição de **rascunho** de boletim? (hoje só criar, assinar, reabrir e descartar) (Q11) | Trilha de auditoria. | [VOCÊ] |
| 10 | O repositório do GitHub é **público** e tem nomes reais do grupo (F19). Tornar privado? | Privacidade. | [VOCÊ] |
| 11 | Aposentar a camada Google Planilhas (nunca foi executada de verdade, F20)? | Menos coisa para manter. | [VOCÊ] |

---

## Etapa 2 — Contas e máquinas (você, eu guio passo a passo)

| # | Tarefa | Observação |
|---|---|---|
| 1 | Conta **Supabase** (plano Pro), **região São Paulo**, **um projeto por clínica**. | As chaves **nunca** vão para o chat nem para o repositório; ficam só no servidor. |
| 2 | **Máquina para o servidor**: pequena, em São Paulo (ex.: Lightsail US$ 7–12/mês), Linux. | Windows também funciona, mas a janela do `.bat` não reabre sozinha. |
| 3 | **Domínio** (ou subdomínio) e **HTTPS** (Caddy, certificado automático). | Sem HTTPS a senha viaja aberta: só serve para a rede interna da clínica. |
| 4 | **Backup fora da máquina**: copiar todo dia as pastas `copias/`, `logs/` e `anexos/` para outro lugar (um bucket). Guardar por **pelo menos 13 meses**. | Hoje as cópias moram no mesmo disco do sistema: se o disco morre, elas morrem junto. **É o item mais importante para o "um ano".** |
| 5 | **Monitor externo gratuito** (por exemplo UptimeRobot) olhando `https://seu-endereco/api/saude` a cada 5 minutos, com aviso por e-mail/WhatsApp. | A rota já existe. Responde 200 quando está de pé e gravando; 503 quando o disco recusa gravar. |
| 6 | Definir **quem recebe os alertas** e quem mexe no servidor quando o alerta chegar. | Uma pessoa e um reserva. |
| 7 | Conferir **relógio e fuso** do servidor (hora de Brasília; sincronização automática ligada). | O sistema só aceita gravação com a hora certa (dentro de 5 minutos). |

---

## Etapa 3 — Desenvolvimento (eu, depois do seu "pode seguir")

Em ordem de prioridade. Cada item: pequeno, com teste, um commit.

| # | Tarefa | Origem |
|---|---|---|
| 1 | **Persistência no Supabase** (estado, diário e PDFs), com a chave de serviço só no servidor, tabelas com segurança por linha ligada e sem política (ninguém acessa direto do navegador), buckets privados. **Grande: pede a aprovação da etapa 1, item 1.** | Auditoria |
| 2 | **HTTPS atrás de proxy**: cookie `Secure` e o IP real de quem entra (hoje o bloqueio por tentativas usa o IP do proxy). | F06, F17 |
| 3 | **Servidor como serviço** que reabre sozinho se cair, e **trava de instância única** (dois servidores no mesmo dado estragariam tudo). | F14, F16 |
| 4 | **Backup completo com PDFs** sem estourar a memória (hoje a importação aceita no máximo 200 MB). | F07 |
| 5 | **Recuperar a senha do chefe** com um comando no servidor (hoje, se o único chefe esquece, não há caminho documentado). | QA geral |
| 6 | **Script que cria uma clínica nova** (projeto, buckets, chefe, senha inicial) — um sistema por clínica. | Decisão |
| 7 | **Rodar os testes sozinho a cada alteração** no GitHub (CI). | F16 |
| 8 | **Validar tipos** dos comandos no servidor (rejeitar objetos onde se espera texto) e limite de PDFs. | Q10, F15 |
| 9 | **RUNBOOK** em português: queda, restaurar backup, relógio errado, disco cheio, trocar senha, atualizar versão. | Fase 5 |
| 10 | Mover o saneador de dados que entram de fora para o `core/` (hoje mora numa pasta de tela). | Arquitetura |

---

## Etapa 4 — Antes de abrir para a equipe

| # | Teste | Como saber que passou |
|---|---|---|
| 1 | **Ensaio de restauração**: pegar um backup, restaurar num servidor limpo. | Todas as cirurgias, boletins, fichas, repasses **e PDFs** voltam; as contas dão o mesmo número. |
| 2 | **Ensaio de queda**: desligar o servidor à força no meio do uso e ligar de novo. | Nada que foi aceito some (o diário reaplica). O teste automático já cobre; repetir no ambiente real. |
| 3 | **Ensaio de disco cheio** no ambiente real. | O sistema recusa gravar com mensagem clara (503), nada se perde, `/api/saude` avisa. |
| 4 | **Revisão de segurança por uma pessoa** (senhas, cookie, cabeçalhos, perfis). | Relatório sem item crítico. |
| 5 | **Uma semana de uso com dados fictícios** por 2 ou 3 pessoas de cada perfil. | Ninguém trava; a tela Integridade fica limpa. |
| 6 | **Conferência clínica** das definições do painel de qualidade (`docs/QUALIDADE_INDICADORES.md`). | Quem usa confirma cada definição. |
| 7 | Conferir que o **alerta chega** (derrubar o servidor de propósito e ver o aviso). | Mensagem recebida em minutos. |

---

## Etapa 5 — Dia da virada

1. Subir o servidor com HTTPS e abrir o endereço.
2. Criar o **Anestesista chefe** com o código de primeiro acesso (some do arquivo quando usado) e trocar a senha.
3. Criar os usuários (Anestesista chefe, Anestesista, Secretária), cada um com senha própria.
4. Conferir **Escala-base**, **cadastro de anestesistas** (nome, CRM, PIX) e **dados da clínica** (CNPJ, termo).
5. Tela **Auditoria → Arquivos e retenção**: conferir 12 meses na tela e prazo de guarda.
6. Fazer uma cirurgia de teste ponta a ponta (cirurgia → avaliação → boletim assinado → ficha de qualidade) e apagar/descartar o que for teste.
7. Confirmar que o **backup fora da máquina** rodou e que o monitor está verde.
8. Guardar fora do computador: a senha do chefe e o contato de quem cuida do servidor.

---

## Etapa 6 — Primeiros 30 dias

| Quando | O que olhar |
|---|---|
| **Todo dia** (1 minuto) | O monitor verde? A tela **Integridade** sem erro? Mensagem de "cópia do dia gravada" no log do servidor? |
| **Toda semana** | Espaço livre em disco; tamanho do estado e tempo de gravação (se passar de 300 ms, avisar); tela **Auditoria** (quem entrou, recusas, acessos negados); duplicidade de pessoa na escala depois de mudar a base. |
| **Todo mês** | **Restaurar uma cópia num lugar de teste** e conferir; conferir os **arquivos de LOG** (botão de conferência de SHA-256); relatório de repasse conferido por duas pessoas. |
| **Dia 30** | Revisar: lentidão, erros, pedidos da equipe, decisões pendentes. Decidir sobre fechamento de mês (F03). |

---

## Se algo der errado (resumo; o RUNBOOK completo vem na etapa 3)

| Situação | O que fazer |
|---|---|
| **Sistema fora do ar** | O monitor avisa. Reabrir o serviço. Os comandos aceitos estão no diário e voltam sozinhos. |
| **"Não consegui gravar no disco"** (erro 503) | Liberar espaço ou permissão. Nada foi alterado; quem digitou refaz depois. Não precisa reiniciar. |
| **Dado lançado errado** | Tela **Auditoria**: quem, quando, de→para. Corrigir pela própria tela. Restaurar cópia só em caso grave (perde o que veio depois; o sistema guarda uma cópia "antes de restaurar"). |
| **Relógio do computador errado** | O sistema recusa gravações com hora fora de 5 minutos; os freios **não apagam** cópias nem arquivos de LOG de uma vez. Acertar o relógio. |
| **Esqueceram a senha do chefe** | Hoje não há caminho documentado: é a tarefa 5 da etapa 3. Até lá, outro chefe cadastrado pode trocar a senha. **Cadastre dois chefes.** |
| **Suspeita de acesso indevido** | Tela **Auditoria** (acessos por usuário); trocar as senhas; derrubar as sessões; avisar o jurídico (LGPD tem prazo para comunicar incidente). |

---

## O que **não** mudou (para não haver surpresa)

- As regras de negócio: nada foi alterado sem você saber. O que mudou de visível: LOG mínimo de 12
  meses, avisos de escala, erro claro quando o disco recusa gravar, linha no LOG ao trocar a escala-base.
- Nada foi enviado ao GitHub, nem publicado em nenhum site, nem criado em nenhuma nuvem.
