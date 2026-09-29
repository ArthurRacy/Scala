/**
 * ============================================================================
 * 10B_RETENCAO — Quanto tempo cada cópia de segurança fica guardada
 * ============================================================================
 * Regra única para o navegador (webapp/js/03d_guarda.js) e para o servidor
 * (server/armazem.js):
 *   - a cópia de cada dia, nos últimos 35 dias;
 *   - a primeira cópia de cada mês, por 24 meses;
 *   - marcos (a cópia tirada antes de apagar ou importar), por 400 dias.
 * Assim nada do que foi lançado some antes de um ano, nem apagado por engano.
 * ============================================================================
 */

var RETENCAO_COPIAS = {
  diasDiarios: 35,      // uma cópia por dia, nos últimos 35 dias
  mesesMensais: 24,     // a primeira cópia de cada mês, por 24 meses
  diasMarcos: 400,      // cópia de antes de apagar/importar
  diasPasta: 60         // arquivos diários na pasta de backup do navegador (os mensais ficam)
};

/**
 * Quais cópias sair (função pura). `copias`: [{ id, tipo: 'diaria'|outro,
 * dia: 'YYYY-MM-DD' }]; devolve os `id` que podem ser apagados em `diaHoje`.
 */
function copiasParaApagar(copias, diaHoje, regras) {
  regras = regras || RETENCAO_COPIAS;
  var limiteDiario = somarDias(diaHoje, -regras.diasDiarios);
  var limiteMarco = somarDias(diaHoje, -regras.diasMarcos);
  var m = mesDaData(diaHoje);
  var mesLimite = somarMeses(m.ano, m.mes, -regras.mesesMensais);

  var primeiraDoMes = {};
  copias.filter(function (c) { return c.tipo === 'diaria'; })
    .forEach(function (c) {
      var k = String(c.dia).slice(0, 7);
      if (!primeiraDoMes[k] || c.dia < primeiraDoMes[k]) primeiraDoMes[k] = c.dia;
    });

  return copias.filter(function (c) {
    if (c.tipo !== 'diaria') return c.dia < limiteMarco;
    if (c.dia >= limiteDiario) return false;
    var mes = mesDaData(c.dia);
    var ehPrimeira = primeiraDoMes[String(c.dia).slice(0, 7)] === c.dia;
    return !(ehPrimeira && compararMeses(mes, mesLimite) > 0);
  }).map(function (c) { return c.id; });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RETENCAO_COPIAS: RETENCAO_COPIAS,
    copiasParaApagar: copiasParaApagar
  };
}
