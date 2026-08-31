"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { connectMeshSession } from "@/actions/inventario";

export function RemoteDesktop({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void connectMeshSession({ id }).then((result) => {
      if (cancelled) return;
      if (result.serverError || !result.data?.url) {
        setError(result.serverError || "Não foi possível abrir o remoto.");
        return;
      }
      setUrl(result.data.url);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link href="/inventario" className="text-sm font-medium text-primary hover:underline">
          Voltar ao inventário
        </Link>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Abrindo área de trabalho...
      </div>
    );
  }

  return (
    <iframe
      title="Área de Trabalho"
      src={url}
      className="h-full w-full border-0 bg-black"
      allow="clipboard-read; clipboard-write; fullscreen; display-capture"
    />
  );
}
