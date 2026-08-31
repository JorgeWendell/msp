const CLIENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomPart(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let part = "";
  for (const byte of bytes) {
    part += CLIENT_CODE_ALPHABET[byte % CLIENT_CODE_ALPHABET.length];
  }
  return part;
}

export function createClientCode() {
  return `${randomPart(3)}-${randomPart(3)}`;
}

export function normalizeClientCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 6) return null;
  return `${compact.slice(0, 3)}-${compact.slice(3)}`;
}

export function clientOptionLabel(item: { name: string; code?: string | null }) {
  return item.code ? `${item.name} · ${item.code}` : item.name;
}
