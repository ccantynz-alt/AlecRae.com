import { Reveal } from "./Reveal";

const stack = [
  { tool: "Email + AI assistant", theirPrice: "$12–30/mo" },
  { tool: "Grammar & writing tool", theirPrice: "$12–30/mo" },
  { tool: "Premium email client", theirPrice: "$30/mo" },
  { tool: "Dictation software", theirPrice: "$15/mo" },
  { tool: "Shared inbox tool", theirPrice: "$19–59/mo" },
  { tool: "Encrypted email", theirPrice: "$5–10/mo" },
  { tool: "Meeting transcription", theirPrice: "$10/mo" },
];

export function Comparison() {
  return (
    <section className="py-28 px-6 bg-white border-t border-[#e3dfd3]">
      <div className="max-w-4xl mx-auto">
        <Reveal className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-[#9a7b4f] mb-5">The math</p>
          <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-[#1c1a17] mb-5">
            Replace your entire stack.
          </h2>
          <p className="text-lg text-[#6b6557] max-w-xl mx-auto">
            Stop paying seven subscriptions for things one app should do.
          </p>
        </Reveal>

        <Reveal className="rounded-2xl border border-[#e3dfd3] bg-[#f5f4ef] overflow-hidden">
          <div className="grid grid-cols-3 gap-0 px-6 py-4 bg-[#efede5] border-b border-[#e3dfd3] text-xs uppercase tracking-[0.15em]">
            <div className="text-[#8a8475]">Tool</div>
            <div className="text-center text-[#8a8475]">Separate cost</div>
            <div className="text-center text-[#1f3d2e]">AlecRae</div>
          </div>
          {stack.map((item, i) => (
            <div key={i} className="grid grid-cols-3 gap-0 px-6 py-4 border-b border-[#e3dfd3]/60 last:border-b-0 hover:bg-white transition-colors">
              <div className="text-sm text-[#1c1a17]">{item.tool}</div>
              <div className="text-center text-sm text-[#8a8475] line-through">{item.theirPrice}</div>
              <div className="text-center text-sm text-[#1f3d2e] font-medium">Included</div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-0 px-6 py-5 bg-[#efede5] border-t border-[#e3dfd3]">
            <div className="text-[#1c1a17] font-semibold">Total</div>
            <div className="text-center font-serif text-xl text-[#8a8475] line-through">$100+/mo</div>
            <div className="text-center font-serif text-xl text-[#1f3d2e]">$9/mo</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
