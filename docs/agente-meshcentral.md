# Construção do EXE AdelMSP + MeshCentral

Documento de construção. Ainda **não é o código pronto** — é a ordem de trabalho para o `.exe` cadastrar a máquina no inventário e abrir o remoto do MeshCentral (tela, Ctrl+Alt+Del, arquivos, terminal).

Repositórios:

| Peça | Pasta | Papel |
|---|---|---|
| Painel | `E:\Meus Projetos\adelmsp` | Cadastro, código `XXX-XXX`, inventário, botão Conectar |
| Agente | `E:\Meus Projetos\adelmsp-agent` | EXE Windows: UI, varredura, enroll, instala MeshAgent |
| MeshCentral | servidor próprio (Node.js) | Relé e visualizador remoto |

O técnico **não** instala o MeshCentral na máquina do cliente. Instala só o **AdelMsp.exe**. Esse EXE registra no inventário e sobe o remoto já com o nome **AdelMsp** — o cliente não vê “Mesh Agent” em Serviços, Programas ou pasta.

No cliente fica **um serviço Windows: `AdelMsp`**.

---

## 1. Como as três peças se falam

```
Técnico no PC do cliente
        │
        │  1. Digita IP/URL do servidor + código da empresa (XXX-XXX)
        ▼
AdelMSP Agent.exe
        │
        ├─ 2. POST /api/agent/enroll          → cria/reusa o ativo no inventário
        ├─ 3. POST /api/agent/inventory       → varredura (já existe hoje)
        ├─ 4. GET  /api/agent/mesh-bootstrap  → MeshID + URL wss do MeshCentral
        └─ 5. Sobe o remoto como processo do serviço AdelMsp
                    │                          (sem serviço "Mesh Agent")
                    │
                    │  conexão de SAÍDA (passa NAT/firewall)
                    ▼
            MeshCentral (wss://IP:443/agent.ashx)
                    │
                    │  6. AdelMSP grava meshNodeId no asset
                    ▼
Painel /inventario → Ações → Conectar → visualizador MeshCentral
```

O botão Conectar **deixa de baixar `.rdp`**. Passa a abrir a sessão MeshCentral daquele `meshNodeId`.

---

## 2. O que o técnico vê no EXE

Tela de instalação (primeira execução, como administrador):

| Campo | Exemplo | O que é |
|---|---|---|
| Servidor | `http://192.168.15.12:3000` | URL do **painel AdelMSP** (não a porta do MeshCentral) |
| Código da empresa | `7QX-CQP` | Código do cliente no cadastro |

Depois de conectar:

- Status: registrado no inventário / remoto online
- Botão para repetir a varredura
- Um único serviço Windows: **AdelMsp** (inventário + remoto)

O IP/porta do MeshCentral **não** é digitado pelo técnico. O painel devolve isso no bootstrap (passo 4). Assim, se o MeshCentral mudar de porta, só o servidor AdelMSP muda — o EXE antigo continua válido.

### Serviços e pastas no PC do cliente

O MeshCentral permite rebatizar o agente. Isso entra no `config.json` **antes** de gerar o instalador:

| Onde o Windows mostra | Nome |
|---|---|
| `services.msc` | `AdelMsp` |
| Programas e Recursos | AdelMsp |
| Pasta | `C:\Program Files\AdelMsp\` |
| Executável remoto | `AdelMsp.exe` (binário Mesh rebatizado) |
| Executável inventário | mesmo serviço, Worker .NET |

Não ficam dois serviços (`AdelMsp` + `Mesh Agent`). O Worker de inventário **é** o serviço `AdelMsp`; o binário remoto roda como processo filho (`AdelMsp.exe run`), sem `-fullinstall`.

Se o Ctrl+Alt+Del exigir o serviço nativo do Mesh, o fallback oficial é o mesmo branding (`serviceName: "AdelMsp"`) no `-fullinstall` — e aí o .NET **não** registra um segundo serviço: o inventário passa a ser hospedado nesse único `AdelMsp`.

---

## 3. Fase 0 — MeshCentral no servidor da MSP

Máquina do servidor (Windows ou Linux). **Não** usar a mesma porta do Next.js (`3000`).

### 3.1 Instalar Node.js LTS e o MeshCentral

```bat
mkdir C:\MeshCentral
cd C:\MeshCentral
npm install meshcentral
node node_modules\meshcentral
```

Na primeira subida o MeshCentral cria `meshcentral-data\config.json`. Parar o processo, editar o arquivo, subir de novo.

Conta inicial: criar o usuário admin na tela web (ex.: `https://IP:443`).

