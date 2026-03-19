/**
 * @fileoverview Markdown 渲染组件
 * @description 将 Markdown 文本渲染为安全的 HTML，支持代码高亮、引用、列表等常用语法
 *
 * 支持的语法：
 * - 标题（h1-h6）
 * - 粗体、斜体、行内代码
 * - 链接（自动添加安全属性）
 * - 引用块
 * - 有序列表、无序列表
 * - 代码块（带语言标识和语法高亮占位）
 * - 水平线
 * - 引用标记 [citation:N]（用于 RAG 对话）
 */

"use client";

import { useMemo, useRef, useEffect } from "react";

/**
 * HTML 转义
 * @description 防止 XSS 攻击
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 渲染行内元素
 * @description 处理粗体、斜体、行内代码、链接、引用标记等
 */
function renderInline(text: string): string {
  let result = escapeHtml(text);

  // 粗体 **text**
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // 斜体 *text* 或 _text_
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/_(.+?)_/g, "<em>$1</em>");

  // 删除线 ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // 行内代码 `code`
  result = result.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // 链接 [text](url) - 仅允许安全协议，防止 XSS
  const safeProtocols = /^(https?:|mailto:|#)/i;
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, linkText, url) => {
      const trimmed = url.trim();
      const safeText = escapeHtml(linkText);
      if (safeProtocols.test(trimmed)) {
        return `<a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer" class="md-link">${safeText}</a>`;
      }
      return safeText; // 不安全 URL 仅渲染为纯文本
    },
  );

  // RAG 引用标记 [citation:N]
  result = result.replace(
    /\[citation:(\d+)\]/g,
    '<sup class="md-citation">[$1]</sup>',
  );

  return result;
}

/**
 * Markdown 转 HTML
 * @description 完整解析 Markdown 文本，转换为安全的 HTML 字符串
 */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" = "ul";
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  /**
   * 关闭列表
   */
  const flushList = () => {
    if (inList) {
      html.push(`</${listType}>`);
      inList = false;
    }
  };

  /**
   * 关闭表格
   */
  const flushTable = () => {
    if (inTable) {
      const headerCells = tableHeaders
        .map((h) => `<th class="md-th">${h}</th>`)
        .join("");
      const bodyRows = tableRows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td class="md-td">${cell}</td>`).join("")}</tr>`,
        )
        .join("");
      html.push(
        `<table class="md-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`,
      );
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ========== 代码块 ==========
    if (inCodeBlock) {
      if (line.trimEnd() === "```") {
        inCodeBlock = false;
        const langClass = codeLang ? ` language-${codeLang}` : "";
        html.push(
          `<div class="md-code-block"><div class="md-code-header"><span class="md-code-lang${langClass}">${escapeHtml(codeLang || "code")}</span><button class="md-code-copy" onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent)">复制</button></div><pre><code class="md-code${langClass}">${escapeHtml(codeLines.join("\n"))}</code></pre></div>`,
        );
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      continue;
    }

    // 开始代码块
    if (line.startsWith("```")) {
      flushList();
      flushTable();
      inCodeBlock = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      continue;
    }

    // ========== 标题 ==========
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      flushTable();
      const level = headingMatch[1].length;
      html.push(
        `<h${level} class="md-h${level}">${renderInline(headingMatch[2])}</h${level}>`,
      );
      continue;
    }

    // ========== 水平线 ==========
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      flushTable();
      html.push('<hr class="md-hr"/>');
      continue;
    }

    // ========== 表格 ==========
    // 表头行 | col1 | col2 |
    if (/^\|.*\|$/.test(line.trim()) && !inTable) {
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      if (cells.every((c) => c.match(/^-+$/))) {
        // 分隔行 |---|---|
        continue;
      }
      flushList();
      flushTable();
      inTable = true;
      tableHeaders = cells;
      continue;
    }

    // 表格数据行
    if (/^\|.*\|$/.test(line.trim()) && inTable) {
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      if (cells.every((c) => c.match(/^-+$/))) {
        continue;
      }
      tableRows.push(cells);
      continue;
    }

    // 空行关闭表格
    if (line.trim() === "" && inTable) {
      flushTable();
      continue;
    }

    // ========== 无序列表 ==========
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushTable();
      if (!inList || listType !== "ul") {
        flushList();
        html.push('<ul class="md-ul">');
        inList = true;
        listType = "ul";
      }
      html.push(`<li class="md-li">${renderInline(ulMatch[2])}</li>`);
      continue;
    }

    // ========== 有序列表 ==========
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      flushTable();
      if (!inList || listType !== "ol") {
        flushList();
        html.push('<ol class="md-ol">');
        inList = true;
        listType = "ol";
      }
      html.push(`<li class="md-li">${renderInline(olMatch[2])}</li>`);
      continue;
    }

    // ========== 引用块 ==========
    if (line.startsWith("> ")) {
      flushList();
      flushTable();
      html.push(
        `<blockquote class="md-blockquote">${renderInline(line.slice(2))}</blockquote>`,
      );
      continue;
    }

    // ========== 空行 ==========
    if (line.trim() === "") {
      flushList();
      flushTable();
      continue;
    }

    // ========== 段落 ==========
    flushList();
    flushTable();
    html.push(`<p class="md-p">${renderInline(line)}</p>`);
  }

  // 处理未关闭的代码块
  if (inCodeBlock) {
    html.push(
      `<div class="md-code-block"><div class="md-code-header">${escapeHtml(codeLang || "code")}</div><pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre></div>`,
    );
  }

  flushList();
  flushTable();

  return html.join("");
}

// ==================== 组件接口 ====================

interface MarkdownProps {
  /** Markdown 文本内容 */
  content: string;
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * Markdown 渲染组件
 * @description 将 Markdown 内容渲染为安全的 HTML
 *
 * @example
 * <Markdown content="# Hello\n\nThis is **bold** text." />
 */
export function Markdown({ content, className = "" }: MarkdownProps) {
  const html = useMemo(() => markdownToHtml(content), [content]);
  const containerRef = useRef<HTMLDivElement>(null);

  // 复制按钮功能（通过原生事件委托）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("md-code-copy")) {
        const code = target.nextElementSibling?.querySelector("code")?.textContent;
        if (code) {
          navigator.clipboard.writeText(code);
          const originalText = target.textContent;
          target.textContent = "已复制";
          setTimeout(() => {
            target.textContent = originalText;
          }, 1500);
        }
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`md-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
