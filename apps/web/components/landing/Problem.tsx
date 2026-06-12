import { Reveal } from "./Reveal";

export function Problem() {
  return (
    <section className="py-28 px-6 border-t border-[#e3dfd3]">
      <div className="max-w-4xl mx-auto text-center">
        <Reveal as="p" className="text-xs uppercase tracking-[0.3em] text-[#9a7b4f] mb-6">
          The problem
        </Reveal>
        <Reveal as="h2" className="font-serif text-3xl md:text-5xl tracking-tight text-[#1c1a17] mb-8 leading-tight">
          Email hasn&apos;t been reconsidered in 22 years.
        </Reveal>
        <Reveal as="p" className="text-lg text-[#6b6557] max-w-2xl mx-auto mb-16 leading-relaxed">
          Your current email was designed before the iPhone existed. You&apos;re patching it
          with a grammar checker, a dictation app, a scheduling tool, and an AI sidebar
          &mdash; paying $100+/month for tools that don&apos;t talk to each other.
        </Reveal>

        <Reveal className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard number="$100+" label="Monthly cost of your current email stack" />
          <StatCard number="5+" label="Separate tools to do what one app should" />
          <StatCard number="0" label="Tools that actually learn how you write" />
        </Reveal>
      </div>
    </section>
  );
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="p-8 rounded-2xl bg-white border border-[#e3dfd3]">
      <div className="font-serif text-4xl text-[#1f3d2e] mb-3">{number}</div>
      <div className="text-sm text-[#6b6557] leading-relaxed">{label}</div>
    </div>
  );
}
