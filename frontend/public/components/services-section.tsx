import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, Shield, Users, PiggyBank, LineChart, Building2 } from "lucide-react"

const services = [
  {
    icon: TrendingUp,
    title: "Wealth Management",
    description: "Personalized investment strategies to grow and preserve your wealth over time.",
  },
  {
    icon: Shield,
    title: "Risk Assessment",
    description: "Comprehensive analysis to protect your assets and minimize financial exposure.",
  },
  {
    icon: Users,
    title: "Family Planning",
    description: "Secure your family&apos;s future with estate planning and generational wealth strategies.",
  },
  {
    icon: PiggyBank,
    title: "Retirement Planning",
    description: "Build a retirement roadmap that ensures comfort and security in your golden years.",
  },
  {
    icon: LineChart,
    title: "Investment Advisory",
    description: "Expert guidance on portfolio diversification and market opportunities.",
  },
  {
    icon: Building2,
    title: "Business Consulting",
    description: "Strategic financial solutions to help your business thrive and scale.",
  },
]

export function ServicesSection() {
  return (
    <section id="services" className="py-20 md:py-32 bg-secondary/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Our Services
          </p>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight text-foreground max-w-2xl mx-auto text-balance">
            Comprehensive Financial Solutions Tailored to You
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <Card 
              key={service.title} 
              className="group border-border/50 bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center mb-5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <service.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-lg text-foreground mb-2">
                  {service.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {service.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
