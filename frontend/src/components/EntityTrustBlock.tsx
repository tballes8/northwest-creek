import React from 'react';
import { EntityTrust, isEntityContradicted } from '../services/api';

/**
 * Blocking state for a positive entity-identity contradiction.
 *
 * Renders nothing unless the verdict is `contradiction`, so it is safe to drop
 * in above any financials surface. `cannot_resolve` deliberately renders
 * nothing: funds/ETFs are absent from EDGAR's company file and new registrants
 * lag it, so non-resolution is "identity not verifiable here", not a problem
 * with the ticker.
 *
 * This is a *replacement* for the surrounding content, not a caveat on it. The
 * previous version of this warning sat above charts that still rendered, under
 * a footnote saying they were "shown for reference" — while green
 * "✓ From SEC filings" badges two hundred lines below vouched for the same
 * numbers. A soft caveat loses to an affirmative green check for a user who
 * trusts the platform, so the figures have to be gone, not annotated.
 *
 * Red, not amber: amber reads as "degraded but usable", which is the wrong
 * instruction here.
 *
 * `note` replaces the default closing line. Use it where the surface offers a
 * way forward — the DCF page lets the user supply the figures themselves — so
 * the block does not tell them to wait on the vendor when they needn't.
 */
const EntityTrustBlock: React.FC<{
  trust?: EntityTrust | null;
  className?: string;
  note?: React.ReactNode;
}> = ({ trust, className = '', note }) => {
  if (!isEntityContradicted(trust) || !trust) return null;

  return (
    <div
      role="alert"
      className={`bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-red-500 text-xl leading-none" aria-hidden="true">
          ⛔
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
            Wrong Company — Data Withheld
          </p>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
            {trust.message}
          </p>

          {/* The two CIKs, so the claim is checkable rather than asserted. */}
          {trust.edgar_cik != null && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              Current entity per SEC EDGAR:{' '}
              <a
                href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${trust.edgar_cik}&type=10-K&dateb=&owner=include&count=40`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                CIK {trust.edgar_cik}
                {trust.edgar_company_name ? ` — ${trust.edgar_company_name}` : ''}
              </a>
              {trust.fmp_filing_cik != null && (
                <>
                  {' · '}Vendor served CIK {trust.fmp_filing_cik}
                </>
              )}
            </p>
          )}

          {/*
            Deliberately does NOT say the current entity has no filings. We
            never queried them, and for the motivating case (TE) it was false —
            T1 Energy files normally. Mismatch is a fixable vendor mapping
            error; "no filings" is a dead end. Conflating them misinforms.
          */}
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">
            {note ?? (
              <>
                Figures, valuation inputs and data-source badges are suppressed for this
                ticker until the vendor corrects the mapping.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default EntityTrustBlock;
