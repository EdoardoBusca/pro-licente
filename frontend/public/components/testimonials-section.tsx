import { Card, CardContent } from "@/components/ui/card"
import { Quote } from "lucide-react"

const testimonials = [
  {
    quote: "Meridian helped us navigate a complex financial transition with grace and expertise. Their team truly cares about their clients.",
    author: "Sarah Mitchell",
    role: "Business Owner",
  },
  {
    quote: "After 10 years with Meridian, I can confidently say they&apos;ve been instrumental in securing my family&apos;s financial future.",
    author: "James Chen",
    role: "Retired Executive",
  },
  {
    quote: "The personalized attention and strategic advice we receive has been invaluable. Highly recommend their services.",
    author: "Emily Rodriguez",
    role: "Healthcare Professional",
  },
]

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20 md:py-32 bg-secondary/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Testimonials
          </p>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight text-foreground max-w-2xl mx-auto text-balance">
            What Our Clients Say About Us
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="border-border/50 bg-card">
              <CardContent className="p-6">
                <Quote className="h-8 w-8 text-accent mb-4" />
                <p className="text-foreground leading-relaxed mb-6">
                  {testimonial.quote}
                </p>
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center">
                    <span className="font-medium text-foreground">
                      {testimonial.author.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{testimonial.author}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
