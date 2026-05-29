import type { Metadata } from "next";
import { Navbar } from "../components/landing/Navbar";
import { Hero } from "../components/landing/Hero";
import { Problem } from "../components/landing/Problem";
import { Features } from "../components/landing/Features";
import { AIShowcase } from "../components/landing/AIShowcase";
import { ProductSuite } from "../components/landing/ProductSuite";
import { Comparison } from "../components/landing/Comparison";
import { Pricing } from "../components/landing/Pricing";
import { Security } from "../components/landing/Security";
import { Platforms } from "../components/landing/Platforms";
import { CTA } from "../components/landing/CTA";
import { Footer } from "../components/landing/Footer";

export const metadata: Metadata = {
  title: "AlecRae — Email, Evolved.",
  description:
    "The AI-native workspace that replaces Gmail, Outlook, Grammarly, Superhuman, Slack, and Zoom. One subscription. Every account. Every device.",
};

export default function LandingPage() {
  return (
    <div className="bg-slate-950 text-white">
      <Navbar />
      <Hero />
      <Problem />
      <Features />
      <AIShowcase />
      <ProductSuite />
      <Comparison />
      <Pricing />
      <Security />
      <Platforms />
      <CTA />
      <Footer />
    </div>
  );
}
