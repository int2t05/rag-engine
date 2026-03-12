"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.replace("/dashboard");
    }
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">RAG Engine</h1>
      <p className="text-gray-500 text-lg mb-8">基于检索增强的知识库问答系统</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-6 py-3 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
        >
          登录
        </Link>
        <Link
          href="/register"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          注册
        </Link>
      </div>
    </main>
  );
}
