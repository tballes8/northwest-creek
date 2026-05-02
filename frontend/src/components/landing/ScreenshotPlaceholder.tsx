import React from 'react';

interface Props {
  fileName: string;
  description?: string;
  aspect?: '16/10' | '16/9' | '4/3';
  imageSrc?: string;
  imageAlt?: string;
  withChrome?: boolean;
}

const BrowserChrome: React.FC = () => (
  <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
      <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
      <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
    </div>
    <div className="flex-1 flex justify-center">
      <div className="px-3 py-0.5 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400 font-mono max-w-[60%] truncate">
        nwc-analytics.com
      </div>
    </div>
    <div className="w-12" />
  </div>
);

const ScreenshotPlaceholder: React.FC<Props> = ({
  fileName,
  description,
  aspect = '16/10',
  imageSrc,
  imageAlt,
  withChrome = false,
}) => {
  if (imageSrc) {
    return (
      <div className="relative">
        {withChrome && (
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-3xl bg-primary-500/15 dark:bg-primary-500/20 blur-3xl"
          />
        )}
        <div className="relative rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
          {withChrome && <BrowserChrome />}
          <img
            src={imageSrc}
            alt={imageAlt || fileName}
            className="w-full h-auto block"
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl shadow-2xl border-2 border-dashed border-gray-400 dark:border-gray-600 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex flex-col items-center justify-center text-center p-8"
      style={{ aspectRatio: aspect.replace('/', ' / ') }}
    >
      <svg
        className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500 font-semibold mb-1">
        Screenshot needed
      </div>
      <div className="font-mono text-sm text-gray-700 dark:text-gray-300 font-bold">
        /landing/{fileName}
      </div>
      {description && (
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-2 max-w-xs">
          {description}
        </div>
      )}
    </div>
  );
};

export default ScreenshotPlaceholder;
