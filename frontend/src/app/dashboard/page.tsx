"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { knowledgeBaseApi, chatApi, apiKeyApi, evaluationApi, ApiError } from "@/lib/api";
import { BookIcon, ChatIcon, ChartBarIcon, KeyIcon, PlusIcon } from "@/components/icons";

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<{ kb: number; chat: number; keys: number; eval: number } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
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
          router.replace("/login");
        }
      }
    })();
  }, [router]);

  const cards = [
    {
      href: "/dashboard/knowledge-base",
      icon: BookIcon,
      iconBg: "bg-blue-50 group-hover:bg-blue-100",
      iconColor: "text-blue-600",
      title: "知识库",
      desc: "管理文档与知识库",
      count: stats?.kb,
      action: "查看全部",
    },
    {
      href: "/dashboard/chat",
      icon: ChatIcon,
      iconBg: "bg-green-50 group-hover:bg-green-100",
      iconColor: "text-green-600",
      title: "对话",
      desc: "基于知识库的智能问答",
      count: stats?.chat,
      action: "开始对话",
    },
    {
      href: "/dashboard/api-keys",
      icon: KeyIcon,
      iconBg: "bg-amber-50 group-hover:bg-amber-100",
      iconColor: "text-amber-600",
      title: "API 密钥",
      desc: "管理外部访问凭证",
      count: stats?.keys,
      action: "管理密钥",
    },
    {
      href: "/dashboard/evaluation",
      icon: ChartBarIcon,
      iconBg: "bg-violet-50 group-hover:bg-violet-100",
      iconColor: "text-violet-600",
      title: "RAG 评估",
      desc: "评估检索与生成效果",
      count: stats?.eval,
      action: "查看评估",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">欢迎回来</h1>
      <p className="text-gray-500 text-sm mb-8">快速访问常用功能</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-blue-200 transition-all group"
          >
            <div
              className={`w-11 h-11 ${card.iconBg} rounded-lg flex items-center justify-center mb-4 transition-colors`}
            >
              <card.icon className={`w-5.5 h-5.5 ${card.iconColor}`} />
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">{card.title}</h3>
            <p className="text-sm text-gray-500 mb-3">{card.desc}</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-bold text-gray-800">
                {card.count ?? (
                  <span className="inline-block w-6 h-6 bg-gray-100 rounded animate-pulse" />
                )}
              </p>
              <span className="text-xs text-blue-600 font-medium">
                {card.action} &rarr;
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-3">快捷操作</h3>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/knowledge-base/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            新建知识库
          </Link>
          <Link
            href="/dashboard/chat"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ChatIcon className="w-4 h-4" />
            新建对话
          </Link>
          <Link
            href="/dashboard/evaluation/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ChartBarIcon className="w-4 h-4" />
            新建评估
          </Link>
        </div>
      </div>
    </div>
  );
}
