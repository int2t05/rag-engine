"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  BookIcon,
  ChartBarIcon,
  ChatIcon,
  CpuChipIcon,
  HomeIcon,
  LogoutIcon,
  MenuIcon,
  XIcon,
} from "@/components/icons";
import { PATH, breadcrumbsForPath, isDashboardFullBleed } from "@/lib/routes";

const DASHBOARD_NAV = [
  { href: PATH.dashboard, label: "首页", icon: HomeIcon },
  { href: PATH.knowledgeBase, label: "知识库", icon: BookIcon },
  { href: PATH.chat, label: "对话", icon: ChatIcon },
  { href: PATH.evaluation, label: "RAG 评估", icon: ChartBarIcon },
  { href: PATH.modelConfig, label: "模型配置", icon: CpuChipIcon },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [username, setUsername] = useState("");
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const breadcrumbs = useMemo(() => breadcrumbsForPath(pathname), [pathname]);
  const mainBleed = isDashboardFullBleed(pathname);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sidebarOpen");
      if (stored !== null) setSidebarOpen(stored === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarOpen", String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace(PATH.login);
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUsername(payload.sub || "用户");
    } catch {
      setUsername("用户");
    }
    setReady(true);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.replace(PATH.login);
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <p className="animate-pulse text-sm text-muted">加载中…</p>
      </div>
    );
  }

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <Link href={PATH.dashboard} className="font-display text-lg font-semibold tracking-tight text-ink">
          RAG Engine
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="p-1 text-muted hover:text-ink md:hidden"
          aria-label="关闭菜单"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <nav className="stagger-reveal flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {DASHBOARD_NAV.map((item) => {
          const active =
            item.href === PATH.dashboard ? pathname === PATH.dashboard : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-accent-muted text-accent" : "text-muted hover:bg-surface-muted hover:text-ink"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-muted text-sm font-semibold text-accent">
            {username.charAt(0).toUpperCase()}
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{username}</p>
          <button
            type="button"
            onClick={handleLogout}
            title="退出登录"
            className="shrink-0 text-muted transition-colors hover:text-red-600"
          >
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <aside
        className={`hidden shrink-0 flex-col border-r border-border bg-surface transition-all duration-200 md:flex ${
          sidebarOpen ? "w-56" : "w-0 overflow-hidden border-0"
        }`}
      >
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40 animate-fade-in"
            aria-label="关闭遮罩"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 z-50 flex w-64 flex-col bg-surface shadow-xl animate-slide-in-left">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:px-5">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.innerWidth < 768) {
                setMobileOpen(true);
              } else {
                setSidebarOpen((o) => !o);
              }
            }}
            className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-ink"
            aria-label="切换侧边栏"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          {breadcrumbs.length > 1 && (
            <nav className="hidden min-w-0 items-center text-sm text-muted sm:flex" aria-label="面包屑">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.href} className="flex min-w-0 items-center">
                  {i > 0 && (
                    <span className="mx-1.5 text-border" aria-hidden>
                      /
                    </span>
                  )}
                  {i === breadcrumbs.length - 1 ? (
                    <span className="truncate font-medium text-ink">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="truncate hover:text-ink">
                      {crumb.label}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          )}
        </header>

        <main
          className={`min-h-0 flex-1 ${mainBleed ? "overflow-hidden p-0" : "overflow-auto p-4 md:p-6"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
