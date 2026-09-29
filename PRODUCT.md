# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Um grupo de 15 anestesistas e a equipe administrativa da clínica. Todos usam o sistema no dia a dia.
- **Secretaria/administrativo:** no computador de mesa. Lança cirurgias, anexa PDFs de exames, fecha horas, gera o termo de consentimento (TCLE).
- **Anestesistas:** no celular. Consultam escala e produção, preenchem e assinam o boletim anestésico.
- **Administrador/sócios:** repasse, financeiro, cadastro, usuários e backup (papel *administrador*; os demais são *equipe*).

## Product Purpose
Sistema de gestão operacional e financeira do grupo de anestesia: escala com rodízio semanal, cirurgias, avaliações pré-anestésicas, boletim anestésico, horas, financeiro, repasse igualitário e trilha de auditoria. Substitui e espelha a planilha em uso (11 abas), sem alterar nomes de abas, colunas ou valores de domínio. Sucesso: a escala e os fechamentos batem com a planilha e ninguém precisa recorrer a ela.

## Positioning
Um só motor de regras (`core/`) roda em três caminhos (web app offline, servidor da clínica com login e LOG por pessoa, Google Apps Script), com fidelidade verificada à planilha original (395/395 linhas da escala reproduzidas).

## Operating Context
- Secretaria: computador de mesa, uso prolongado, entrada de dados.
- Anestesistas: celular. Boletim durante ou logo após a cirurgia.
- Dados no navegador (IndexedDB) ou em servidor da rede da clínica (Node), com backups automáticos.
- Documentos clínicos com valor formal: boletim e TCLE em PDF, assinatura na tela, código de conferência SHA-256.

## Capabilities and Constraints
- Esquema das 11 abas da planilha é imutável (nomes, rótulos, domínios).
- Horas reais e estimadas nunca se somam. Repasse é divisão igual do resultado. Valores por anestesista não aparecem no comparativo (só produção).
- Boletim finalizado não se edita; reabrir exige motivo registrado no LOG.
- Funciona offline; sem dependências de build (sem `npm install`).
- Idioma: português do Brasil. Terminologia do domínio: rodízio, escala-base, posição, boletim, TCLE, TUSS, ASA, Aldrete.
- O texto do TCLE precisa de revisão jurídica da clínica antes do uso real.

## Brand Commitments
Identidade de referência indicada pelo usuário: **THE ONE – Hospital Brasília** (https://www.theonehospital.com.br/), lema "Medicina de Excelência" / #BeTheOne. Tom institucional e aspiracional. Paleta adotada por decisão do usuário, extraída da folha de estilo do site: verde-hospital `#15563f`, esmeralda `#0d7c66` e ouro `#c4a572`. O site usa fontes do sistema. O logotipo oficial (THE ONE, branco e ouro sobre verde `#15563f`) foi fornecido em PNG de 297x267 com a frase "O hospital onde você quer estar"; por decisão do usuário a frase foi retirada e a imagem recortada para 297x166 (`webapp/public/the-one-logo.png`; o original está em `the-one-logo-com-frase.png`); o verde do logotipo é o verde-hospital oficial. O `public/logo.png` (seringa e estetoscópio) segue como ícone da aba.

## Evidence on Hand
- Dados reais da planilha em `data/` (`seed.json`, `escalas_ref.json`, `cabecalhos_planilha.json`).
- Regras documentadas em `docs/REGRAS_DE_NEGOCIO.md` e bateria de testes em `qa/`.
- Ausente: versão vetorial (SVG) do logotipo e guia de marca oficial do hospital, depoimentos, métricas de uso.

## Product Principles
1. Fidelidade à planilha antes de qualquer conveniência. A tela nunca contradiz a regra de negócio.
2. Dois contextos, um produto: densidade e velocidade no computador da secretaria, toque e leitura rápida no celular do anestesista.
3. Documento clínico é registro formal. O que é assinado, finalizado ou auditado deve parecer, e ser, irreversível.
4. Erro cedo e explicado: conflito de horário, anestesista fora da escala e valores impossíveis são recusados na hora, com o motivo.
5. Confiança institucional: o sistema representa um hospital de excelência, então clareza e sobriedade valem mais que ornamento.

## Accessibility & Inclusion
Uso em celular exige alvos de toque adequados e boa legibilidade. Contraste mínimo WCAG AA (o detector já apontou texto `#e7edf3` sobre branco no `index.html`).
