/**
 * ============================================================================
 * 12B_PERMISSOES — Quem vê e quem faz o quê (três perfis de acesso)
 * ============================================================================
 * Os perfis do sistema da clínica (modo servidor, com login):
 *
 *   chefe        Anestesista chefe. Poder total sobre a plataforma.
 *   anestesista  Anestesista. Todo o painel de operação (escala, quadro do dia,
 *                cirurgias, avaliações pré, boletim e ficha de qualidade) mais o
 *                painel de qualidade. NUNCA vê dinheiro (valor, pago, data do
 *                pagamento, nota fiscal, repasse) nem a chave PIX, o telefone e o
 *                e-mail dos colegas.
 *   secretaria   Secretária. Operação e gestão (horas, financeiro, repasse,
 *                indicadores, cadastro e dados da clínica), sem o painel de
 *                qualidade e sem estrutura; vê e imprime o boletim mas não cria,
 *                não edita e não assina; sem as telas de administração.
 *
 * A TABELA MORA AQUI, no core, para três leitores usarem a MESMA regra: o
 * servidor (quem decide e quem corta os dados), a tela (que só esconde o que a
 * pessoa não pode usar) e os testes (que conferem). Esconder um botão nunca é
 * a proteção: quem protege é o servidor.
 *
 * REGRA DE OURO: operação do store que não esteja classificada em
 * GRUPO_DA_MUTACAO é recusada para todo perfil que não seja o chefe. Uma
 * operação nova esquecida aqui nasce fechada, não aberta (teste em qa/25).
 *
 * Computador único não tem login: ali quem usa é o chefe. A versão online de
 * demonstração tem uma conta por perfil (webapp/js/demo_online.js) e confere
 * as operações por esta mesma tabela, só no navegador.
 * ============================================================================
 */

