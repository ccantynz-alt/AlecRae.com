import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Entrance-animation style helper.
 *
 * Mirrors the prior Framer Motion on-mount config per element
 * (`initial { opacity: 0, y } -> animate { opacity: 1, y: 0 }`) using the
 * pure-CSS `.enter-up` keyframe (see globals.css). No `motion/react` runtime is
 * loaded on the landing route — the Hero is a Server Component.
 */
function enter(y: number, durationSeconds: number, delaySeconds: number): CSSProperties {
  return {
    ["--enter-y" as string]: `${y}px`,
    ["--enter-duration" as string]: `${durationSeconds}s`,
    ["--enter-delay" as string]: `${delaySeconds}s`,
  };
}

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16 overflow-hidden">
      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        <div className="enter-up" style={enter(20, 0.6, 0)}>
          <div className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-[#9a7b4f] mb-10">
            <span className="block w-10 h-px bg-[#9a7b4f]/50" aria-hidden="true" />
            Now in private beta
            <span className="block w-10 h-px bg-[#9a7b4f]/50" aria-hidden="true" />
          </div>
        </div>

        <h1
          className="enter-up font-serif text-5xl sm:text-7xl md:text-[5.5rem] tracking-tight leading-[1.05] text-[#1c1a17] mb-8"
          style={enter(30, 0.7, 0.1)}
        >
          Email, Evolved.
        </h1>

        <p
          className="enter-up text-lg md:text-xl text-[#6b6557] max-w-2xl mx-auto mb-12 leading-relaxed"
          style={enter(20, 0.6, 0.3)}
        >
          The inbox you&apos;d sign your name to. AlecRae replaces your
          email apps, grammar checker, dictation software, and newsletter reader —
          one subscription, every account, every device.
        </p>

        <div
          className="enter-up flex flex-col sm:flex-row items-center justify-center gap-4 mb-24"
          style={enter(20, 0.6, 0.5)}
        >
          <Link
            href="/register"
            className="w-full sm:w-auto px-10 py-3.5 bg-[#1c1a17] text-[#f5f4ef] font-medium rounded-full hover:bg-[#1f3d2e] transition-colors text-center"
          >
            Request access
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto px-10 py-3.5 border border-[#1c1a17]/20 text-[#1c1a17] font-medium rounded-full hover:border-[#1c1a17]/50 transition-colors text-center"
          >
            Explore AlecRae
          </a>
        </div>

        <div className="enter-up relative max-w-4xl mx-auto" style={enter(40, 0.8, 0.7)}>
          <InboxPreview />
        </div>
      </div>
    </section>
  );
}

function InboxPreview() {
  const emails = [
    { from: "Sarah Chen", subject: "Q3 Revenue Report — Final Numbers", time: "10:32 AM", unread: true, ai: "Contains 3 action items" },
    { from: "Dev Team", subject: "Deployment successful: v2.4.1 is live", time: "9:15 AM", unread: true, ai: "No action needed" },
    { from: "Alex Rivera", subject: "Re: Partnership proposal — thoughts?", time: "8:48 AM", unread: false, ai: "Follow-up by Friday" },
    { from: "Newsletter", subject: "This Week in AI: Claude 4 benchmarks...", time: "7:00 AM", unread: false, ai: "3-bullet summary ready" },
    { from: "Jordan Lee", subject: "Meeting moved to 3pm tomorrow", time: "Yesterday", unread: false, ai: "Calendar updated" },
  ];

  return (
    <div className="relative bg-white border border-[#e3dfd3] rounded-2xl overflow-hidden shadow-[0_30px_60px_-20px_rgba(28,26,23,0.15)]">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#efede5] bg-[#faf9f5]">
        <div className="flex gap-1.5" aria-hidden="true">
          <div className="w-3 h-3 rounded-full bg-[#e3dfd3]" />
          <div className="w-3 h-3 rounded-full bg-[#e3dfd3]" />
          <div className="w-3 h-3 rounded-full bg-[#e3dfd3]" />
        </div>
        <div className="flex-1 text-center text-xs text-[#8a8475]">AlecRae — Inbox</div>
      </div>
      <div className="divide-y divide-[#efede5]">
        {emails.map((email, i) => (
          <div key={i} className={`flex items-center gap-4 px-6 py-4 text-left hover:bg-[#faf9f5] transition-colors ${email.unread ? "bg-[#fcfbf8]" : ""}`}>
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${email.unread ? "bg-[#1f3d2e]" : "bg-transparent"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4">
                <span className={`text-sm truncate ${email.unread ? "text-[#1c1a17] font-semibold" : "text-[#57534a]"}`}>{email.from}</span>
                <span className="text-xs text-[#a8a294] flex-shrink-0">{email.time}</span>
              </div>
              <div className="text-sm text-[#8a8475] truncate">{email.subject}</div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1f3d2e]/[0.06] border border-[#1f3d2e]/15 flex-shrink-0">
              <span className="w-1 h-1 rounded-full bg-[#1f3d2e]" aria-hidden="true" />
              <span className="text-[11px] text-[#1f3d2e]">{email.ai}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
