import { createCipheriv, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type MeshSettings = {
  url: string;
  meshServer: string;
  meshName: string;
  meshId: string;
  serverId: string;
  loginToken: string;
  user: string;
  pass: string;
  dir: string;
  agentPath: string;
  enabled: boolean;
};

export function getMeshSettings(): MeshSettings {
  const url = (process.env.MESHCENTRAL_URL ?? "").trim().replace(/\/$/, "");
  const meshServer = (process.env.MESHCENTRAL_AGENT_WSS ?? "").trim();
  const meshId = (process.env.MESHCENTRAL_MESH_ID ?? "").trim();
  const serverId = (process.env.MESHCENTRAL_SERVER_ID ?? "").trim();
  return {
    url,
    meshServer,
    meshName: (process.env.MESHCENTRAL_MESH_NAME ?? "AdelMsp").trim() || "AdelMsp",
    meshId,
    serverId,
    loginToken: (process.env.MESHCENTRAL_LOGIN_TOKEN ?? "").trim(),
    user: (process.env.MESHCENTRAL_USER ?? "").trim(),
    pass: (process.env.MESHCENTRAL_PASS ?? "").trim(),
    dir: (process.env.MESHCENTRAL_DIR ?? "C:\\MeshCentral").trim(),
    agentPath: path.resolve(
      process.cwd(),
      process.env.MESHCENTRAL_AGENT_PATH ?? "private/mesh/AdelMsp.Remote.exe"
    ),
    enabled: Boolean(url && meshServer && meshId),
  };
}

export function meshViewerUrl(settings: MeshSettings, nodeId: string, loginToken?: string) {
  const params = new URLSearchParams();
  const token = (loginToken ?? settings.loginToken).trim();
  if (token) {
    params.set("login", token);
    params.set("auth", token);
  }
  const nodeKey = nodeId.includes("/") ? (nodeId.split("/").pop() ?? nodeId) : nodeId;
  params.set("node", nodeKey);
  params.set("gotonode", nodeKey);
  params.set("viewmode", "11");
  // 1 = faixa AdelMsp, 8 = título da página, 16 = menu lateral do MeshCentral
  params.set("hide", "25");
  return `${settings.url}/?${params.toString()}`;
}

export async function createMeshLoginToken(settings: MeshSettings) {
  if (settings.loginToken) return settings.loginToken;
  const username = (settings.user || "suporte").trim().toLowerCase();
  const userid = username.includes("/") ? username : `user//${username}`;
  try {
    const raw = await readFile(path.join(settings.dir, "meshcentral-data", "meshcentral.db"), "utf8");
    let keyHex = "";
    for (const line of raw.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as { _id?: string; key?: string };
        if (row._id === "LoginCookieEncryptionKey" && row.key) {
          keyHex = row.key;
        }
      } catch {
        // o meshcentral.db mistura linhas; ignora o que não for JSON
      }
    }
    if (keyHex.length < 64) return "";
    const key = Buffer.from(keyHex, "hex");
    const payload = {
      u: userid,
      a: 3,
      userid,
      domainid: "",
      expire: 0,
      time: Math.floor(Date.now() / 1000),
    };
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key.subarray(0, 32), iv);
    const crypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), crypted])
      .toString("base64")
      .replace(/\+/g, "@")
      .replace(/\//g, "$");
  } catch {
    return "";
  }
}

type MeshDevice = {
  _id?: string;
  name?: string;
  rname?: string;
  meshid?: string;
  conn?: number;
};

function nodeMatchesMachine(item: MeshDevice, hostname: string, assetId: string) {
  const name = String(item.name ?? "").toLowerCase();
  const rname = String(item.rname ?? "").toLowerCase();
  const host = hostname.toLowerCase();
  const tagged = `adelmsp-${assetId}`.toLowerCase();
  return (
    name === tagged ||
    name === host ||
    rname === host ||
    (host.length > 2 && (name.includes(host) || rname.includes(host)))
  );
}

