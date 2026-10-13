/**
 * ============================================================================
 * 12B_PERMISSOES — Quem vê e quem faz o quê (catálogo de permissões)
 * ============================================================================
 * Cada usuário do sistema da clínica tem uma lista de PERMISSÕES, escolhida
 * pelo Anestesista chefe (docs/PERMISSOES.md):
 *
 *   chefe        Anestesista chefe. Tem todas as permissões, sempre, e é o
 *                único que cadastra usuários, decide as permissões de cada um,
 *                importa, restaura ou apaga os dados de todos e mexe nas regras
 *                do LOG. Um deles é o chefe PRINCIPAL: só ele cria, altera ou
 *                rebaixa outros chefes (regra em server/contas.js).
 *   anestesista  Modelo "Anestesista": operação, boletim, ficha e painel de
 *   secretaria   qualidade. Modelo "Secretária": operação e gestão. O chefe
 *                aplica um modelo e liga ou desliga cada permissão, pessoa a
 *                pessoa (`permissoes` na conta). Sem lista guardada, vale o
 *                modelo do perfil — é o que reproduz o acesso de antes.
 *
 * A TABELA MORA AQUI, no core, para três leitores usarem a MESMA regra: o
 * servidor (quem decide e quem corta os dados), a tela (que só esconde o que a
 * pessoa não pode usar) e os testes (que conferem). Esconder um botão nunca é
 * a proteção: quem protege é o servidor.
 *
 * REGRA DE OURO: operação do store, tela ou rota que não esteja no catálogo é
 * só do chefe. Uma operação nova esquecida aqui nasce fechada, não aberta
 * (teste em qa/25).
 *
 * Quem pede ("quem", nas funções abaixo) é o nome de um perfil ('chefe',
 * 'anestesista', 'secretaria' e os antigos 'admin'/'equipe') ou uma conta
 * { papel, permissoes }.
 *
 * Computador único não tem login: ali quem usa é o chefe. A versão online de
 * demonstração tem uma conta por perfil (webapp/js/demo_online.js) e confere
 * as operações por esta mesma tabela, só no navegador.
 * ============================================================================
 */

var PERFIS = {
  chefe: {
    id: 'chefe', rotulo: 'Anestesista chefe',
    resumo: 'Poder total sobre a plataforma: usuários, permissões, cadastro, financeiro, qualidade, auditoria e backup.'
  },
  anestesista: {
    id: 'anestesista', rotulo: 'Anestesista',
    resumo: 'Todo o painel de operação e o painel de qualidade. Não vê dinheiro nem dados de contato dos colegas.'
  },
  secretaria: {
    id: 'secretaria', rotulo: 'Secretária',
    resumo: 'Operação e gestão (horas, financeiro, repasse, cadastro), sem painel de qualidade, sem assinar boletim e sem administração.'
  }
};

var ORDEM_DOS_PERFIS = ['chefe', 'anestesista', 'secretaria'];

/**
 * Nome de perfil (inclusive os dois antigos, "admin" e "equipe") -> perfil
 * canônico, ou '' se não existir. "equipe" virou "anestesista": era a operação do
 * dia a dia, e o anestesista é o perfil que menos dado vê (o chefe promove a
 * secretária, se for o caso).
 */
function perfilCanonico(valor) {
  var v = String(valor === null || valor === undefined ? '' : valor).trim().toLowerCase();
  if (v === 'admin') return 'chefe';
  if (v === 'equipe') return 'anestesista';
  return PERFIS[v] ? v : '';
}

/* -------------------------------------------------------------- catálogo -- */

var GRUPOS_DE_PERMISSAO = [
  { id: 'operacao', rotulo: 'Operação' },
  { id: 'boletim', rotulo: 'Boletim anestésico' },
  { id: 'qualidade', rotulo: 'Qualidade' },
  { id: 'gestao', rotulo: 'Gestão' },
  { id: 'cadastro', rotulo: 'Cadastro' },
  { id: 'sistema', rotulo: 'Sistema' }
];

/** Selos de cuidado: o que pede atenção antes de dar a alguém. */
var CUIDADOS_DE_PERMISSAO = {
  dinheiro: 'dinheiro',
  pessoal: 'dado pessoal',
  prontuario: 'prontuário',
  massa: 'apaga ou altera'
};

/**
 * As permissões que o chefe dá a cada usuário. `depende`: o que tem de vir junto (ligar uma liga as de que ela
 * depende; desligar uma desliga as que dependem dela). `sempre`: vem em toda conta. A ordem é a da tela.
 */
