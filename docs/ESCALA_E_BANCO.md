# Escala de volume e escolha do banco de dados

Escrito em 07/10/2026, a partir do que você informou: **800 cirurgias por mês no dia a dia (≈ 9.600 por ano)** e
**no máximo 2.500 por mês** (≈ 30 mil por ano, no pico). Marcas: **CONFIRMADO (rodei)** = medi · **HIPÓTESE** =
estimativa minha, sem medição.

---

## 1. O problema, com número

Hoje o sistema guarda **tudo** num só bloco na memória do servidor, cada tela baixa esse bloco inteiro, e
cada gravação recalcula tudo. Isso é ótimo para um grupo pequeno e quebra com volume.

**Medido (CONFIRMADO, rodei; 1 avaliação por cirurgia, sem boletins nem fichas):**

| Cirurgias no sistema | Tempo de uma gravação | Tamanho do estado | Chega lá, com 800 por mês | Chega lá, com 2.500 por mês |
|---|---|---|---|---|
| 2.500 | 0,13 s | 2,4 MB | no 3º mês | no 1º mês |
| 5.000 | 0,31 s | 4,6 MB | no 6º mês | no 2º mês |
| 10.000 | 0,65 s | 9 MB | no 13º mês | no 4º mês |
| 30.000 | 0,8 s | 27 MB | em 3 anos | no 12º mês |

Um ano com 800 por mês são **9.600 cirurgias**: entre as duas últimas medidas, ≈ 0,6 s por gravação e ≈ 9 MB.

**O peso de verdade são os boletins e as fichas de qualidade** (HIPÓTESE, pelos tamanhos medidos na
auditoria: boletim 3,5 a 10 KB, ficha 14 KB): com um boletim e uma ficha por cirurgia, o bloco que cada tela
baixa fica em **40 a 60 MB aos 3 meses, 80 a 115 MB aos 6 meses e 170 a 230 MB em 1 ano** (800 por mês), ou
**500 a 700 MB em 1 ano** (2.500 por mês). A compressão já feita corta a descarga de 8 a 10 vezes, mas o
servidor e as telas ainda carregam tudo na memória.

**Conclusão:**
- **Com 800 por mês (o normal):** o desenho atual serve bem nos **3 a 4 primeiros meses** (gravação abaixo de
  0,2 s), fica pesado por volta dos **6 meses** e é ruim no **fim do primeiro ano** (≈ 0,6 s por gravação e
  centenas de MB). Dá para começar, mas a troca do armazenamento tem de estar pronta **antes do 5º mês**.
- **Com 2.500 por mês (o pico):** não aguenta um ano; aguenta 2 a 3 meses.
- Não é erro de conta: é o desenho "um bloco só". Fazer a troca **antes** de abrir com dado real é mais seguro do
  que migrar dados reais depois.

---

## 2. Como resolver

A ideia é parar de tratar **todo o histórico** como se fosse o que está vivo na tela.

| Passo | O que muda | Efeito |
|---|---|---|
| 1. **Banco de dados de verdade** (relacional, com índices) no lugar do bloco único | Cada cirurgia, avaliação, boletim, ficha e repasse vira linha de tabela | Buscar um mês ou um boletim não lê o resto |
| 2. **A tela carrega só o mês** que está olhando (e o seguinte e o anterior) | Navegar para outro mês busca aquele mês | O que a tela baixa passa de centenas de MB para poucos MB |
| 3. **Boletim e ficha por registro**: só vêm quando são abertos | A lista mostra um resumo leve | É o que mais pesa hoje e deixa de pesar |
| 4. **A gravação recalcula só o dia/mês mexido** | As regras do `core/` já são por mês (escala, financeiro, repasse, horas) | Uma gravação fica em milissegundos, qualquer que seja o histórico |
| 5. **Totais do ano e painel de qualidade calculados no servidor** (por consulta) | A tela recebe o resultado, não os dados | Relatórios longos não baixam o histórico |
| 6. **Compressão** (gzip) | **Já feito** nesta rodada | Tudo que trafega fica de 4 a 10 vezes menor |

