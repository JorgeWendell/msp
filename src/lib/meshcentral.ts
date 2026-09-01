import { createCipheriv, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import WebSocket from "ws";

const execFileAsync = promisify(execFile);

export type MeshSettings = {
  url: string;
  controlUrl: string;
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

type MeshMsg = Record<string, unknown>;

type MeshDevice = {
  _id?: string;
  name?: string;
  rname?: string;
  meshid?: string;
  conn?: number;
};

type MeshGroup = {
  _id?: string;
  name?: string;
  mtype?: number;
};

export function getMeshSettings(): MeshSettings {
  const url = (process.env.MESHCENTRAL_URL ?? "").trim().replace(/\/$/, "");
  const controlUrl = (process.env.MESHCENTRAL_CONTROL_URL ?? url).trim().replace(/\/$/, "");
  const meshServer = (process.env.MESHCENTRAL_AGENT_WSS ?? "").trim();
  const meshId = (process.env.MESHCENTRAL_MESH_ID ?? "").trim();
  const serverId = (process.env.MESHCENTRAL_SERVER_ID ?? "").trim();
  return {
    url,
    controlUrl,
    meshServer,
    meshName: (process.env.MESHCENTRAL_MESH_NAME ?? "AdelMsp").trim() || "AdelMsp",
    meshId,
    serverId,
    loginToken: (process.env.MESHCENTRAL_LOGIN_TOKEN ?? "").trim(),
    user: (process.env.MESHCENTRAL_USER ?? "").trim(),
    pass: (process.env.MESHCENTRAL_PASS ?? "").trim(),
    dir: (process.env.MESHCENTRAL_DIR ?? "").trim(),
    agentPath: path.resolve(
      process.cwd(),
      process.env.MESHCENTRAL_AGENT_PATH ?? "private/mesh/AdelMsp.Remote.exe"
    ),
    enabled: Boolean(url && meshServer),
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

export function meshAgentDownloadUrl(settings: MeshSettings) {
  const base = (settings.controlUrl || settings.url).replace(/\/$/, "");
  return `${base}/meshagents?id=4`;
}

export async function resolveMeshSettings(): Promise<MeshSettings> {
  const settings = getMeshSettings();
  if (!settings.enabled) return settings;
  if (settings.meshId && settings.serverId) return settings;
  try {
    const live = await fetchMeshIdentity(settings);
    return {
      ...settings,
      meshId: live.meshId || settings.meshId,
      serverId: live.serverId || settings.serverId,
    };
  } catch {
    return settings;
  }
}

export async function createMeshLoginToken(settings: MeshSettings) {
  if (settings.loginToken) return settings.loginToken;
  const fromSocket = await requestMeshLoginCookie(settings);
  if (fromSocket) return fromSocket;
  return createMeshLoginTokenFromDb(settings);
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

function meshWsUrl(settings: MeshSettings) {
  const base = (settings.controlUrl || settings.url).replace(/\/$/, "");
  return `${base.replace(/^http/, "ws")}/control.ashx`;
}

function hashToHex(value: string) {
  const normalized = value.replace(/@/g, "+").replace(/\$/g, "/");
  return Buffer.from(normalized, "base64").toString("hex").toUpperCase();
}

function meshIdToHex(meshId: string) {
  const raw = meshId.includes("/") ? (meshId.split("/").pop() ?? meshId) : meshId;
  if (raw.startsWith("0x") || raw.startsWith("0X")) return raw;
  try {
    return `0x${hashToHex(raw)}`;
  } catch {
    return raw;
  }
}

function flattenNodes(msg: MeshMsg) {
  const nodes = (msg.nodes ?? {}) as Record<string, MeshDevice[]>;
  const out: MeshDevice[] = [];
  for (const list of Object.values(nodes)) {
    if (!Array.isArray(list)) continue;
    for (const node of list) out.push(node);
  }
  return out;
}

async function withMeshControl<T>(
  settings: MeshSettings,
  run: (send: (msg: object) => void, wait: (action: string) => Promise<MeshMsg>) => Promise<T>
): Promise<T | null> {
  if (!settings.controlUrl && !settings.url) return null;
  const wsUrl = meshWsUrl(settings);
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
    const pending = new Map<string, Array<(msg: MeshMsg) => void>>();
    const buffered = new Map<string, MeshMsg[]>();
    let settled = false;

    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // conexão já fechada
      }
      resolve(value);
    };

    const send = (msg: object) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    const wait = (action: string) =>
      new Promise<MeshMsg>((ok, fail) => {
        const queue = buffered.get(action);
        if (queue?.length) {
          ok(queue.shift() as MeshMsg);
          return;
        }
        const list = pending.get(action) ?? [];
        list.push(ok);
        pending.set(action, list);
        setTimeout(() => fail(new Error(`timeout ${action}`)), 8_000);
      });

    const timer = setTimeout(() => finish(null), 15_000);

    ws.on("open", () => {
      void (async () => {
        try {
          finish(await run(send, wait));
        } catch {
          finish(null);
        }
      })();
    });

    ws.on("message", (data) => {
      let msg: MeshMsg;
      try {
        msg = JSON.parse(data.toString()) as MeshMsg;
      } catch {
        return;
      }
      const action = String(msg.action ?? "");
      const list = pending.get(action);
      if (list?.length) {
        const next = list.shift();
        if (!list.length) pending.delete(action);
        next?.(msg);
        return;
      }
      const queue = buffered.get(action) ?? [];
      queue.push(msg);
      buffered.set(action, queue);
    });

    ws.on("error", () => finish(null));
    ws.on("close", () => finish(null));
  });
}

async function fetchMeshIdentity(settings: MeshSettings) {
  const result = { meshId: settings.meshId, serverId: settings.serverId };
  await withMeshControl(settings, async (send, wait) => {
    const info = await wait("serverinfo").catch(() => null);
    const payload = ((info?.serverinfo as MeshMsg | undefined) ?? info ?? {}) as MeshMsg;
    const agentHash = String(payload.agentCertHash ?? "");
    if (agentHash) result.serverId = hashToHex(agentHash);

    send({ action: "meshes", responseid: "adelmsp-meshes" });
    const meshesMsg = await wait("meshes").catch(() => null);
    const meshes = (meshesMsg?.meshes ?? []) as MeshGroup[];
    const named =
      meshes.find((item) => item.name === settings.meshName && item.mtype === 2) ??
      meshes.find((item) => item.name === settings.meshName);
    if (named?._id) {
      result.meshId = meshIdToHex(named._id);
      return;
    }

    send({
      action: "createmesh",
      meshname: settings.meshName,
      meshtype: 2,
      responseid: "adelmsp-create",
    });
    const created = await wait("createmesh").catch(() => null);
    const createdId = String(created?.meshid ?? "");
    if (createdId) result.meshId = meshIdToHex(createdId);
  });
  return result;
}

async function requestMeshLoginCookie(settings: MeshSettings) {
  return withMeshControl(settings, async (send, wait) => {
    await wait("serverinfo").catch(() => null);
    send({ action: "logincookie" });
    const msg = await wait("logincookie");
    return String(msg.cookie ?? "");
  });
}

async function findLiveMeshNodeId(hostname: string, assetId: string, settings: MeshSettings) {
  const list = await withMeshControl(settings, async (send, wait) => {
    await wait("serverinfo").catch(() => null);
    send({ action: "nodes", responseid: "adelmsp-nodes" });
    const msg = await wait("nodes");
    return flattenNodes(msg);
  });
  if (!list?.length) return null;
  return pickMeshNodeId(list, hostname, assetId);
}

async function createMeshLoginTokenFromDb(settings: MeshSettings) {
  if (!settings.dir) return "";
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
