"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import Logo from "./reusables/Logo";
import PrimaryButton from "./reusables/primaryButton";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "Features", href: "/features" },
    { name: "Solutions", href: "/solutions" },
    { name: "Pricing", href: "/pricing" },
    { name: "Resources", href: "/#features" },
  ];

  return (
    <header className="relative border-b border-border py-3 px-4 sm:px-8 bg-white mx-3 my-3 sm:m-4 rounded-xl border shadow-sm transition-all z-40">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-6 lg:gap-12">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <Logo markSize={32} textSize={18} />
          </Link>
          <nav className="hidden md:flex">
            <ul className="flex gap-6 lg:gap-8 text-[15px] font-medium text-slate">
              {navLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="hover:text-blue transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/auth/login" className="hidden md:block text-sm font-medium text-slate hover:text-ink transition-colors px-3 py-2">
            Sign in
          </Link>
          <div className="hidden md:block">
            <Link href="/auth/register">
              <PrimaryButton size="sm">Get Started Free</PrimaryButton>
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-slate hover:text-blue rounded-md focus:outline-none focus:ring-2 focus:ring-blue/20 transition-colors"
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden pt-4 pb-3 border-t border-border mt-3 space-y-3">
          <nav>
            <ul className="flex flex-col space-y-1">
              {navLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-3 py-2 text-[15px] font-medium text-slate hover:text-blue hover:bg-slate-50 rounded-md transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/auth/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 text-[15px] font-medium text-slate hover:text-blue hover:bg-slate-50 rounded-md transition-colors"
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
          <div className="pt-2 border-t border-border">
            <Link href="/auth/register" onClick={() => setIsMobileMenuOpen(false)}>
              <PrimaryButton size="md" className="w-full">Get Started Free</PrimaryButton>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}


