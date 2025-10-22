import React from 'react';

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

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, range, color = 'text-slate-700', description, warning, note }) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 text-center transition-transform duration-200 ease-in-out hover:-translate-y-1 hover:shadow-lg">
      <h3 className="text-lg font-semibold text-slate-500">{title}</h3>
      <p className={`text-5xl font-bold mt-2 ${color}`}>{value}{subtitle && <span className="text-3xl">{subtitle}</span>}</p>
      {range && <p className="text-sm text-slate-400 mt-1">{range}</p>}
      {warning && (
        <p className="text-xs text-orange-500 mt-1">{warning}</p>
      )}
      {note && <p className="text-xs text-slate-400 mt-1">{note}</p>}
      {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
    </div>
  );
};

export default KpiCard;
