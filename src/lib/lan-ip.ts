const VIRTUAL_NIC =
  /vethernet|virtual|vmware|vbox|virtualbox|hyper-v|hyperv|\btap\b|vpn|bluetooth|docker|wsl|loopback|pseudo|teredo|isatap|wan miniport|wifi direct|hosted network|kernel debug|npcap|wireguard|openvpn|cisco anyconnect|fortinet|zerotier/i;

const APIPA = /^169\.254\./;
const LOOPBACK = /^127\./;

type Nic = {
  name?: unknown;
  description?: unknown;
  type?: unknown;
  ipv4?: unknown;
  mac?: unknown;
  status?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isPrivateIpv4(ip: string) {
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  const match = /^172\.(\d+)\./.exec(ip);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 16 && second <= 31;
}

function scoreLanNic(nic: Nic) {
  const ipv4 = text(nic.ipv4);
  const type = text(nic.type).toLowerCase();
  const label = `${text(nic.name)} ${text(nic.description)}`;
  const status = text(nic.status).toLowerCase();

  if (!ipv4 || LOOPBACK.test(ipv4) || APIPA.test(ipv4)) return -1;
  if (type === "loopback" || type === "tunnel" || type === "ppp") return -1;
  if (VIRTUAL_NIC.test(label)) return -1;

  let score = 1;
  if (status === "up") score += 30;
  if (type === "ethernet") score += 20;
  else if (type === "wireless80211") score += 16;
  else if (/ethernet|wi-?fi|wlan|wireless/i.test(label)) score += 12;
  if (isPrivateIpv4(ipv4)) score += 5;
  return score;
}

export function pickLanAdapter(adapters: unknown): Nic | null {
  if (!Array.isArray(adapters)) return null;
  let best: Nic | null = null;
  let bestScore = -1;
  for (const item of adapters) {
    if (!item || typeof item !== "object") continue;
    const nic = item as Nic;
    const score = scoreLanNic(nic);
    if (score > bestScore) {
      best = nic;
      bestScore = score;
    }
  }
  return bestScore >= 0 ? best : null;
}

export function lanIpFromInventory(
  payload: unknown,
  fallback?: string | null
) {
  const network =
    payload && typeof payload === "object"
      ? (payload as { network?: { adapters?: unknown; publicIp?: unknown } })
          .network
      : undefined;
  const nic = pickLanAdapter(network?.adapters);
  const ipv4 = text(nic?.ipv4);
  if (ipv4) return ipv4;
  const stored = text(fallback);
  if (stored && !LOOPBACK.test(stored) && !APIPA.test(stored)) return stored;
  const publicIp = text(network?.publicIp);
  return publicIp || stored || null;
}