var PERMISSOES = [
  { id: 'operacao.ver', grupo: 'operacao', rotulo: 'Ver a operação', sempre: true, depende: [],
    descricao: 'Painel, Escala, Quadro do dia, Cirurgias e Avaliações pré (leitura).' },
  { id: 'cirurgias.editar', grupo: 'operacao', rotulo: 'Lançar e alterar cirurgias', depende: ['operacao.ver'],
    descricao: 'Sem os campos de dinheiro, que têm permissão própria.' },
  { id: 'cirurgias.excluir', grupo: 'operacao', rotulo: 'Excluir cirurgias', depende: ['cirurgias.editar'], cuidado: ['massa'],
    descricao: 'Exclui a cirurgia e as avaliações dela.' },
  { id: 'avaliacoes.editar', grupo: 'operacao', rotulo: 'Alterar avaliações pré-anestésicas', depende: ['operacao.ver'], cuidado: ['prontuario'],
    descricao: 'Realizada, data, observações e o termo de consentimento.' },
  { id: 'escala.ajustar', grupo: 'operacao', rotulo: 'Ajustar a escala', depende: ['operacao.ver'],
    descricao: 'Substituições e remanejamento das posições.' },
  { id: 'exames.ver', grupo: 'operacao', rotulo: 'Abrir os exames do paciente', depende: ['operacao.ver'], cuidado: ['prontuario'],
    descricao: 'Os PDFs de exame presos às avaliações.' },
  { id: 'exames.anexar', grupo: 'operacao', rotulo: 'Anexar exames', depende: ['exames.ver'], cuidado: ['prontuario'],
    descricao: 'Guardar PDF de exame na avaliação ou na cirurgia nova.' },
  { id: 'exames.remover', grupo: 'operacao', rotulo: 'Remover exames', depende: ['exames.anexar'], cuidado: ['massa'],
    descricao: 'O PDF removido continua guardado no servidor por 3 anos.' },

  { id: 'boletim.ver', grupo: 'boletim', rotulo: 'Ver e imprimir o boletim', depende: ['operacao.ver'], cuidado: ['prontuario'],
    descricao: 'Tela do boletim e o PDF.' },
  { id: 'boletim.preencher', grupo: 'boletim', rotulo: 'Criar e preencher o boletim', depende: ['boletim.ver'], cuidado: ['prontuario'],
    descricao: 'Inclui descartar o rascunho.' },
  { id: 'boletim.assinar', grupo: 'boletim', rotulo: 'Assinar o boletim', depende: ['boletim.preencher'], cuidado: ['prontuario'],
    descricao: 'Só funciona com o usuário ligado a um anestesista do cadastro: o boletim sai no nome e no CRM dele.' },
  { id: 'boletim.reabrir', grupo: 'boletim', rotulo: 'Reabrir boletim assinado', depende: ['boletim.assinar'], cuidado: ['prontuario'],
    descricao: 'Com motivo; a versão anterior fica no histórico.' },

  { id: 'qualidade.ficha', grupo: 'qualidade', rotulo: 'Preencher a ficha de qualidade', depende: ['operacao.ver'], cuidado: ['prontuario'],
    descricao: 'Criar, preencher, acompanhar, concluir e descartar a ficha.' },
  { id: 'qualidade.revisar', grupo: 'qualidade', rotulo: 'Revisão clínica da ficha', depende: ['qualidade.ficha'], cuidado: ['prontuario'],
    descricao: 'Revisar e reabrir a ficha de qualidade.' },
  { id: 'qualidade.painel', grupo: 'qualidade', rotulo: 'Painel de qualidade', depende: ['operacao.ver'],
    descricao: 'Indicadores do grupo, sem comparar profissionais.' },
  { id: 'qualidade.comparar', grupo: 'qualidade', rotulo: 'Comparar profissionais', depende: ['qualidade.painel'], cuidado: ['pessoal'],
    descricao: 'O mesmo indicador por anestesista, no painel de qualidade.' },
  { id: 'qualidade.coordenar', grupo: 'qualidade', rotulo: 'Coordenação da qualidade', depende: ['qualidade.painel'],
    descricao: 'Estrutura (equipamentos, salas, treinamentos) e definições clínicas do painel.' },

  { id: 'horas.ver', grupo: 'gestao', rotulo: 'Horas', depende: ['operacao.ver'],
    descricao: 'Horas reais e estimadas por anestesista.' },
  { id: 'indicadores.ver', grupo: 'gestao', rotulo: 'Indicadores de produção', depende: ['operacao.ver'],
    descricao: 'Cirurgias, avaliações e horas do grupo, sem valores.' },
  { id: 'financeiro.ver', grupo: 'gestao', rotulo: 'Ver valores e pagamentos', depende: ['operacao.ver'], cuidado: ['dinheiro'],
    descricao: 'Valor, pago, data do pagamento e nota fiscal; tela Financeiro; números de dinheiro do painel.' },
  { id: 'financeiro.editar', grupo: 'gestao', rotulo: 'Alterar valores e pagamentos', depende: ['financeiro.ver'], cuidado: ['dinheiro'],
    descricao: 'Nas cirurgias e nas avaliações.' },
  { id: 'repasse.ver', grupo: 'gestao', rotulo: 'Ver o repasse', depende: ['financeiro.ver'], cuidado: ['dinheiro'],
    descricao: 'Divisão do resultado do mês, com a chave PIX de cada um.' },
  { id: 'repasse.gerir', grupo: 'gestao', rotulo: 'Gerir o repasse', depende: ['repasse.ver'], cuidado: ['dinheiro'],
    descricao: 'Despesas, pagamentos e quem participa da divisão.' },

  { id: 'contatos.ver', grupo: 'cadastro', rotulo: 'Ver contatos dos anestesistas', depende: ['operacao.ver'], cuidado: ['pessoal'],
    descricao: 'Chave PIX, telefone e e-mail.' },
  { id: 'cadastro.anestesistas', grupo: 'cadastro', rotulo: 'Cadastro de anestesistas', depende: ['contatos.ver'],
    descricao: 'Anestesistas e a escala-base.' },
  { id: 'cadastro.clinica', grupo: 'cadastro', rotulo: 'Clínica e termo', depende: ['operacao.ver'],
    descricao: 'Dados da clínica e o texto do termo de consentimento.' },

  { id: 'auditoria.ver', grupo: 'sistema', rotulo: 'Ver a auditoria', depende: ['repasse.ver', 'contatos.ver'], cuidado: ['pessoal', 'dinheiro'],
    descricao: 'O LOG de alterações, os acessos e os arquivos mensais conferidos. O LOG mostra tudo o que mudou, inclusive valores, ' +
      'repasses e PIX: por isso exige ver o repasse e os contatos.' },
  { id: 'integridade', grupo: 'sistema', rotulo: 'Integridade e reparo', depende: ['auditoria.ver'], cuidado: ['massa'],
    descricao: 'Verificação de consistência dos dados e o reparo geral.' },
  { id: 'dados.exportar', grupo: 'sistema', rotulo: 'Baixar os dados', depende: ['auditoria.ver', 'exames.ver'], cuidado: ['pessoal', 'prontuario'],
    descricao: 'Backup, planilhas e "Baixar todos os dados": todos os pacientes, todos os exames, valores e o LOG.' }
];

