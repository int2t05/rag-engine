/**
 * 应用路由单一来源：导航、面包屑、router.push 均应由此导出，避免魔法字符串分叉。
 * 鉴权仍依赖客户端 localStorage（token）；Edge Middleware 无法读取，故保护逻辑在 dashboard layout。
 */

export const PATH = {
  home: "/",
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
  knowledgeBase: "/dashboard/knowledge-base",
  knowledgeBaseNew: "/dashboard/knowledge-base/new",
  knowledgeBaseDetail: (id: string | number) => `/dashboard/knowledge-base/${id}`,
  knowledgeBaseEdit: (id: string | number) => `/dashboard/knowledge-base/${id}/edit`,
  documentDetail: (kbId: string | number, docId: string | number) =>
    `/dashboard/knowledge-base/${kbId}/documents/${docId}`,
  chunkDetail: (kbId: string | number, chunkId: string) =>
    `/dashboard/knowledge-base/${kbId}/chunks/${encodeURIComponent(chunkId)}`,
  chat: "/dashboard/chat",
  evaluation: "/dashboard/evaluation",
  evaluationNew: "/dashboard/evaluation/new",
  evaluationDetail: (id: string | number) => `/dashboard/evaluation/${id}`,
  modelConfig: "/dashboard/model-config",
} as const;

/** 主内容区全宽、无外边距（如对话全屏） */
export const DASHBOARD_FULL_BLEED_PATHS: readonly string[] = [PATH.chat];

const STATIC_CRUMB: Record<string, string> = {
  [PATH.dashboard]: "首页",
  [PATH.knowledgeBase]: "知识库",
  [PATH.knowledgeBaseNew]: "新建知识库",
  [PATH.chat]: "对话",
  [PATH.evaluation]: "RAG 评估",
  [PATH.evaluationNew]: "新建评估",
  [PATH.modelConfig]: "模型配置",
};

export function breadcrumbsForPath(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const mapped = STATIC_CRUMB[href];

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

export function isDashboardFullBleed(pathname: string): boolean {
  return DASHBOARD_FULL_BLEED_PATHS.includes(pathname);
}
