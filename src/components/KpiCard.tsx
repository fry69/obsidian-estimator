import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  range?: string;
  color?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, range, color = 'text-slate-700' }) => {
  return (
    <div className="metric-card">
      <h3 className="text-lg font-semibold text-slate-500">{title}</h3>
      <p className={`text-5xl font-bold mt-2 ${color}`}>{value}{subtitle && <span className="text-3xl">{subtitle}</span>}</p>
      {range && <p className="text-sm text-slate-400 mt-1">{range}</p>}
      <p className="text-sm text-slate-400 mt-1">{title.includes('Wait') ? 'Based on recent review velocity' : (title.includes('Queue') ? `"${title.split(' ')[0].toLowerCase()}" & "Ready for review"` : 'PRs "Ready for review"')}</p>
    </div>
  );
};

export default KpiCard;
