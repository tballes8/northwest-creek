import React from 'react';
import ScreenshotPlaceholder from './ScreenshotPlaceholder';

export interface FeatureSectionProps {
  eyebrow?: string;
  eyebrowColor?: 'primary' | 'green' | 'purple' | 'blue' | 'amber' | 'rose';
  title: string;
  body: React.ReactNode;
  bullets?: string[];
  screenshotFile: string;
  screenshotDescription?: string;
  imageSrc?: string;
  reverse?: boolean;
  withChrome?: boolean;
}

const eyebrowStyles: Record<NonNullable<FeatureSectionProps['eyebrowColor']>, string> = {
  primary: 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  rose: 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300',
};

const Check = () => (
  <svg
    className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const FeatureSection: React.FC<FeatureSectionProps> = ({
  eyebrow,
  eyebrowColor = 'primary',
  title,
  body,
  bullets,
  screenshotFile,
  screenshotDescription,
  imageSrc,
  reverse = false,
  withChrome = false,
}) => {
  const copy = (
    <div className={reverse ? 'order-1 md:order-2' : ''}>
      {eyebrow && (
        <div
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mb-4 ${eyebrowStyles[eyebrowColor]}`}
        >
          {eyebrow}
        </div>
      )}
      <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">{title}</h3>
      <div className="text-lg text-gray-600 dark:text-gray-300 mb-6">{body}</div>
      {bullets && bullets.length > 0 && (
        <ul className="space-y-3">
          {bullets.map((b) => (
            <li key={b} className="flex items-start">
              <Check />
              <span className="text-gray-700 dark:text-gray-300">{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const visual = (
    <div className={reverse ? 'order-2 md:order-1' : ''}>
      <ScreenshotPlaceholder
        fileName={screenshotFile}
        description={screenshotDescription}
        imageSrc={imageSrc}
        imageAlt={title}
        withChrome={withChrome}
      />
    </div>
  );

  return (
    <div className="grid md:grid-cols-2 gap-12 items-center">
      {reverse ? (
        <>
          {visual}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {visual}
        </>
      )}
    </div>
  );
};

export default FeatureSection;
