"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, ApiError } from "@/lib/api";
import { PASSWORD_MIN_LENGTH } from "@/lib/api-errors";
import { PATH } from "@/lib/routes";
import { AuthSplitLayout } from "@/components/layout/AuthSplitLayout";

const inputClass =
  "block w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) router.replace(PATH.dashboard);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const username = fd.get("username") as string;
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    const confirmPassword = fd.get("confirmPassword") as string;

    if (!username?.trim() || !email?.trim() || !password || !confirmPassword) {
      setError("请填写用户名、邮箱、密码和确认密码");
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致，请检查后重试");
      setLoading(false);
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`密码至少需要 ${PASSWORD_MIN_LENGTH} 位字符（与系统要求一致）`);
      setLoading(false);
      return;
    }

    try {
      await authApi.register({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      setSuccess("注册成功，正在跳转登录…");
      setTimeout(() => router.push(PATH.login), 1200);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "网络异常或服务器繁忙，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  };

  const EyeToggle = (
    <button
      type="button"
      onClick={() => setShowPwd(!showPwd)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
      tabIndex={-1}
    >
      {showPwd ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
          />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      )}
    </button>
  );

  return (
    <AuthSplitLayout title="创建账号" subtitle="注册后即可创建知识库与对话">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">用户名</label>
          <input
            name="username"
            type="text"
            required
            autoComplete="username"
            placeholder="用于登录，请勿使用敏感信息"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">邮箱</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="name@example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">密码</label>
          <div className="relative">
            <input
              name="password"
              type={showPwd ? "text" : "password"}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位`}
              className={`${inputClass} pr-10`}
            />
            {EyeToggle}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            至少 {PASSWORD_MIN_LENGTH} 位字符；建议使用字母、数字组合，勿与常用网站密码相同。
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">确认密码</label>
          <input
            name="confirmPassword"
            type={showPwd ? "text" : "password"}
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            placeholder="再次输入以确认"
            className={inputClass}
          />
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        {success && (
          <div className="rounded-lg border border-accent/30 bg-accent-muted px-3 py-2 text-sm text-accent">{success}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-muted"
        >
          {loading ? "注册中…" : "注册"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        已有账号？
        <Link href={PATH.login} className="ml-1 font-medium text-accent hover:text-accent-hover">
          登录
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
