import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-sm text-muted-foreground mb-8">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Trusted by over 10,000 clients worldwide
          </div>

          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight text-foreground max-w-4xl text-balance leading-tight">
            Financial Guidance for{" "}
            <span className="italic">Every Stage</span> of Life
          </h1>

          <p className="mt-6 text-lg text-muted-foreground max-w-2xl text-pretty leading-relaxed">
            Expert wealth management and financial consulting services designed to help you 
            build, protect, and grow your assets with confidence and clarity.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <Button size="lg" className="rounded-full px-8 gap-2">
              Schedule a Consultation
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="rounded-full px-8">
              Explore Our Services
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
