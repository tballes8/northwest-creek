import React, { useState } from 'react';

interface FAQItem {
  q: string;
  a: string;
}

const FAQS: FAQItem[] = [
  {
    q: 'Is NWC-Analytics financial advice?',
    a: 'No. NWC-Analytics is a research and analysis platform. We provide data, charts, and AI-generated insights to help you make your own decisions. Nothing on the platform constitutes personalized financial advice or a recommendation to buy or sell any security.',
  },
  {
    q: 'How current is the data?',
    a: 'Quotes stream over WebSocket during market hours and refresh every few seconds. Historical bars, fundamentals, and news come from Financial Modeling Prep with intraday updates. The daily snapshot used by the screener refreshes every 15 minutes.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Yes. You can cancel from your account page at any time. Your access continues through the end of the billing period, then the subscription stops — no extra charges, no fees.',
  },
  {
    q: 'Do you offer a free trial?',
    a: 'The Beginner and Casual tiers include a 14-day free trial — no charge until the trial ends, and you can cancel during the trial without being billed.',
  },
  {
    q: 'What data sources do you use?',
    a: 'Market data from Financial Modeling Prep, regulatory filings from SEC EDGAR, and AI analysis powered by Anthropic Claude. Live streaming prices use WebSockets directly from our market data provider.',
  },
  {
    q: 'Is my data secure?',
    a: 'Passwords are hashed with industry-standard algorithms, payments are handled by Stripe (we never see your card details), and all traffic is served over HTTPS. We do not sell your data, ever.',
  },
];

const FAQAccordion: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="max-w-3xl mx-auto divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-900">
      {FAQS.map((item, i) => {
        const open = openIdx === i;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpenIdx(open ? null : i)}
              className="w-full flex items-center justify-between text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              aria-expanded={open}
            >
              <span className="font-semibold text-gray-900 dark:text-white">{item.q}</span>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {open && (
              <div className="px-5 pb-5 -mt-1 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default FAQAccordion;
