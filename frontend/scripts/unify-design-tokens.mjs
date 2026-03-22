/**
 * 一次性将 tailwind 原子类从 gray/blue 迁移到项目语义 token（ink、accent 等）。
 * 用法：node scripts/unify-design-tokens.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const FILES = [
  "src/app/dashboard/knowledge-base/[id]/page.tsx",
  "src/app/dashboard/knowledge-base/[id]/documents/[docId]/page.tsx",
  "src/app/dashboard/knowledge-base/[id]/chunks/[chunkId]/page.tsx",
  "src/app/dashboard/knowledge-base/[id]/edit/page.tsx",
  "src/app/dashboard/knowledge-base/page.tsx",
  "src/app/dashboard/knowledge-base/new/page.tsx",
  "src/app/dashboard/evaluation/page.tsx",
  "src/app/dashboard/evaluation/new/page.tsx",
  "src/app/dashboard/evaluation/[id]/page.tsx",
  "src/app/dashboard/model-config/page.tsx",
  "src/app/dashboard/page.tsx",
  "src/app/page.tsx",
  "src/app/login/page.tsx",
  "src/app/register/page.tsx",
  "src/components/layout/AuthSplitLayout.tsx",
  "src/components/Markdown.tsx",
];

/** 先匹配长的、再短的，避免误伤 */
const REPLACEMENTS = [
  ["bg-blue-600 text-white", "bg-accent text-surface"],
  ["hover:bg-blue-700", "hover:bg-accent-hover"],
  ["focus:ring-2 focus:ring-blue-500 focus:border-blue-500", "focus:ring-2 focus:ring-accent/30 focus:border-accent"],
  ["focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500", "focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"],
  ["text-gray-800", "text-ink"],
  ["text-gray-900", "text-ink"],
  ["text-gray-700", "text-ink"],
  ["text-gray-600", "text-muted"],
  ["text-gray-500", "text-muted"],
  ["text-gray-400", "text-muted"],
  ["text-gray-300", "text-muted"],
  ["border-gray-200", "border-border"],
  ["border-gray-100", "border-border"],
  ["divide-gray-100", "divide-border"],
  ["divide-gray-200", "divide-border"],
  ["hover:bg-gray-50", "hover:bg-surface-muted"],
  ["hover:bg-gray-100", "hover:bg-surface-muted"],
  ["bg-gray-50", "bg-surface-muted"],
  ["bg-gray-100", "bg-surface-muted"],
  ["bg-white", "bg-surface"],
  ["border-gray-300", "border-border"],
  ["focus:ring-blue-500", "focus:ring-accent"],
  ["focus:border-blue-500", "focus:border-accent"],
  ["ring-blue-500", "ring-accent"],
  ["border-blue-400", "border-accent"],
  ["border-blue-300", "border-accent/40"],
  ["border-blue-200", "border-accent/30"],
  ["border-blue-100", "border-accent/30"],
  ["bg-blue-50/60", "bg-accent-muted/80"],
  ["bg-blue-50/50", "bg-accent-muted/70"],
  ["bg-blue-50", "bg-accent-muted"],
  ["hover:bg-blue-50", "hover:bg-accent-muted"],
  ["hover:text-blue-700", "hover:text-accent-hover"],
  ["text-blue-700", "text-accent"],
  ["text-blue-600", "text-accent"],
  ["text-blue-500", "text-accent"],
  ["bg-blue-600", "bg-accent"],
];

for (const rel of FILES) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) {
    console.warn("skip missing:", rel);
    continue;
  }
  let s = fs.readFileSync(fp, "utf8");
  const orig = s;
  for (const [a, b] of REPLACEMENTS) {
    s = s.split(a).join(b);
  }
  if (s !== orig) {
    fs.writeFileSync(fp, s, "utf8");
    console.log("updated:", rel);
  }
}

console.log("done.");
