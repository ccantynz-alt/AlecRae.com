import { CodeBlock } from "./code-block";

interface Parameter {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
  readonly example?: string;
}

interface EndpointCardProps {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly description: string;
  readonly parameters?: readonly Parameter[];
  readonly requestBody?: string;
  readonly responseExample?: string;
  readonly curlExample: string;
  readonly jsExample: string;
  readonly pythonExample: string;
  readonly scopes?: readonly string[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  PATCH: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  DELETE: "bg-red-500/20 text-red-300 border-red-500/30",
};

export function EndpointCard({
  method,
  path,
  description,
  parameters,
  requestBody,
  responseExample,
  curlExample,
  jsExample,
  pythonExample,
  scopes,
}: EndpointCardProps): React.JSX.Element {
  const colorClass = METHOD_COLORS[method] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm overflow-hidden mb-8">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono border ${colorClass}`}>
            {method}
          </span>
          <code className="text-sm font-mono text-white/90">{path}</code>
        </div>
        <p className="text-blue-100/70 text-sm leading-relaxed">{description}</p>
        {scopes && scopes.length > 0 ? (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-blue-200/40">Required scopes:</span>
            {scopes.map((scope) => (
              <span key={scope} className="text-xs font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                {scope}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {parameters && parameters.length > 0 ? (
        <div className="p-6 border-b border-white/10">
          <h4 className="text-sm font-semibold text-white/80 mb-3 uppercase tracking-wider">Parameters</h4>
          <div className="space-y-2">
            {parameters.map((param) => (
              <div key={param.name} className="flex items-start gap-3 text-sm">
                <code className="font-mono text-cyan-300 shrink-0 mt-0.5">{param.name}</code>
                <span className="text-blue-200/40 shrink-0">{param.type}</span>
                {param.required ? (
                  <span className="text-xs text-red-400/80 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">required</span>
                ) : (
                  <span className="text-xs text-blue-200/30 bg-white/5 px-1.5 py-0.5 rounded shrink-0">optional</span>
                )}
                <span className="text-blue-100/60">{param.description}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {requestBody ? (
        <div className="border-b border-white/10">
          <CodeBlock code={requestBody} language="json" title="Request Body" />
        </div>
      ) : null}

      <div className="border-b border-white/10">
        <CodeBlock code={curlExample} language="bash" title="curl" />
      </div>
      <div className="border-b border-white/10">
        <CodeBlock code={jsExample} language="javascript" title="JavaScript (fetch)" />
      </div>
      <div className="border-b border-white/10">
        <CodeBlock code={pythonExample} language="python" title="Python (requests)" />
      </div>

      {responseExample ? (
        <div>
          <CodeBlock code={responseExample} language="json" title="Response" />
        </div>
      ) : null}
    </section>
  );
}