var IDS_DE_PERMISSAO = PERMISSOES.map(function (p) { return p.id; });
var PERMISSAO_POR_ID = {};
PERMISSOES.forEach(function (p) { PERMISSAO_POR_ID[p.id] = p; });

/** O que só o chefe faz (não se delega) e o que nenhuma pessoa faz (só o próprio servidor). */
var SO_CHEFE = 'chefe';
var INTERNA = 'interna';

/** O que o chefe faz e não se dá a ninguém (aparece na tela Usuários, para ficar claro). */
var EXCLUSIVO_DO_CHEFE = [
  'Cadastrar usuários, desativar, definir senha nova e ligar a um anestesista do cadastro',
  'Decidir as permissões de cada usuário',
  'Importar backup, restaurar cópia e apagar tudo',
  'Regras do LOG: quanto fica na tela, arquivar e conferir'
];

/**
 * Os modelos reproduzem o acesso dos perfis de antes (qa/25 confere operação por operação). Conta sem lista
 * guardada usa o modelo do seu perfil.
 */
var MODELOS_DE_PERMISSAO = {
  anestesista: ['operacao.ver', 'cirurgias.editar', 'cirurgias.excluir', 'avaliacoes.editar', 'escala.ajustar',
    'exames.ver', 'exames.anexar', 'exames.remover',
    'boletim.ver', 'boletim.preencher', 'boletim.assinar', 'boletim.reabrir',
    'qualidade.ficha', 'qualidade.revisar', 'qualidade.painel'],
  secretaria: ['operacao.ver', 'cirurgias.editar', 'cirurgias.excluir', 'avaliacoes.editar', 'escala.ajustar',
    'exames.ver', 'exames.anexar', 'exames.remover',
    'boletim.ver', 'qualidade.ficha', 'qualidade.revisar',
    'horas.ver', 'indicadores.ver', 'financeiro.ver', 'financeiro.editar', 'repasse.ver', 'repasse.gerir',
    'contatos.ver', 'cadastro.anestesistas', 'cadastro.clinica']
};

