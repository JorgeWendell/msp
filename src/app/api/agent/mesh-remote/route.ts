import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { NextResponse } from "next/server";

import { assetByAgentToken, bearerToken } from "@/lib/agent-auth";
import { getMeshSettings, meshAgentDownloadUrl } from "@/lib/meshcentral";

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Token ausente." }, { status: 401 });
  }

  const owned = await assetByAgentToken(token);
  if (!owned) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const mesh = getMeshSettings();
  if (!mesh.enabled) {
    return NextResponse.json({ error: "Remoto não configurado." }, { status: 404 });
  }

  let bytes: Buffer | null = existsSync(mesh.agentPath) ? await readFile(mesh.agentPath) : null;
  if (!bytes || bytes.length < 1024) {
    bytes = await downloadMeshAgentBinary(meshAgentDownloadUrl(mesh));
  }
  if (!bytes) {
    return NextResponse.json({ error: "Binário remoto ausente." }, { status: 404 });
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": 'attachment; filename="AdelMsp.Remote.exe"',
    },
  });
}

async function downloadMeshAgentBinary(url: string) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      // o Mesh interno no Docker usa HTTP; o da LAN pode ter certificado próprio
    });
    if (!response.ok) return null;
    const data = Buffer.from(await response.arrayBuffer());
    return data.length >= 1024 ? data : null;
  } catch {
    return null;
  }
}
