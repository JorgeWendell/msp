import type { Metadata } from "next";

import { VaultBoard } from "@/components/cofre/vault-board";

export const metadata: Metadata = {
  title: "Cofre",
};

export default function CofrePage() {
  return <VaultBoard />;
}
