import Link from "next/link";
import { Reveal } from "./Reveal";

export function CTA() {
  return (
    <section className="py-32 px-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500 rounded-full mix-blend-screen filter blur-[200px] opacity-[0.08]" />
      </div>

      <Reveal className="max-w-3xl mx-auto text-center relative z-10">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6">
          Ready to upgrade your email?
        </h2>
        <p className="text-lg text-blue-100/50 mb-10 max-w-xl mx-auto">
          Join the beta. Free forever on the starter plan.
          No credit card required.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto px-10 py-4 bg-white text-slate-950 font-semibold rounded-full hover:bg-blue-100 transition-all hover:shadow-lg hover:shadow-blue-500/20 text-center text-lg"
          >
            Get Started Free
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