function pickMeshNodeId(list: MeshDevice[], hostname: string, assetId: string) {
  const matches = list.filter((item) => item._id && nodeMatchesMachine(item, hostname, assetId));
  const online = [...matches].reverse().find((item) => ((item.conn ?? 0) & 1) !== 0);
  return online?._id ?? matches.at(-1)?._id ?? null;
}

async function findLiveMeshNodeId(hostname: string, assetId: string, settings: MeshSettings) {
  if (!settings.url || !settings.dir) return null;
  const wsModule = path.join(settings.dir, "node_modules", "ws");
  const wsUrl = `${settings.url.replace(/^http/, "ws")}/control.ashx`;
  const script = `
    const WebSocket = require(${JSON.stringify(wsModule)});
    const ws = new WebSocket(${JSON.stringify(wsUrl)}, { rejectUnauthorized: false });
    const t = setTimeout(function () { process.stdout.write("[]"); ws.close(); process.exit(0); }, 8000);
    function dump(msg) {
      const nodes = msg.nodes || {};
      const out = [];
      for (const list of Object.values(nodes)) {
        if (!Array.isArray(list)) continue;
        for (const n of list) out.push({ _id: n._id, name: n.name, rname: n.rname, conn: n.conn || 0 });
      }
      clearTimeout(t);
      process.stdout.write(JSON.stringify(out));
      ws.close();
      process.exit(0);
    }
    ws.on("open", function () { ws.send(JSON.stringify({ action: "nodes", responseid: "x" })); });
    ws.on("message", function (data) {
      var msg; try { msg = JSON.parse(data.toString()); } catch (e) { return; }
      if (msg.action === "nodes") dump(msg);
      if (msg.action === "serverinfo") ws.send(JSON.stringify({ action: "nodes", responseid: "x" }));
    });
    ws.on("error", function () { process.stdout.write("[]"); process.exit(0); });
  `;
  try {
    const { stdout } = await execFileAsync("node", ["-e", script], {
      timeout: 10_000,
      windowsHide: true,
      env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    });
    const list = JSON.parse(stdout.trim() || "[]") as MeshDevice[];
    return pickMeshNodeId(list, hostname, assetId);
  } catch {
    return null;
  }
}

async function findMeshNodeIdFromDb(hostname: string, assetId: string, dir: string) {
  try {
    const raw = await readFile(path.join(dir, "meshcentral-data", "meshcentral.db"), "utf8");
    const byId = new Map<string, MeshDevice>();
    for (const line of raw.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as MeshDevice & { type?: string };
        if (row.type === "node" && row._id) byId.set(row._id, row);
      } catch {
        // o meshcentral.db mistura linhas; ignora o que não for JSON
      }
    }
    return pickMeshNodeId([...byId.values()], hostname, assetId);
  } catch {
    return null;
  }
}

export async function findMeshNodeId(hostname: string, assetId: string) {
  const settings = getMeshSettings();
  const live = await findLiveMeshNodeId(hostname, assetId, settings);
  if (live) return live;
  const fromDb = settings.dir
    ? await findMeshNodeIdFromDb(hostname, assetId, settings.dir)
    : null;
  if (fromDb) return fromDb;
  if (!settings.user || !settings.pass || !settings.dir) return null;

  const meshctrl = path.join(
    settings.dir,
    "node_modules",
    "meshcentral",
    "meshctrl.js"
  );
  try {
    const { stdout } = await execFileAsync(
      "node",
      [
        meshctrl,
        "--url",
        settings.url,
        "--loginuser",
        settings.user,
        "--loginpass",
        settings.pass,
        "listdevices",
        "--json",
      ],
      { timeout: 20_000, windowsHide: true, env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" } }
    );
    const parsed = JSON.parse(stdout) as MeshDevice[] | { devices?: MeshDevice[] };
    const list = Array.isArray(parsed) ? parsed : parsed.devices ?? [];
    return pickMeshNodeId(list, hostname, assetId);
  } catch {
    return null;
  }
}
