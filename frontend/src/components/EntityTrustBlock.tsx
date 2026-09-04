import React from 'react';
import { EntityTrust, isEntityContradicted, isEntitySuccessor } from '../services/api';

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
 * Two states, two colours, because they call for different behaviour:
 *
 *   contradiction        RED. Ticker reuse or a cross-exchange collision — one
 *                        company's numbers under another's ticker. Figures are
 *                        gone, and this replaces them.
 *   successor_registrant AMBER. The vendor is serving the *predecessor*
 *                        registrant of the same business (TE: FREYR Battery ->
 *                        T1 Energy). Those figures are that business's own
 *                        history, so they render and this sits above them as a
 *                        real caveat. Amber's "degraded but usable" reading is
 *                        exactly right here and exactly wrong above.
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
  const blocked = isEntityContradicted(trust);
  const successor = isEntitySuccessor(trust);
  if (!trust || (!blocked && !successor)) return null;

  const c = blocked
    ? {
        wrap: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700',
        icon: 'text-red-500', glyph: '⛔',
        head: 'text-red-800 dark:text-red-200',
        body: 'text-red-700 dark:text-red-300',
        meta: 'text-red-600 dark:text-red-400',
        title: 'Wrong Company — Data Withheld',
      }
    : {
        wrap: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700',
        icon: 'text-amber-500', glyph: '⚠️',
        head: 'text-amber-800 dark:text-amber-200',
        body: 'text-amber-700 dark:text-amber-300',
        meta: 'text-amber-600 dark:text-amber-400',
        title: 'Predecessor Filings — Same Business, Older Registrant',
      };

  return (
    <div role="alert" className={`${c.wrap} border rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <span className={`${c.icon} text-xl leading-none`} aria-hidden="true">
          {c.glyph}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${c.head}`}>{c.title}</p>
          <p className={`text-xs ${c.body} mt-1`}>{trust.message}</p>

          {/* The two CIKs, so the claim is checkable rather than asserted. */}
          {trust.edgar_cik != null && (
            <p className={`text-xs ${c.meta} mt-2`}>
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
                  {trust.predecessor_name ? ` (${trust.predecessor_name})` : ''}
                </>
              )}
              {/* Verified, not inferred. The old copy claimed the current
                  entity had "different or no SEC filings available" without
                  ever asking, and for TE that was false. */}
              {trust.edgar_has_filings && trust.edgar_latest_filing_date && (
                <>
                  {' · '}Latest filing {trust.edgar_latest_form} on{' '}
                  {trust.edgar_latest_filing_date}
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
          <p className={`text-xs ${c.meta} mt-2`}>
            {note ??
              (blocked ? (
                <>
                  Figures, valuation inputs and data-source badges are suppressed for
                  this ticker until the vendor corrects the mapping.
                </>
              ) : (
                <>
                  The figures below are shown because they are this business's own filed
                  history — but treat them as pre-reorganization, and check the current
                  registrant's filings for anything since.
                </>
              ))}
          </p>
        </div>
      </div>
    </div>
  );
};

export default EntityTrustBlock;