/* -------------------------------------------------- listas e dependências -- */

function emOrdemDoCatalogo(ids) {
  return IDS_DE_PERMISSAO.filter(function (id) { return ids.indexOf(id) >= 0; });
}

/** Lista + tudo de que ela depende + as que vêm sempre (para a tela: ligar uma liga as de que ela precisa). */
function completarDependencias(lista) {
  var saida = [];
  function incluir(id) {
    var p = PERMISSAO_POR_ID[id];
    if (!p || saida.indexOf(id) >= 0) return;
    saida.push(id);
    p.depende.forEach(incluir);
  }
  (Array.isArray(lista) ? lista : []).forEach(function (id) { incluir(String(id)); });
  PERMISSOES.forEach(function (p) { if (p.sempre) incluir(p.id); });
  return emOrdemDoCatalogo(saida);
}

/** As permissões que dependem desta, direta ou indiretamente (para a tela: desligar uma desliga estas). */
function dependentesDe(id) {
  var saida = [];
  var mudou = true;
  while (mudou) {
    mudou = false;
    PERMISSOES.forEach(function (p) {
      if (saida.indexOf(p.id) >= 0) return;
      if (p.depende.some(function (d) { return d === id || saida.indexOf(d) >= 0; })) { saida.push(p.id); mudou = true; }
    });
  }
  return emOrdemDoCatalogo(saida);
}

/**
 * Lista guardada -> lista que vale. O que não se reconhece é ignorado, e a permissão cuja dependência falta
 * cai (na dúvida, fecha: nunca abre mais do que está escrito).
 */
function listaQueVale(lista) {
  var conhecidas = (Array.isArray(lista) ? lista : []).map(String).filter(function (id) { return !!PERMISSAO_POR_ID[id]; });
  PERMISSOES.forEach(function (p) { if (p.sempre && conhecidas.indexOf(p.id) < 0) conhecidas.push(p.id); });
  var vale = conhecidas.slice();
  var mudou = true;
  while (mudou) {
    mudou = false;
    vale = vale.filter(function (id) {
      var ok = PERMISSAO_POR_ID[id].depende.every(function (d) { return vale.indexOf(d) >= 0; });
      if (!ok) mudou = true;
      return ok;
    });
  }
  return emOrdemDoCatalogo(vale);
}

/**
 * Confere uma lista mandada pelo chefe: só ids do catálogo e dependências completas. Devolve
 * { ok, lista, erros:[{ campo: 'permissoes', msg }] }.
 */
function validarPermissoes(lista) {
  if (!Array.isArray(lista)) return { ok: false, lista: [], erros: [{ campo: 'permissoes', msg: 'Lista de permissões inválida.' }] };
  var erros = [];
  var ids = lista.map(function (x) { return String(x); });
  var desconhecidas = ids.filter(function (id) { return !PERMISSAO_POR_ID[id]; });
  if (desconhecidas.length) {
    erros.push({ campo: 'permissoes', msg: 'Permissão que não existe: ' + desconhecidas.join(', ') + '.' });
  }
  var conhecidas = ids.filter(function (id) { return !!PERMISSAO_POR_ID[id]; });
  PERMISSOES.forEach(function (p) { if (p.sempre && conhecidas.indexOf(p.id) < 0) conhecidas.push(p.id); });
  conhecidas.forEach(function (id) {
    var p = PERMISSAO_POR_ID[id];
    var faltam = p.depende.filter(function (d) { return conhecidas.indexOf(d) < 0; });
    if (faltam.length) {
      erros.push({ campo: 'permissoes', msg: '"' + p.rotulo + '" precisa de ' +
        faltam.map(function (d) { return '"' + PERMISSAO_POR_ID[d].rotulo + '"'; }).join(' e ') + '.' });
    }
  });
  return { ok: !erros.length, lista: emOrdemDoCatalogo(conhecidas), erros: erros };
}

/** 'anestesista' ou 'secretaria' se a lista é exatamente a do modelo; '' se foi ajustada. */
function modeloDaLista(lista) {
  var l = emOrdemDoCatalogo(Array.isArray(lista) ? lista.map(String) : []).join(',');
  var achado = '';
  Object.keys(MODELOS_DE_PERMISSAO).forEach(function (m) {
    if (!achado && emOrdemDoCatalogo(MODELOS_DE_PERMISSAO[m]).join(',') === l) achado = m;
  });
  return achado;
}

/* ------------------------------------------------------------ quem pode -- */

