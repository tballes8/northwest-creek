import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import BackToTop from '../components/BackToTop';

const FAQ: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('general');

  const faqData = {
    general: [
      {
        question: "What is NWC-Analytics?",
        answer: "NWC-Analytics is a comprehensive stock analysis platform that provides real-time market data, technical analysis tools, portfolio management, and educational content to help investors make informed decisions."
      },
      {
        question: "How do I get started?",
        answer: "Simply create a free account and start exploring our beginner-friendly tools. You can upgrade to a paid tier anytime to access advanced features like real-time alerts, unlimited watchlists, and premium indicators."
      },
      {
        question: "What subscription tiers are available?",
        answer: "We offer four tiers: Beginner (free), Casual ($9.99/month), Active ($19.99/month), and Professional ($39.99/month). Each tier provides progressively more features and higher usage limits."
      },
      {
        question: "Is there a free trial?",
        answer: "Yes! All users start with our Beginner tier which includes basic features. You can explore most functionality before deciding to upgrade."
      }
    ],
    subscription: [
      {
        question: "How do I cancel my subscription?",
        answer: (
          <div>
            <p className="mb-3">You can cancel your subscription at any time through your account settings:</p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>Log in to your account</li>
              <li>Navigate to <Link to="/account" className="text-primary-600 dark:text-primary-400 hover:underline">Account Settings</Link></li>
              <li>Scroll to the "Subscription Management" section</li>
              <li>Click "Cancel Subscription"</li>
              <li>Follow the confirmation prompts</li>
            </ol>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Your subscription will remain active until the end of your current billing period. You'll continue to have access to premium features until then.
            </p>
          </div>
        )
      },
      {
        question: "Can I change my subscription tier?",
        answer: "Yes! You can upgrade or downgrade your subscription at any time. Changes take effect immediately for upgrades, while downgrades apply at the next billing cycle."
      },
      {
        question: "What payment methods do you accept?",
        answer: "We accept all major credit cards (Visa, MasterCard, American Express) and PayPal through our secure Stripe payment processor."
      },
      {
        question: "Do you offer refunds?",
        answer: "We offer a 30-day money-back guarantee for all paid subscriptions. If you're not satisfied, contact our support team within 30 days of your purchase."
      }
    ],
    tutorials: [
      {
        question: "What are YouTube tutorials?",
        answer: "Our YouTube tutorials are comprehensive video guides that walk you through various features of the platform. From basic navigation to advanced technical analysis techniques, our tutorials are designed to help users at all skill levels."
      },
      {
        question: "How do I access the tutorials?",
        answer: (
          <div>
            <p className="mb-3">Tutorials are available in two ways:</p>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>Visit our <Link to="/tutorials" className="text-primary-600 dark:text-primary-400 hover:underline">Tutorials page</Link> to browse all available videos</li>
              <li>Click the tutorial links within specific tools for contextual help</li>
            </ol>
          </div>
        )
      },
      {
        question: "Are tutorials included in all subscription tiers?",
        answer: "Yes! All tutorials are available to users of all subscription tiers, including our free Beginner tier. No subscription required to access educational content."
      },
      {
        question: "Can I suggest new tutorial topics?",
        answer: "Absolutely! We love hearing from our users. Send your tutorial suggestions to our support team, and we'll consider them for future content."
      }
    ],
    blogs: [
      {
        question: "What content is available in the blogs?",
        answer: "Our blog covers a wide range of topics including market analysis, investment strategies, platform updates, educational content, and insights from experienced traders and analysts."
      },
      {
        question: "How do I access the blogs?",
        answer: (
          <div>
            <p className="mb-3">Access our blog content through:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>The <Link to="/blogs" className="text-primary-600 dark:text-primary-400 hover:underline">Blogs page</Link> to browse all articles</li>
              <li>Category filters to find content on specific topics</li>
              <li>Search functionality to find articles by keyword</li>
            </ul>
          </div>
        )
      },
      {
        question: "Are blogs free to read?",
        answer: "Yes! All blog content is completely free to read for all users, regardless of subscription tier. We believe in making educational content accessible to everyone."
      },
      {
        question: "How often are new blog posts published?",
        answer: "We publish new content regularly, typically 2-3 articles per week. Follow us on social media or subscribe to our newsletter to stay updated on new posts."
      }
    ],
    technical: [
      {
        question: "What browsers are supported?",
        answer: "NWC-Analytics works best with modern browsers including Chrome, Firefox, Safari, and Edge. We recommend keeping your browser updated for the best experience."
      },
      {
        question: "Is the platform mobile-friendly?",
        answer: "Yes! Our platform is fully responsive and works great on tablets and smartphones. Some advanced features may be optimized for desktop use."
      },
      {
        question: "How do I reset my password?",
        answer: "Click 'Forgot Password' on the login page, enter your email address, and follow the instructions sent to your email to reset your password."
      },
      {
        question: "I'm experiencing technical issues. What should I do?",
        answer: "Try refreshing the page first. If issues persist, clear your browser cache and cookies, or try a different browser. Contact support if problems continue."
      }
    ]
  };

  const categories = [
    { id: 'general', label: 'General', icon: '🤔' },
    { id: 'subscription', label: 'Subscription', icon: '💳' },
    { id: 'tutorials', label: 'Tutorials', icon: '🎥' },
    { id: 'blogs', label: 'Blogs', icon: '📝' },
    { id: 'technical', label: 'Technical', icon: '🔧' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <title>FAQ — NWC-Analytics</title>
      <meta name="description" content="Frequently asked questions about NWC-Analytics. Find answers about subscriptions, tutorials, blogs, and technical support." />
      <link rel="canonical" href="https://nwc-analytics.com/faq" />

      {/* Nav */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <Link to="/" className="flex items-center">
              <img src="/images/logo.png" alt="NWC-Analytics" className="h-12 w-12 mr-3" />
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
            Frequently Asked Questions
          </h1>
          <p className="text-primary-300/70 font-medium">
            Find answers to common questions about NWC-Analytics
          </p>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Category Tabs */}
        <div className="flex flex-wrap justify-center mb-8 border-b border-gray-200 dark:border-gray-700">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeCategory === category.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <span className="mr-2">{category.icon}</span>
              {category.label}
            </button>
          ))}
        </div>

        {/* FAQ Content */}
        <div className="space-y-6">
          {faqData[activeCategory as keyof typeof faqData].map((faq, index) => (
            <div key={index} className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {faq.question}
              </h3>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {faq.answer}
              </div>
            </div>
          ))}
        </div>

        {/* Contact Support */}
        <div className="mt-12 text-center">
          <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-6 border border-primary-200 dark:border-primary-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Still have questions?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Can't find the answer you're looking for? Our support team is here to help.
            </p>
            <a
              href="mailto:support@nwc-analytics.com"
              className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-md transition-colors"
            >
              Contact Support
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-forest-800 dark:bg-gray-950 text-gray-300 dark:text-gray-400 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img src="/images/logo.png" alt="NWC-Analytics" className="h-12 w-12 mr-3" />
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

export default FAQ;
