import React, { useState } from 'react';
import { SectorBreakdown, SECTOR_COLORS } from '../utils/sectorMap';

interface SectorPieChartProps {
  data: SectorBreakdown[];
  title?: string;
  /** 'value' weights by $ amount (portfolio), 'count' weights equally (watchlist) */
  mode?: 'value' | 'count';
  size?: number;
  /** Called when a sector is clicked in the legend or chart */
  onSectorClick?: (sector: string) => void;
}

const ALL_SECTORS = [
  'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
  'Communication Services', 'Industrials', 'Consumer Defensive', 'Energy',
  'Real Estate', 'Utilities', 'Basic Materials',
];

const SectorPieChart: React.FC<SectorPieChartProps> = ({
  data,
  title,
  mode = 'value',
  size = 160,
  onSectorClick,
}) => {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);

  if (data.length === 0) return null;

  const radius = size / 2;
  const strokeWidth = size * 0.2;
  const innerRadius = radius - strokeWidth;
  const center = radius;

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

  const segments = data
    .filter(item => item.percentage > 0)
    .map((item) => {
      const startPercent = cumulativePercent;
      const clampedPercent = Math.max(item.percentage, 0.5);
      cumulativePercent += item.percentage;
      return { ...item, startPercent, path: getArcPath(clampedPercent, startPercent) };
    });

  const totalItems = data.reduce((sum, d) => sum + d.count, 0);

  // Build full legend: all 11 standard sectors + "Other" if present
  const dataMap = new Map(data.map(d => [d.sector, d]));
  const legendItems = ALL_SECTORS.map(sector => ({
    sector,
    percentage: dataMap.get(sector)?.percentage ?? 0,
    count: dataMap.get(sector)?.count ?? 0,
    color: SECTOR_COLORS[sector] || SECTOR_COLORS['Other'],
  })).sort((a, b) => b.percentage - a.percentage);

  // Add "Other" if present in data
  const otherData = dataMap.get('Other');
  if (otherData) {
    legendItems.push({
      sector: 'Other',
      percentage: otherData.percentage,
      count: otherData.count,
      color: SECTOR_COLORS['Other'],
    });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {title && (
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {title}
        </p>
      )}
      <div className="flex items-start gap-5">
        {/* Donut Chart */}
        <div className="relative flex-shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={center} cy={center} r={radius - strokeWidth / 2}
              fill="none" stroke="currentColor"
              className="text-gray-200 dark:text-gray-600"
              strokeWidth={strokeWidth}
            />
            {segments.map((seg) => (
              <path
                key={seg.sector}
                d={seg.path}
                fill={seg.color}
                opacity={hoveredSector === null || hoveredSector === seg.sector ? 1 : 0.3}
                onMouseEnter={() => setHoveredSector(seg.sector)}
                onMouseLeave={() => setHoveredSector(null)}
                onClick={() => onSectorClick?.(seg.sector)}
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
                  {(dataMap.get(hoveredSector)?.percentage ?? 0).toFixed(1)}%
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

        {/* Full Legend — all sectors, clickable */}
        <div className="flex flex-col gap-0.5 min-w-0">
          {legendItems.map((item) => {
            const isZero = item.percentage === 0;
            const isHoverDimmed = hoveredSector !== null && hoveredSector !== item.sector;
            return (
              <div
                key={item.sector}
                className={`flex items-center gap-2 text-xs py-0.5 rounded transition-all duration-200 ${
                  isHoverDimmed ? 'opacity-40' : 'opacity-100'
                } ${
                  onSectorClick
                    ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 px-1.5 -mx-1.5'
                    : ''
                }`}
                onMouseEnter={() => setHoveredSector(item.sector)}
                onMouseLeave={() => setHoveredSector(null)}
                onClick={() => onSectorClick?.(item.sector)}
                title={
                  isZero
                    ? `No ${item.sector} stocks — click to explore`
                    : `${item.count} ${item.sector} stock(s) — click to explore`
                }
              >
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0 ${isZero ? 'opacity-30' : ''}`}
                  style={{ backgroundColor: item.color }}
                />
                <span className={`truncate ${
                  isZero ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {item.sector}
                </span>
                <span className={`ml-auto flex-shrink-0 tabular-nums ${
                  isZero ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {item.percentage.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SectorPieChart;
