"use client";

import { useMemo } from "react";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  let result = escapeHtml(text);
  // bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // italic
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // inline code
  result = result.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // links
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>',
  );
  // citation markers [citation:N]
  result = result.replace(
    /\[citation:(\d+)\]/g,
    '<sup class="md-citation">[$1]</sup>',
  );
  return result;
}

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" = "ul";

  const flushList = () => {
    if (inList) {
      html.push(`</${listType}>`);
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inCodeBlock) {
      if (line.trimEnd() === "```") {
        inCodeBlock = false;
        html.push(
          `<div class="md-code-block"><div class="md-code-header">${codeLang || "code"}</div><pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre></div>`,
        );
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushList();
      inCodeBlock = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      continue;
    }

    // headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      html.push(`<h${level} class="md-h${level}">${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      html.push('<hr class="md-hr"/>');
      continue;
    }

    // unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== "ul") {
        flushList();
        html.push('<ul class="md-ul">');
        inList = true;
        listType = "ul";
      }
      html.push(`<li>${renderInline(ulMatch[2])}</li>`);
      continue;
    }

    // ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== "ol") {
        flushList();
        html.push('<ol class="md-ol">');
        inList = true;
        listType = "ol";
      }
      html.push(`<li>${renderInline(olMatch[2])}</li>`);
      continue;
    }

    // blockquote
    if (line.startsWith("> ")) {
      flushList();
      html.push(`<blockquote class="md-blockquote">${renderInline(line.slice(2))}</blockquote>`);
      continue;
    }

    // empty line
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // paragraph
    flushList();
    html.push(`<p class="md-p">${renderInline(line)}</p>`);
  }

  if (inCodeBlock) {
    html.push(
      `<div class="md-code-block"><div class="md-code-header">${codeLang || "code"}</div><pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre></div>`,
    );
  }
  flushList();

  return html.join("");
}

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className = "" }: MarkdownProps) {
  const html = useMemo(() => markdownToHtml(content), [content]);

  return (
    <div
      className={`md-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
