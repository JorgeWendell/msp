import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { NextResponse } from "next/server";

import { assetByAgentToken, bearerToken } from "@/lib/agent-auth";
import { getMeshSettings } from "@/lib/meshcentral";

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
  if (!mesh.enabled || !existsSync(mesh.agentPath)) {
    return NextResponse.json({ error: "Binário remoto ausente." }, { status: 404 });
  }

  const bytes = await readFile(mesh.agentPath);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": 'attachment; filename="AdelMsp.Remote.exe"',
    },
  });
}
