import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  Command,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Search,
  Send,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  helper: string;
  activePaths?: string[];
};

const businessLinks: NavItem[] = [
  {
    to: "/business",
    label: "Dashboard",
    icon: LayoutDashboard,
    helper: "Company overview",
  },
  {
    to: "/forms",
    label: "Forms",
    icon: ClipboardList,
    helper: "Feedback builders",
    activePaths: ["/forms"],
  },
  {
    to: "/clients",
    label: "Clients",
    icon: UsersRound,
    helper: "Contacts and invites",
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    helper: "Signals and trends",
  },
  {
    to: "/company",
    label: "Company Settings",
    icon: Building2,
    helper: "Workspace controls",
  },
];

const clientLinks: NavItem[] = [
  {
    to: "/submit",
    label: "Forms",
    icon: Send,
    helper: "Submit feedback",
  },
  {
    to: "/responses",
    label: "History",
    icon: MessageSquareText,
    helper: "Submission history",
    activePaths: ["/responses"],
  },
];

const pageTitles: Record<string, string> = {
  "/business": "Dashboard",
  "/clients": "Clients",
  "/forms": "Forms",
  "/forms/new": "New Form",
  "/analytics": "Analytics",
  "/responses": "Responses",
  "/submit": "Forms",
  "/company": "Company Settings",
};

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/forms/") && pathname.endsWith("/edit")) {
    return "Edit Form";
  }
  if (pathname.startsWith("/forms/")) {
    return "Form Details";
  }
  if (pathname.startsWith("/responses/")) {
    return "Response Details";
  }
  return pageTitles[pathname] ?? "FeedbackIQ";
}

function isActiveLink(pathname: string, item: NavItem, isActive: boolean) {
  if (item.activePaths) {
    return item.activePaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  }
  if (isActive) {
    return true;
  }
  return false;
}

function roleLabel(role?: Role) {
  return role === "business" ? "Business" : "Client";
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = user?.role === "business" ? businessLinks : clientLinks;
  const pageTitle = getPageTitle(location.pathname);
  const userInitials = useMemo(() => {
    const source = user?.full_name || user?.email || "FI";
    return source
      .split(/[ @._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, [user?.email, user?.full_name]);

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate("/login");
  }

  const navigation = (
    <nav className="grid gap-1.5">
      {links.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition duration-200 hover:bg-foreground/[0.04] hover:text-foreground",
                "dark:hover:bg-white/[0.06]",
                isActiveLink(location.pathname, item, isActive) &&
                  "bg-foreground text-background shadow-sm hover:bg-foreground hover:text-background [&>span:first-child]:bg-background/15 [&>span:first-child]:text-background dark:bg-white dark:text-black dark:hover:bg-white dark:[&>span:first-child]:bg-black/10 dark:[&>span:first-child]:text-black",
              )
            }
            key={item.label}
            onClick={() => setMobileOpen(false)}
            to={item.to}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground transition group-hover:bg-background group-hover:text-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.label}</span>
              <span className="block truncate text-xs opacity-70">{item.helper}</span>
            </span>
            <ChevronRight className="h-4 w-4 opacity-0 transition group-hover:opacity-60" />
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.11),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.34))] text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[18.5rem] border-r border-border/80 bg-card/80 shadow-[0_0_50px_rgba(15,23,42,0.05)] backdrop-blur-xl lg:flex lg:flex-col">
        <div className="border-b border-border/70 p-5">
          <div className="flex items-center gap-3">
            <div className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-foreground text-sm font-bold text-background shadow-sm">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,hsl(var(--accent)/0.65),transparent_38%),radial-gradient(circle_at_80%_85%,hsl(var(--primary)/0.55),transparent_45%)]" />
              <span className="relative">IQ</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-normal">FeedbackIQ</p>
              <p className="truncate text-xs text-muted-foreground">Feedback intelligence</p>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-border/80 bg-background/75 p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-muted-foreground">Workspace</p>
                <p className="truncate text-sm font-semibold">
                  {user?.role === "business" ? "Company insights" : "Client portal"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-3 px-3 text-[0.68rem] font-semibold uppercase tracking-normal text-muted-foreground">
            Navigation
          </div>
          {navigation}
        </div>

        <div className="border-t border-border/70 p-4">
          <div className="rounded-xl border border-border/80 bg-background/75 p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground text-xs font-semibold text-background">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.full_name || "Signed in"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm lg:hidden">
          <div className="flex h-full w-[min(340px,88vw)] flex-col border-r bg-card shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-foreground text-xs font-bold text-background">
                  IQ
                </div>
                <div>
                  <p className="text-sm font-semibold">FeedbackIQ</p>
                  <p className="text-xs text-muted-foreground">Feedback intelligence</p>
                </div>
              </div>
              <Button
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">{navigation}</div>
          </div>
        </div>
      ) : null}

      <div className="min-h-screen lg:pl-[18.5rem]">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
            <Button
              aria-label="Open navigation"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold md:text-base">{pageTitle}</p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Command center for feedback operations and customer signals
              </p>
            </div>

            <div className="hidden min-w-[260px] max-w-md flex-1 items-center gap-2 rounded-xl border border-border/80 bg-card/80 px-3 py-2 text-sm text-muted-foreground shadow-sm transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 md:flex">
              <Search className="h-4 w-4 shrink-0" />
              <input
                aria-label="Search"
                className="h-6 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search or jump to..."
                type="search"
              />
              <span className="flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
                <Command className="h-3 w-3" />
                K
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Badge
                className="hidden capitalize shadow-sm sm:inline-flex"
                variant={user?.role === "business" ? "default" : "secondary"}
              >
                {roleLabel(user?.role)}
              </Badge>
              <div className="hidden items-center gap-2 rounded-xl border border-border/80 bg-card/80 px-2.5 py-1.5 shadow-sm md:flex">
                <UserRound className="h-4 w-4 text-muted-foreground" />
                <span className="max-w-[140px] truncate text-sm font-medium">
                  {user?.full_name || user?.email}
                </span>
              </div>
              <Button
                aria-label="Logout"
                onClick={handleLogout}
                size="sm"
                type="button"
                variant="outline"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 md:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
