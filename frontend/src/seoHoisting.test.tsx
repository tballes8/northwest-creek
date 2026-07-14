/**
 * Verifies React 19 native metadata hoisting — the pattern every page relies on
 * for per-route SEO. A hoisted <title> must take precedence over the static
 * shell <title> baked into public/index.html, and <meta>/<link rel=canonical>
 * must land in <head>.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';

const PageMetaFixture: React.FC = () => (
  <div>
    <title>Pricing — NWC-Analytics</title>
    <meta name="description" content="A per-route description." />
    <link rel="canonical" href="https://nwc-analytics.com/pricing" />
    <span>page body</span>
  </div>
);

describe('React 19 metadata hoisting', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<title>NWC-Analytics — Professional Stock Analysis for Retail Investors</title>';
  });

  it('hoisted <title> overrides the static shell title', async () => {
    render(<PageMetaFixture />);
    await waitFor(() =>
      expect(document.title).toBe('Pricing — NWC-Analytics')
    );
  });

  it('hoists meta description and canonical link into <head>', async () => {
    render(<PageMetaFixture />);
    await waitFor(() => {
      const desc = document.head.querySelector('meta[name="description"]');
      expect(desc).toHaveAttribute('content', 'A per-route description.');
      const canonical = document.head.querySelector('link[rel="canonical"]');
      expect(canonical).toHaveAttribute(
        'href',
        'https://nwc-analytics.com/pricing'
      );
    });
  });
});
