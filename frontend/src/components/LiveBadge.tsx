import React from 'react';
import '../styles/livePrice.css';

interface LiveBadgeProps {
  isConnected: boolean;
  className?: string;
}

const LiveBadge: React.FC<LiveBadgeProps> = ({ isConnected, className = '' }) => {
  if (!isConnected) {
    return null;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${className}`}>
      <span className="live-badge-pulse inline-block w-2 h-2 bg-red-500 rounded-full"></span>
      <span className="text-red-600 dark:text-red-400">LIVE</span>
    </span>
  );
};

export default LiveBadge;
