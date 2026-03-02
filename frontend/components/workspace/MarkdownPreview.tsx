"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <article className="prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-a:text-cyan-400 prose-strong:text-gray-200 prose-code:text-emerald-400 prose-pre:bg-[#0f1117] prose-pre:border prose-pre:border-gray-800 prose-th:text-gray-300 prose-td:text-gray-400 prose-hr:border-gray-800">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </article>
    </div>
  );
}
