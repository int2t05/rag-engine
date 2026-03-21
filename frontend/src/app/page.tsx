"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PATH } from "@/lib/routes";

const highlights = [
  { t: "知识库", d: "多格式文档分块与向量化" },
  { t: "对话", d: "流式回答与引用溯源" },
  { t: "API", d: "密钥管理与系统集成" },
];

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.replace(PATH.dashboard);
      return;
    }
    setChecking(false);
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="animate-pulse text-sm text-muted">加载中…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 md:px-10">
        <span className="font-display text-xl font-semibold tracking-tight">RAG Engine</span>
        <div className="flex items-center gap-2">
          <Link
            href={PATH.login}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            登录
          </Link>
          <Link
            href={PATH.register}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            注册
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20 pt-4 md:px-10 md:pt-12">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">检索增强生成</p>
        <h1 className="mt-4 max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          面向文档团队的简洁问答工作台
        </h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
          上传资料、自动索引、用自然语言提问。控制台内完成知识库、对话、评估与 API 密钥管理。
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href={PATH.register}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            开始使用
          </Link>
          <Link
            href={PATH.login}
            className="rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted"
          >
            已有账号
          </Link>
        </div>

        <ul className="mt-20 grid gap-4 sm:grid-cols-3">
          {highlights.map((x) => (
            <li
              key={x.t}
              className="rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-sm"
            >
              <h2 className="font-display text-base font-semibold">{x.t}</h2>
              <p className="mt-2 text-sm text-muted">{x.d}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        RAG Engine · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
