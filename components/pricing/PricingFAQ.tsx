"use client";

import { useState } from "react";

export default function PricingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0); // First item open by default like in screenshot

  const faqs = [
    {
      question: "Can I change plans at any time?",
      answer:
        "Yes, you can upgrade, downgrade, or cancel your subscription at any time. Any changes will be applied at the start of your next billing cycle.",
    },
    {
      question: "What forms of payment do you accept?",
      answer:
        "We accept all major credit cards including Visa, Mastercard, American Express, and Discover. For Enterprise plans, we also support ACH bank transfers and invoicing.",
    },
    {
      question: "Does unused AI credits roll over to the next month?",
      answer:
        "No, AI credits reset at the beginning of each billing cycle and do not roll over to subsequent months.",
    },
    {
      question: "How does annual billing work?",
      answer:
        "With annual billing, you pay upfront for a 12-month subscription and save 20% compared to paying month-to-month.",
    },
    {
      question: "What happens to my data if I cancel my subscription?",
      answer:
        "If you cancel, your account data will remain accessible in read-only mode for 30 days, allowing you to export all your roadmaps before permanent deletion.",
    },
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="py-16 px-4 max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <span className="text-xs font-bold tracking-wider text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
          FAQ
        </span>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mt-3 tracking-tight">
          Frequently asked questions.
        </h2>
        <p className="text-sm md:text-base text-slate-600 mt-2">
          Can&apos;t find what you&apos;re looking for? Reach out to our support team.
        </p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;

          return (
            <div
              key={index}
              className={`border rounded-2xl bg-white transition-all duration-200 ${
                isOpen ? "border-blue-200 shadow-md ring-1 ring-blue-500/10" : "border-slate-200 hover:border-slate-300 shadow-sm"
              }`}
            >
              <button
                type="button"
                id={`faq-button-${index}`}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${index}`}
                onClick={() => toggleFAQ(index)}
                className="w-full py-4 px-6 text-left flex items-center justify-between gap-4 font-semibold text-slate-900 text-sm md:text-base focus:outline-none cursor-pointer"
              >
                <span>{faq.question}</span>
                <svg
                  className={`w-5 h-5 text-blue-600 shrink-0 transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div
                  id={`faq-panel-${index}`}
                  aria-labelledby={`faq-button-${index}`}
                  className="px-6 pb-5 pt-1 text-xs md:text-sm text-slate-600 leading-relaxed border-t border-slate-100"
                >
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
