import React from 'react';

interface Props {
  fileName: string;
  description?: string;
  aspect?: '16/10' | '16/9' | '4/3';
  imageSrc?: string;
  imageAlt?: string;
}

const ScreenshotPlaceholder: React.FC<Props> = ({
  fileName,
  description,
  aspect = '16/10',
  imageSrc,
  imageAlt,
}) => {
  if (imageSrc) {
    return (
      <div className="rounded-xl shadow-2xl border border-gray-700 overflow-hidden bg-gray-900">
        <img
          src={imageSrc}
          alt={imageAlt || fileName}
          className="w-full h-auto block"
          loading="lazy"
        />
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
