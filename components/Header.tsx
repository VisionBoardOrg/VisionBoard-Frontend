"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Logo from "./reusables/Logo";
import PrimaryButton from "./reusables/primaryButton";

interface HeaderProps {
  isAuthenticated?: boolean;
}

export default function Header({ isAuthenticated = false }: HeaderProps) {
  const pathname = usePathname();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const navLinks = [
    { name: "Features", href: "/features" },
    { name: "Solutions", href: "/solutions" },
    { name: "Pricing", href: "/pricing" },
  ];

  // Close mobile menu on Escape key or outside click
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-blue focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>

      <header
        ref={headerRef}
        className="relative border-b border-border py-3 px-4 sm:px-8 bg-white mx-3 my-3 sm:m-4 rounded-xl border shadow-sm transition-all z-40"
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-6 lg:gap-12">
            <Link
              href="/"
              aria-label="VisionBoard Home"
              className="hover:opacity-90 transition-opacity rounded-lg"
            >
              <Logo markSize={32} textSize={18} />
            </Link>
            <nav aria-label="Primary" className="hidden md:flex">
              <ul className="flex gap-6 lg:gap-8 text-[15px] font-medium text-slate">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <li key={link.name}>
                      <Link
                        href={link.href}
                        aria-current={isActive ? "page" : undefined}
                        className={`transition-colors ${
                          isActive
                            ? "text-blue font-semibold"
                            : "hover:text-blue"
                        }`}
                      >
                        {link.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <div className="hidden md:block">
                <PrimaryButton href="/dashboard" size="sm">
                  Go to Dashboard
                </PrimaryButton>
              </div>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="hidden md:block text-sm font-medium text-slate hover:text-ink transition-colors px-3 py-2"
                >
                  Sign in
                </Link>
                <div className="hidden md:block">
                  <PrimaryButton href="/auth/register" size="sm">
                    Get Started Free
                  </PrimaryButton>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="md:hidden min-w-11 min-h-11 flex items-center justify-center text-slate hover:text-blue hover:bg-slate-50 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue transition-colors cursor-pointer"
              aria-label={isMobileMenuOpen ? "Close mobile menu" : "Open mobile menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav-menu"
            >
              {isMobileMenuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <div id="mobile-nav-menu" className="md:hidden pt-4 pb-3 border-t border-border mt-3 space-y-3">
            <nav aria-label="Mobile primary">
              <ul className="flex flex-col space-y-1">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <li key={link.name}>
                      <Link
                        href={link.href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`block px-3 py-2.5 text-[15px] font-medium rounded-md transition-colors ${
                          isActive
                            ? "text-blue bg-blue-faint font-semibold"
                            : "text-slate hover:text-blue hover:bg-slate-50"
                        }`}
                      >
                        {link.name}
                      </Link>
                    </li>
                  );
                })}
                {!isAuthenticated && (
                  <li>
                    <Link
                      href="/auth/login"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block px-3 py-2.5 text-[15px] font-medium text-slate hover:text-blue hover:bg-slate-50 rounded-md transition-colors"
                    >
                      Sign in
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
            <div className="pt-2 border-t border-border">
              {isAuthenticated ? (
                <PrimaryButton
                  href="/dashboard"
                  size="md"
                  className="w-full"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Go to Dashboard
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  href="/auth/register"
                  size="md"
                  className="w-full"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Get Started Free
                </PrimaryButton>
              )}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
