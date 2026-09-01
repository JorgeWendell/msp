import { NextResponse } from "next/server";

import { assetByAgentToken, bearerToken } from "@/lib/agent-auth";
import { resolveMeshSettings } from "@/lib/meshcentral";

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Token ausente." }, { status: 401 });
  }

  const owned = await assetByAgentToken(token);
  if (!owned) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const mesh = await resolveMeshSettings();
  if (!mesh.enabled || !mesh.meshId || !mesh.meshServer) {
    return NextResponse.json({ error: "Remoto não configurado." }, { status: 404 });
  }

  return NextResponse.json({
    meshName: mesh.meshName,
    meshId: mesh.meshId,
    serverId: mesh.serverId || undefined,
    meshServer: mesh.meshServer,
    agentName: `adelmsp-${owned.id}`,
    agentDownloadUrl: "/api/agent/mesh-remote",
  });
}
