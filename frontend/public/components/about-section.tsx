import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"

const highlights = [
  "25+ years of industry experience",
  "Certified financial planners on staff",
  "Personalized approach to every client",
  "Transparent fee structure",
]

const stats = [
  { value: "$2.5B+", label: "Assets Managed" },
  { value: "10,000+", label: "Happy Clients" },
  { value: "98%", label: "Client Retention" },
  { value: "15+", label: "Years Average Tenure" },
]

export function AboutSection() {
  return (
    <section id="about" className="py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              About Meridian
            </p>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight text-foreground mb-6 text-balance">
              Building Trust Through Expert Financial Guidance
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Since 1998, Meridian Finance has been helping individuals and families achieve their 
              financial goals. Our team of dedicated advisors combines deep industry expertise with 
              a genuine commitment to your success.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-8">
              We believe that financial planning should be accessible, transparent, and tailored to 
              your unique circumstances. Whether you&apos;re just starting out or planning for retirement, 
              we&apos;re here to guide you every step of the way.
            </p>

            <ul className="space-y-3 mb-8">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-3 text-foreground">
                  <span className="h-5 w-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                    <Check className="h-3 w-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <Button className="rounded-full px-8">
              Learn More About Us
            </Button>
          </div>

          <div className="bg-secondary rounded-3xl p-8 md:p-10">
            <div className="grid grid-cols-2 gap-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="font-serif text-3xl md:text-4xl text-foreground mb-2">
                    {stat.value}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