var PERFIS = {
  chefe: {
    id: 'chefe', rotulo: 'Anestesista chefe',
    resumo: 'Poder total sobre a plataforma: usuários, cadastro, financeiro, qualidade, auditoria e backup.'
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

/* ------------------------------------------------------------------ telas -- */

var TELAS_DE_OPERACAO = ['painel', 'escala', 'quadro', 'cirurgias', 'avaliacoes', 'boletim', 'qualidade'];

var TELAS_DO_PERFIL = {
  chefe: ['painel', 'escala', 'quadro', 'cirurgias', 'avaliacoes', 'boletim', 'qualidade',
    'horas', 'financeiro', 'repasse', 'indicadores', 'painel_qualidade', 'estrutura',
    'anestesistas', 'clinica', 'integridade', 'log', 'usuarios', 'dados'],
  anestesista: TELAS_DE_OPERACAO.concat(['painel_qualidade']),
  secretaria: TELAS_DE_OPERACAO.concat(['horas', 'financeiro', 'repasse', 'indicadores', 'anestesistas', 'clinica'])
};

/** O perfil abre esta tela? (Perfil desconhecido não abre nenhuma.) */
function perfilPodeVerTela(perfil, tela) {
  var p = perfilCanonico(perfil);
  return !!p && TELAS_DO_PERFIL[p].indexOf(tela) >= 0;
}

/** Vê dinheiro (valores, pagamentos, nota fiscal, repasse) e dados de contato dos colegas. */
function perfilVeFinanceiro(perfil) {
  var p = perfilCanonico(perfil);
  return p === 'chefe' || p === 'secretaria';
}

/** Coordenação: configura as definições clínicas e compara profissionais entre si. */
function perfilEhCoordenacao(perfil) {
  return perfilCanonico(perfil) === 'chefe';
}

/* -------------------------------------------------------------- operações -- */

/**
 * Grupo de cada operação do store que muda dados. Os grupos definem quem faz
 * (PERFIS_DO_GRUPO). Operação fora desta lista é negada a quem não é chefe.
 */
var GRUPO_DA_MUTACAO = {
  adicionarCirurgia: 'operacao', atualizarCirurgia: 'operacao', removerCirurgia: 'operacao',
  atualizarAvaliacao: 'operacao', ajustarEscala: 'operacao', aplicarRemanejamento: 'operacao',

  salvarAnestesista: 'cadastro', definirEscalaBase: 'cadastro', definirModoEscalaBase: 'cadastro',
  salvarConfigClinica: 'cadastro',

  salvarDespesasRepasse: 'financeiro', registrarPagamentoRepasse: 'financeiro',
  removerPagamentoRepasse: 'financeiro', atualizarParticipantesRepasse: 'financeiro',

  criarBoletim: 'boletim', salvarBoletim: 'boletim', alterarLinhaBoletim: 'boletim',
  finalizarBoletim: 'boletim', reabrirBoletim: 'boletim', descartarBoletim: 'boletim',

  criarFichaQualidade: 'qualidade', salvarFichaQualidade: 'qualidade', preencherFichaDoBoletim: 'qualidade',
  alterarEventoQualidade: 'qualidade', registrarSeguimentoQualidade: 'qualidade',
  revisarFichaQualidade: 'qualidade', concluirFichaQualidade: 'qualidade',
  reabrirFichaQualidade: 'qualidade', descartarFichaQualidade: 'qualidade',

  salvarRegistroEstrutura: 'coordenacao', removerRegistroEstrutura: 'coordenacao', salvarConfigQualidade: 'coordenacao',

  reparar: 'sistema', salvarConfigLog: 'sistema',

  // Só o próprio servidor aplica (rotação mensal do LOG): nenhum perfil manda isto pela rede.
  arquivarLogAte: 'interna'
};

var PERFIS_DO_GRUPO = {
  operacao: ['chefe', 'anestesista', 'secretaria'],
  cadastro: ['chefe', 'secretaria'],
  financeiro: ['chefe', 'secretaria'],
  boletim: ['chefe', 'anestesista'],
  qualidade: ['chefe', 'anestesista', 'secretaria'],
  coordenacao: ['chefe'],
  sistema: ['chefe'],
  interna: []
};

/**
 * O que só o Anestesista chefe faz (estrutura, definições clínicas e reparo geral). Sai da tabela
 * acima: não existe uma segunda lista para esquecer de atualizar.
 */
var MUTACOES_SO_ADMIN = Object.keys(GRUPO_DA_MUTACAO).filter(function (nome) {
  var quem = PERFIS_DO_GRUPO[GRUPO_DA_MUTACAO[nome]];
  return quem.length === 1 && quem[0] === 'chefe';
});

/**
 * Campos que o anestesista não pode enviar (nem receber): dinheiro das cirurgias
 * e das avaliações, e os dados de contato e a chave PIX do cadastro.
 */
var CAMPOS_FINANCEIROS = {
  CIRURGIAS: ['valor', 'pago', 'dataPagamento', 'nf'],
  AVALIACOES_PRE: ['valor', 'pago', 'dataPagamento', 'nf'],
  ANESTESISTAS: ['pix', 'telefone', 'email']
};

/** Em qual argumento de cada operação vêm os campos restritos, e de que aba. */
var ARGUMENTO_RESTRITO = {
  adicionarCirurgia: { arg: 0, aba: 'CIRURGIAS' },
  atualizarCirurgia: { arg: 1, aba: 'CIRURGIAS' },
  atualizarAvaliacao: { arg: 1, aba: 'AVALIACOES_PRE' },
  salvarAnestesista: { arg: 0, aba: 'ANESTESISTAS' }
};

function camposRestritosEnviados(nome, args) {
  var regra = ARGUMENTO_RESTRITO[nome];
  var alvo = regra && Array.isArray(args) ? args[regra.arg] : null;
  if (!regra || !alvo || typeof alvo !== 'object') return [];
  return CAMPOS_FINANCEIROS[regra.aba].filter(function (c) {
    return Object.prototype.hasOwnProperty.call(alvo, c);
  });
}

/**
 * Quem assina o boletim é quem entrou no sistema: cada login de anestesista ou de chefe é ligado a um anestesista
 * do cadastro, e o boletim sai no nome e no CRM dele. Devolve { anestesista: { id, nome, crm } | null }.
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

/**
 * O perfil pode mandar esta operação com estes argumentos?
 * `contexto` (só no modo servidor) vem de contextoDeAssinatura: sem ele (um computador só, sem login) a assinatura é livre.
 * Devolve { ok: true } ou { ok: false, motivo: 'perfil'|'campo'|'interna'|'vinculo', erro }.
 */
function perfilPodeExecutar(perfil, nome, args, contexto) {
  var p = perfilCanonico(perfil);
  var grupo = GRUPO_DA_MUTACAO[nome];
  if (grupo === 'interna') {
    return { ok: false, motivo: 'interna', erro: 'Esta operação é só do próprio servidor.' };
  }
  if (!p) return { ok: false, motivo: 'perfil', erro: 'Seu perfil de acesso não existe mais. Fale com o administrador.' };
  var permitidos = grupo ? PERFIS_DO_GRUPO[grupo] : ['chefe'];
  if (permitidos.indexOf(p) < 0) {
    return { ok: false, motivo: 'perfil', erro: 'O seu perfil (' + PERFIS[p].rotulo + ') não faz esta operação.' };
  }
  if (!perfilVeFinanceiro(p)) {
    var proibidos = camposRestritosEnviados(nome, args);
    if (proibidos.length) {
      return { ok: false, motivo: 'campo', erro: 'O seu perfil (' + PERFIS[p].rotulo + ') não altera dados financeiros nem de contato (' +
        proibidos.join(', ') + ').' };
    }
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

/**
 * O estado que este perfil recebe. Não altera o original.
 *   chefe        tudo (devolve o mesmo objeto).
 *   secretaria   tudo, menos o LOG de auditoria.
 *   anestesista  sem dinheiro (cirurgias e avaliações), sem repasses, sem PIX,
 *                telefone e e-mail do cadastro, e sem o LOG.
 */
function projetarEstadoParaPerfil(estado, perfil) {
  var p = perfilCanonico(perfil) || 'anestesista';
  if (p === 'chefe') return estado;
  var saida = Object.assign({}, estado);
  saida.log = [];
  if (p === 'secretaria') return saida;
  saida.repasses = [];
  saida.cirurgias = (estado.cirurgias || []).map(function (c) { return semOsCampos(c, CAMPOS_FINANCEIROS.CIRURGIAS); });
  saida.avaliacoes = (estado.avaliacoes || []).map(function (a) { return semOsCampos(a, CAMPOS_FINANCEIROS.AVALIACOES_PRE); });
  saida.anestesistas = (estado.anestesistas || []).map(function (a) { return semOsCampos(a, CAMPOS_FINANCEIROS.ANESTESISTAS); });
  return saida;
}

/**
 * Um comando do diário, como este perfil pode recebê-lo para reexecutar na tela
 * dele (as telas reexecutam o que os outros gravaram). Quem não vê dinheiro:
 *   - não recebe os comandos de repasse (viram { oculto: true });
 *   - recebe os outros sem os campos restritos;
 *   - recarrega os dados quando o comando é um reparo geral.
 * Não altera o original.
 */
function redigirComandoParaPerfil(entrada, perfil) {
  var p = perfilCanonico(perfil) || 'anestesista';
  if (p === 'chefe' || p === 'secretaria') return entrada;
  var grupo = GRUPO_DA_MUTACAO[entrada.nome];
  if (grupo === 'financeiro') return { revisao: entrada.revisao, oculto: true };
  if (entrada.nome === 'reparar') return { revisao: entrada.revisao, oculto: true, recarregar: true };
  var regra = ARGUMENTO_RESTRITO[entrada.nome];
  if (!regra || !Array.isArray(entrada.args)) return entrada;
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
    TELAS_DO_PERFIL: TELAS_DO_PERFIL,
    GRUPO_DA_MUTACAO: GRUPO_DA_MUTACAO,
    PERFIS_DO_GRUPO: PERFIS_DO_GRUPO,
    MUTACOES_SO_ADMIN: MUTACOES_SO_ADMIN,
    CAMPOS_FINANCEIROS: CAMPOS_FINANCEIROS,
    perfilCanonico: perfilCanonico,
    perfilPodeVerTela: perfilPodeVerTela,
    perfilVeFinanceiro: perfilVeFinanceiro,
    perfilEhCoordenacao: perfilEhCoordenacao,
    perfilPodeExecutar: perfilPodeExecutar,
    contextoDeAssinatura: contextoDeAssinatura,
    projetarEstadoParaPerfil: projetarEstadoParaPerfil,
    redigirComandoParaPerfil: redigirComandoParaPerfil
  };
}
