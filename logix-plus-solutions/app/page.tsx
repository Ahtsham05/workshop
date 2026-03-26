import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Services from "@/components/Services";
import About from "@/components/About";
import Testimonials from "@/components/Testimonials";
import CTA from "@/components/CTA";

export default function HomePage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <Features />
      <Services />
      <About />
      <Testimonials />
      <CTA />
    </main>
  );
}