function papelDe(quem) {
  return perfilCanonico(quem && typeof quem === 'object' ? quem.papel : quem);
}

/** As permissões que valem para quem pede (todas, para o chefe; nenhuma, para perfil desconhecido). */
function permissoesDe(quem) {
  var papel = papelDe(quem);
  if (!papel) return [];
  if (papel === 'chefe') return IDS_DE_PERMISSAO.slice();
  var guardada = quem && typeof quem === 'object' && Array.isArray(quem.permissoes) ? quem.permissoes : null;
  return listaQueVale(guardada || MODELOS_DE_PERMISSAO[papel]);
}

function ehChefe(quem) { return papelDe(quem) === 'chefe'; }

/** Quem pede tem esta permissão? (SO_CHEFE: só o chefe; INTERNA: ninguém.) */
function pode(quem, permissao) {
  if (permissao === INTERNA) return false;
  if (permissao === SO_CHEFE) return ehChefe(quem);
  return permissoesDe(quem).indexOf(permissao) >= 0;
}

/** Rótulo do acesso de uma conta: "Anestesista chefe", "Secretária" ou "Secretária (ajustado)". */
function rotuloDoAcesso(quem) {
  var papel = papelDe(quem);
  if (!papel) return 'sem acesso';
  if (papel === 'chefe') return PERFIS.chefe.rotulo;
  var lista = permissoesDe(quem);
  return PERFIS[papel].rotulo + (modeloDaLista(lista) === papel ? '' : ' (ajustado)');
}

/* ------------------------------------------------------------------ telas -- */

var PERMISSAO_DA_TELA = {
  painel: 'operacao.ver', escala: 'operacao.ver', quadro: 'operacao.ver', cirurgias: 'operacao.ver', avaliacoes: 'operacao.ver',
  boletim: 'boletim.ver', qualidade: 'qualidade.ficha',
  horas: 'horas.ver', financeiro: 'financeiro.ver', repasse: 'repasse.ver', indicadores: 'indicadores.ver',
  painel_qualidade: 'qualidade.painel', estrutura: 'qualidade.coordenar',
  anestesistas: 'cadastro.anestesistas', clinica: 'cadastro.clinica',
  integridade: 'integridade', log: 'auditoria.ver', dados: 'dados.exportar',
  usuarios: SO_CHEFE
};

/** Quem pede abre esta tela? (Perfil desconhecido não abre nenhuma; tela fora da tabela, ninguém.) */
function perfilPodeVerTela(quem, tela) {
  var perm = PERMISSAO_DA_TELA[tela];
  return !!perm && pode(quem, perm);
}

/** Vê dinheiro (valores, pagamentos, nota fiscal). */
function perfilVeFinanceiro(quem) { return pode(quem, 'financeiro.ver'); }

/** Coordenação da qualidade: estrutura e definições clínicas. */
function perfilEhCoordenacao(quem) { return pode(quem, 'qualidade.coordenar'); }

/* -------------------------------------------------------------- operações -- */

/** A permissão que cada operação do store exige. Operação fora desta tabela é só do chefe. */
var PERMISSAO_DA_OPERACAO = {
  adicionarCirurgia: 'cirurgias.editar', atualizarCirurgia: 'cirurgias.editar', removerCirurgia: 'cirurgias.excluir',
  atualizarAvaliacao: 'avaliacoes.editar', ajustarEscala: 'escala.ajustar', aplicarRemanejamento: 'escala.ajustar',

  salvarAnestesista: 'cadastro.anestesistas', definirEscalaBase: 'cadastro.anestesistas', definirModoEscalaBase: 'cadastro.anestesistas',
  salvarConfigClinica: 'cadastro.clinica',

  salvarDespesasRepasse: 'repasse.gerir', registrarPagamentoRepasse: 'repasse.gerir',
  removerPagamentoRepasse: 'repasse.gerir', atualizarParticipantesRepasse: 'repasse.gerir',

  criarBoletim: 'boletim.preencher', salvarBoletim: 'boletim.preencher', alterarLinhaBoletim: 'boletim.preencher',
  descartarBoletim: 'boletim.preencher', finalizarBoletim: 'boletim.assinar', reabrirBoletim: 'boletim.reabrir',

  criarFichaQualidade: 'qualidade.ficha', salvarFichaQualidade: 'qualidade.ficha', preencherFichaDoBoletim: 'qualidade.ficha',
  alterarEventoQualidade: 'qualidade.ficha', registrarSeguimentoQualidade: 'qualidade.ficha',
  concluirFichaQualidade: 'qualidade.ficha', descartarFichaQualidade: 'qualidade.ficha',
  revisarFichaQualidade: 'qualidade.revisar', reabrirFichaQualidade: 'qualidade.revisar',

  salvarRegistroEstrutura: 'qualidade.coordenar', removerRegistroEstrutura: 'qualidade.coordenar', salvarConfigQualidade: 'qualidade.coordenar',

  reparar: 'integridade',
  salvarConfigLog: SO_CHEFE,

  // Só o próprio servidor aplica (rotação mensal do LOG): nenhuma pessoa manda isto pela rede.
  arquivarLogAte: INTERNA
};

