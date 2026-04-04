import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function CTASection() {
  return (
    <section className="py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="bg-primary rounded-3xl px-8 py-16 md:px-16 md:py-20 text-center">
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight text-primary-foreground max-w-2xl mx-auto text-balance mb-6">
            Ready to Take Control of Your Financial Future?
          </h2>
          <p className="text-primary-foreground/80 max-w-xl mx-auto mb-10 leading-relaxed">
            Schedule a free consultation with one of our expert advisors and discover how 
            we can help you achieve your financial goals.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              size="lg" 
              variant="secondary"
              className="rounded-full px-8 gap-2"
            >
              Schedule a Consultation
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="rounded-full px-8 bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              Call Us Today
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
