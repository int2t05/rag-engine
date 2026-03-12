"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");

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
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.replace("/login");
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">RAG Engine</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">欢迎，{username}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-700 transition-colors"
            >
              退出登录
            </button>
          </div>
        </div>
      </nav>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">知识库管理</h2>
          <p className="text-gray-500">登录成功！知识库功能开发中...</p>
        </div>
      </div>
    </main>
  );
}