### 3.2 `config.json` mínimo para o AdelMSP embutir o remoto

```json
{
  "settings": {
    "cert": "192.168.15.12",
    "port": 443,
    "redirPort": 80,
    "LANonly": false,
    "allowLoginToken": true,
    "allowFraming": true,
    "sessionSameSite": "none"
  },
  "domains": {
    "": {
      "title": "AdelMsp",
      "newAccounts": false,
      "agentCustomization": {
        "displayName": "AdelMsp",
        "description": "Agente AdelMsp",
        "companyName": "AdelMsp",
        "serviceName": "AdelMsp",
        "fileName": "AdelMsp"
      }
    }
  }
}
```

Notas:

- `cert` = IP ou DNS que o **agente no cliente** vai usar. Tem que ser o mesmo endereço que chega na placa do servidor.
- Em LAN, certificado autoassinado funciona. Na internet, usar DNS + Let's Encrypt.
- `allowFraming` + `sessionSameSite: none` permitem abrir o visualizador dentro do `/inventario`.
- `agentCustomization` **antes** de baixar o agente: serviço, pasta e exe saem como AdelMsp. Customização depois do deploy não atualiza máquina já instalada.
- Rodar MeshCentral como serviço Windows (NSSM ou `node node_modules\meshcentral --install`).

### 3.3 Grupo de dispositivos

No MeshCentral: **Add Device Group** (tipo com agente, não Intel AMT).

Nome sugerido: `AdelMSP` (um grupo para toda a MSP). O cliente AdelMSP continua separado pelo código `XXX-XXX` no inventário.

Anotar, no servidor MeshCentral:

```bat
node node_modules\meshcentral\meshctrl --url https://127.0.0.1 --loginuser admin --loginpass SENHA listdevicegroups --hex --json
```

Guardar:

- `name` → `MeshName`
- `_idhex` → `MeshID` (começa com `0x`)
- `ServerID` (fingerprint do servidor; sai no `.msh` gerado pelo próprio MeshCentral)

### 3.4 Baixar o MeshAgent “mestre”

No site do MeshCentral, no grupo: **Add Agent** → Windows x64.

Isso gera `meshagent.exe` + `meshagent.msh`. Guardar uma cópia em pasta do AdelMSP, por exemplo:

```
E:\Meus Projetos\adelmsp\private\mesh\
  meshagent.exe
  meshagent.msh
```

Esse par **não** vai no Git. O AdelMSP só serve o arquivo autenticado para o EXE no enroll.

---

## 4. Fase 1 — EXE com os dois campos + varredura

O agente de hoje já faz enroll + inventário pelo console. A construção do EXE de instalação é:

### 4.1 Projeto (`adelmsp-agent`)

Manter o Worker atual (`InventoryCollector`, `AdelMspApi`, `Worker`).

Acrescentar:

1. App WinForms/WPF (`net8.0-windows`) só para o setup.
2. Depois do setup, instalar o próprio processo como serviço `AdelMSP Agent` (já previsto no `.csproj`).

Fluxo do `Program.cs`:

1. Se não existir `C:\ProgramData\AdelMSP\agent.json` **ou** `--setup`:
   - Abrir janela: Servidor + Código da empresa
   - Validar os dois campos
   - Coletar inventário local (código que já existe)
   - `POST /api/agent/enroll`
   - `POST /api/agent/inventory`
   - (Fase 2+) bootstrap Mesh + inicia o remoto como processo do serviço AdelMsp
   - Gravar `agent.json`
2. Se já estiver configurado: só sobe o Worker (heartbeat 60 s, inventário 15 min).

### 4.2 Publicar o EXE único

No PC de build:

```bat
cd E:\Meus Projetos\adelmsp-agent
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o dist
```

Saída: `dist\AdelMsp.exe`.

No código do serviço Windows:

```csharp
builder.Services.AddWindowsService(options => options.ServiceName = "AdelMsp");
```

O técnico roda **como Administrador**.

Opcional depois: Inno Setup gerando `AdelMsp-Setup.exe` com `/VERYSILENT`.

### 4.3 Como a máquina aparece no inventário (já é o contrato atual)

1. Cliente cadastrado em `/cadastros/clientes` → código `XXX-XXX`.
2. Técnico cola esse código no EXE.
3. `POST /api/agent/enroll` cria o `asset` (ou reusa serial/hostname no mesmo cliente).
4. A linha entra em `/inventario` com hostname, cliente, SO, IP, status do agente.

