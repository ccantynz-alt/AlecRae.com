export default function ForgotPasswordPage(): React.ReactElement {
  return (
    <main
      className="min-h-screen bg-[#f5f4ef] text-neutral-900"
      style={{ fontFamily: "var(--font-inter), sans-serif" }}
    >
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#f5f4ef]/80 border-b border-neutral-300/40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <a
            href="/"
            className="text-2xl"
            style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
          >
            AlecRae
          </a>
          <a
            href="/login"
            className="text-xs tracking-[0.18em] uppercase text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Sign in
          </a>
        </div>
      </nav>

      <section className="pt-32 pb-16 px-6 flex flex-col items-center">
        <h1
          className="text-[5rem] sm:text-[6.5rem] leading-[0.85] text-neutral-900 select-none"
          style={{
            fontFamily: "var(--font-italianno), 'Snell Roundhand', cursive",
            fontWeight: 400,
            letterSpacing: "-0.01em",
          }}
        >
          Recovery
        </h1>
        <div className="mt-3 mb-8 w-32 h-px bg-neutral-400/50" aria-hidden="true" />
        <p className="text-sm text-neutral-600 font-light">
          Let&apos;s get you back in
        </p>

        <div className="mt-10 w-full max-w-md bg-white/60 backdrop-blur-sm border border-neutral-300/60 rounded-2xl p-8 shadow-sm space-y-7">
          <div>
            <p className="text-xs tracking-[0.18em] uppercase text-neutral-500 mb-3">
              Sign in with a passkey
            </p>
            <p className="text-sm text-neutral-600 font-light leading-relaxed mb-5">
              Passkeys are our primary authentication method. If you&apos;ve set one up on
              any of your devices, you can use it to sign in without a password.
            </p>
            <a
              href="/login"
              className="block w-full text-center text-xs tracking-[0.18em] uppercase bg-neutral-900 text-[#f5f4ef] px-5 py-3.5 rounded-full hover:bg-neutral-800 transition-colors"
            >
              Return to sign in
            </a>
          </div>

          <div className="border-t border-neutral-300/60 pt-6">
            <p className="text-xs tracking-[0.18em] uppercase text-neutral-500 mb-3">
              Need more help?
            </p>
            <p className="text-sm text-neutral-600 font-light leading-relaxed">
              Email{" "}
              <a
                href="mailto:support@alecrae.com"
                className="text-neutral-900 underline hover:no-underline"
              >
                support@alecrae.com
              </a>{" "}
              from the address tied to your account and our team will verify your identity
              and help you regain access.
            </p>
          </div>
        </div>

        <p className="mt-8 text-sm text-neutral-600">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-neutral-900 hover:underline font-medium">
            Create one
          </a>
        </p>
      </section>
    </main>
  );
}
