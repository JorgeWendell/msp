# Agente de inventário (contrato)

O app **não** fica dentro de `adelmsp`. Repositório irmão:

| Projeto | Pasta | Papel |
|---|---|---|
| Painel MSP | `E:\Meus Projetos\adelmsp` | Cadastro, código do cliente, API, ficha da máquina, tickets |
| Agente Windows | `E:\Meus Projetos\adelmsp-agent` | Coleta local e envio do inventário |

## Vínculo com o cliente

Todo cliente ganha um **código automático** no formato `XXX-XXX` (ex.: `K7P-3MD`).

Na instalação o técnico **é obrigado** a informar esse código. Sem código válido a máquina não entra no inventário.

1. Cadastro do cliente no web → código gerado.
2. Técnico instala o agente e digita o código.
3. `POST /api/agent/enroll` valida o código, cria (ou reaproveita) o ativo naquele cliente e devolve o `agentToken`.
4. Daí em diante o agente usa o token no heartbeat/inventário.

Se o serial (ou o hostname) já existir nesse cliente, a instalação reaproveita o ativo — não duplica.

## API (AdelMSP)

- `POST /api/agent/enroll` — **obrigatório** `clientCode` (`XXX-XXX`). Sem sessão de usuário.
- `POST /api/agent/heartbeat` — `Authorization: Bearer <agentToken>`
- `POST /api/agent/inventory` — `Authorization: Bearer <agentToken>`

### Enroll

```json
{
  "clientCode": "K7P-3MD",
  "hostname": "DESKTOP-2K4F53I",
  "serial": "CBQS9B2",
  "os": "Microsoft Windows 10 Pro",
  "ip": "192.168.10.55",
  "mac": "20:47:47:FE:4F:87",
  "kind": "Desktop",
  "agentVersion": "0.1.0"
}
```

Resposta: `{ assetId, agentToken, hostname, clientName, clientCode }`.

Código inválido ou cliente inativo → `401`.

## O que vem de onde

### Coletado no PC (agente)

Sistema, CPU, memória, placa-mãe, impressoras, armazenamento, rede, usuários locais, softwares, processos, serviços, Event Viewer.

### Vem do AdelMSP

**Histórico de chamados** na ficha da máquina.

## App (`adelmsp-agent`)

- .NET 8 Worker Service (Windows x64).
- Na primeira execução: pede **URL do painel** + **código do cliente (obrigatório)**.
- Guarda o `agentToken` localmente após o enroll.
- Heartbeat ~60 s; inventário completo ~15 min.

## Remoto (MeshCentral)

A construção do EXE com tela (servidor + código da empresa), varredura e acesso remoto está em [`docs/agente-meshcentral.md`](agente-meshcentral.md).
