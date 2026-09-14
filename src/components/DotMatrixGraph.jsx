import { formatAmount } from '../lib/currency.js';

function formatCompact(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return `${value}`;
}

export default function DotMatrixGraph({ data, labels, currencyCode = 'UZS' }) {
  if (!data || data.length === 0 || !labels || labels.length !== data.length) {
    return <div className="text-gray-500 text-sm">[ NO DATA ]</div>;
  }

  const paddingX = 60;
  const paddingY = 30;
  const graphWidth = 1000 - paddingX - 20;
  const graphHeight = 200 - paddingY * 2;
  const maxValue = Math.max(...data);
  const baselineY = 200 - paddingY;

  // guard div-by-zero when single data point or flat maxValue of 0
  const points = data.map((value, i) => {
    const x = data.length > 1 ? paddingX + (i / (data.length - 1)) * graphWidth : paddingX;
    const y = maxValue > 0 ? baselineY - (value / maxValue) * graphHeight : baselineY;
    return { x, y };
  });

  const yAxisRatios = [1, 0.5, 0];
  const gridRatios = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox="0 0 1000 200"
      preserveAspectRatio="none"
      className="w-full h-auto text-white overflow-visible"
    >
      {gridRatios.map((ratio) => {
        const y = paddingY + (1 - ratio) * graphHeight;
        return (
          <line
            key={`grid-${ratio}`}
            x1={paddingX}
            x2={1000 - 20}
            y1={y}
            y2={y}
            stroke="#333"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
        );
      })}

      <line
        x1={paddingX}
        x2={1000 - 20}
        y1={baselineY}
        y2={baselineY}
        stroke="#555"
        strokeWidth="2"
      />

      {yAxisRatios.map((ratio) => {
        const y = paddingY + (1 - ratio) * graphHeight;
        const labelValue = formatCompact(maxValue * ratio);
        return (
          <text
            key={`ylabel-${ratio}`}
            x={0}
            y={y}
            textAnchor="start"
            fill="#666"
            fontSize="11"
            fontFamily="monospace"
          >
            {labelValue}
          </text>
        );
      })}

      {points.slice(0, -1).map((point, i) => (
        <line
          key={`line-${i}`}
          x1={point.x}
          y1={point.y}
          x2={points[i + 1].x}
          y2={points[i + 1].y}
          stroke="#ffffff"
          strokeWidth="1"
          strokeDasharray="3,3"
          opacity="0.5"
        />
      ))}

      {points.map((point, i) => (
        <circle key={`point-${i}`} cx={point.x} cy={point.y} r="4" fill="#ffffff" className="animate-none" />
      ))}

      {labels.map((label, i) => (
        <text
          key={`xlabel-${i}`}
          x={points[i].x}
          y={200 - 5}
          textAnchor="middle"
          fill="#666"
          fontSize="11"
          fontFamily="monospace"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}
