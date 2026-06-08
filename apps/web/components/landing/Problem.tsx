import { Reveal } from "./Reveal";

export function Problem() {
  return (
    <section className="py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <Reveal as="p" className="text-sm font-medium uppercase tracking-widest text-blue-400 mb-6">
          The problem
        </Reveal>
        <Reveal as="h2" className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-8 leading-tight">
          Email hasn&apos;t been reinvented in{" "}
          <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">22 years.</span>
        </Reveal>
        <Reveal as="p" className="text-lg text-blue-100/50 max-w-2xl mx-auto mb-16 leading-relaxed">
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
    <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10">
      <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">{number}</div>
      <div className="text-sm text-blue-100/50">{label}</div>
    </div>
  );
}
