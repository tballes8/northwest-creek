import React from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import BackToTop from '../components/BackToTop';

// Every statement here must match what the code actually does. Before adding a
// tracker, ad pixel, AI feature or data processor, update the matching section
// (and lastUpdated) in the same change.
const h2 = 'text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500';
const h3 = 'text-base font-semibold text-gray-900 dark:text-white mt-6 mb-2';
const p = 'text-gray-700 dark:text-gray-300 leading-relaxed';
const ul = 'list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300 leading-relaxed';
const strong = 'text-gray-900 dark:text-white';
const a = 'text-primary-600 dark:text-primary-400 hover:underline';

const Ext: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={a}>{children}</a>
);

const SUPPORT_EMAIL = 'support@nwc-analytics.com';

const PrivacyPolicy: React.FC = () => {
  const lastUpdated = 'October 30, 2026';

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <title>Privacy Policy — NWC-Analytics</title>
      <meta name="description" content="How NWC-Analytics collects, uses, shares and protects your personal information, and the choices you have." />
      <link rel="canonical" href="https://nwc-analytics.com/privacy" />

      {/* Nav */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <Link to="/" className="flex items-center">
              <img src="/images/logo.png" alt="NWC-Analytics LLC" className="h-12 w-12 mr-3" />
              <span className="text-xl font-bold text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>
                NWC-Analytics
              </span>
            </Link>
            <div className="flex items-center space-x-4">
              <Link to="/login" className="text-gray-300 hover:text-primary-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                Sign In
              </Link>
              <Link to="/pricing" className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">
                Get Started
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 dark:from-gray-950 dark:via-gray-900 dark:to-primary-950" />
        <div className="relative max-w-3xl mx-auto px-6 py-14 md:py-20 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-4" style={{ fontFamily: "'Georgia', serif" }}>
            Privacy Policy
          </h1>
          <p className="text-sm text-primary-300/70 font-medium">Last updated: {lastUpdated}</p>
        </div>
      </header>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <div className="prose-container space-y-10">

          {/* Introduction */}
          <section>
            <p className={p}>
              NWC-Analytics, LLC ("NWC-Analytics," "we," "us," or "our") runs the website and app at <strong className={strong}>nwc-analytics.com</strong> (the "Service"). This policy explains what personal information we collect, why we collect it, who we share it with, how long we keep it, and the choices you have.
            </p>
          </section>

          {/* Summary */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">The short version</h2>
            <ul className={ul}>
              <li>We collect what we need to run your account: your name and email, the portfolio, watchlists and alerts you enter, and your subscription status.</li>
              <li>Your card details go straight to Stripe, our payment processor. They never touch our servers.</li>
              <li>We use Google Analytics, Microsoft Clarity and Cloudflare Web Analytics to understand how the site is used. Clarity records clicks and scrolling with all text masked.</li>
              <li>When you ask for an AI portfolio analysis, your holdings (not your name or email) are sent to Anthropic to write it.</li>
              <li>We don't sell your personal information, and we don't use advertising trackers.</li>
              <li>To see, correct or delete your data, email <a href={`mailto:${SUPPORT_EMAIL}`} className={a}>{SUPPORT_EMAIL}</a>.</li>
            </ul>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className={h2}>Information We Collect</h2>

            <h3 className={h3}>Information you give us</h3>
            <ul className={ul}>
              <li><strong className={strong}>Account:</strong> your name, email address and password. We store the password only as a one-way bcrypt hash, so we can't read it.</li>
              <li><strong className={strong}>What you enter in the app:</strong> portfolio positions and transactions (tickers, share quantities, prices, dates and any notes), watchlists, price and technical alerts, and saved screener settings.</li>
              <li><strong className={strong}>Waitlist:</strong> if you join our waitlist, your email address, how you reached us (the referring link or campaign tag) and your IP address, which we keep to prevent abuse.</li>
              <li><strong className={strong}>Support:</strong> anything you send us when you email us.</li>
            </ul>

            <h3 className={h3}>Payment information</h3>
            <p className={p}>
              Payments are handled by Stripe. When you start a trial or subscribe, you enter your card details into a form that Stripe hosts, and they go directly to Stripe. We never receive or store your full card number. From Stripe we receive and keep your Stripe customer ID, your plan, and your subscription status and billing dates.
            </p>

            <h3 className={h3}>Information collected automatically</h3>
            <p className={p}>
              When you use the Service, our servers and the analytics tools described below receive your IP address, browser and device type, the pages you visit, the site that referred you, and the time of each request. We also count your use of features that have plan limits (for example, AI analyses per day).
            </p>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className={h2}>How We Use Your Information</h2>
            <ul className={ul}>
              <li><strong className={strong}>To run the Service:</strong> create and secure your account, show your portfolio, watchlists and alerts, and apply your plan's limits.</li>
              <li><strong className={strong}>For billing:</strong> start trials, charge subscriptions, and handle failed payments, through Stripe.</li>
              <li><strong className={strong}>To email you:</strong> email verification, password resets, billing and trial notices, and the price and technical alerts you set up. These are service emails. We don't send marketing email today; if we start, every marketing email will include a way to unsubscribe.</li>
              <li><strong className={strong}>For AI features:</strong> to generate the analyses you request (see "AI Features" below).</li>
              <li><strong className={strong}>To improve the site:</strong> to see which pages and features are used and where people run into trouble.</li>
              <li><strong className={strong}>For security:</strong> to limit repeated sign-in and sign-up attempts and to prevent fraud and abuse.</li>
              <li><strong className={strong}>To meet legal obligations:</strong> such as tax and accounting records.</li>
            </ul>
          </section>

          {/* Service Providers */}
          <section>
            <h2 className={h2}>Who We Share It With</h2>
            <p className={p}>
              We don't sell your personal information. We share it only with the service providers below, so they can run parts of the Service for us. Each one receives only what its job needs.
            </p>
            <ul className={`${ul} mt-4`}>
              <li><strong className={strong}>Stripe</strong> (payments and subscriptions): your name, email address, card and billing details, and our internal ID for your account. On the payment page, Stripe's script also collects device and browser information to prevent fraud. <Ext href="https://stripe.com/privacy">Stripe Privacy Policy</Ext></li>
              <li><strong className={strong}>Railway</strong> (hosting): runs our servers and database in the United States, so it stores everything we store.</li>
              <li><strong className={strong}>Cloudflare</strong> (network and security): every request to the site passes through Cloudflare, which processes your IP address and request details to deliver the site and block attacks. <Ext href="https://www.cloudflare.com/privacypolicy/">Cloudflare Privacy Policy</Ext></li>
              <li><strong className={strong}>Postmark</strong> (email delivery): your name, email address and the content of the emails we send you, including your alert details. <Ext href="https://postmarkapp.com/privacy-policy">Postmark Privacy Policy</Ext></li>
              <li><strong className={strong}>Anthropic</strong> (AI analysis): the data described under "AI Features." <Ext href="https://www.anthropic.com/legal/commercial-terms">Anthropic Commercial Terms</Ext></li>
              <li><strong className={strong}>Google Analytics, Microsoft Clarity and Cloudflare Web Analytics</strong> (site analytics): see "Analytics and Session Recording."</li>
              <li><strong className={strong}>Google Fonts:</strong> the site loads a font from Google's servers, which receive your IP address and browser information. <Ext href="https://policies.google.com/privacy">Google Privacy Policy</Ext></li>
            </ul>
            <p className={`${p} mt-4`}>
              Market data comes from Financial Modeling Prep and the SEC. Our servers request public data from them about the tickers you look up, without your name, email or any other information about you.
            </p>
            <p className={`${p} mt-4`}>
              We may also disclose information if the law requires it, in response to valid legal process, or to protect the rights, property or safety of NWC-Analytics, our users or others. If NWC-Analytics is sold or merged, your information may transfer to the new owner, who must honor this policy for it.
            </p>
          </section>

          {/* AI Features */}
          <section>
            <h2 className={h2}>AI Features</h2>
            <p className={p}>
              Some features use Anthropic's Claude models to write analysis. When you request a <strong className={strong}>portfolio analysis</strong>, we send Anthropic your positions (ticker, number of shares, buy price, current price, value, and gain or loss), your portfolio totals, dividend data for your holdings, and general market data. We don't send your name, email address or account details.
            </p>
            <p className={`${p} mt-4`}>
              The AI analyses on stock and company pages send Anthropic only public company and market data, nothing about you.
            </p>
            <p className={`${p} mt-4`}>
              Anthropic processes this data to return the analysis to us. Under its commercial terms, Anthropic doesn't use data sent through its API to train its models.
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className={h2}>Cookies and Browser Storage</h2>
            <p className={p}>
              We don't set cookies of our own. We keep two things in your browser's local storage: your sign-in token, which expires after 90 minutes and is removed when you sign out, and your light or dark theme choice. While a tab is open, we also keep some page data in session storage so pages load faster, including your latest AI portfolio summary. The browser clears session storage when you close the tab.
            </p>
            <p className={`${p} mt-4`}>
              Third-party services set their own cookies:
            </p>
            <ul className={`${ul} mt-2`}>
              <li><strong className={strong}>Google Analytics</strong> sets cookies (such as <code>_ga</code>) that tell visits apart.</li>
              <li><strong className={strong}>Microsoft Clarity</strong> sets cookies (such as <code>_clck</code> and <code>_clsk</code>) that link the pages of one visit, and Microsoft may set its own cookies.</li>
              <li><strong className={strong}>Stripe</strong> sets cookies on the payment page to prevent fraud.</li>
              <li><strong className={strong}>Cloudflare</strong> may set a cookie that's needed to protect the site from bots.</li>
            </ul>
            <p className={`${p} mt-4`}>
              You can block or delete cookies in your browser's settings. The site still works without analytics cookies. Blocking Stripe's cookies may stop the payment form from working.
            </p>
          </section>

          {/* Analytics */}
          <section>
            <h2 className={h2}>Analytics and Session Recording</h2>

            <h3 className={h3}>Google Analytics</h3>
            <p className={p}>
              Records the pages you view, how you arrived, your device and browser, and your approximate location (derived from your IP address). <Ext href="https://policies.google.com/technologies/partner-sites">How Google uses this data</Ext> · <Ext href="https://tools.google.com/dlpage/gaoptout">Google Analytics opt-out add-on</Ext>
            </p>

            <h3 className={h3}>Microsoft Clarity</h3>
            <p className={p}>
              We partner with Microsoft Clarity to capture how you use and interact with our website through behavioral metrics, heatmaps and session replay, to improve the Service. Clarity records mouse movements, clicks, scrolling and the layout of each page. We set Clarity to mask all text, so recordings don't show what's on screen, such as your portfolio values, or what you type. Card details are entered in Stripe's own form, which Clarity can't see. Usage data is captured using first- and third-party cookies and other tracking technologies. For how Microsoft collects and uses your data, see the <Ext href="https://privacy.microsoft.com/privacystatement">Microsoft Privacy Statement</Ext>.
            </p>

            <h3 className={h3}>Cloudflare Web Analytics</h3>
            <p className={p}>
              Counts page views and records the referring site, browser and country, without cookies.
            </p>

            <p className={`${p} mt-4`}>
              We don't send your name or email address to any of these tools. Links in our verification and password-reset emails carry a one-time code. We keep it out of analytics: Google Analytics receives the page address with the code removed, and Clarity and Cloudflare Web Analytics don't load on those pages.
            </p>
          </section>

          {/* Advertising, DNT */}
          <section>
            <h2 className={h2}>Advertising, Do Not Track and Cross-Site Tracking</h2>
            <p className={p}>
              We don't currently use advertising cookies or ad-tracking pixels. We don't sell your personal information or share it for cross-context behavioral advertising. If we start measuring ads (for example, which ads lead to sign-ups), we'll update this policy before that tracking goes live, list the companies involved and how to opt out, and treat a Global Privacy Control signal from your browser as an opt-out.
            </p>
            <p className={`${p} mt-4`}>
              There's no common standard for browser "Do Not Track" signals, and the Service doesn't respond to them. Google Analytics and Microsoft Clarity can collect information about your online activity over time and across different websites that also use them. You can limit this with the opt-outs above, by blocking third-party cookies, or with your browser's tracking protection.
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className={h2}>How Long We Keep It</h2>
            <ul className={ul}>
              <li><strong className={strong}>Your account and what you've entered:</strong> for as long as your account exists, including after a subscription ends, so that if you resubscribe your portfolio, watchlists and alerts are as you left them. When you ask us to delete your account, we delete it (see below).</li>
              <li><strong className={strong}>Waitlist sign-ups:</strong> until you ask us to remove yours.</li>
              <li><strong className={strong}>Server logs</strong> (including IP addresses): for a short period set by our hosting provider, then deleted automatically.</li>
              <li><strong className={strong}>Billing records:</strong> Stripe keeps payment records, and we keep invoices, for as long as tax and accounting rules require.</li>
              <li><strong className={strong}>Analytics data:</strong> kept by Google, Microsoft and Cloudflare under their own retention settings.</li>
            </ul>
            <p className={`${p} mt-4`}>
              Deleted data may remain in backups for a limited time until they are overwritten.
            </p>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className={h2}>Your Choices and Rights</h2>
            <p className={p}>
              Wherever you live, you can ask us to:
            </p>
            <ul className={`${ul} mt-2`}>
              <li><strong className={strong}>See</strong> the personal information we hold about you, and get a copy of it.</li>
              <li><strong className={strong}>Correct</strong> anything that's wrong.</li>
              <li><strong className={strong}>Delete</strong> your account and personal information.</li>
            </ul>
            <p className={`${p} mt-4`}>
              Email <a href={`mailto:${SUPPORT_EMAIL}`} className={a}>{SUPPORT_EMAIL}</a> from the address on your account, so we know the request is yours. We'll respond within 30 days.
            </p>
            <p className={`${p} mt-4`}>
              <strong className={strong}>Deleting your account</strong> removes your account and everything stored with it (portfolio positions and transactions, watchlists, alerts, saved screens and usage records) within 30 days. It also ends any subscription immediately. As our Terms explain, fees already paid aren't refunded. We'll also ask Stripe to delete your customer record, though Stripe keeps the payment records the law requires it to keep.
            </p>
            <p className={`${p} mt-4`}>
              Service emails (security, billing and trial notices) are part of having an account. You control alert emails by turning the alerts off in the app.
            </p>
            <p className={`${p} mt-4`}>
              If we turn down a request, we'll explain why, and you can reply to ask us to reconsider. We won't treat you differently for exercising any of these rights.
            </p>
          </section>

          {/* Data Security */}
          <section>
            <h2 className={h2}>Data Security</h2>
            <p className={p}>
              We protect your information with encryption in transit (TLS), one-way hashing of passwords, sign-in tokens that expire, limits on repeated sign-in attempts, and access controls on our systems. Card details are handled only by Stripe. No method of storing or transmitting data is completely secure, so we can't guarantee absolute security. If a breach affects your personal information, we'll notify you as the law requires.
            </p>
          </section>

          {/* Location */}
          <section>
            <h2 className={h2}>Where Your Information Is Processed</h2>
            <p className={p}>
              NWC-Analytics is based in the United States, and your information is stored and processed in the United States. If you use the Service from another country, your information will be transferred to the United States.
            </p>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className={h2}>Children's Privacy</h2>
            <p className={p}>
              The Service is not intended for anyone under 18, and we don't knowingly collect personal information from children. If we learn that we have, we'll delete it promptly.
            </p>
          </section>

          {/* Third-Party Links */}
          <section>
            <h2 className={h2}>Third-Party Links</h2>
            <p className={p}>
              The Service links to other websites, such as news articles and company filings. Their privacy practices are their own, so please review their policies.
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className={h2}>Changes to This Policy</h2>
            <p className={p}>
              When we change this policy, we'll post the new version here with a new "Last updated" date. For a material change, such as a new kind of data or a new way of sharing it, we'll also email account holders before the change takes effect.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className={h2}>Contact Us</h2>
            <p className={p}>
              Questions about this policy or your personal information:
            </p>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700 mt-4">
              <p className="text-gray-900 dark:text-white font-semibold">NWC-Analytics, LLC</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">Post Falls, Idaho</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                Email: <a href={`mailto:${SUPPORT_EMAIL}`} className={a}>{SUPPORT_EMAIL}</a>
              </p>
            </div>
          </section>

        </div>
      </article>

      {/* Footer */}
      <footer className="bg-forest-800 dark:bg-gray-950 text-gray-300 dark:text-gray-400 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img src="/images/logo.png" alt="NWC-Analytics LLC" className="h-12 w-12 mr-3" />
              <div>
                <p className="text-xl font-bold text-white">NWC-Analytics</p>
                <p className="text-sm">Professional stock analysis for retail investors</p>
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm">© 2026 NWC-Analytics LLC. All rights reserved.</p>
              <p className="text-sm mt-1">Post Falls, Idaho</p>
            </div>
          </div>
        </div>
      </footer>
      <BackToTop />
    </div>
  );
};

export default PrivacyPolicy;
