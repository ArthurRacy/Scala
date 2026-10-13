# Modelos para colocar o sistema no ar

Estes arquivos são **modelos**: foram escritos com cuidado mas **não foram testados numa máquina de verdade**
(só o servidor em si é testado pela bateria). Confira cada caminho antes de usar.

| Arquivo | Para quê |
|---|---|
| `Caddyfile` | HTTPS automático na frente do sistema (Caddy). O sistema abre só na própria máquina e confia no IP e no HTTPS que o Caddy informa (`--atras-de-proxy` ou `ATRAS_DE_PROXY=1`). |
| `anestesia.service` | Serviço do Linux (systemd) que mantém o sistema aberto e o reabre sozinho. |
| `backup_diario.sh` | Copia `copias/`, `logs/`, `anexos/` e `usuarios.json` para fora da máquina (rclone), **sem apagar** o que já está lá. |
| `backup_diario.ps1` | O mesmo para Windows, copiando para outro disco ou pasta de rede. |

Ordem sugerida, numa máquina Linux em São Paulo: instalar Node (22 ou mais novo) → copiar o projeto para `/opt/anestesia`
→ `anestesia.service` → Caddy com o `Caddyfile` → `backup_diario.sh` no cron → monitor externo em `/api/saude`.
O passo a passo da operação está em `docs/RUNBOOK.md` e a lista completa em `docs/COLOCAR_NO_AR.md`.
