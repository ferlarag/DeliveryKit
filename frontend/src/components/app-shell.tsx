import {
  RiInboxLine,
  RiArrowLeftRightLine,
  RiListCheck3,
  RiMoonLine,
  RiSunLine,
  RiWebhookLine,
} from "@remixicon/react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { AdminTokenContext } from "@/lib/use-admin-token";

const navigation = [
  { to: "/", label: "Incoming", icon: RiInboxLine },
  { to: "/destinations", label: "Destinations", icon: RiArrowLeftRightLine },
  { to: "/deliveries", label: "Deliveries", icon: RiListCheck3 },
] as const;

export function AppShell() {
  const [adminToken, setAdminToken] = useState("");
  const { theme, setTheme } = useTheme();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b bg-card/70 backdrop-blur-xl">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <RiWebhookLine className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg">DeliveryKit</span>
          </Link>
          <nav
            aria-label="Main navigation"
            className="col-span-2 row-start-2 flex min-w-0 justify-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:col-span-1 lg:col-start-2 lg:row-start-1"
          >
            {navigation.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
                    "gap-1.5 px-2 sm:gap-2 sm:px-3",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="col-start-2 row-start-1 flex items-center justify-self-end gap-3 lg:col-start-3">
            <div className="hidden items-center gap-2 sm:flex">
              <label
                htmlFor="admin-token"
                className="whitespace-nowrap text-xs font-medium text-muted-foreground"
              >
                Admin token
              </label>
              <Input
                id="admin-token"
                type="password"
                autoComplete="off"
                placeholder="Enter token"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                className="w-44"
              />
            </div>
            <Button
              aria-label="Toggle color theme"
              variant="outline"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <RiSunLine /> : <RiMoonLine />}
            </Button>
          </div>
        </div>
        <div className="mx-auto px-5 pb-4 sm:hidden">
          <label
            htmlFor="admin-token-mobile"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Admin token (kept until refresh)
          </label>
          <Input
            id="admin-token-mobile"
            type="password"
            autoComplete="off"
            placeholder="Needed for destinations and retry"
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
          />
        </div>
      </header>
      <AdminTokenContext.Provider value={adminToken}>
        <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
          <Outlet />
        </main>
      </AdminTokenContext.Provider>
      <footer className="mx-auto max-w-6xl px-5 pb-8 text-xs text-muted-foreground sm:px-8">
        The admin token stays in this tab&apos;s memory until you refresh.
      </footer>
    </div>
  );
}