O que **se aproveita**: as regras puras do `core/` (rodízio, repasse, horas, validações, indicadores) e
todos os testes que as cobrem, mais a mesma ideia de "o servidor refaz o comando". O que **se reescreve**:
a camada que guarda e carrega os dados (`core/12_store.js`, `server/`) e a forma como as telas pedem dados.

**Tamanho do trabalho:** grande (semanas). Faço em etapas pequenas, cada uma com teste e sem quebrar o que
funciona: (a) modelo das tabelas e importação do que existe hoje; (b) servidor lendo e gravando no banco;
(c) tela por mês; (d) boletim e ficha por registro; (e) totais no servidor; (f) teste de carga com 30 mil
cirurgias e réplica idêntica. **Precisa da sua aprovação** (é troca de armazenamento) e de um banco de
teste. Pergunta que ainda muda o desenho: alguém precisa ver o histórico inteiro de uma vez (relatórios de
anos) ou só por mês? (O volume típico já foi informado: 800 por mês.)

Enquanto isso não vem, o sistema serve para **começar** (3 a 4 meses com 800 por mês). Não prometa à clínica o
primeiro ano antes de a etapa acima estar pronta.

**Tamanho do banco (HIPÓTESE):** ≈ 25 KB por cirurgia com boletim e ficha, ou **≈ 240 MB por ano** com 800 por mês
(≈ 750 MB por ano no pico). Qualquer plano de banco gerenciado comporta isso por muitos anos (o Supabase Pro vem
com 8 GB). Os PDFs de exame ficam à parte, em arquivo; é o que mais cresce e o que a cópia fora da máquina cobre.

---

## 3. Alternativas ao Supabase

Para este sistema o banco precisa de pouca coisa: **PostgreSQL** (ou parecido), **cópia de segurança
automática**, servidor **em São Paulo**, e **contrato de tratamento de dados**. O login, as permissões e as
regras já estão no nosso servidor; então o que o Supabase traz de extra (login pronto, API pronta, painel)
não é usado. Por isso há alternativas equivalentes:

| Opção | O que é | Pontos fortes | Pontos fracos | Custo de referência |
|---|---|---|---|---|
| **Supabase Pro** (escolhido) | Postgres gerenciado + arquivos + painel | Tudo junto, São Paulo, backup diário de 7 dias | Paga-se por recursos que não usamos | US$ 25 a 35 por mês |
| **Neon** | Só o banco, "serverless", região **São Paulo** (AWS) | Barato, restauração a um ponto do tempo, escala sozinho | Só banco: PDFs ficam em outro lugar; cobrança por uso | poucos dólares a ~US$ 30 |
| **AWS** (RDS ou Lightsail Postgres + S3, tudo em São Paulo) | Banco e arquivos do mesmo fornecedor | Muito aceito na área da saúde; um contrato só; restauração a ponto do tempo | Mais para configurar | Lightsail Postgres a partir de US$ 15 (US$ 30 com alta disponibilidade) |
| **Google Cloud SQL / Azure PostgreSQL** (Brasil) | Idem, outros fornecedores | Idem | Mais caros e mais complexos | a partir de ~US$ 30 |
| **Postgres na própria máquina** (VPS) + cópia contínua para fora | Você administra | Mais barato, controle total | Atualização, backup e restauração são seus | US$ 7 a 15 |
| **SQLite embutido no Node** + cópia contínua para fora (Litestream) | Um arquivo, sem servidor de banco | Simples, rápido, sem rede, sem custo extra; sobra para 30 mil cirurgias por ano | A função do Node ainda é "candidata a estável"; uma máquina só (sem reserva); a segurança depende 100% da cópia para fora | US$ 0 extra |

**Minha recomendação:** a escolha do fornecedor importa **menos** que o desenho em tabelas (seção 2). Pelas
perguntas de LGPD e de simplicidade: **(1) manter o Supabase** (já decidido, funciona, São Paulo) ou
**(2) AWS inteira em São Paulo** se o advogado preferir um fornecedor grande e conhecido na saúde. **Neon** se
o custo for o que mais pesa. **SQLite** só se você aceitar uma máquina única e uma disciplina rigorosa de cópia
para fora (a lista de tarefas já exige isso de qualquer jeito).

Preços e regiões acima são os que consegui conferir em 05–07/10/2026 e **mudam**: conferir na página do
fornecedor antes de contratar.
