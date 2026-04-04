"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, TrendingUp, Building2 } from "lucide-react";

interface HeroProps {
  onEnterDashboard: () => void;
}

export function Hero({ onEnterDashboard }: HeroProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 lg:px-16 py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-foreground rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-background" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Estate Vantage</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          <a href="#about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About</a>
        </nav>
        <Button 
          onClick={onEnterDashboard}
          className="rounded-full px-6"
        >
          Launch App
        </Button>
      </header>

      {/* Hero Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 lg:px-16 pb-20">
        {/* Badge */}
        <div className="mb-8 px-4 py-2 bg-secondary rounded-full flex items-center gap-2 text-sm">
          <span className="w-2 h-2 bg-estate-green rounded-full animate-pulse" />
          <span className="text-muted-foreground">Now with AI-powered predictions</span>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </div>

        {/* Main Heading */}
        <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl text-center max-w-4xl leading-[1.1] tracking-tight text-balance">
          Real Estate Valuation
          <br />
          <span className="text-muted-foreground">meets precision</span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg md:text-xl text-muted-foreground text-center max-w-2xl text-pretty">
          Deploy our advanced ML valuation engine designed for institutional real estate. 
          Our models power valuations for portfolios representing $50B+ in assets.
        </p>

        {/* CTA */}
        <div className="mt-10">
          <Button 
            size="lg"
            onClick={onEnterDashboard}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="rounded-full px-8 py-6 text-base gap-2 group"
          >
            Request Access
            <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${isHovered ? 'translate-x-1' : ''}`} />
          </Button>
        </div>

        {/* Feature Cards */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          <FeatureCard 
            icon={<BarChart3 className="w-6 h-6" />}
            title="Automated Valuation"
            description="ML models trained on 10M+ transactions for institutional-grade accuracy"
          />
          <FeatureCard 
            icon={<TrendingUp className="w-6 h-6" />}
            title="Market Intelligence"
            description="Real-time market dynamics and liquidity scoring at your fingertips"
          />
          <FeatureCard 
            icon={<Building2 className="w-6 h-6" />}
            title="Portfolio Analytics"
            description="Deep insights into your holdings with actionable recommendations"
          />
        </div>
      </div>

      {/* Bottom Links */}
      <div className="flex justify-between items-center px-8 lg:px-16 py-8 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>LEARN OUR</span>
          <span className="font-medium text-foreground">METHODOLOGY</span>
          <div className="w-8 h-8 rounded-full border border-estate-red flex items-center justify-center ml-2">
            <ArrowRight className="w-3 h-3 text-estate-red" />
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
          <span>EXPLORE</span>
          <span className="font-medium text-foreground">CASE STUDIES</span>
          <div className="w-8 h-8 rounded-full border border-estate-red flex items-center justify-center ml-2">
            <ArrowRight className="w-3 h-3 text-estate-red" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 rounded-2xl bg-card border border-border hover:border-foreground/20 transition-all duration-300 hover:shadow-lg group">
      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4 group-hover:bg-foreground group-hover:text-background transition-colors duration-300">
        {icon}
      </div>
      <h3 className="font-medium text-base mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
