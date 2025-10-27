import React from "react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  range?: string;
  color?: string;
  description?: string;
  warning?: string;
  note?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  range,
  color = "text-[color:var(--foreground)]",
  description,
  warning,
  note,
}) => {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-6 text-center shadow-[var(--shadow-soft)] transition-[background-color,border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-hover)]">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]">
        {title}
      </h3>
      <p className={`text-5xl font-bold ${color}`}>
        {value}
        {subtitle && (
          <span className="ml-1 text-2xl font-semibold text-[color:var(--muted)]">
            {subtitle}
          </span>
        )}
      </p>
      <p className="h-[1rem] text-sm text-[color:var(--muted)]">{range}</p>
      {warning && <p className="warning-text text-xs font-medium">{warning}</p>}
      {note && <p className="text-xs text-[color:var(--muted)]">{note}</p>}
      {description && (
        <p className="text-sm text-[color:var(--muted)]">{description}</p>
      )}
    </div>
  );
};

export default KpiCard;
