"use client";

import React, { useState } from "react";
import Link from "next/link";
import Logo from "./reusables/Logo";
import PrimaryButton from "./reusables/primaryButton";
import WaitlistModal from "./waitlist/WaitlistModal";

export default function Header() {
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

  return (
    <header className="flex justify-between items-center border-b border-border py-4 px-8 bg-white m-4 rounded-lg border shadow-sm">
      <div className="flex items-center gap-12">
        <Link href="/" className="hover:opacity-90 transition-opacity">
          <Logo markSize={32} textSize={18} />
        </Link>
        <nav className="hidden md:flex">
          <ul className="flex gap-8 text-[15px] font-medium text-slate">
            <li>
              <Link href="/features" className="hover:text-blue transition-colors">Features</Link>
            </li>
            <li>
              <Link href="/solutions" className="hover:text-blue transition-colors">Solutions</Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-blue transition-colors">Pricing</Link>
            </li>
            <li>
              <Link href="/#features" className="hover:text-blue transition-colors">Resources</Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {/*
        <Link href="#" className="text-sm font-semibold text-slate hover:text-blue transition-colors px-3 py-2">
          Login
        </Link>
        <PrimaryButton size="sm">Start free trial</PrimaryButton>
        */}
        <PrimaryButton size="sm" onClick={() => setIsWaitlistOpen(true)}>
          Join Waitlist
        </PrimaryButton>
      </div>

      <WaitlistModal
        isOpen={isWaitlistOpen}
        onClose={() => setIsWaitlistOpen(false)}
      />
    </header>
  );
}

