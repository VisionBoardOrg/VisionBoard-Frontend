"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

interface WaitlistTickerProps {
  count?: number;
  className?: string;
}

export default function WaitlistTicker({ count: initialCount, className = "" }: WaitlistTickerProps) {
  const [count, setCount] = useState<number | null>(initialCount ?? null);

  useEffect(() => {
    if (initialCount !== undefined) {
      queueMicrotask(() => setCount(initialCount));
      return;
    }

    const fetchCount = async () => {
      try {
        const res = await fetch("/api/waitlist/status");
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data) {
          setCount(json.data.totalWaitlist);
        }
      } catch (err) {
        console.error("Failed to fetch waitlist count:", err);
      }
    };

    fetchCount();
  }, [initialCount]);

  // If loading or count is 0, show a welcoming message
  if (count === null || count === 0) {
    return (
      <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-faint border border-blue-light text-blue text-xs font-semibold shadow-sm ${className}`}>
        <Sparkles className="w-3.5 h-3.5 text-blue animate-pulse" />
        <span>Be the first to join our exclusive early access waitlist!</span>
      </div>
    );
  }

  // Format count dynamically based on the numbers
  const peopleWord = count === 1 ? "Product Leader" : "Product Leaders";

  return (
    <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-faint border border-blue-light text-blue text-xs font-semibold shadow-sm ${className}`}>
      <div className="flex -space-x-1.5">
        <img
          src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex"
          alt="Avatar"
          className="w-4 h-4 rounded-full border border-white bg-blue-light"
        />
        <img
          src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah"
          alt="Avatar"
          className="w-4 h-4 rounded-full border border-white bg-blue-light"
        />
        <img
          src="https://api.dicebear.com/7.x/avataaars/svg?seed=David"
          alt="Avatar"
          className="w-4 h-4 rounded-full border border-white bg-blue-light"
        />
      </div>
      <Sparkles className="w-3.5 h-3.5 text-blue" />
      <span>
        Joined by <strong className="font-bold text-blue">{count.toLocaleString()}</strong> {peopleWord} from companies around the world
      </span>
    </div>
  );
}
