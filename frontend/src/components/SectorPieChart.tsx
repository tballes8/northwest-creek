import React, { useState } from 'react';
import { SectorBreakdown } from '../utils/sectorMap';

interface SectorPieChartProps {
  data: SectorBreakdown[];
  title?: string;
  /** 'value' weights by $ amount (portfolio), 'count' weights equally (watchlist) */
  mode?: 'value' | 'count';
  size?: number;
}

const SectorPieChart: React.FC<SectorPieChartProps> = ({
  data,
  title,
  mode = 'value',
  size = 160,
}) => {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);

  if (data.length === 0) return null;

  const radius = size / 2;
  const strokeWidth = size * 0.2;         // donut thickness
  const innerRadius = radius - strokeWidth;
  const center = radius;

  // Build the SVG arc paths
  let cumulativePercent = 0;

  const getArcPath = (percent: number, startPercent: number): string => {
    const startAngle = (startPercent / 100) * 360 - 90;
    const endAngle = ((startPercent + percent) / 100) * 360 - 90;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const ix1 = center + innerRadius * Math.cos(startRad);
    const iy1 = center + innerRadius * Math.sin(startRad);
    const ix2 = center + innerRadius * Math.cos(endRad);
    const iy2 = center + innerRadius * Math.sin(endRad);

    const largeArc = percent > 50 ? 1 : 0;

    return [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ');
  };

  const segments = data.map((item) => {
    const startPercent = cumulativePercent;
    // Ensure tiny slices still render (min 0.5%)
    const clampedPercent = Math.max(item.percentage, 0.5);
    cumulativePercent += item.percentage;

    return {
      ...item,
      startPercent,
      path: getArcPath(clampedPercent, startPercent),
    };
  });

  const totalItems = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="flex flex-col items-center gap-3">
      {title && (
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {title}
        </p>
      )}

      <div className="flex items-center gap-4">
        {/* Donut Chart */}
        <div className="relative flex-shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background circle */}
            <circle
              cx={center}
              cy={center}
              r={radius - strokeWidth / 2}
              fill="none"
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-600"
              strokeWidth={strokeWidth}
            />

            {/* Sector segments */}
            {segments.map((seg) => (
              <path
                key={seg.sector}
                d={seg.path}
                fill={seg.color}
                opacity={hoveredSector === null || hoveredSector === seg.sector ? 1 : 0.3}
                onMouseEnter={() => setHoveredSector(seg.sector)}
                onMouseLeave={() => setHoveredSector(null)}
                className="transition-opacity duration-200 cursor-pointer"
              />
            ))}
          </svg>

          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {hoveredSector ? (
              <>
                <span className="text-xs font-bold text-gray-900 dark:text-white leading-tight text-center px-1">
                  {hoveredSector}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {data.find(d => d.sector === hoveredSector)?.percentage.toFixed(1)}%
                </span>
              </>
            ) : (
              <>
                <span className="text-lg font-bold text-gray-900 dark:text-white">{totalItems}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {mode === 'value' ? 'positions' : 'stocks'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1 min-w-0">
          {data.slice(0, 6).map((item) => (
            <div
              key={item.sector}
              className={`flex items-center gap-2 text-xs cursor-pointer transition-opacity duration-200 ${
                hoveredSector !== null && hoveredSector !== item.sector ? 'opacity-40' : 'opacity-100'
              }`}
              onMouseEnter={() => setHoveredSector(item.sector)}
              onMouseLeave={() => setHoveredSector(null)}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-gray-700 dark:text-gray-300 truncate">
                {item.sector}
              </span>
              <span className="text-gray-500 dark:text-gray-400 ml-auto flex-shrink-0">
                {item.percentage.toFixed(0)}%
              </span>
            </div>
          ))}
          {data.length > 6 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 pl-4">
              +{data.length - 6} more
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SectorPieChart;
