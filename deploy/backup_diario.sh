#!/bin/sh
# Copia as pastas do sistema para FORA da máquina (rclone: rclone.org). MODELO — não foi testado com um destino de verdade.
#
# Use "copy", não "sync": o destino GUARDA o que o sistema já apagou da própria pasta (as cópias diárias de mais de 35 dias,
# os PDFs removidos). É assim que a informação fica pelo menos um ano — e mais — mesmo que o disco do servidor se perca.
# Ligue o versionamento do bucket para também guardar versões antigas do que for sobrescrito.
#
#   rclone config                      (cria o destino, ex.: "fora": um bucket S3, Backblaze, R2, Drive...)
#   DESTINO=fora:anestesia-clinica-x /opt/anestesia/deploy/backup_diario.sh
#   crontab -e  ->  15 3 * * *  DESTINO=fora:anestesia-clinica-x /opt/anestesia/deploy/backup_diario.sh >> /var/log/anestesia-backup.log 2>&1
#
# Depois de configurar: restaure uma cópia num lugar de teste e confira (ver docs/COLOCAR_NO_AR.md, etapa 4).

set -eu
DADOS="${DADOS:-/var/lib/anestesia}"
DESTINO="${DESTINO:?Defina DESTINO, por exemplo DESTINO=fora:anestesia-clinica-x}"

echo "$(date '+%F %T') copiando $DADOS para $DESTINO"
rclone copy "$DADOS/copias" "$DESTINO/copias" --transfers 4
rclone copy "$DADOS/logs"   "$DESTINO/logs"
rclone copy "$DADOS/anexos" "$DESTINO/anexos" --transfers 4
# Usuários (só os "hashes" das senhas, nunca as senhas) para reconstruir os acessos.
rclone copy "$DADOS/usuarios.json" "$DESTINO/"
echo "$(date '+%F %T') pronto"
