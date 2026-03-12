"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username");
    const email = formData.get("email");
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");

    // 前端校验
    if (!username || !email || !password || !confirmPassword) {
      setError("所有字段都不能为空");
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      setLoading(false);
      return;
    }
    if ((password as string).length < 6) {
      setError("密码长度不能少于6位");
      setLoading(false);
      return;
    }

    try {
      // 调用注册接口
      await api.post(
        "/api/auth/register",
        { username, email, password } // JSON 格式请求体
      );

      // 注册成功
      setSuccess("注册成功！即将跳转到登录页...");
      // 1秒后跳转到登录页
      setTimeout(() => {
        router.push("/login");
      }, 1000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 border border-gray-200 rounded-lg bg-white shadow-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">用户注册</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 用户名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700">用户名</label>
            <input 
              name="username" 
              type="text" 
              required 
              className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {/* 邮箱 */}
          <div>
            <label className="block text-sm font-medium text-gray-700">邮箱</label>
            <input 
              name="email" 
              type="email" 
              required 
              className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {/* 密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700">密码</label>
            <input 
              name="password" 
              type="password" 
              required 
              className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {/* 确认密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700">确认密码</label>
            <input 
              name="confirmPassword" 
              type="password" 
              required 
              className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {/* 错误/成功提示 */}
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          {success && <p className="text-green-500 text-sm text-center">{success}</p>}
          {/* 注册按钮 */}
          <button 
            type="submit" 
            disabled={loading} 
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? "注册中..." : "注册"}
          </button>
        </form>
        {/* 登录链接 */}
        <p className="mt-4 text-sm text-gray-600 text-center">
          已有账号？<Link href="/login" className="text-blue-600 hover:underline">立即登录</Link>
        </p>
      </div>
    </main>
  );
}