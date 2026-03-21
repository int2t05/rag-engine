import Link from "next/link";
import type { ComponentType } from "react";

type IconProps = { className?: string };

export function DashboardSkillCard({
  href,
  title,
  desc,
  icon: Icon,
  count,
  loading,
}: {
  href: string;
  title: string;
  desc: string;
  icon: ComponentType<IconProps>;
  count: number | null;
  loading: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-surface p-5 transition-all hover:border-accent/30 hover:shadow-sm"
    >
      <Icon className="h-5 w-5 text-accent" />
      <h2 className="mt-3 font-medium text-ink">{title}</h2>
      <p className="mt-0.5 text-xs text-muted">{desc}</p>
      <p className="mt-4 font-display text-2xl font-semibold tabular-nums text-ink">
        {loading || count === null ? (
          <span className="inline-block h-7 w-8 animate-pulse rounded bg-surface-muted" />
        ) : (
          count
        )}
      </p>
    </Link>
  );
}
