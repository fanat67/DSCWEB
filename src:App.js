import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight, Menu, X, Cpu, BarChart3, Rocket, Users, Mail, Phone, MapPin } from "lucide-react";

// Simple container wrapper
const Section = ({ id, children, className = "" }) => (
  <section id={id} className={`w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 ${className}`}>{children}</section>
);

const NavLink = ({ href, children, onClick }) => (
  <a href={href} onClick={onClick} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
    {children}
  </a>
);

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#about", label: "About" },
    { href: "#features", label: "Features" },
    { href: "#services", label: "Services" },
    { href: "#testimonials", label: "Testimonials" },
    { href: "#faq", label: "FAQ" },
    { href: "#contact", label: "Contact" },
  ];

  return (
    <div className="sticky top-0 z-50 w-full border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Section className="flex items-center justify-between h-16">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-primary/90 to-primary/40" />
          <span className="font-semibold tracking-tight">YourBrand</span>
          <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">Beta</Badge>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <NavLink key={l.href} href={l.href}>{l.label}</NavLink>
          ))}
          <Button asChild size="sm" className="ml-2">
            <a href="#contact">Get Started</a>
          </Button>
        </nav>

        <button className="md:hidden p-2" aria-label="Toggle menu" onClick={() => setOpen((v) => !v)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </Section>

      {/* Mobile Drawer */}
      {open && (
        <div className="md:hidden border-t bg-background">
          <Section className="py-4 space-y-4">
            {links.map((l) => (
              <div key={l.href}>
                <NavLink href={l.href} onClick={() => setOpen(false)}>{l.label}</NavLink>
              </div>
            ))}
            <Button asChild className="w-full" onClick={() => setOpen(false)}>
              <a href="#contact">Get Started</a>
            </Button>
          </Section>
        </div>
      )}
    </div>
  );
};

const Hero = () => (
  <div className="relative overflow-hidden">
    <div className="absolute inset-0 -z-10 opacity-40 pointer-events-none" aria-hidden>
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
    </div>
    <Section className="py-20 sm:py-28 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-4xl sm:text-6xl font-bold tracking-tight"
      >
        Build a clean, modern site in minutes
      </motion.h1>
      <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
        A production-ready React + Tailwind starter with shadcn/ui, framer-motion animations, and beautiful defaults. Swap content, ship fast.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Button asChild size="lg">
          <a href="#contact" className="inline-flex items-center gap-2">Contact Us <ArrowRight className="h-4 w-4" /></a>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <a href="#features">See Features</a>
        </Button>
      </div>
      <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm text-muted-foreground">
        {["Fast", "Accessible", "Responsive", "SEO-ready"].map((t) => (
          <div key={t} className="flex items-center justify-center gap-2">
            <Check className="h-4 w-4" /> {t}
          </div>
        ))}
      </div>
    </Section>
  </div>
);

const Feature = ({ icon: Icon, title, desc }) => (
  <Card className="h-full">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5" /> {title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </CardContent>
  </Card>
);

const Features = () => (
  <Section id="features" className="py-16 sm:py-24">
    <div className="text-center mb-10">
      <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Features</h2>
      <p className="text-muted-foreground mt-2">Everything you need to make a crisp, credible landing page.</p>
    </div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <Feature icon={Cpu} title="Modern Stack" desc="React + Tailwind + shadcn/ui + framer-motion for smooth, production-grade UX." />
      <Feature icon={BarChart3} title="Analytics Ready" desc="Hook up your favorite analytics and SEO tags easily." />
      <Feature icon={Rocket} title="Blazing Fast" desc="Optimized layout, minimal bloat, and responsive by default." />
      <Feature icon={Users} title="Trust Building" desc="Testimonials, FAQs, and clear CTAs help convert visitors." />
      <Feature icon={Mail} title="Contact Form" desc="A ready-to-use form. Point the action at your backend or Formspree." />
      <Feature icon={Phone} title="Mobile First" desc="Looks great on every screen size without extra work." />
    </div>
  </Section>
);

const About = () => (
  <Section id="about" className="py-16">
    <div className="grid lg:grid-cols-2 gap-10 items-center">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">About YourBrand</h2>
        <p className="mt-4 text-muted-foreground">
          Replace this paragraph with your brand story. Explain what you do, who you serve, and the value you bring. Keep it concise and human.
        </p>
        <ul className="mt-6 space-y-3 text-sm">
          {[
            "Clear value proposition and outcomes",
            "Expert team with proven results",
            "Flexible engagement models",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2"><Check className="h-4 w-4 mt-1" /> {t}</li>
          ))}
        </ul>
      </div>
      <div>
        <Card>
          <CardContent className="p-6">
            <div className="aspect-video w-full rounded-xl bg-muted grid place-items-center">
              <span className="text-muted-foreground">Add an image or product mockup here</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </Section>
);