/**
 * O que, nos modelos, só o Anestesista chefe faz (estrutura, definições clínicas, reparo geral e regras do LOG).
 * Sai da tabela acima: não existe uma segunda lista para esquecer de atualizar.
 */
var MUTACOES_SO_ADMIN = Object.keys(PERMISSAO_DA_OPERACAO).filter(function (nome) {
  var perm = PERMISSAO_DA_OPERACAO[nome];
  if (perm === INTERNA) return false;
  if (perm === SO_CHEFE) return true;
  return !Object.keys(MODELOS_DE_PERMISSAO).some(function (m) { return MODELOS_DE_PERMISSAO[m].indexOf(perm) >= 0; });
});

/* ------------------------------------------------------------------ rotas -- */

/** A permissão de cada rota do servidor que não é de todo mundo que entrou. Fora da tabela: quem entrou. */
var PERMISSAO_DA_ROTA = {
  'GET /api/anexos': 'exames.ver', 'GET /api/anexos/:id': 'exames.ver',
  'POST /api/anexos': 'exames.anexar', 'DELETE /api/anexos/:id': 'exames.remover',
  'GET /api/backup': 'dados.exportar', 'GET /api/exportar-tudo': 'dados.exportar',
  'GET /api/auditoria/acessos': 'auditoria.ver', 'GET /api/auditoria/arquivos': 'auditoria.ver',
  'GET /api/auditoria/arquivos/:id': 'auditoria.ver',
  'GET /api/usuarios': SO_CHEFE, 'POST /api/usuarios': SO_CHEFE,
  'POST /api/importar': SO_CHEFE, 'POST /api/apagar-tudo': SO_CHEFE,
  'GET /api/copias': SO_CHEFE, 'POST /api/copias/restaurar': SO_CHEFE,
  'POST /api/auditoria/rotacionar': SO_CHEFE, 'POST /api/auditoria/conferir': SO_CHEFE
};

/* ------------------------------------------------------- campos restritos -- */

/**
 * Campos com permissão própria: dinheiro das cirurgias e das avaliações, e os dados de contato e a chave PIX
 * do cadastro. Quem não vê não recebe; quem não pode alterar não envia.
 */
var CAMPOS_FINANCEIROS = {
  CIRURGIAS: ['valor', 'pago', 'dataPagamento', 'nf'],
  AVALIACOES_PRE: ['valor', 'pago', 'dataPagamento', 'nf'],
  ANESTESISTAS: ['pix', 'telefone', 'email']
};

/** Para ver e para enviar os campos restritos de cada aba. */
var PERMISSAO_DOS_CAMPOS = {
  CIRURGIAS: { ver: 'financeiro.ver', enviar: 'financeiro.editar' },
  AVALIACOES_PRE: { ver: 'financeiro.ver', enviar: 'financeiro.editar' },
  ANESTESISTAS: { ver: 'contatos.ver', enviar: 'contatos.ver' }
};

/** Em qual argumento de cada operação vêm os campos restritos, e de que aba. */
var ARGUMENTO_RESTRITO = {
  adicionarCirurgia: { arg: 0, aba: 'CIRURGIAS' },
  atualizarCirurgia: { arg: 1, aba: 'CIRURGIAS' },
  atualizarAvaliacao: { arg: 1, aba: 'AVALIACOES_PRE' },
  salvarAnestesista: { arg: 0, aba: 'ANESTESISTAS' }
};

/** Os campos restritos que esta operação traz e que quem pede não pode enviar. */
function camposRestritosEnviados(nome, args, quem) {
  var regra = ARGUMENTO_RESTRITO[nome];
  var alvo = regra && Array.isArray(args) ? args[regra.arg] : null;
  if (!regra || !alvo || typeof alvo !== 'object') return [];
  if (quem !== undefined && pode(quem, PERMISSAO_DOS_CAMPOS[regra.aba].enviar)) return [];
  return CAMPOS_FINANCEIROS[regra.aba].filter(function (c) {
    return Object.prototype.hasOwnProperty.call(alvo, c);
  });
}

