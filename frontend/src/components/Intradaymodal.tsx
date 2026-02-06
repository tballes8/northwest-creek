import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { intradayAPI } from '../services/api';


interface IntradayData {
  ticker: string;
  name: string | null;
  type: string | null;
  market_status: string | null;
  price: number | null;
  updated: string | null;
  session: {
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    previous_close: number | null;
    change: number | null;
    change_percent: number | null;
  } | null;
}

interface BarData {
  timestamp: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  vwap?: number | null;
  ma_20?: number | null;
  ma_50?: number | null;
  ma_200?: number | null;
}

interface BarsResponse {
  ticker: string;
  bars: BarData[];
  timespan: string;
  multiplier: number;
  count: number;
  data_date: string;
  is_today: boolean;
  market_status: string;
  moving_averages: {
    ma_20: number | null;
    ma_50: number | null;
    ma_200: number | null;
  };
  note?: string;
}

interface IntradayModalProps {
  ticker: string;
  isOpen: boolean;
  onClose: () => void;
}

const IntradayModal: React.FC<IntradayModalProps> = ({ ticker, isOpen, onClose }) => {
  const [data, setData] = useState<IntradayData | null>(null);
  const [barsData, setBarsData] = useState<BarsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (isOpen && ticker) {
      fetchAllData();
    }
  }, [isOpen, ticker]);
   
  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('access_token');
      const baseUrl = intradayAPI;
      
      // Fetch both snapshot and bars data with moving averages in parallel
      const [snapshotResponse, barsResponse] = await Promise.all([
        intradayAPI.getSnapshot(ticker),
        intradayAPI.getBarsWithMA(ticker)
      ]);
      
      const snapshotData = snapshotResponse.data;
      const barsDataResponse = barsResponse.data;
      
      // If current price is null/undefined and we have bars, use the last bar's close
      if ((!snapshotData.price || snapshotData.price === null) && barsDataResponse.bars && barsDataResponse.bars.length > 0) {
        const lastBar = barsDataResponse.bars[barsDataResponse.bars.length - 1];
        snapshotData.price = lastBar.close;
        
        // Also update session data if available
        if (snapshotData.session) {
          snapshotData.session.close = lastBar.close;
        }
      }
         
      setData(snapshotData);
      setBarsData(barsDataResponse);
    } catch (err: any) {
      console.error('Failed to fetch intraday data:', err);
      setError(err.response?.data?.detail || 'Failed to load intraday data');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatNumber = (num: number | null | undefined, decimals: number = 2): string => {
    if (num === null || num === undefined) return 'N/A';
    return num.toFixed(decimals);
  };

  const formatLargeNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return 'N/A';
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(2)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toString();
  };

  const formatTime = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timestamp;
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const getChangeColor = (change: number | null | undefined): string => {
    if (change === null || change === undefined) return 'text-gray-600 dark:text-gray-400';
    return change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  const getChangePrefix = (change: number | null | undefined): string => {
    if (change === null || change === undefined) return '';
    return change >= 0 ? '+' : '';
  };

  // Prepare chart data
  const chartData = barsData?.bars.map(bar => ({
    time: formatTime(bar.timestamp),
    price: bar.close,
    high: bar.high,
    low: bar.low,
    open: bar.open,
    volume: bar.volume,
    ma_20: bar.ma_20,
    ma_50: bar.ma_50,
    ma_200: bar.ma_200
  })) || [];

  // Debug: Log MA values to console
  if (barsData && chartData.length > 0) {
    console.log('Moving Averages:', {
      ma_20: barsData.moving_averages.ma_20,
      ma_50: barsData.moving_averages.ma_50,
      ma_200: barsData.moving_averages.ma_200,
      sample_bar_ma_20: chartData[0]?.ma_20,
      sample_bar_ma_50: chartData[0]?.ma_50,
      sample_bar_ma_200: chartData[0]?.ma_200
    });
  }

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{data.time}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Price: <span className="font-semibold text-gray-900 dark:text-white">${formatNumber(data.price)}</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            H: ${formatNumber(data.high)} | L: ${formatNumber(data.low)}
          </p>
          {data.volume && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Vol: {formatLargeNumber(data.volume)}
            </p>
          )}
          <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2">
            {data.ma_20 && (
              <p className="text-xs" style={{ color: 'rgb(234, 179, 8)' }}>
                20-day MA: ${formatNumber(data.ma_20)}
              </p>
            )}
            {data.ma_50 && (
              <p className="text-xs" style={{ color: 'rgb(168, 85, 247)' }}>
                50-day MA: ${formatNumber(data.ma_50)}
              </p>
            )}
            {data.ma_200 && (
              <p className="text-xs" style={{ color: 'rgb(59, 130, 246)' }}>
                200-day MA: ${formatNumber(data.ma_200)}
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Determine color based on price movement
  const getPriceColor = () => {
    if (!data?.session?.change) return '#3b82f6'; // blue
    return data.session.change >= 0 ? '#10b981' : '#ef4444'; // green or red
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-7xl w-full h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header - Fixed */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {ticker} - Intraday Chart
              </h2>
              {barsData && !barsData.is_today && (
                <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs font-medium rounded">
                  {formatDate(barsData.data_date)}
                </span>
              )}
            </div>
            {data?.name && (
              <p className="text-sm text-gray-600 dark:text-gray-400">{data.name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - Scrollable only if needed */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : error ? (
            <div className="text-center h-full flex flex-col items-center justify-center">
              <div className="text-red-600 dark:text-red-400 mb-2">{error}</div>
              <button
                onClick={fetchAllData}
                className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Show info banner if displaying previous day's data */}
              {barsData && !barsData.is_today && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Market is closed. Showing data from most recent trading day: <strong>{formatDate(barsData.data_date)}</strong>
                    </p>
                  </div>
                </div>
              )}

              {/* Price Overview - Compact */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Current Price</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    ${formatNumber(data?.price)}
                  </div>
                  {data?.session?.change !== null && (
                    <div className={`text-xs font-semibold ${getChangeColor(data?.session?.change)}`}>
                      {getChangePrefix(data?.session?.change)}{formatNumber(data?.session?.change)} 
                      ({getChangePrefix(data?.session?.change_percent)}{formatNumber(data?.session?.change_percent)}%)
                    </div>
                  )}
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Day Range</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    ${formatNumber(data?.session?.low)} - ${formatNumber(data?.session?.high)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Open: ${formatNumber(data?.session?.open)}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Volume</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {formatLargeNumber(data?.session?.volume)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Status: {data?.market_status || 'N/A'}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Moving Averages</div>
                  <div className="text-xs" style={{ color: barsData?.moving_averages.ma_20 ? 'rgb(234, 179, 8)' : '#9ca3af' }}>
                    20-day: {barsData?.moving_averages.ma_20 ? `$${formatNumber(barsData.moving_averages.ma_20)}` : 'N/A'}
                  </div>
                  <div className="text-xs mt-1" style={{ color: barsData?.moving_averages.ma_50 ? 'rgb(168, 85, 247)' : '#9ca3af' }}>
                    50-day: {barsData?.moving_averages.ma_50 ? `$${formatNumber(barsData.moving_averages.ma_50)}` : 'N/A'}
                  </div>
                  <div className="text-xs mt-1" style={{ color: barsData?.moving_averages.ma_200 ? 'rgb(59, 130, 246)' : '#9ca3af' }}>
                    200-day: {barsData?.moving_averages.ma_200 ? `$${formatNumber(barsData.moving_averages.ma_200)}` : 'Insufficient data'}
                  </div>
                </div>
              </div>

              {/* Price Chart with Moving Averages - Adjusted height */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    Intraday Price Chart
                  </h3>
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                    <span style={{ color: 'rgb(234, 179, 8)' }}>20d: ${formatNumber(barsData?.moving_averages.ma_20)}</span>
                    <span className="mx-1">|</span>
                    <span style={{ color: 'rgb(168, 85, 247)' }}>50d: ${formatNumber(barsData?.moving_averages.ma_50)}</span>
                    {barsData?.moving_averages.ma_200 && (
                      <>
                        <span className="mx-1">|</span>
                        <span style={{ color: 'rgb(59, 130, 246)' }}>200d: ${formatNumber(barsData?.moving_averages.ma_200)}</span>
                      </>
                    )}
                  </div>
                </div>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="rgb(59, 130, 246)" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="rgb(59, 130, 246)" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                      <XAxis 
                        dataKey="time" 
                        stroke="#9ca3af"
                        style={{ fontSize: '11px' }}
                      />
                      <YAxis 
                        stroke="#9ca3af"
                        domain={['auto', 'auto']}
                        style={{ fontSize: '11px' }}
                        tickFormatter={(value) => `$${value.toFixed(2)}`}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      
                      {/* Intraday Price - PROMINENT (foreground) */}
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke={getPriceColor()}
                        strokeWidth={3}
                        fill="url(#colorPrice)"
                        dot={{ r: 5, fill: getPriceColor(), strokeWidth: 2, stroke: '#ffffff' }}
                        activeDot={{ r: 7, strokeWidth: 2 }}
                        name="Price"
                      />

                      {/* 20-day MA - Subtle Reference Line (background) */}
                      {barsData?.moving_averages.ma_20 && (
                        <Line
                          type="monotone"
                          dataKey="ma_20"
                          stroke="rgb(234, 179, 8)"
                          strokeWidth={1.5}
                          strokeOpacity={0.8}
                          dot={false}
                          name="20-day MA"
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}
                      
                      {/* 50-day MA - Subtle Reference Line (background) */}
                      {barsData?.moving_averages.ma_50 && (
                        <Line
                          type="monotone"
                          dataKey="ma_50"
                          stroke="rgb(168, 85, 247)"
                          strokeWidth={1.5}
                          strokeOpacity={0.8}
                          dot={false}
                          name="50-day MA"
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}
                      
                      {/* 200-day MA - Subtle Reference Line (background) */}
                      {barsData?.moving_averages.ma_200 && (
                        <Line
                          type="monotone"
                          dataKey="ma_200"
                          stroke="rgb(59, 130, 246)"
                          strokeWidth={1.5}
                          strokeOpacity={0.4}
                          dot={false}
                          name="200-day MA"
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-80 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    No intraday data available
                  </div>
                )}
                {barsData && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                    {barsData.count} bars (15-minute intervals)
                    {barsData.moving_averages.ma_20 && (
                      <span className="text-gray-400"> | <span style={{ color: 'rgb(234, 179, 8)' }}>Yellow</span> = 20-day MA</span>
                    )}
                    {barsData.moving_averages.ma_50 && (
                      <span className="text-gray-400"> | <span style={{ color: 'rgb(168, 85, 247)' }}>Purple</span> = 50-day MA</span>
                    )}
                    {barsData.moving_averages.ma_200 && (
                      <span className="text-gray-400"> | <span style={{ color: 'rgb(59, 130, 246)' }}>Blue</span> = 200-day MA</span>
                    )}
                    {!barsData.moving_averages.ma_200 && (barsData.moving_averages.ma_50 || barsData.moving_averages.ma_20) && (
                      <span className="block mt-1 text-gray-400">
                        (200-day MA unavailable - insufficient trading history)
                      </span>
                    )}
                    {barsData.note && (
                      <span className="block mt-1">
                        {barsData.note}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-between items-center">
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh Data'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default IntradayModal;
