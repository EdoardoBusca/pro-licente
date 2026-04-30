"use client";

import { useEffect, useState } from "react";

const LOADING_TEXTS = [
  "Initializing valuation engine...",
  "Loading market data...",
  "Calibrating ML models...",
  "Preparing dashboard...",
];

interface LoadingTransitionProps {
  onComplete: () => void;
}

export function LoadingTransition({ onComplete }: LoadingTransitionProps) {
  const [progress, setProgress] = useState(0);
  const [currentText, setCurrentText] = useState(0);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          setTimeout(onComplete, 400);
          return 100;
        }
        return prev + 2;
      });
    }, 40);

    const textInterval = setInterval(() => {
      setCurrentText(prev => (prev + 1) % LOADING_TEXTS.length);
    }, 600);

    return () => {
      clearInterval(progressInterval);
      clearInterval(textInterval);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-foreground z-50 flex flex-col items-center justify-center">
      {/* Logo */}
      <div className="mb-12 flex items-center gap-3">
        <img src="/logo-vantagepoint.png" alt="VantagePoint" className="h-16 w-auto object-contain brightness-0 invert" />
      </div>

      {/* Progress Bar */}
      <div className="w-64 h-1 bg-background/20 rounded-full overflow-hidden mb-6">
        <div 
          className="h-full bg-background rounded-full transition-all duration-100 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Loading Text */}
      <p className="text-background/60 text-sm h-5">
        {LOADING_TEXTS[currentText]}
      </p>

      {/* Stats appearing */}
      <div className="absolute bottom-20 flex gap-16 text-background/40 text-xs tracking-widest">
        <div className={`transition-opacity duration-500 ${progress > 30 ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-background text-2xl font-light mb-1">10M+</div>
          <div>TRANSACTIONS</div>
        </div>
        <div className={`transition-opacity duration-500 ${progress > 50 ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-background text-2xl font-light mb-1">$50B</div>
          <div>ASSETS VALUED</div>
        </div>
        <div className={`transition-opacity duration-500 ${progress > 70 ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-background text-2xl font-light mb-1">98.2%</div>
          <div>ACCURACY</div>
        </div>
      </div>
    </div>
  );
}
