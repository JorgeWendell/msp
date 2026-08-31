import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { getModuleBySlug } from "@/config/modules";
import { canAccessModule, getAccessForSession } from "@/lib/access";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}): Promise<Metadata> {
  const { module: slug } = await params;
  const module = getModuleBySlug(slug);

  return {
    title: module?.title ?? "Módulo",
  };
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: slug } = await params;
  const module = getModuleBySlug(slug);

  if (!module || slug === "cadastros" || slug === "tickets" || slug === "inventario" || slug === "cofre" || slug === "conhecimento") {
    notFound();
  }

  const access = await getAccessForSession();
  if (!access || !canAccessModule(access, slug)) {
    return <AccessDenied title={module.title} />;
  }

  return <ModulePlaceholder module={module} />;
}
