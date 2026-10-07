# Copia as pastas do sistema para OUTRO disco ou pasta de rede (Windows). MODELO — não foi testado numa máquina de verdade.
#
# Sem /MIR: o destino GUARDA o que o sistema já apagou da própria pasta (as cópias diárias de mais de 35 dias, os PDFs
# removidos). É assim que a informação fica pelo menos um ano. O destino tem de ser OUTRO disco (ou outro computador):
# cópia no mesmo disco não protege contra o disco que morre.
#
#   powershell -ExecutionPolicy Bypass -File deploy\backup_diario.ps1 -Dados "D:\anestesia" -Destino "E:\backup-anestesia"
#   Agende no "Agendador de Tarefas" do Windows, todo dia de madrugada.

param(
  [Parameter(Mandatory = $true)][string]$Dados,
  [Parameter(Mandatory = $true)][string]$Destino
)

$ErrorActionPreference = 'Stop'
foreach ($pasta in 'copias', 'logs', 'anexos') {
  if (Test-Path (Join-Path $Dados $pasta)) {
    robocopy (Join-Path $Dados $pasta) (Join-Path $Destino $pasta) /E /XO /R:2 /W:5 /NP | Out-Null
    # robocopy devolve 0 a 7 quando deu certo
    if ($LASTEXITCODE -ge 8) { throw "robocopy falhou em $pasta (código $LASTEXITCODE)" }
  }
}
Copy-Item (Join-Path $Dados 'usuarios.json') (Join-Path $Destino 'usuarios.json') -Force
Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') cópia pronta em $Destino"
