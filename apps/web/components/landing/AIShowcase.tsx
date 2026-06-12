import { Reveal } from "./Reveal";

const capabilities = [
  { title: "Overnight Agent", desc: "AI triages your inbox while you sleep. Wake up to a sorted inbox with reply drafts ready for one-tap approval." },
  { title: "Voice Profile", desc: "AI learns your writing style — vocabulary, rhythm, formality. Every draft sounds like you, not a template." },
  { title: "Natural Language Search", desc: "“Find the email where someone mentioned the budget for Q3” — search by meaning, not just keywords." },
  { title: "Newsletter Summaries", desc: "Every newsletter reduced to 3 bullets in your inbox preview. Full text on demand." },
  { title: "Commitment Tracker", desc: "AI catches every promise made in email. “I'll send that by Friday” — tracked automatically." },
  { title: "Smart Unsubscribe", desc: "One click. AI navigates the unsubscribe page for you and confirms removal." },
];

export function AIShowcase() {
  return (
    <section id="ai" className="py-28 px-6 bg-[#15281e] text-[#f5f4ef]">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-[#c5a572] mb-5">Intelligence</p>
          <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-[#f5f4ef] mb-5">
            AI in every layer. Not bolted on.
          </h2>
          <p className="text-lg text-[#f5f4ef]/60 max-w-xl mx-auto">
            Three-tier AI: free on-device inference, sub-50ms edge processing,
            full cloud power when you need it.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((c, i) => (
            <Reveal
              key={c.title}
              delay={i * 0.08}
              rootMargin="-50px"
              className="p-7 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-[#c5a572]/40 transition-colors"
            >
              <h3 className="font-serif text-xl text-[#f5f4ef] mb-3">{c.title}</h3>
              <p className="text-sm text-[#f5f4ef]/55 leading-relaxed">{c.desc}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-16 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-8 px-10 py-7 rounded-2xl bg-white/[0.04] border border-white/10">
            <div className="text-left">
              <div className="text-xs uppercase tracking-[0.2em] text-[#c5a572] mb-2">On-device AI</div>
              <div className="font-serif text-2xl text-[#f5f4ef]">$0/token</div>
              <div className="text-xs text-[#f5f4ef]/40 mt-1">Runs on your GPU</div>
            </div>
            <div className="w-px h-14 bg-white/10 hidden sm:block" aria-hidden="true" />
            <div className="text-left">
              <div className="text-xs uppercase tracking-[0.2em] text-[#c5a572] mb-2">Edge AI</div>
              <div className="font-serif text-2xl text-[#f5f4ef]">&lt;50ms</div>
              <div className="text-xs text-[#f5f4ef]/40 mt-1">330+ global locations</div>
            </div>
            <div className="w-px h-14 bg-white/10 hidden sm:block" aria-hidden="true" />
            <div className="text-left">
              <div className="text-xs uppercase tracking-[0.2em] text-[#c5a572] mb-2">Cloud AI</div>
              <div className="font-serif text-2xl text-[#f5f4ef]">Full power</div>
              <div className="text-xs text-[#f5f4ef]/40 mt-1">H100 GPUs on demand</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
