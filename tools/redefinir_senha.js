#!/usr/bin/env node
/**
 * Redefine a senha de um usuário do servidor da clínica — o caminho de quem perdeu a senha do Anestesista chefe.
 *
 *     node tools/redefinir_senha.js <pasta dos dados> <login>
 *     node tools/redefinir_senha.js D:\anestesia admin
 *
 * Roda com o servidor FECHADO (pega a mesma trava do servidor: se ele estiver aberto, recusa). Gera uma senha temporária
 * de 12 caracteres, grava e mostra uma única vez. A pessoa entra com ela e troca em seguida (menu do usuário → Trocar
 * senha). As sessões abertas dessa pessoa são encerradas e o fato fica registrado em logs/acessos.jsonl.
 * Só quem tem acesso à pasta de dados do servidor consegue fazer isto: é o mesmo poder de quem pode copiar o backup.
 */
'use strict';

var path = require('path');
var crypto = require('crypto');

var core = require('../core');
var criarContas = require('../server/contas').criarContas;
var criarAuditoria = require('../server/auditoria').criarAuditoria;
var pegarTrava = require('../server/servidor').pegarTrava;

// Sem 0/O, 1/l/I: a senha é lida de uma tela e digitada à mão.
var ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function senhaTemporaria() {
  var s = '';
  for (var i = 0; i < 12; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return s;
}

function principal(argv) {
  var pasta = argv[0], login = String(argv[1] || '').trim().toLowerCase();
  if (!pasta || !login) {
    console.error('Uso: node tools/redefinir_senha.js <pasta dos dados> <login>');
    return 2;
  }
  pasta = path.resolve(pasta);
  var soltar;
  try { soltar = pegarTrava(pasta); } catch (e) { console.error(e.message); return 1; }
  try {
    var contas = criarContas(pasta);
    if (!contas.usuario(login)) {
      console.error('Não existe o usuário "' + login + '" nesta pasta. Usuários: ' + contas.listar().map(function (u) { return u.login; }).join(', ') + '.');
      return 1;
    }
    var senha = senhaTemporaria();
    var r = contas.alterarUsuario(login, { senha: senha });
    if (!r.ok) { console.error('Não foi possível: ' + r.erros.map(function (e) { return e.msg; }).join(' ')); return 1; }
    contas.gravarSessoes();
    criarAuditoria(pasta, core).registrar({ login: 'sistema', nome: 'Servidor (linha de comando)', papel: 'sistema',
      evento: 'senha_redefinida_no_servidor', detalhe: 'usuário ' + login });
    console.log('Senha de "' + login + '" redefinida.');
    console.log('Nova senha temporária: ' + senha);
    console.log('Entre com ela e troque em seguida (menu do usuário → Trocar senha). As sessões abertas dessa pessoa foram encerradas.');
    return 0;
  } finally {
    soltar();
  }
}

if (require.main === module) process.exit(principal(process.argv.slice(2)));
module.exports = { principal: principal, senhaTemporaria: senhaTemporaria };
