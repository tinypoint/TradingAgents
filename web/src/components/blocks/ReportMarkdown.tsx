import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "../../styles/markdown.css";

type ReportMarkdownProps = {
  content: string;
  emptyText?: string;
};

export function ReportMarkdown({ content, emptyText = "No content." }: ReportMarkdownProps) {
  if (!content) return <p>{emptyText}</p>;

  return (
    <article className="markdown-prose max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </article>
  );
}

