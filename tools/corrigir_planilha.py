#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
============================================================================
corrigir_planilha.py — Aplica na planilha .xlsx as correcoes encontradas
============================================================================
Para quem vai continuar usando a planilha em paralelo ao sistema. Faz tres
coisas, todas conferidas antes de gravar:

1. TASK-201  Cria a lista suspensa na coluna ANESTESISTA da aba CIRURGIAS,
             restrita aos nomes da aba ANESTESISTAS. Hoje essa coluna aceita
             digitacao livre, e um nome digitado errado quebra os SUMIFS
             (que casam por texto exato) sem dar nenhum aviso.

2. TASK-303  Cria a lista suspensa na coluna ANESTESISTA DA AVALIACAO da aba
             AVALIACOES PRE, pelo mesmo motivo.

3. Corrige   Dois erros de formula na aba INDICADORES:

             B14  VALOR PENDENTE EM ANESTESIAS     =B11-B12  ->  =B12-B13
                  B11 e "NUMERO DE AVALIACOES" (contagem) e B12 e o VALOR
                  TOTAL. A conta subtraia dinheiro de quantidade.

             B18  TOTAL RECEBIDO                   =B12+B16  ->  =B13+B16
                  B12 e o TOTAL de anestesias, nao o RECEBIDO. O numero
                  exibido ficava inflado pelo que ainda nao entrou em caixa.

             A tabela comparativa (linhas 24+) ja estava correta e confirma
             qual era a intencao original.

O arquivo ORIGINAL nunca e sobrescrito: a saida vai para um arquivo novo.

Uso:
    python tools/corrigir_planilha.py "entrada.xlsx"
    python tools/corrigir_planilha.py "entrada.xlsx" "saida.xlsx"
    python tools/corrigir_planilha.py "entrada.xlsx" --conferir   (so relata)
