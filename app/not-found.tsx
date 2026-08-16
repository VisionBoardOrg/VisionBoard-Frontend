import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ArrowLeft, MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-offwhite text-ink font-sans">
      <Header />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-border p-8 md:p-12 max-w-lg w-full text-center space-y-6 shadow-sm">
          <div className="w-16 h-16 bg-blue-faint rounded-2xl border border-blue-light flex items-center justify-center mx-auto text-blue">
            <MapPinOff className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-mono font-bold text-blue uppercase tracking-widest bg-blue-faint px-3 py-1 rounded-full border border-blue-light">
              404 Page Not Found
            </span>
            <h1 className="text-3xl font-extrabold text-ink tracking-tight pt-2">
              Lost in Space
            </h1>
            <p className="text-sm text-slate leading-relaxed">
              The page or resource you are looking for does not exist or has been moved to a new workspace location.
            </p>
          </div>

          <div className="pt-2 flex justify-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-blue text-white px-6 py-3 rounded-xl font-semibold text-xs shadow-md hover:bg-blue-mid transition-all hover:scale-[1.02]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
