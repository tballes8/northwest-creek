import React from 'react';
import { Link } from 'react-router-dom';
import ScreenshotPlaceholder from './ScreenshotPlaceholder';

interface Props {
  onChoosePlanClick: (e: React.MouseEvent) => void;
  imageSrc?: string;
}

const HeroSection: React.FC<Props> = ({ onChoosePlanClick, imageSrc }) => {
  return (
    <div className="pt-20 pb-16">
      <div className="text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-extrabold text-gray-900 dark:text-white sm:text-6xl">
          <span className="block">Professional Stock Analysis</span>
          <span className="block text-primary-600 dark:text-primary-400 mt-2">For Retail Investors</span>
        </h1>
        <p className="mt-6 max-w-3xl mx-auto text-xl text-gray-600 dark:text-gray-300">
          Real-time prices, AI-powered analysis, technical alerts, and DCF modeling — built for
          retail investors who do their own homework.
        </p>
        <div className="mt-10 flex justify-center gap-4 flex-wrap">
          <button
            onClick={onChoosePlanClick}
            className="px-8 py-4 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white text-lg font-semibold rounded-lg shadow-lg transition-colors cursor-pointer"
          >
            Start Free 14-Day Trial
          </button>
          <Link
            to="/login"
            className="px-8 py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-primary-600 dark:text-primary-400 text-lg font-semibold rounded-lg shadow-lg border-2 border-primary-600 dark:border-primary-500 transition-colors"
          >
            Sign In
          </Link>
        </div>
        <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          No credit card required · Cancel anytime
        </div>
      </div>

      <div className="mt-16 max-w-6xl mx-auto">
        <ScreenshotPlaceholder
          fileName="dashboard-hero.png"
          description="Live Dashboard with watchlist, sector breakdown, and real-time WebSocket prices — captured at 1440×900."
          aspect="16/9"
          imageSrc={imageSrc}
          imageAlt="NWC-Analytics Dashboard"
        />
      </div>
    </div>
  );
};

export default HeroSection;
