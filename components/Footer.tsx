import Link from "next/link";
import Logo from "./reusables/Logo";

export default function Footer() {
  return (
    <footer className="bg-blue text-white w-full pt-14 pb-10 px-8 md:px-16 lg:px-24">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 sm:gap-10 pb-12">
          {/* Left Column: Brand, Description & Socials */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 space-y-4">
            <Link href="/" className="inline-block hover:opacity-95 transition-opacity">
              <Logo markSize={30} textSize={24} inv markBg="transparent" markFg="#FFFFFF" />
            </Link>
            <p className="text-blue-100/90 text-sm leading-relaxed max-w-sm">
              AI-powered roadmaps, collaboration, and execution tracking — all in one workspace.
            </p>
          </div>

          {/* Column 1: Company */}
          <div>
            <h3 className="font-bold text-white text-base mb-4">Company</h3>
            <ul className="space-y-3 text-sm text-blue-100/90">
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/solutions" className="hover:text-white transition-colors">
                  Solutions
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-white transition-colors">
                  Features
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Resources */}
          <div>
            <h3 className="font-bold text-white text-base mb-4">Resources</h3>
            <ul className="space-y-3 text-sm text-blue-100/90">
              <li>
                <Link href="/features" className="hover:text-white transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-white transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/solutions" className="hover:text-white transition-colors">
                  Solutions
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Solution */}
          <div>
            <h3 className="font-bold text-white text-base mb-4">Solution</h3>
            <ul className="space-y-3 text-sm text-blue-100/90">
              <li>
                <Link href="/solutions" className="hover:text-white transition-colors">
                  Solutions
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-white transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-white transition-colors">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Legal */}
          <div>
            <h3 className="font-bold text-white text-base mb-4">Legal</h3>
            <ul className="space-y-3 text-sm text-blue-100/90">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <a href="mailto:legal@vision-board.tech" className="hover:text-white transition-colors">
                  Contact Legal
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar Divider & Copyright */}
        <div className="pt-8 border-t border-white/20 flex flex-col md:flex-row justify-between items-center text-xs text-blue-100/80 gap-4">
          <p>© {new Date().getFullYear()} VisionBoard. All rights reserved.</p>
          <p>Built for teams that plan, track, and ship together.</p>
        </div>
      </div>
    </footer>
  );
}


