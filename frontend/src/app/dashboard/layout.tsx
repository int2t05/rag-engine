"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { BookIcon, ChartBarIcon, ChatIcon, HomeIcon, KeyIcon, LogoutIcon, MenuIcon, XIcon } from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "首页", icon: HomeIcon },
  { href: "/dashboard/knowledge-base", label: "知识库", icon: BookIcon },
  { href: "/dashboard/chat", label: "对话", icon: ChatIcon },
  { href: "/dashboard/evaluation", label: "RAG 评估", icon: ChartBarIcon },
  { href: "/dashboard/api-keys", label: "API 密钥", icon: KeyIcon },
];

const BREADCRUMB_MAP: Record<string, string> = {
  "/dashboard": "首页",
  "/dashboard/knowledge-base": "知识库",
  "/dashboard/knowledge-base/new": "新建知识库",
  "/dashboard/chat": "对话",
  "/dashboard/evaluation": "RAG 评估",
  "/dashboard/evaluation/new": "新建评估",
  "/dashboard/api-keys": "API 密钥",
};

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const mapped = BREADCRUMB_MAP[href];

    if (mapped) {
      crumbs.push({ label: mapped, href });
    } else if (segments[i] === "edit") {
      crumbs.push({ label: "编辑", href });
    } else if (segments[i] === "documents") {
      continue;
    } else if (i > 0 && segments[i - 1] === "documents") {
      crumbs.push({ label: "文档详情", href });
    } else if (/^\d+$/.test(segments[i])) {
      if (segments[i - 1] === "knowledge-base") {
        crumbs.push({ label: "知识库详情", href });
      } else if (segments[i - 1] === "evaluation") {
        crumbs.push({ label: "评估详情", href });
      }
    }
  }
  return crumbs;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [username, setUsername] = useState("");
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const breadcrumbs = useMemo(() => getBreadcrumbs(pathname), [pathname]);

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
      router.replace("/login");
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
    router.replace("/login");
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  const sidebarContent = (
    <>
      <div className="h-16 flex items-center justify-between px-5 border-b border-gray-200">
        <Link href="/dashboard" className="text-lg font-bold text-gray-800">
          RAG Engine
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden text-gray-400 hover:text-gray-600 p-1"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 truncate">
              {username}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="退出登录"
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <LogoutIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex ${
          sidebarOpen ? "w-60" : "w-0 overflow-hidden"
        } flex-shrink-0 bg-white border-r border-gray-200 transition-all duration-200 flex-col`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-64 bg-white flex flex-col z-50 animate-slide-in-left shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="h-14 shrink-0 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 gap-3">
          <button
            onClick={() => {
              if (window.innerWidth < 768) {
                setMobileOpen(true);
              } else {
                setSidebarOpen(!sidebarOpen);
              }
            }}
            className="text-gray-500 hover:text-gray-700 transition-colors p-1 rounded hover:bg-gray-100"
            aria-label="切换侧边栏"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          {/* Breadcrumbs */}
          {breadcrumbs.length > 1 && (
            <nav className="hidden sm:flex items-center text-sm text-gray-500">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.href} className="flex items-center">
                  {i > 0 && (
                    <svg className="w-3.5 h-3.5 mx-1.5 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                  {i === breadcrumbs.length - 1 ? (
                    <span className="text-gray-800 font-medium">{crumb.label}</span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="hover:text-gray-700 transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          )}
        </header>

        <main
          className={`flex-1 min-h-0 overflow-auto ${
            pathname === "/dashboard/chat" ? "p-0" : "p-4 md:p-6"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
