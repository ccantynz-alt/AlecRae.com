import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface PageProps {
  readonly params: Promise<{ slug: readonly string[] }>;
}

const KNOWN_DOCS = new Set([
  "quickstart",
  "authentication",
  "messages",
  "domains",
  "webhooks",
  "errors",
]);

export function generateStaticParams(): Array<{ slug: string[] }> {
  return [...KNOWN_DOCS, "api-reference"].map((s) => ({ slug: [s] }));
}

export async function generateMetadata({ params }: PageProps): Promise<{ title: string }> {
  const { slug } = await params;
  const first = slug[0] ?? "docs";
  const title = first.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { title: `${title} — Vienna Docs` };
}

export default async function DocPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const first = slug[0];

  if (!first) notFound();

  if (first === "api-reference") {
    return (
      <article className="px-8 py-16 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
          API Reference
        </h1>
        <p className="text-blue-100/70 mb-8">
          The full Vienna API is described as an OpenAPI 3.1 specification. Import the spec into
          Postman, Insomnia, or your favorite codegen tool.
        </p>
        <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-3">
          <a
            className="block text-cyan-300 hover:text-cyan-200 underline font-mono text-sm"
            href="https://api.48co.ai/openapi.yaml"
          >
            https://api.48co.ai/openapi.yaml
          </a>
          <a
            className="block text-cyan-300 hover:text-cyan-200 underline font-mono text-sm"
            href="https://api.48co.ai/openapi.json"
          >
            https://api.48co.ai/openapi.json
          </a>
        </div>
        <div className="mt-8">
          <Link href="/" className="text-sm text-blue-200/60 hover:text-cyan-200">← Back to docs</Link>
        </div>
      </article>
    );
  }

  if (!KNOWN_DOCS.has(first)) notFound();

  const filePath = path.join(process.cwd(), "content", `${first}.md`);
  let source: string;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch {
    notFound();
  }

  return (
    <article className="px-8 py-16 max-w-4xl mx-auto">
      <div className="prose prose-invert prose-headings:bg-gradient-to-r prose-headings:from-white prose-headings:via-blue-200 prose-headings:to-cyan-300 prose-headings:bg-clip-text prose-headings:text-transparent prose-a:text-cyan-300 hover:prose-a:text-cyan-200 prose-code:text-cyan-200 prose-pre:bg-slate-900/80 prose-pre:border prose-pre:border-white/10 max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
      </div>
      <div className="mt-12">
        <Link href="/" className="text-sm text-blue-200/60 hover:text-cyan-200">← Back to docs</Link>
      </div>
    </article>
  );
}
