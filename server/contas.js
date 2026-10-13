/**
 * ============================================================================
 * CONTAS — Usuários, senhas e sessões do modo servidor
 * ============================================================================
 *   <dados>/usuarios.json   { login, nome, papel, permissoes, principal, ativo, sal, hash, criadoEm,
 *                             anestesistaId, permissoesAlteradasEm, permissoesAlteradasPor }
 *   <dados>/sessoes.json    sessões ativas, pelo SHA-256 do token (quem lê o
 *                           arquivo não consegue entrar com ele)
 *
 * Senha: scrypt (Node, sem biblioteca), sal próprio por usuário, comparação
 * em tempo constante. Sessão: token aleatório de 256 bits em cookie
 * HttpOnly + SameSite=Strict; cai após 12 h sem uso ou 7 dias no total.
 * Tentativas: 5 senhas erradas em 15 min travam aquele login (e aquele
 * endereço) por 15 min.
 *
 * Perfis (core/12b_permissoes.js): 'chefe' (Anestesista chefe, poder total),
 * 'anestesista' (painel de operação e de qualidade, sem dinheiro) e 'secretaria'
 * (operação e gestão, sem painel de qualidade nem administração). Os nomes
 * antigos continuam entendidos: 'admin' vira 'chefe' e 'equipe' vira 'anestesista'
 * (o arquivo é regravado com os nomes novos na primeira partida).
 *
 * Permissões (docs/PERMISSOES.md): quem não é chefe guarda a LISTA COMPLETA do
 * que pode (`permissoes`), escolhida pelo chefe a partir de um modelo. Conta
 * antiga, sem lista, ganha a do modelo do seu perfil na primeira partida (o
 * acesso não muda), com uma cópia do arquivo antes (usuarios.antes-das-permissoes.json).
 *
 * Chefe principal: entre os chefes, exatamente um é o principal. Só ele cria
 * outro chefe, promove, rebaixa, desativa ou altera a conta de outro chefe, e
 * passa a função de principal a outro chefe ativo. Ele mesmo não pode ser
 * desativado nem rebaixado: passa a função antes. Os outros chefes fazem todo o
 * resto (inclusive cadastrar usuários e decidir permissões). As regras valem
 * quando há `ator` (a tela Usuários); a linha de comando do servidor
 * (tools/redefinir_senha.js) não passa ator.
 *
 * Primeiro acesso: sem nenhum usuário, o servidor cria um código de uso
 * único (mostrado na janela do servidor e gravado em PRIMEIRO_ACESSO.txt);
 * quem tem o código cria o administrador pela própria tela de entrada.
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var core = require('../core');

var PAPEIS = core.ORDEM_DOS_PERFIS;
var LOGIN = /^[a-z0-9._-]{3,30}$/;
var OCIOSA_MS = 12 * 3600 * 1000;
var MAXIMA_MS = 7 * 24 * 3600 * 1000;
var TENTATIVAS = 5;
var JANELA_MS = 15 * 60 * 1000;

/**
 * `opcoes.custo`: custo do scrypt (N). O padrão (16384) é o de produção. Os testes que sobem
 * dezenas de servidores passam um custo menor só para não gastar minutos em hash de senha; nada
 * em produção passa isto.
 */
