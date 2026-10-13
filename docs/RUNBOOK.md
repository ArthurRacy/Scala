# RUNBOOK — o que fazer quando algo acontece

Para quem cuida do servidor da clínica. Em português simples, um problema por vez. Onde ficam as coisas:
a **pasta de dados** (padrão `dados_servidor/`, ou a de `--dados`) guarda `estado.json` (o estado de agora),
`diario.jsonl` (cada comando, gravado antes de responder), `copias/` (cópias do estado), `anexos/` (PDFs de
exame), `logs/` (o LOG por usuário e os arquivos mensais conferidos) e `usuarios.json` (acessos, só com o
"hash" das senhas).

## Como saber se está tudo bem
- Abra `https://seu-endereco/api/saude` (ou `http://localhost:8080/api/saude`): `{"ok":true}` = de pé e gravando.
  `503` = o disco está recusando gravação (ver "Disco cheio"). Ponha um monitor externo olhando este endereço.
- Na tela **Integridade**, nenhum erro. Na tela **Auditoria**, só acessos que você reconhece.

## O sistema caiu / o computador reiniciou
1. Abra de novo (`Abrir servidor da clínica.bat`, ou `sudo systemctl restart anestesia`).
2. Nada que foi aceito se perde: o servidor reaplica o diário na partida (a janela diz "comando(s) do diário reaplicado(s)").
3. Se aparecer **"Já existe um servidor usando esta pasta de dados"**: ou já está aberto em outra janela (use essa),
   ou o computador desligou sem fechar e a trava ficou. Se tiver certeza de que não há outro aberto, apague o arquivo
   `servidor.trava` da pasta de dados (ele se refaz sozinho quando o processo dono já não existe).

## Disco cheio, ou "Não consegui gravar no disco" (erro 503)
- Nada foi alterado e nada se perdeu: quem digitou vê a mensagem e refaz depois.
- Libere espaço (apague o que não é do sistema; não apague `estado.json`, `diario.jsonl`, `copias/`).
- Não precisa reiniciar: o servidor tenta de novo sozinho (a cada 10 s ou na próxima gravação) e `/api/saude` volta a 200.

## Esqueci a senha do Anestesista chefe
Com o servidor **fechado**, na máquina do servidor:
```bash
node tools/redefinir_senha.js <pasta de dados> <login>
```
Ele mostra uma senha temporária (uma vez só). Entre com ela e troque em **Trocar senha**. Fica registrado no LOG.
Dica: tenha **dois chefes** cadastrados; o outro pode trocar a senha pela tela **Usuários**.

## Dado errado lançado
- Tela **Auditoria**: quem, quando, de → para. Corrija pela própria tela.
- Só se for grave: **Dados → Cópias** e restaurar uma cópia (o sistema guarda uma cópia "antes de restaurar"). Restaurar
  perde o que foi feito depois daquela cópia.

## O relógio do computador está errado
- O sistema só aceita gravação com a hora certa (diferença de até 5 minutos): acerte o relógio e o fuso (Brasília).
- A limpeza de cópias e de arquivos de LOG tem **freio**: se a data estiver absurda e ela quiser apagar quase tudo, não
  apaga nada e deixa aviso na janela e no LOG. Acerte o relógio e confira `copias/` e `logs/`.

## Alerta "Exames com problema" ou "Índice dos exames refeito" na Auditoria
O servidor confere os PDFs de exame na partida e a cada dia: existe, tem o tamanho e o SHA-256 registrados ao anexar.
- **"sem o arquivo"**: o PDF sumiu de `anexos/`. Procure-o no backup fora da máquina (`anexos/<id>.pdf`) e copie de volta
  para `anexos/` com o servidor fechado.
- **"SHA-256 não confere"** ou **"tamanho diferente"**: o arquivo foi trocado ou se estragou no disco. Pegue a versão do
  backup fora da máquina (o bucket com versões guarda a anterior) e confira com `Get-FileHash -Algorithm SHA256`.
- **"fora do índice"** ou **"sem ficha"**: há um PDF em `anexos/` que o sistema não sabe de que avaliação é. Não apague:
  a ficha `<id>.json` do backup resolve; sem ela, veja o conteúdo e anexe de novo pela tela.
- **"Índice dos exames refeito"**: o `anexos/indice.json` estava ilegível ou sumiu e foi refeito das fichas; o estragado
  fica guardado como `indice.ilegivel_*.json`. Confira a quantidade de PDF(s) na tela **Dados e backup**.

## Guardar mais que 3 anos / levar todos os dados embora
**Dados e backup → Baixar todos os dados** (só o chefe): um .zip com os dados (que voltam por *Importar backup*), as
planilhas, todos os PDFs (também os removidos ainda no prazo), o LOG, `CONFERENCIA.txt` e `SHA256SUMS.txt`. Guarde fora do
servidor, com acesso restrito (tem dados de pacientes). O `LEIA-ME.txt` dentro do pacote explica como conferir anos depois.

## Restaurar a partir de uma cópia fora da máquina
1. Feche o servidor. Guarde a pasta de dados atual (renomeie para `dados_antigos`).
2. Copie de volta `copias/`, `logs/`, `anexos/` e `usuarios.json` do backup para uma pasta de dados nova.
3. Abra o servidor. Na tela **Dados → Cópias**, restaure a cópia mais recente (`estado_AAAA-MM-DD.json.gz`).
4. Confira cirurgias, boletins e repasses de um mês que você conhece, e a tela **Integridade**.

## Trocar de versão do sistema
1. Faça uma cópia da pasta de dados (e confira que `copias/` tem a de hoje).
2. Feche o servidor, troque os arquivos do projeto (a pasta de dados não está dentro dele), abra de novo.
3. Rode `node qa` na máquina nova antes de abrir para a equipe, se possível.

## Suspeita de acesso indevido
1. Tela **Auditoria → acessos**: veja entradas, recusas e acessos negados por usuário e IP.
2. Troque as senhas dos envolvidos (derruba as sessões abertas) e desative quem não deve ter acesso.
3. Avise o jurídico/encarregado: a LGPD tem **prazo curto** (hoje, 3 dias úteis, a confirmar) para comunicar incidente
   à ANPD e aos titulares.

## Antes de cada mudança grande
Copie a pasta de dados inteira. O sistema já faz uma cópia "antes de importar/apagar/restaurar", mas a sua é a garantia.
