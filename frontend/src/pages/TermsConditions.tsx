import React from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import BackToTop from '../components/BackToTop';

const TermsConditions: React.FC = () => {
  const lastUpdated = 'February 25, 2026';

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <title>Terms &amp; Conditions — NWC-Analytics</title>
      <meta name="description" content="Terms and Conditions for NWC-AnalyticsLLC. Read the terms governing your use of our stock analysis platform and services." />
      <link rel="canonical" href="https://nwc-analytics.com/terms" />

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
            Terms &amp; Conditions
          </h1>
          <p className="text-sm text-primary-300/70 font-medium">Last updated: {lastUpdated}</p>
        </div>
      </header>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <div className="prose-container space-y-10">

          {/* Introduction */}
          <section>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              These Terms and Conditions ("Terms") govern your access to and use of the website, applications, and services (collectively, the "Service") operated by NWC-Analytics, LLC ("NWC-Analytics," "we," "us," or "our"), a limited liability company registered in the State of Idaho, with its principal place of business in Post Falls, Idaho.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, you must not use the Service.
            </p>
          </section>

          {/* Service Description */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Service Description</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              NWC-Analytics provides a web-based stock analysis platform designed for retail investors. Features include real-time and historical stock data, technical analysis tools, discounted cash flow (DCF) valuation models, portfolio tracking, watchlists, stock price alert notifications, and related financial research tools. Feature availability varies by subscription tier.
            </p>
          </section>

          {/* Not Financial Advice */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Not Financial Advice</h2>
            <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-lg p-6">
              <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                <strong className="text-amber-700 dark:text-amber-400">Important:</strong> The Service is provided for informational and educational purposes only. Nothing on this platform constitutes financial advice, investment advice, tax advice, or legal advice. NWC-Analytics is not a registered investment advisor, broker-dealer, or financial planner. All investment decisions are made solely by you, and you are solely responsible for evaluating the merits and risks of any investment or trading decision. Past performance is not indicative of future results. Always consult a qualified financial professional before making investment decisions.
              </p>
            </div>
          </section>

          {/* Account Terms */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Account Terms</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              You must be at least 18 years of age to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to provide accurate and complete information when creating your account and to update that information as needed. We reserve the right to suspend or terminate accounts that violate these Terms or that we reasonably believe are being used fraudulently.
            </p>
          </section>

          {/* Subscriptions & Billing */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Subscriptions &amp; Billing</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              Certain features of the Service are available only through paid subscription plans. Subscription pricing, features, and billing frequency are described on our pricing page and may change from time to time. We will notify existing subscribers of material pricing changes before they take effect.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              Payments are processed through Stripe. By subscribing, you authorize us to charge your payment method on a recurring basis at the applicable subscription rate. You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of the current billing period — you will retain access to paid features until then.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              <strong className="text-gray-900 dark:text-white">Free Trial:</strong> Certain subscription plans may include a 14-day free trial period. When you sign up for a trial-eligible plan, you must provide a valid payment method. <strong className="text-gray-900 dark:text-white">Your payment method will not be charged during the trial period.</strong> At the end of the 14-day trial, your subscription will automatically convert to a paid subscription and your payment method will be charged at the applicable subscription rate unless you cancel before the trial period ends. You may cancel your trial at any time through your account settings. If you cancel during the trial period, you will retain access to paid features until the trial expires, and you will not be charged. Trial offers are limited to one per user per plan. We reserve the right to modify or discontinue trial offers at any time.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We do not offer refunds for partial billing periods. If you believe you were charged in error, please contact us and we will review your case.
            </p>
          </section>


          {/* Data Accuracy */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Data Accuracy &amp; Availability</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Market data, stock quotes, financial metrics, and other information displayed on the Service are sourced from third-party data providers. While we make reasonable efforts to ensure accuracy, we do not warrant that any data is complete, accurate, current, or error-free. Data may be delayed, unavailable, or subject to interruption. NWC-Analytics is not liable for any losses, damages, or decisions arising from reliance on data provided through the Service.
            </p>
          </section>

          {/* Acceptable Use */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Acceptable Use</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              You agree to use the Service only for lawful purposes and in compliance with these Terms. You may not use the Service to attempt to gain unauthorized access to our systems or other users' accounts; scrape, crawl, or harvest data from the Service by automated means without our written consent; redistribute, resell, or sublicense any data obtained through the Service; interfere with the operation of the Service or impose an unreasonable load on our infrastructure; or use the Service for any purpose that is unlawful or prohibited by these Terms.
            </p>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Intellectual Property</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              All content, features, and functionality of the Service — including but not limited to text, graphics, logos, icons, software, and the overall design and layout — are the property of NWC-Analytics, LLC or its licensors and are protected by copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, modify, or create derivative works based on our content without prior written consent.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Limitation of Liability</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              To the maximum extent permitted by applicable law, NWC-Analytics, LLC, its owners, officers, employees, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or investment losses, arising from or related to your use of or inability to use the Service. Our total aggregate liability for any claims arising from these Terms or the Service shall not exceed the amount you have paid us in the twelve (12) months preceding the claim.
            </p>
          </section>

          {/* Disclaimer of Warranties */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Disclaimer of Warranties</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              The Service is provided on an "as is" and "as available" basis, without warranties of any kind, either express or implied. We disclaim all warranties, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, secure, or error-free, or that any data provided will be accurate or reliable.
            </p>
          </section>

          {/* Indemnification */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Indemnification</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              You agree to indemnify, defend, and hold harmless NWC-Analytics, LLC, its owners, officers, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising from or related to your use of the Service, your violation of these Terms, or your violation of any third-party rights.
            </p>
          </section>

          {/* Termination */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Termination</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We reserve the right to suspend or terminate your access to the Service at our sole discretion, with or without notice, for conduct that we determine violates these Terms or is harmful to other users, us, or third parties. You may terminate your account at any time by contacting us or through your account settings. Upon termination, your right to use the Service ceases immediately, and we may delete your account data in accordance with our Privacy Policy.
            </p>
          </section>

          {/* Governing Law */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Governing Law</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              These Terms are governed by and construed in accordance with the laws of the State of Idaho, without regard to its conflict of laws provisions. Any disputes arising from or related to these Terms or the Service shall be resolved in the state or federal courts located in Kootenai County, Idaho, and you consent to the personal jurisdiction of such courts.
            </p>
          </section>

          {/* Changes to Terms */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Changes to These Terms</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We may update these Terms from time to time. If we make material changes, we will post the updated Terms on the Service with a revised "Last updated" date. Your continued use of the Service after changes are posted constitutes your acceptance of the updated Terms. We encourage you to review these Terms periodically.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Contact Us</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              If you have questions about these Terms, please contact us at:
            </p>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700 mt-4">
              <p className="text-gray-900 dark:text-white font-semibold">NWC-Analytics, LLC</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">Post Falls, Idaho</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                Email: <a href="mailto:support@nwc-analytics.com" className="text-primary-600 dark:text-primary-400 hover:underline">support@nwc-analytics.com</a>
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

export default TermsConditions;