Sem código válido o EXE **não** instala nada e **não** chama o MeshCentral.

---

## 5. Fase 2 — AdelMSP conhece o MeshCentral

Variáveis no `.env` do painel (servidor):

```env
MESHCENTRAL_URL=https://192.168.15.12
MESHCENTRAL_USER=admin
MESHCENTRAL_PASS=...
MESHCENTRAL_MESH_NAME=AdelMSP
MESHCENTRAL_MESH_ID=0x...
MESHCENTRAL_SERVER_ID=...
MESHCENTRAL_AGENT_WSS=wss://192.168.15.12/agent.ashx
```

### 5.1 Coluna no ativo

Em `asset`:

- `meshNodeId` (texto, único, opcional)

O node id só existe **depois** que o MeshAgent conecta. O EXE ou o painel preenche.

### 5.2 API nova no AdelMSP

`GET /api/agent/mesh-bootstrap`  
`Authorization: Bearer <agentToken>` (o mesmo do enroll)

Resposta:

```json
{
  "meshName": "AdelMSP",
  "meshId": "0x...",
  "serverId": "...",
  "meshServer": "wss://192.168.15.12/agent.ashx",
  "agentDownloadUrl": "/api/agent/AdelMsp-remote.exe"
}
```

`POST /api/agent/mesh-bind`  
Body: `{ "nodeId": "node//...." }`  
Amarra o node MeshCentral ao `asset` do token.

`GET /api/agent/AdelMsp-remote.exe`  
Entrega o binário Mesh já rebatizado (só com token válido). O arquivo no disco do cliente é `C:\Program Files\AdelMsp\AdelMsp.exe`.

### 5.3 `.msh` gerado na hora

O EXE **não** leva MeshID gravado. Monta o arquivo a partir do bootstrap:

```
MeshName=AdelMSP
MeshType=2
MeshID=0x...
ServerID=...
MeshServer=wss://192.168.15.12/agent.ashx
```

Gravar em `C:\Program Files\AdelMsp\AdelMsp.msh` (ao lado do binário remoto).

---

## 6. Fase 3 — O serviço AdelMsp sobe o remoto

Depois do enroll + inventário, ainda como Administrador:

