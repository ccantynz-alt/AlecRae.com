import fs from "node:fs/promises";
import path from "node:path";
import { ChangelogList, type Release, type ReleaseType } from "./changelog-list";

const VALID_TYPES: ReadonlySet<ReleaseType> = new Set([
  "feature",
  "improvement",
  "fix",
  "security",
  "breaking",
]);

interface FrontMatter {
  readonly version: string;
  readonly date: string;
  readonly title: string;
  readonly types: readonly ReleaseType[];
}

function parseFrontMatter(source: string): { readonly fm: FrontMatter; readonly body: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return {
      fm: { version: "0.0.0", date: "1970-01-01", title: "Untitled", types: [] },
      body: source,
    };
  }
  const yaml = match[1] ?? "";
  const body = match[2] ?? "";
  const data: Record<string, string> = {};
  for (const line of yaml.split("\n")) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (m && m[1]) data[m[1]] = (m[2] ?? "").trim();
  }
  const typesRaw = data["types"] ?? "[]";
  const types = typesRaw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ReleaseType => VALID_TYPES.has(s as ReleaseType));
  return {
    fm: {
      version: data["version"] ?? "0.0.0",
      date: data["date"] ?? "1970-01-01",
      title: data["title"] ?? "Untitled",
      types,
    },
    body,
  };
}

async function loadReleases(): Promise<readonly Release[]> {
  const dir = path.join(process.cwd(), "content");
  const files = await fs.readdir(dir);
  const releases: Release[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const source = await fs.readFile(path.join(dir, file), "utf8");
    const { fm, body } = parseFrontMatter(source);
    releases.push({
      slug: file.replace(/\.md$/, ""),
      version: fm.version,
      date: fm.date,
      title: fm.title,
      types: fm.types,
      body,
    });
  }
  releases.sort((a, b) => b.date.localeCompare(a.date));
  return releases;
}

export default async function ChangelogPage(): Promise<React.JSX.Element> {
  const releases = await loadReleases();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
              Vienna
            </div>
            <span className="text-sm uppercase tracking-wider text-blue-200/60">Changelog</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-3">
            Every release.
          </h1>
          <p className="text-blue-100/60 max-w-2xl">
            New features, improvements, fixes, and breaking changes — every time we ship.
          </p>
        </header>

        <ChangelogList releases={releases} />

        <footer className="text-center text-xs text-blue-200/40 pt-16 mt-16 border-t border-white/5">
          2026 Vienna - changelog.48co.ai
        </footer>
      </div>
    </main>
  );
}
