export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white px-6">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-xl">
        <h1 className="text-8xl md:text-[10rem] font-bold tracking-tighter bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent mb-4">
          404
        </h1>

        <p className="text-xl md:text-2xl font-light text-blue-100 mb-2">
          Page not found.
        </p>

        <p className="text-base text-blue-200/60 mb-10 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <a
          href="/"
          className="px-6 py-3 rounded-full bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Back to AlecRae
        </a>
      </div>
    </main>
  );
}