const Services = () => (
  <Section id="services" className="py-16">
    <div className="text-center mb-10">
      <h2 className="text-3xl font-bold tracking-tight">Services</h2>
      <p className="text-muted-foreground mt-2">Outline the core problems you solve.</p>
    </div>
    <div className="grid md:grid-cols-3 gap-6">
      {[1,2,3].map((i) => (
        <Card key={i} className="flex flex-col">
          <CardHeader>
            <CardTitle>Service {i}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="text-sm text-muted-foreground">Short description of what this service does and the outcomes clients get.</p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full">Learn more</Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  </Section>
);

const Testimonials = () => (
  <Section id="testimonials" className="py-16">
    <div className="text-center mb-10">
      <h2 className="text-3xl font-bold tracking-tight">What clients say</h2>
      <p className="text-muted-foreground mt-2">Social proof that builds trust.</p>
    </div>
    <div className="grid md:grid-cols-3 gap-6">
      {["“They delivered exactly what we needed, ahead of schedule.”", "“Polished design and fast site—our conversions went up.”", "“Clear communication and great results. Highly recommend.”"].map((q, idx) => (
        <Card key={idx}>
          <CardContent className="p-6">
            <p className="text-sm">{q}</p>
            <div className="mt-4 text-xs text-muted-foreground">— Happy Customer</div>
          </CardContent>
        </Card>
      ))}
    </div>
  </Section>
);

const FAQ = () => (
  <Section id="faq" className="py-16">
    <div className="text-center mb-6">
      <h2 className="text-3xl font-bold tracking-tight">FAQs</h2>
      <p className="text-muted-foreground mt-2">Answer common questions to reduce friction.</p>
    </div>
    <Accordion type="single" collapsible className="w-full max-w-3xl mx-auto">
      <AccordionItem value="item-1">
        <AccordionTrigger>How customizable is this template?</AccordionTrigger>
        <AccordionContent>
          Highly. Swap copy, sections, and styles. Extend components with shadcn/ui.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Can I hook up a real contact form?</AccordionTrigger>
        <AccordionContent>
          Yes—send the form to your API route, serverless function, or Formspree/Getform. The UI is ready here.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Is it mobile-friendly?</AccordionTrigger>
        <AccordionContent>
          Absolutely. It’s responsive out of the box and looks great on all devices.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </Section>
);

const Contact = () => {
  const [status, setStatus] = useState("idle");
  const onSubmit = (e) => {
    e.preventDefault();
    // Demo only: show a fake success after brief delay
    setStatus("sending");
    setTimeout(() => setStatus("sent"), 700);
  };
  return (
    <Section id="contact" className="py-16">
      <div className="grid lg:grid-cols-2 gap-10">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Let’s talk</h2>
          <p className="mt-3 text-muted-foreground">Tell us about your project and timelines. We’ll reply within 1–2 business days.</p>
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> hello@yourbrand.co</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> +64 00 000 0000</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Wellington, New Zealand</div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Contact form</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input placeholder="First name" required />
                <Input placeholder="Last name" required />
              </div>
              <Input type="email" placeholder="Email" required />
              <Textarea rows={5} placeholder="Tell us what you’re after…" required />
              <Button type="submit" className="inline-flex items-center gap-2" disabled={status!=="idle" && status!=="sent"}>
                {status === "idle" && <>Send message <ArrowRight className="h-4 w-4" /></>}
                {status === "sending" && <>Sending…</>}
                {status === "sent" && <>Sent ✓</>}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
};

const Footer = () => (
  <footer className="border-t">
    <Section className="py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="text-sm text-muted-foreground">© {new Date().getFullYear()} YourBrand. All rights reserved.</div>
      <div className="flex items-center gap-6 text-sm">
        <a href="#" className="text-muted-foreground hover:text-foreground">Privacy</a>
        <a href="#" className="text-muted-foreground hover:text-foreground">Terms</a>
        <a href="#" className="text-muted-foreground hover:text-foreground">Contact</a>
      </div>
    </Section>
  </footer>
);
ads
export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <About />
        <Features />
        <Services />
        <Testimonials />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
