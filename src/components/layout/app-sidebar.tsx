"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { inventoryGroupHref, inventoryGroups } from "@/config/inventario";
import { erpModules } from "@/config/modules";
import { cn } from "@/lib/utils";

export function AppSidebar({
  allowedModules,
  homeHref,
}: {
  allowedModules: string[];
  homeHref: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const modules = erpModules.filter((item) => allowedModules.includes(item.slug));
  const showDashboard = allowedModules.length !== 1;
  const onInventory = pathname.startsWith("/inventario");
  const currentGroup = searchParams.get("grupo");
  const [inventoryOpen, setInventoryOpen] = useState(onInventory);

  useEffect(() => {
    if (onInventory) setInventoryOpen(true);
  }, [onInventory]);

  return (
    <aside className="hidden h-svh w-72 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center justify-center border-b px-4">
        <Link href={homeHref} className="flex justify-center">
          <BrandLogo align="center" className="h-7 w-32" />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Módulos
        </p>
        {showDashboard ? (
        <Link
          href="/dashboard"
          className={cn(
            "mb-2 flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
            pathname === "/dashboard"
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
          )}
        >
          Painel
        </Link>
        ) : null}
        <div className="grid gap-0.5">
          {modules.map((item) => {
            const Icon = item.icon;
            const active =
              item.slug === "inventario"
                ? onInventory
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (item.slug === "inventario") {
              return (
                <div key={item.slug} className="grid gap-0.5">
                  <button
                    type="button"
                    onClick={() => setInventoryOpen((open) => !open)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                    <ChevronDown
                      className={cn(
                        "ml-auto size-4 shrink-0 transition-transform",
                        inventoryOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {inventoryOpen ? (
                    <div className="ml-4 grid gap-0.5 border-l border-sidebar-border pl-2">
                      {inventoryGroups.map((group) => {
                        const groupActive =
                          pathname === "/inventario" &&
                          (currentGroup === group.slug ||
                            (!currentGroup && group.slug === "maquinas"));
                        return (
                          <Link
                            key={group.slug}
                            href={inventoryGroupHref(group.slug)}
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                              groupActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                            )}
                          >
                            {group.label}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <Link
                key={item.slug}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
