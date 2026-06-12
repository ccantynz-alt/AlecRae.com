import Link from "next/link";
import { Reveal } from "./Reveal";

export function CTA() {
  return (
    <section className="py-28 px-6 bg-[#15281e] text-[#f5f4ef]">
      <Reveal className="max-w-3xl mx-auto text-center">
        <p className="font-script text-5xl text-[#c5a572] mb-6" aria-hidden="true">AlecRae</p>
        <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-[#f5f4ef] mb-6">
          The inbox you&apos;d sign your name to.
        </h2>
        <p className="text-lg text-[#f5f4ef]/60 mb-10 max-w-xl mx-auto">
          Join the private beta. Free forever on the starter plan.
          No credit card required.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto px-12 py-4 bg-[#f5f4ef] text-[#15281e] font-medium rounded-full hover:bg-white transition-colors text-center text-lg"
          >
            Request access
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