/* ------------------------------------------------------------- assinatura -- */

/**
 * Quem assina o boletim é quem entrou no sistema: cada login que assina é ligado a um anestesista do cadastro,
 * e o boletim sai no nome e no CRM dele. Devolve { anestesista: { id, nome, crm } | null }.
 */
function contextoDeAssinatura(anestesistaId, anestesistas) {
  var id = txt(anestesistaId);
  var a = id ? (anestesistas || []).filter(function (x) { return txt(x.id) === id; })[0] : null;
  return { anestesista: a ? { id: txt(a.id), nome: txt(a.nome), crm: txt(a.crm) } : null };
}

function assinaturaConfere(contexto, args) {
  var eu = contexto && contexto.anestesista;
  if (!eu) {
    return { ok: false, motivo: 'vinculo', erro: 'O seu usuário não está ligado a um anestesista do cadastro. Peça ao Anestesista chefe para ligar (tela Usuários) antes de assinar um boletim.' };
  }
  var a = (Array.isArray(args) && args[1] && typeof args[1] === 'object') ? args[1] : {};
  if (!mesmoTexto(a.nome, eu.nome)) {
    return { ok: false, motivo: 'vinculo', erro: 'O boletim só pode ser assinado por quem entrou no sistema: ele sai em nome de ' + eu.nome + '.' };
  }
  if (!vazio(eu.crm) && !mesmoTexto(a.crm, eu.crm)) {
    return { ok: false, motivo: 'vinculo', erro: 'O CRM da assinatura tem de ser o do seu cadastro (' + eu.crm + ').' };
  }
  return { ok: true };
}

/* ------------------------------------------------------- pode executar? -- */

function nomeDoAcesso(quem) {
  var papel = papelDe(quem);
  return papel ? PERFIS[papel].rotulo : 'sem acesso';
}

/**
 * Quem pede pode mandar esta operação com estes argumentos?
 * `contexto` (só com login) vem de contextoDeAssinatura: sem ele (um computador só, sem login) a assinatura é livre.
 * Devolve { ok: true } ou { ok: false, motivo: 'perfil'|'campo'|'interna'|'vinculo', erro }.
 */
function perfilPodeExecutar(quem, nome, args, contexto) {
  var perm = PERMISSAO_DA_OPERACAO[nome];
  if (perm === INTERNA) {
    return { ok: false, motivo: 'interna', erro: 'Esta operação é só do próprio servidor.' };
  }
  var papel = papelDe(quem);
  if (!papel) return { ok: false, motivo: 'perfil', erro: 'Seu perfil de acesso não existe mais. Fale com o administrador.' };
  if (!pode(quem, perm || SO_CHEFE)) {
    var p = perm && perm !== SO_CHEFE ? PERMISSAO_POR_ID[perm] : null;
    return { ok: false, motivo: 'perfil', erro: 'O seu perfil (' + nomeDoAcesso(quem) + ') não faz esta operação' +
      (p ? ': falta a permissão "' + p.rotulo + '". Peça ao Anestesista chefe.' : ': só o Anestesista chefe.') };
  }
  var proibidos = camposRestritosEnviados(nome, args, quem);
  if (proibidos.length) {
    return { ok: false, motivo: 'campo', erro: 'O seu perfil (' + nomeDoAcesso(quem) + ') não altera dados financeiros nem de contato (' +
      proibidos.join(', ') + ').' };
  }
  if (nome === 'finalizarBoletim' && contexto) return assinaturaConfere(contexto, args);
  return { ok: true };
}

/* ------------------------------------------------------------ o que chega -- */

function semOsCampos(registro, campos) {
  var copia = {};
  Object.keys(registro || {}).forEach(function (k) {
    if (campos.indexOf(k) < 0) copia[k] = registro[k];
  });
  return copia;
}

/** Os quatro cortes do que chega a quem pede (true = corta). */
function corteDe(quem) {
  return {
    dinheiro: !pode(quem, 'financeiro.ver'),
    repasse: !pode(quem, 'repasse.ver'),
    contatos: !pode(quem, 'contatos.ver'),
    log: !pode(quem, 'auditoria.ver')
  };
}

/**
 * O estado que quem pede recebe. Não altera o original.
 *   chefe     tudo (devolve o mesmo objeto).
 *   os outros sem dinheiro (cirurgias e avaliações) sem "Ver valores"; sem repasses sem "Ver o repasse";
 *             sem PIX, telefone e e-mail sem "Ver contatos"; sem o LOG sem "Ver a auditoria".
 * Perfil desconhecido recebe o corte mais fechado.
 */
