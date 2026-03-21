import Link from "next/link";
import { PATH } from "@/lib/routes";

type AuthSplitLayoutProps = {
  children: React.ReactNode;
  title: string;
  subtitle: string;
};

export function AuthSplitLayout({ children, title, subtitle }: AuthSplitLayoutProps) {
  return (
    <main className="min-h-screen flex bg-surface-muted">
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-center border-r border-border bg-ink px-12 py-16 text-canvas">
        <Link href={PATH.home} className="font-display text-2xl font-semibold tracking-tight">
          RAG Engine
        </Link>
        <p className="mt-10 max-w-sm text-sm leading-relaxed text-canvas/75">
          检索增强生成：文档入库、向量检索、带引用的回答。为团队知识场景而设计。
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <Link href={PATH.home} className="mb-10 block lg:hidden">
            <span className="font-display text-xl font-semibold text-ink">RAG Engine</span>
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
