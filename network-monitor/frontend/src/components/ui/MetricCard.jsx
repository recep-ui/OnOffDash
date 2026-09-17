import React from 'react';

export default function MetricCard({
  icon: Icon,
  iconColor = 'blue',
  value,
  label,
  subtext,
  sparklineData = [3, 7, 5, 9, 6, 8, 12, 10, 14],
  sparklineColor = '#2563eb'
}) {
  const min = Math.min(...sparklineData);
  const max = Math.max(...sparklineData);
  const range = max - min || 1;
  const width = 64;
  const height = 22;
  const points = sparklineData.map((val, idx) => {
    const x = (idx / (sparklineData.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const renderIcon = () => {
    if (!Icon) return null;
    if (React.isValidElement(Icon)) return Icon;
    const Comp = Icon;
    return <Comp size={22} strokeWidth={2} />;
  };

  return (
    <div className="metric-card">
      <div className="metric-card-top">
        <div className={`metric-icon-box ${iconColor}`}>
          {renderIcon()}
        </div>
        <div className="metric-info">
          <span className="metric-value">{value}</span>
          <span className="metric-label">{label}</span>
        </div>
      </div>
      <div className="metric-card-bottom">
        <span className="metric-subtext">{subtext}</span>
        <svg className="metric-sparkline" viewBox={`0 0 ${width} ${height}`}>
          <polyline
            fill="none"
            stroke={sparklineColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
      </div>
    </div>
  );
}