function projetarEstadoParaPerfil(estado, quem) {
  if (ehChefe(quem)) return estado;
  var c = corteDe(quem);
  var saida = Object.assign({}, estado);
  if (c.log) saida.log = [];
  if (c.repasse) saida.repasses = [];
  if (c.dinheiro) {
    saida.cirurgias = (estado.cirurgias || []).map(function (x) { return semOsCampos(x, CAMPOS_FINANCEIROS.CIRURGIAS); });
    saida.avaliacoes = (estado.avaliacoes || []).map(function (x) { return semOsCampos(x, CAMPOS_FINANCEIROS.AVALIACOES_PRE); });
  }
  if (c.contatos) {
    saida.anestesistas = (estado.anestesistas || []).map(function (x) { return semOsCampos(x, CAMPOS_FINANCEIROS.ANESTESISTAS); });
  }
  return saida;
}

/** Quem pede não fica sabendo deste comando (nome e autor) no aviso ao vivo: repasse, para quem não o vê. */
function comandoOcultoPara(quem, nome) {
  return !ehChefe(quem) && PERMISSAO_DA_OPERACAO[nome] === 'repasse.gerir' && corteDe(quem).repasse;
}

/**
 * Um comando do diário, como quem pede pode recebê-lo para reexecutar na tela dele (as telas reexecutam o que
 * os outros gravaram):
 *   - o de repasse, para quem não vê o repasse, vira { oculto: true };
 *   - o reparo geral, para quem tem algum dado cortado, vira { oculto, recarregar };
 *   - os outros chegam sem os campos que quem pede não vê.
 * Não altera o original.
 */
function redigirComandoParaPerfil(entrada, quem) {
  if (ehChefe(quem)) return entrada;
  var c = corteDe(quem);
  if (comandoOcultoPara(quem, entrada.nome)) return { revisao: entrada.revisao, oculto: true };
  if (entrada.nome === 'reparar' && (c.dinheiro || c.repasse || c.contatos)) {
    return { revisao: entrada.revisao, oculto: true, recarregar: true };
  }
  var regra = ARGUMENTO_RESTRITO[entrada.nome];
  if (!regra || !Array.isArray(entrada.args)) return entrada;
  var corta = regra.aba === 'ANESTESISTAS' ? c.contatos : c.dinheiro;
  if (!corta) return entrada;
  var copia = Object.assign({}, entrada);
  copia.args = entrada.args.map(function (a, i) {
    return i === regra.arg && a && typeof a === 'object' ? semOsCampos(a, CAMPOS_FINANCEIROS[regra.aba]) : a;
  });
  return copia;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PERFIS: PERFIS,
    ORDEM_DOS_PERFIS: ORDEM_DOS_PERFIS,
    GRUPOS_DE_PERMISSAO: GRUPOS_DE_PERMISSAO,
    CUIDADOS_DE_PERMISSAO: CUIDADOS_DE_PERMISSAO,
    PERMISSOES: PERMISSOES,
    IDS_DE_PERMISSAO: IDS_DE_PERMISSAO,
    MODELOS_DE_PERMISSAO: MODELOS_DE_PERMISSAO,
    EXCLUSIVO_DO_CHEFE: EXCLUSIVO_DO_CHEFE,
    SO_CHEFE: SO_CHEFE,
    INTERNA: INTERNA,
    PERMISSAO_DA_TELA: PERMISSAO_DA_TELA,
    PERMISSAO_DA_OPERACAO: PERMISSAO_DA_OPERACAO,
    PERMISSAO_DA_ROTA: PERMISSAO_DA_ROTA,
    MUTACOES_SO_ADMIN: MUTACOES_SO_ADMIN,
    CAMPOS_FINANCEIROS: CAMPOS_FINANCEIROS,
    perfilCanonico: perfilCanonico,
    completarDependencias: completarDependencias,
    dependentesDe: dependentesDe,
    validarPermissoes: validarPermissoes,
    modeloDaLista: modeloDaLista,
    permissoesDe: permissoesDe,
    pode: pode,
    rotuloDoAcesso: rotuloDoAcesso,
    perfilPodeVerTela: perfilPodeVerTela,
    perfilVeFinanceiro: perfilVeFinanceiro,
    perfilEhCoordenacao: perfilEhCoordenacao,
    perfilPodeExecutar: perfilPodeExecutar,
    contextoDeAssinatura: contextoDeAssinatura,
    projetarEstadoParaPerfil: projetarEstadoParaPerfil,
    comandoOcultoPara: comandoOcultoPara,
    redigirComandoParaPerfil: redigirComandoParaPerfil
  };
}
