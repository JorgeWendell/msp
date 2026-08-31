import { AppSidebar } from "@/components/layout/app-sidebar";
import { UserMenu } from "@/components/layout/user-menu";

type AppShellProps = {
  companyName: string;
  userName: string;
  userEmail: string;
  allowedModules: string[];
  homeHref: string;
  children: React.ReactNode;
};

export function AppShell({
  companyName,
  userName,
  userEmail,
  allowedModules,
  homeHref,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-svh bg-background">
      <AppSidebar allowedModules={allowedModules} homeHref={homeHref} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b px-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{companyName}</p>
            <p className="text-xs text-muted-foreground">MSP</p>
          </div>
          <UserMenu
            name={userName}
            email={userEmail}
            companyName={companyName}
          />
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
