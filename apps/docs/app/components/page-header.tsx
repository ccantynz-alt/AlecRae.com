interface PageHeaderProps {
  readonly title: string;
  readonly description: string;
  readonly badge?: string;
}

export function PageHeader({ title, description, badge }: PageHeaderProps): React.JSX.Element {
  return (
    <header className="mb-12">
      {badge ? (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-4">
          <span className="text-xs font-medium text-blue-100 tracking-wide uppercase">{badge}</span>
        </div>
      ) : null}
      <h1 className="text-4xl md:text-5xl font-bold tracking-tighter bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent mb-4">
        {title}
      </h1>
      <p className="text-lg text-blue-100/70 max-w-3xl leading-relaxed font-light">
        {description}
      </p>
    </header>
  );
}