============================================================================
"""
import os
import sys

try:
    import openpyxl
    from openpyxl.worksheet.datavalidation import DataValidation
except ImportError:
    sys.exit("Instale a dependencia: pip install openpyxl")

ABA_ANEST = "ANESTESISTAS"
ABA_CIRURGIAS = "CIRURGIAS"
ABA_AVALIACOES = "AVALIAÇÕES PRÉ"
ABA_INDICADORES = "INDICADORES"

# Correcoes de formula: celula -> (formula_errada_esperada, formula_correta, motivo)
CORRECOES = {
    "B14": ("=B11-B12", "=B12-B13",
            "VALOR PENDENTE EM ANESTESIAS = VALOR TOTAL - VALOR RECEBIDO"),
    "B18": ("=B12+B16", "=B13+B16",
            "TOTAL RECEBIDO = RECEBIDO ANEST. + RECEBIDO AVAL."),
}


def coluna_por_rotulo(ws, rotulo, linha=1):
    """Indice (1-based) da coluna cujo cabecalho e exatamente `rotulo`."""
    for c in range(1, ws.max_column + 1):
        v = ws.cell(linha, c).value
        if v is not None and str(v).strip() == rotulo:
            return c
    return None


def letra(n):
    s = ""
    while n > 0:
        n, m = divmod(n - 1, 26)
        s = chr(65 + m) + s
    return s


def contar_anestesistas(wb):
    ws = wb[ABA_ANEST]
    col = coluna_por_rotulo(ws, "NOME")
    if not col:
        return 0
    n = 0
    for r in range(2, ws.max_row + 1):
        if str(ws.cell(r, col).value or "").strip():
            n += 1
    return n


def faixa_nomes(wb):
    """Referencia absoluta para a coluna NOME da aba ANESTESISTAS."""
    ws = wb[ABA_ANEST]
    col = coluna_por_rotulo(ws, "NOME")
    if not col:
        raise RuntimeError("A aba %s nao tem a coluna NOME." % ABA_ANEST)
    ultima = max(ws.max_row, 2)
    L = letra(col)
    return "=%s!$%s$2:$%s$%d" % (ABA_ANEST, L, L, ultima)


def ja_tem_validacao(ws, col_letra):
    """True se alguma validacao existente ja cobre a coluna inteira."""
    for dv in ws.data_validations.dataValidation:
        if col_letra + "2" in str(dv.sqref) or ("%s2:%s" % (col_letra, col_letra)) in str(dv.sqref):
            return True
        for faixa in str(dv.sqref).split():
            if faixa.startswith(col_letra + "2:" + col_letra):
                return True
    return False


def adicionar_lista(ws, rotulo, formula, ajuda, ultima_linha):
    """Aplica lista suspensa na coluna de `rotulo`. Devolve texto do que fez."""
    col = coluna_por_rotulo(ws, rotulo)
    if not col:
        return "  [!] Coluna '%s' nao encontrada em %s." % (rotulo, ws.title)

    L = letra(col)
    if ja_tem_validacao(ws, L):
        return "  [=] %s!%s (%s) ja tinha validacao." % (ws.title, L, rotulo)

    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showDropDown=False)
    dv.errorTitle = "Anestesista nao cadastrado"
    dv.error = ("Escolha um dos anestesistas da aba %s. "
                "Nome digitado fora da lista quebra os calculos da planilha." % ABA_ANEST)
    dv.promptTitle = "Anestesista"
    dv.prompt = ajuda
    dv.showErrorMessage = True

    ws.add_data_validation(dv)
    dv.add("%s2:%s%d" % (L, L, ultima_linha))
    return "  [+] %s!%s (%s) -> lista suspensa aplicada." % (ws.title, L, rotulo)


def corrigir_indicadores(ws, aplicar):
    """Confere e (se aplicar) corrige as duas formulas. Devolve lista de textos."""
    saida = []
    for celula, (errada, correta, motivo) in sorted(CORRECOES.items()):
        atual = ws[celula].value
        atual_txt = "" if atual is None else str(atual).replace(" ", "")

        if atual_txt == correta:
            saida.append("  [=] %s ja esta correta (%s)." % (celula, correta))
            continue

        if atual_txt != errada:
            saida.append("  [?] %s tem formula inesperada: %s\n"
                         "      esperava %s. NAO alterada — confira a mao."
                         % (celula, atual_txt or "(vazia)", errada))
            continue

        if aplicar:
            ws[celula] = correta
            saida.append("  [+] %s: %s -> %s\n      %s" % (celula, errada, correta, motivo))
        else:
            saida.append("  [ ] %s: %s -> %s (seria corrigida)\n      %s"
                         % (celula, errada, correta, motivo))
    return saida


def main():
    args = [a for a in sys.argv[1:]]
    conferir = "--conferir" in args
    args = [a for a in args if not a.startswith("--")]

    if not args:
        sys.exit(__doc__)

    entrada = args[0]
    if not os.path.exists(entrada):
        sys.exit("Planilha nao encontrada: %s" % entrada)

    if len(args) > 1:
        saida = args[1]
    else:
        base, ext = os.path.splitext(entrada)
        saida = base + "_corrigida" + ext

    wb = openpyxl.load_workbook(entrada)

    faltando = [n for n in (ABA_ANEST, ABA_CIRURGIAS, ABA_AVALIACOES) if n not in wb.sheetnames]
    if faltando:
        sys.exit("Abas ausentes na planilha: %s" % ", ".join(faltando))

    print("=" * 70)
    print("  CORRECOES NA PLANILHA")
    print("=" * 70)
    print("  Entrada: %s" % entrada)
    print("  Modo   : %s" % ("apenas conferir" if conferir else "aplicar e gravar copia"))
    print("  Equipe : %d anestesistas cadastrados" % contar_anestesistas(wb))
    print()

    formula = faixa_nomes(wb)

    print("TASK-201 e TASK-303 — listas suspensas de anestesista")
    ws_cir = wb[ABA_CIRURGIAS]
    ws_av = wb[ABA_AVALIACOES]

    if conferir:
        for ws, rotulo in ((ws_cir, "ANESTESISTA"), (ws_av, "ANESTESISTA DA AVALIAÇÃO")):
            col = coluna_por_rotulo(ws, rotulo)
            if not col:
                print("  [!] Coluna '%s' nao encontrada em %s." % (rotulo, ws.title))
            elif ja_tem_validacao(ws, letra(col)):
                print("  [=] %s!%s (%s) ja tem validacao." % (ws.title, letra(col), rotulo))
            else:
                print("  [ ] %s!%s (%s) receberia lista suspensa."
                      % (ws.title, letra(col), rotulo))
    else:
        print(adicionar_lista(ws_cir, "ANESTESISTA", formula,
                              "Escolha um anestesista cadastrado.", ws_cir.max_row))
        print(adicionar_lista(ws_av, "ANESTESISTA DA AVALIAÇÃO", formula,
                              "Quem realizou a consulta previa.", ws_av.max_row))

    print()
    print("Aba INDICADORES — erros de formula")
    if ABA_INDICADORES in wb.sheetnames:
        for linha in corrigir_indicadores(wb[ABA_INDICADORES], not conferir):
            print(linha)
    else:
        print("  [!] Aba %s nao encontrada." % ABA_INDICADORES)

    print()
    if conferir:
        print("Nada foi gravado (--conferir).")
        print("=" * 70)
        return

    wb.save(saida)
    print("Gravado: %s" % saida)
    print("O arquivo original nao foi alterado.")
    print("=" * 70)


if __name__ == "__main__":
    main()
