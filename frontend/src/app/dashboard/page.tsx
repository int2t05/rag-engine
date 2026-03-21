"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { knowledgeBaseApi, chatApi, apiKeyApi, evaluationApi, ApiError } from "@/lib/api";
import { PATH } from "@/lib/routes";
import { BookIcon, ChatIcon, ChartBarIcon, KeyIcon, PlusIcon } from "@/components/icons";

const modules = [
  { href: PATH.knowledgeBase, icon: BookIcon, title: "知识库", desc: "文档与索引", key: "kb" as const },
  { href: PATH.chat, icon: ChatIcon, title: "对话", desc: "RAG 问答", key: "chat" as const },
  { href: PATH.apiKeys, icon: KeyIcon, title: "API 密钥", desc: "对外集成", key: "keys" as const },
  { href: PATH.evaluation, icon: ChartBarIcon, title: "RAG 评估", desc: "检索与生成", key: "eval" as const },
];

const quickLinks = [
  { href: PATH.knowledgeBaseNew, label: "新建知识库", icon: PlusIcon, primary: true },
  { href: PATH.chat, label: "去对话", icon: ChatIcon, primary: false },
  { href: PATH.evaluationNew, label: "新建评估", icon: ChartBarIcon, primary: false },
];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<{ kb: number; chat: number; keys: number; eval: number } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace(PATH.login);
      return;
    }

    (async () => {
      try {
        const [kbList, chatList, keyList, evalList] = await Promise.all([
          knowledgeBaseApi.list(),
          chatApi.list(),
          apiKeyApi.list(),
          evaluationApi.list(),
        ]);
        setStats({
          kb: Array.isArray(kbList) ? kbList.length : 0,
          chat: Array.isArray(chatList) ? chatList.length : 0,
          keys: Array.isArray(keyList) ? keyList.length : 0,
          eval: Array.isArray(evalList) ? evalList.length : 0,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace(PATH.login);
        }
      }
    })();
  }, [router]);

  const countFor = (key: (typeof modules)[number]["key"]) => {
    if (!stats) return null;
    return stats[key];
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold text-ink">工作台</h1>
      <p className="mt-1 text-sm text-muted">常用入口与数量一览</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group rounded-xl border border-border bg-surface p-5 transition-all hover:border-accent/30 hover:shadow-sm"
          >
            <m.icon className="h-5 w-5 text-accent" />
            <h2 className="mt-3 font-medium text-ink">{m.title}</h2>
            <p className="mt-0.5 text-xs text-muted">{m.desc}</p>
            <p className="mt-4 font-display text-2xl font-semibold tabular-nums text-ink">
              {countFor(m.key) ?? <span className="inline-block h-7 w-8 animate-pulse rounded bg-surface-muted" />}
            </p>
          </Link>
        ))}
      </div>

      <section className="mt-10 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">快捷操作</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {quickLinks.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                q.primary
                  ? "bg-accent text-white hover:bg-accent-hover"
                  : "border border-border bg-surface-muted text-ink hover:bg-border/40"
              }`}
            >
              <q.icon className="h-4 w-4" />
              {q.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