1. Criar `C:\Program Files\AdelMsp\`.
2. Baixar o binário rebatizado para `C:\Program Files\AdelMsp\AdelMsp.exe`.
3. Gravar o `.msh` no mesmo pasta.
4. Registrar **um** serviço Windows:

```bat
sc create AdelMsp binPath= "C:\Program Files\AdelMsp\AdelMsp.Agent.exe" start= auto DisplayName= "AdelMsp"
sc description AdelMsp "Agente AdelMsp"
sc start AdelMsp
```

O Worker .NET, ao iniciar, dispara o remoto:

```bat
"C:\Program Files\AdelMsp\AdelMsp.exe" run
```

`run` = agente em console, **sem** instalar o serviço "Mesh Agent".

5. Esperar o node aparecer no MeshCentral (`meshctrl listdevices`).
6. `POST /api/agent/mesh-bind` com o `nodeId`.

Como achar o `nodeId` sem UI:

```bat
node node_modules\meshcentral\meshctrl --url https://127.0.0.1 --loginuser admin --loginpass SENHA listdevices --json
```

Casar por hostname (o mesmo do inventário). O painel pode fazer esse match sozinho 30–60 s após o install.

O que o cliente vê em `services.msc`:

| Serviço | Função |
|---|---|
| `AdelMsp` | Inventário + heartbeat + processo do remoto |

Não existe serviço `Mesh Agent`. O MeshCentral no servidor continua sendo MeshCentral — só o PC do cliente é que está rebatizado.

**Fallback** (se Ctrl+Alt+Del falhar no modo `run`): `-fullinstall` com `agentCustomization.serviceName = "AdelMsp"`. Nesse caso o .NET **não** cria outro serviço; o inventário fica hospedado no mesmo `AdelMsp`.

---

## 7. Fase 4 — Conectar no `/inventario`

No dropdown **Ações**:

- **Editar** — ficha da máquina (já existe)
- **Conectar** — se `meshNodeId` existir, abrir o visualizador; senão avisar “agente remoto ainda não vinculado”
- **Excluir** — já existe (não desinstala o MeshAgent sozinho na primeira versão; documentar)

### 7.1 Abrir a sessão

O painel gera um login token MeshCentral (usuário de serviço) e redireciona ou abre iframe:

```
https://192.168.15.12/?login=<token>&gotonode=<nodeId>
```

É a tela do print: Desconectar, tela cheia, Ctrl+Alt+Del, arquivos, terminal, latência.

### 7.2 Permissão

Só quem tem o módulo **inventário** no AdelMSP chama a action que emite o token. O técnico **não** precisa de login separado no site MeshCentral.

---

## 8. Ordem de construção (checklist)

Fazer nesta ordem. Cada item deixa algo testável.

### Servidor MeshCentral

- [ ] Node.js LTS no servidor da MSP
- [ ] `npm install meshcentral` em `C:\MeshCentral`
- [ ] `config.json` com porta 443, `allowLoginToken`, `allowFraming`
- [ ] Usuário admin criado
- [ ] `agentCustomization` com displayName, serviceName, fileName e companyName = `AdelMsp`
- [ ] Device group `AdelMSP` criado
- [ ] `meshctrl listdevicegroups --hex` → MeshID guardado
- [ ] Download Windows x64 do agente (já deve chamar AdelMsp) → `private/mesh/`
- [ ] Teste manual numa VM: em Serviços deve aparecer **AdelMsp**, não Mesh Agent; o remoto no site MeshCentral funciona **antes** de ligar no AdelMSP

### EXE AdelMSP (UI + inventário)

- [ ] Tela: Servidor + Código da empresa
- [ ] Recusar install sem os dois campos
- [ ] Enroll + primeira varredura (código atual)
- [ ] Serviço `AdelMSP Agent` após o setup
- [ ] `dotnet publish` single-file `win-x64`
- [ ] Teste: máquina nova aparece em `/inventario` com inventário nas abas

### Ligação Mesh ↔ inventário

- [ ] Coluna `asset.meshNodeId`
- [ ] `.env` MeshCentral no AdelMSP
- [ ] `GET /api/agent/mesh-bootstrap`
- [ ] `GET /api/agent/AdelMsp-remote.exe`
- [ ] EXE baixa o remoto, grava `.msh` em `Program Files\AdelMsp`, sobe `AdelMsp.exe run`
- [ ] Um serviço `AdelMsp` em `services.msc` (sem Mesh Agent)
- [ ] `POST /api/agent/mesh-bind` ou match por hostname

### Conectar

- [ ] Trocar o download `.rdp` por sessão MeshCentral
- [ ] Token de login gerado no servidor
- [ ] Abrir visualizador (nova aba ou iframe na ficha)
- [ ] Teste: Ctrl+Alt+Del, tela cheia, pasta, terminal

---

## 9. Teste de ponta a ponta (máquina real)

1. Painel no ar (`npm run dev` ou produção) em `http://IP:3000`.
2. MeshCentral no ar em `https://IP`.
3. Cliente com código visível em Cadastros.
4. No PC alvo, Administrador: `AdelMsp.Agent.exe`.
5. Servidor = URL do painel. Código = `XXX-XXX`.
6. Esperar “Registrado” + serviço **AdelMsp** running (não Mesh Agent).
7. Recarregar `/inventario` → hostname na lista.
8. Abrir a ficha → abas Detalhe/Softwares preenchidas.
9. Ações → **Conectar** → tela remota (como no print).

Se o inventário aparecer e o Conectar não: MeshAgent não vinculou (`meshNodeId` vazio). Conferir serviço Mesh Agent, firewall de **saída** 443, e `MeshServer=` no `.msh`.

Se o remoto abrir e o inventário não: enroll AdelMSP falhou (URL errada ou código inválido). O MeshCentral sozinho **não** cria linha em `/inventario`.

---

## 10. Decisões travadas neste documento

- Um único `.exe` AdelMsp. O remoto Mesh é baixado na hora, rebatizado, **não** aparece como Mesh Agent.
- Um serviço Windows no cliente: **AdelMsp**.
- Um device group MeshCentral para a MSP. Isolamento de cliente = código `XXX-XXX` no AdelMSP.
- Técnico informa só **URL do painel** + **código**. Endereço MeshCentral vem do servidor.
- Inventário continua sendo do AdelMSP (WMI). MeshCentral não substitui as abas.
- Remoto = MeshCentral. O `.rdp` local some do Conectar.

Quando este passo a passo estiver ok no papel, a implementação começa pela **Fase 1** (janela do EXE), com o MeshCentral da Fase 0 já respondendo na rede.