function criarContas(pasta, opcoes) {
  var custo = opcoes && opcoes.custo ? opcoes.custo : 16384;
  var arqUsuarios = path.join(pasta, 'usuarios.json');
  var arqSessoes = path.join(pasta, 'sessoes.json');
  var arqCodigo = path.join(pasta, 'PRIMEIRO_ACESSO.txt');

  function ler(arquivo, padrao) {
    try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) { return padrao; }
  }
  function gravar(arquivo, obj) {
    var tmp = arquivo + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
    fs.renameSync(tmp, arquivo);
  }

  var usuarios = ler(arqUsuarios, []);
  if (!Array.isArray(usuarios)) usuarios = [];
  // Perfis antigos ("admin", "equipe") e valores estranhos viram perfis de hoje. O que não se
  // reconhece vira o perfil que menos vê (anestesista): nunca um perfil mais aberto.
  var migrou = false;
  var antesDasPermissoes = JSON.stringify(usuarios, null, 1);
  var ganhouLista = false;
  usuarios.forEach(function (u) {
    var canonico = core.perfilCanonico(u.papel) || 'anestesista';
    if (u.papel !== canonico) { u.papel = canonico; migrou = true; }
    // Conta sem lista de permissões: a do modelo do perfil (o mesmo acesso de antes), escrita por extenso.
    if (canonico !== 'chefe' && !Array.isArray(u.permissoes)) {
      u.permissoes = core.permissoesDe(canonico);
      migrou = true;
      ganhouLista = true;
    }
    if (canonico === 'chefe' && u.permissoes !== undefined) { delete u.permissoes; migrou = true; }
  });
  // Sempre um chefe principal (o primeiro chefe ativo, se ninguém estiver marcado), e só um.
  var principais = usuarios.filter(function (u) { return u.papel === 'chefe' && u.ativo !== false && u.principal === true; });
  usuarios.forEach(function (u) {
    var deve = principais.length ? u === principais[0] : false;
    if (!!u.principal !== deve) { if (deve) u.principal = true; else delete u.principal; migrou = true; }
  });
  if (!principais.length) {
    var primeiroChefe = usuarios.filter(function (u) { return u.papel === 'chefe' && u.ativo !== false; })[0];
    if (primeiroChefe) { primeiroChefe.principal = true; migrou = true; }
  }
  if (ganhouLista) {
    var arqAntes = path.join(pasta, 'usuarios.antes-das-permissoes.json');
    if (!fs.existsSync(arqAntes)) fs.writeFileSync(arqAntes, antesDasPermissoes);
  }
  if (migrou) gravar(arqUsuarios, usuarios);
  var sessoes = ler(arqSessoes, {});
  if (!sessoes || typeof sessoes !== 'object') sessoes = {};
  var tentativas = {};    // chave -> { falhas, desde, travadoAte }
  var codigo = null;

  function hash(senha, sal) {
    return crypto.scryptSync(String(senha), sal, 64, { N: custo, r: 8, p: 1 }).toString('hex');
  }
  function sha(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
  /** O que sai da conta para a tela e para as regras: `permissoes` é a lista que vale (todas, para o chefe). */
  function publico(u) {
    if (!u) return null;
    var papel = core.perfilCanonico(u.papel) || 'anestesista';
    return { login: u.login, nome: u.nome, papel: papel, ativo: u.ativo !== false,
      anestesistaId: String(u.anestesistaId || ''), principal: papel === 'chefe' && u.principal === true,
      permissoes: core.permissoesDe({ papel: papel, permissoes: u.permissoes }),
      permissoesAlteradasEm: u.permissoesAlteradasEm || '', permissoesAlteradasPor: u.permissoesAlteradasPor || '' };
  }
  function porLogin(login) {
    var l = String(login || '').trim().toLowerCase();
    return usuarios.filter(function (u) { return u.login === l; })[0] || null;
  }

  var gravarSessoesAgendado = null;
  function salvarSessoes(agora) {
    if (agora) { clearTimeout(gravarSessoesAgendado); gravarSessoesAgendado = null; gravar(arqSessoes, sessoes); return; }
    if (gravarSessoesAgendado) return;
    gravarSessoesAgendado = setTimeout(function () { gravarSessoesAgendado = null; gravar(arqSessoes, sessoes); }, 5000);
    if (gravarSessoesAgendado.unref) gravarSessoesAgendado.unref();
  }

  /* ------------------------------------------------------ primeiro acesso */

  /** Código de uso único enquanto não houver usuário. null quando já há. */
  function codigoPrimeiroAcesso() {
    if (usuarios.length) return null;
    if (!codigo) {
      codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
      fs.writeFileSync(arqCodigo, 'Código para criar o administrador (uso único): ' + codigo + '\n');
    }
    return codigo;
  }

  /* --------------------------------------------------------- validações */

  function validar(dados, novo) {
    var erros = [];
    if (novo && !LOGIN.test(String(dados.login || ''))) {
      erros.push({ campo: 'login', msg: 'Login: 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado.' });
    }
    if (dados.nome !== undefined && (String(dados.nome).trim().length < 2 || String(dados.nome).trim().length > 80)) {
      erros.push({ campo: 'nome', msg: 'Nome: de 2 a 80 letras.' });
    }
    if (dados.papel !== undefined && !core.perfilCanonico(dados.papel)) erros.push({ campo: 'papel', msg: 'Perfil de acesso inválido.' });
    if (dados.permissoes !== undefined) erros = erros.concat(core.validarPermissoes(dados.permissoes).erros);
    if (dados.senha !== undefined) {
      var s = String(dados.senha);
      if (s.length < 8) erros.push({ campo: 'senha', msg: 'A senha precisa de pelo menos 8 caracteres.' });
      else if (s.length > 200) erros.push({ campo: 'senha', msg: 'Senha longa demais.' });
    }
    return erros;
  }

  /* ----------------------------------------------------------- usuários */

  /** O ator é o chefe principal? Sem ator (a linha de comando do próprio servidor) não há regra de ator. */
  function atorPrincipal(ator) {
    if (!ator) return true;
    var a = porLogin(ator.login);
    return !!(a && a.papel === 'chefe' && a.ativo !== false && a.principal === true);
  }

  var SO_PRINCIPAL = 'Só o Anestesista chefe principal cria, altera ou rebaixa outro Anestesista chefe.';

  function diferenca(antes, depois) {
    return {
      entraram: depois.filter(function (p) { return antes.indexOf(p) < 0; }),
      sairam: antes.filter(function (p) { return depois.indexOf(p) < 0; })
    };
  }

  /** Cria um usuário. Chefe novo só pelo chefe principal (o primeiro usuário, no primeiro acesso, já nasce principal). */
  function criarUsuario(dados, ator) {
    var d = { login: String(dados.login || '').trim().toLowerCase(), nome: String(dados.nome || '').trim(),
      papel: dados.papel || 'anestesista', senha: dados.senha };
    if (dados.permissoes !== undefined) d.permissoes = dados.permissoes;
    var erros = validar(d, true);
    if (porLogin(d.login)) erros.push({ campo: 'login', msg: 'Já existe um usuário "' + d.login + '".' });
    var papel = core.perfilCanonico(d.papel);
    if (papel === 'chefe' && usuarios.length && !atorPrincipal(ator)) erros.push({ campo: 'papel', msg: SO_PRINCIPAL });
    if (erros.length) return { ok: false, erros: erros };
    var sal = crypto.randomBytes(16).toString('hex');
    var agora = new Date().toISOString();
    var u = { login: d.login, nome: d.nome, papel: papel, ativo: true, sal: sal, hash: hash(d.senha, sal),
      criadoEm: agora, anestesistaId: String(dados.anestesistaId || '').trim() };
    if (papel === 'chefe') {
      if (!usuarios.some(function (x) { return x.papel === 'chefe' && x.ativo !== false && x.principal === true; })) u.principal = true;
    } else {
      u.permissoes = d.permissoes !== undefined ? core.validarPermissoes(d.permissoes).lista : core.permissoesDe(papel);
      u.permissoesAlteradasEm = agora;
      u.permissoesAlteradasPor = ator ? String(ator.login || '') : '';
    }
    usuarios.push(u);
    gravar(arqUsuarios, usuarios);
    if (codigo) { codigo = null; try { fs.unlinkSync(arqCodigo); } catch (e) { /* ok */ } }
    var pub = publico(u);
    return { ok: true, usuario: pub, entraram: pub.permissoes, sairam: [] };
  }

  function chefesAtivos() { return usuarios.filter(function (u) { return u.papel === 'chefe' && u.ativo !== false; }); }

  /**
   * Muda nome, perfil (modelo), permissões, ativo, vínculo ou define senha nova (pelo Anestesista chefe).
   * Mudar o perfil sem mandar a lista aplica o modelo do perfil novo. Devolve também o que entrou e o que saiu.
   */
  function alterarUsuario(login, dados, ator) {
    var u = porLogin(login);
    if (!u) return { ok: false, erros: [{ campo: 'login', msg: 'Usuário não encontrado.' }] };
    var d = {};
    ['nome', 'papel', 'senha'].forEach(function (k) { if (dados[k] !== undefined && dados[k] !== '') d[k] = dados[k]; });
    if (dados.permissoes !== undefined) d.permissoes = dados.permissoes;
    var erros = validar(d, false);
    var papelNovo = core.perfilCanonico(d.papel) || u.papel;
    var ativoNovo = dados.ativo === undefined ? u.ativo !== false : !!dados.ativo;
    if ((u.papel === 'chefe' || papelNovo === 'chefe') && !atorPrincipal(ator)) {
      erros.push({ campo: 'papel', msg: SO_PRINCIPAL });
    }
    if (u.principal === true && (papelNovo !== 'chefe' || !ativoNovo)) {
      erros.push({ campo: 'papel', msg: 'Este é o Anestesista chefe principal: passe a função a outro chefe antes de tirá-lo.' });
    }
    var ficaChefeAtivo = papelNovo === 'chefe' && ativoNovo;
    if (u.papel === 'chefe' && u.ativo !== false && !ficaChefeAtivo && chefesAtivos().length <= 1) {
      erros.push({ campo: 'papel', msg: 'Este é o único Anestesista chefe ativo: crie outro antes de tirá-lo.' });
    }
    if (erros.length) return { ok: false, erros: erros };
    var antes = publico(u).permissoes;
    var papelAntes = u.papel;
    if (d.nome) u.nome = String(d.nome).trim();
    u.papel = papelNovo;
    if (dados.ativo !== undefined) u.ativo = !!dados.ativo;
    if (dados.anestesistaId !== undefined) u.anestesistaId = String(dados.anestesistaId || '').trim();
    if (d.senha) { u.sal = crypto.randomBytes(16).toString('hex'); u.hash = hash(d.senha, u.sal); }
    if (papelNovo === 'chefe') delete u.permissoes;
    else {
      delete u.principal;
      if (d.permissoes !== undefined) u.permissoes = core.validarPermissoes(d.permissoes).lista;
      else if (papelNovo !== papelAntes || !Array.isArray(u.permissoes)) u.permissoes = core.permissoesDe(papelNovo);
    }
    var mud = diferenca(antes, publico(u).permissoes);
    var mudouAcesso = mud.entraram.length > 0 || mud.sairam.length > 0 || papelNovo !== papelAntes;
    if (mudouAcesso) {
      u.permissoesAlteradasEm = new Date().toISOString();
      u.permissoesAlteradasPor = ator ? String(ator.login || '') : 'servidor';
    }
    gravar(arqUsuarios, usuarios);
    // Senha trocada, acesso cortado ou permissões mudadas: as sessões abertas caem (a pessoa entra de novo e
    // recebe os dados do acesso novo; quem perdeu acesso não fica com a tela antiga viva).
    if (d.senha || u.ativo === false || mudouAcesso) encerrarSessoesDe(u.login);
    return { ok: true, usuario: publico(u), entraram: mud.entraram, sairam: mud.sairam, mudouAcesso: mudouAcesso };
  }

  /** O chefe principal passa a função a outro chefe ativo (e continua chefe). */
  function transferirPrincipal(paraLogin, ator) {
    if (!atorPrincipal(ator)) return { ok: false, erros: [{ campo: 'principal', msg: 'Só o Anestesista chefe principal passa a função.' }] };
    var alvo = porLogin(paraLogin);
    if (!alvo || alvo.papel !== 'chefe' || alvo.ativo === false) {
      return { ok: false, erros: [{ campo: 'principal', msg: 'A função de principal só passa para outro Anestesista chefe ativo.' }] };
    }
    if (alvo.principal === true) return { ok: false, erros: [{ campo: 'principal', msg: 'Este já é o Anestesista chefe principal.' }] };
    usuarios.forEach(function (x) { delete x.principal; });
    alvo.principal = true;
    gravar(arqUsuarios, usuarios);
    return { ok: true, usuario: publico(alvo) };
  }

  /** A própria pessoa troca a senha, confirmando a atual. */
  function trocarSenha(login, atual, nova) {
    var u = porLogin(login);
    // Quem tem uma sessão aberta (esquecida, roubada) não pode descobrir a senha
    // atual por tentativa e erro: mesma trava do login, por usuário.
    var chave = 's:' + (u ? u.login : String(login || '').trim().toLowerCase());
    if (travado(chave)) {
      return { ok: false, travado: true, erros: [{ campo: 'atual', msg: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' }] };
    }
    if (!u || !confere(u, atual)) {
      falhou(chave);
      return { ok: false, erros: [{ campo: 'atual', msg: 'A senha atual não confere.' }] };
    }
    delete tentativas[chave];
    var erros = validar({ senha: nova }, false);
    if (erros.length) return { ok: false, erros: erros };
    u.sal = crypto.randomBytes(16).toString('hex');
    u.hash = hash(nova, u.sal);
    gravar(arqUsuarios, usuarios);
    return { ok: true };
  }

  function listar() { return usuarios.map(publico); }
  function usuario(login) { return publico(porLogin(login)); }

  /* --------------------------------------------------------- tentativas */

  function travado(chave) {
    var t = tentativas[chave];
    return !!(t && t.travadoAte && t.travadoAte > Date.now());
  }
  function falhou(chave) {
    var agora = Date.now();
    var t = tentativas[chave];
    if (!t || agora - t.desde > JANELA_MS) t = tentativas[chave] = { falhas: 0, desde: agora, travadoAte: 0 };
    t.falhas++;
    if (t.falhas >= TENTATIVAS) t.travadoAte = agora + JANELA_MS;
  }

  function confere(u, senha) {
    var a = Buffer.from(hash(senha, u.sal), 'hex');
    var b = Buffer.from(u.hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Confere login e senha. Devolve { ok, usuario } ou { ok:false, travado }.
   * `ip` entra na trava para ninguém travar o login alheio de outro lugar
   * sem também travar a si mesmo.
   */
  function entrar(login, senha, ip) {
    var l = String(login || '').trim().toLowerCase();
    var chaves = ['l:' + l, 'i:' + ip];
    if (chaves.some(travado)) return { ok: false, travado: true };
    var u = porLogin(l);
    // Mesmo sem usuário, calcula um hash: o tempo de resposta não revela quem existe.
    var bate = u ? confere(u, senha) : (hash(senha, 'x'), false);
    if (!bate || u.ativo === false) { chaves.forEach(falhou); return { ok: false }; }
    chaves.forEach(function (k) { delete tentativas[k]; });
    return { ok: true, usuario: publico(u) };
  }

  /* ----------------------------------------------------------- sessões */

  function iniciarSessao(login) {
    var token = crypto.randomBytes(32).toString('base64url');
    var agora = Date.now();
    sessoes[sha(token)] = { login: String(login), criadaEm: agora, usadaEm: agora };
    salvarSessoes(true);
    return token;
  }

  /** Usuário da sessão (e renova o uso), ou null. */
  function sessao(token) {
    if (!token) return null;
    var k = sha(token);
    var s = sessoes[k];
    if (!s) return null;
    var agora = Date.now();
    var u = porLogin(s.login);
    if (!u || u.ativo === false || agora - s.usadaEm > OCIOSA_MS || agora - s.criadaEm > MAXIMA_MS) {
      delete sessoes[k];
      salvarSessoes();
      return null;
    }
    if (agora - s.usadaEm > 60000) { s.usadaEm = agora; salvarSessoes(); }
    return publico(u);
  }

  function encerrarSessao(token) {
    if (!token) return;
    delete sessoes[sha(token)];
    salvarSessoes(true);
  }

  /** Derruba as sessões de um usuário. `manter` (token) poupa a sessão de quem acabou de trocar a senha. */
  function encerrarSessoesDe(login, manter) {
    var poupar = manter ? sha(manter) : null;
    Object.keys(sessoes).forEach(function (k) { if (sessoes[k].login === login && k !== poupar) delete sessoes[k]; });
    salvarSessoes(true);
  }

  return {
    PAPEIS: PAPEIS,
    codigoPrimeiroAcesso: codigoPrimeiroAcesso,
    temUsuarios: function () { return usuarios.length > 0; },
    criarUsuario: criarUsuario,
    alterarUsuario: alterarUsuario,
    transferirPrincipal: transferirPrincipal,
    trocarSenha: trocarSenha,
    listar: listar,
    usuario: usuario,
    entrar: entrar,
    iniciarSessao: iniciarSessao,
    sessao: sessao,
    encerrarSessao: encerrarSessao,
    encerrarSessoesDe: encerrarSessoesDe,
    gravarSessoes: function () { salvarSessoes(true); }
  };
}

module.exports = { criarContas: criarContas };
