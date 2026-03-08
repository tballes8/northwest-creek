import React from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import BackToTop from '../components/BackToTop';

const PrivacyPolicy: React.FC = () => {
  const lastUpdated = 'February 25, 2026';

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <title>Privacy Policy — NWC-Analytics</title>
      <meta name="description" content="Privacy Policy for NWC-Analytics LLC. Learn how we collect, use, and protect your personal information." />
      <link rel="canonical" href="https://northwestcreekllc.com/privacy" />

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
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              NWC-Analytics, LLC ("NWC-Analytics," "we," "us," or "our") operates the website located at <strong className="text-gray-900 dark:text-white">nwc-analytics.com</strong> and related services. This Privacy Policy describes how we collect, use, store, and protect your personal information when you use our website, applications, and services (collectively, the "Service").
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              By accessing or using the Service, you agree to the collection and use of information in accordance with this policy. If you do not agree with this policy, please do not use our Service.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Information We Collect</h2>

            <h3 className="text-base font-semibold text-gray-900 dark:text-white mt-6 mb-2">Account Information</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              When you create an account, we collect your name, email address, and password. If you subscribe to a paid plan or begin a free trial, we collect billing information through our payment processor, Stripe. During a free trial, your payment method is securely stored by Stripe to enable automatic billing at the end of the trial period if you do not cancel. We do not store your full credit card number on our servers.
            </p>

            <h3 className="text-base font-semibold text-gray-900 dark:text-white mt-6 mb-2">Usage Data</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We automatically collect certain information when you use the Service, including your IP address, browser type, device information, pages visited, and timestamps. This data is used to maintain and improve the Service and is not sold to third parties.
            </p>

            <h3 className="text-base font-semibold text-gray-900 dark:text-white mt-6 mb-2">Cookies</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We use cookies and similar technologies to maintain your session, remember your preferences (such as dark mode), and understand how the Service is used. You can control cookie settings through your browser, though disabling cookies may affect the functionality of the Service.
            </p>
          </section>


          {/* How We Use Your Information */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">How We Use Your Information</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We use the information we collect to provide, maintain, and improve the Service; process transactions and manage your subscription (including free trial periods and automatic conversion to paid plans); deliver email notifications for stock price alerts you have configured; send transactional communications related to your account (such as password resets, billing confirmations, and trial expiration reminders); respond to your inquiries and support requests; monitor and analyze usage patterns to improve the user experience; and protect against unauthorized access, fraud, and abuse.
            </p>
          </section>

          {/* Data Sharing */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">How We Share Your Information</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              We do not sell your personal information to third parties. We may share your information with the following categories of service providers, solely to operate the Service:
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              <strong className="text-gray-900 dark:text-white">Payment Processing:</strong> Stripe processes your payment information and securely stores your payment method for recurring billing and free trial conversions. Stripe's use of your data is governed by their privacy policy.
              <br className="mb-2" />
              <strong className="text-gray-900 dark:text-white">Hosting & Infrastructure:</strong> Our application is hosted on Railway. Your data may be processed on their infrastructure.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              We may also disclose your information if required to do so by law, in response to a valid legal process, or to protect the rights, property, or safety of NWC-Analytics, our users, or the public.
            </p>
          </section>

          {/* Data Security */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Data Security</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We take reasonable administrative, technical, and physical measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. This includes encryption of data in transit (TLS/SSL), hashed passwords, and secure access controls. However, no method of electronic storage or transmission is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Data Retention</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We retain your account information for as long as your account is active or as needed to provide the Service. If you delete your account, we will delete or anonymize your personal information within a reasonable timeframe, except where retention is required by law or for legitimate business purposes (such as resolving disputes or enforcing agreements).
            </p>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Children's Privacy</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              The Service is not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected personal information from a child under 18, we will take steps to delete that information promptly.
            </p>
          </section>

          {/* Third-Party Links */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Third-Party Links</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              The Service may contain links to third-party websites or services. We are not responsible for the privacy practices or content of those third parties. We encourage you to review the privacy policies of any third-party services you access through our Service.
            </p>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Your Rights</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Depending on your jurisdiction, you may have certain rights regarding your personal information, including the right to access the personal data we hold about you; request correction of inaccurate information; request deletion of your personal data; and withdraw consent for data processing where consent is the legal basis. To exercise any of these rights, please contact us at the email address below.
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Changes to This Policy</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We may update this Privacy Policy from time to time. If we make material changes, we will notify you by posting the updated policy on the Service with a revised "Last updated" date. Your continued use of the Service after any changes constitutes your acceptance of the updated policy.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pl-4 border-l-4 border-primary-500">Contact Us</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              If you have questions about this Privacy Policy or your personal information, please contact us at:
            </p>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700 mt-4">
              <p className="text-gray-900 dark:text-white font-semibold">NWC-Analytics, LLC</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">Post Falls, Idaho</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                Email: <a href="mailto:support@nwc-analytics.com" className="text-primary-600 dark:text-primary-400 hover:underline">support@northwestcreekllc.com</a>
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