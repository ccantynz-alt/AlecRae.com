interface CalloutProps {
  readonly type: "info" | "warning" | "danger" | "tip";
  readonly title?: string;
  readonly children: React.ReactNode;
}

const DEFAULT_STYLE = {
  border: "border-blue-500/30",
  bg: "bg-blue-500/10",
  title: "text-blue-300",
  icon: "i",
} as const;

const CALLOUT_STYLES: Record<string, { border: string; bg: string; title: string; icon: string }> = {
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    title: "text-blue-300",
    icon: "i",
  },
  warning: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    title: "text-amber-300",
    icon: "!",
  },
  danger: {
    border: "border-red-500/30",
    bg: "bg-red-500/10",
    title: "text-red-300",
    icon: "x",
  },
  tip: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    title: "text-emerald-300",
    icon: "*",
  },
};

export function Callout({ type, title, children }: CalloutProps): React.JSX.Element {
  const styles = CALLOUT_STYLES[type] ?? DEFAULT_STYLE;

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-4 my-6`}>
      {title ? (
        <div className={`text-sm font-semibold ${styles.title} mb-2`}>
          {title}
        </div>
      ) : null}
      <div className="text-sm text-blue-100/70 leading-relaxed">{children}</div>
    </div>
  );
}
