export function StatCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: string;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl2 border border-border bg-surface p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-base">
        {icon}
      </div>
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink-strong">{value}</div>
      {sublabel ? <div className="mt-1 text-xs text-ink-muted">{sublabel}</div> : null}
    </div>
  );
}

export function formatPkr(n: number): string {
  return `₨ ${Math.round(n).toLocaleString('en-PK')}`;
}
