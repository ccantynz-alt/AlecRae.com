"use client";

import React, {
  forwardRef,
  useState,
  useEffect,
  useCallback,
  type HTMLAttributes,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NewAchievement {
  key: string;
  name: string;
  description: string;
  icon: string;
}

export interface InboxZeroCelebrationProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onAnimationEnd"> {
  /** Whether to show the celebration overlay. */
  visible: boolean;
  /** Current streak count to display. */
  currentStreak: number;
  /** Total inbox zeros achieved. */
  totalZeros?: number;
  /** Newly unlocked achievements to display. */
  newAchievements?: NewAchievement[];
  /** Callback when the celebration is dismissed. */
  onDismiss: () => void;
  /** Whether to respect prefers-reduced-motion. */
  respectReducedMotion?: boolean;
  className?: string;
}

// ─── Icon mapping ──────────────────────────────────────────────────────────

const ACHIEVEMENT_ICONS: Record<string, string> = {
  trophy: "\uD83C\uDFC6",
  flame: "\uD83D\uDD25",
  crown: "\uD83D\uDC51",
  zap: "\u26A1",
  sunrise: "\uD83C\uDF05",
  moon: "\uD83C\uDF19",
  shield: "\uD83D\uDEE1\uFE0F",
  target: "\uD83C\uDFAF",
  sparkles: "\u2728",
  star: "\u2B50",
};

// ─── Confetti particle ──────────────────────────────────────────────────────

interface ConfettiParticle {
  id: number;
  x: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
}

const CONFETTI_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f97316", // orange
  "#14b8a6", // teal
];

function generateConfetti(count: number): ConfettiParticle[] {
  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 1.5 + Math.random() * 2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? "#6366f1",
      size: 6 + Math.random() * 8,
    });
  }
  return particles;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const InboxZeroCelebration = forwardRef<
  HTMLDivElement,
  InboxZeroCelebrationProps
>(function InboxZeroCelebration(
  {
    visible,
    currentStreak,
    totalZeros,
    newAchievements = [],
    onDismiss,
    respectReducedMotion = true,
    className = "",
    ...props
  },
  ref,
) {
  const [confetti] = useState(() => generateConfetti(40));
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (respectReducedMotion && typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setPrefersReducedMotion(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent): void => {
        setPrefersReducedMotion(e.matches);
      };
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
    return undefined;
  }, [respectReducedMotion]);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === "Escape") {
        onDismiss();
      }
    },
    [onDismiss],
  );

  if (!visible) return null;

  const showAnimations = !prefersReducedMotion;

  return (
    <Box
      ref={ref}
      className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label="Inbox Zero Celebration"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {/* Backdrop */}
      <Box
        className={`absolute inset-0 bg-black/50 ${
          showAnimations ? "animate-[fadeIn_0.3s_ease-out]" : ""
        }`}
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Confetti layer */}
      {showAnimations && (
        <Box className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {confetti.map((particle) => (
            <Box
              key={particle.id}
              className="absolute rounded-full"
              style={{
                left: `${particle.x}%`,
                top: "-10px",
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                backgroundColor: particle.color,
                animation: `confettiFall ${particle.duration}s ease-in ${particle.delay}s forwards`,
                opacity: 0,
              }}
            />
          ))}
        </Box>
      )}

      {/* Main card */}
      <Box
        className={`relative z-10 bg-surface border border-border rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center ${
          showAnimations
            ? "animate-[celebrationPop_0.5s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
            : ""
        }`}
      >
        {/* Zero icon */}
        <Box
          className={`text-6xl mb-4 ${
            showAnimations ? "animate-[celebrationBounce_1s_ease-in-out_infinite]" : ""
          }`}
          aria-hidden="true"
        >
          {"\uD83C\uDF89"}
        </Box>

        <Text variant="display-sm" className="mb-2">
          Inbox Zero!
        </Text>

        <Text variant="body-lg" muted className="mb-6">
          You cleared your inbox. That is how it is done.
        </Text>

        {/* Streak display */}
        <Box className="flex items-center justify-center gap-6 mb-6">
          <Box className="text-center">
            <Text variant="display-md" className="text-brand-600">
              {currentStreak}
            </Text>
            <Text variant="body-sm" muted>
              {currentStreak === 1 ? "day streak" : "day streak"}
            </Text>
          </Box>
          {totalZeros !== undefined && (
            <Box className="text-center">
              <Text variant="display-md" className="text-brand-600">
                {totalZeros}
              </Text>
              <Text variant="body-sm" muted>
                total zeros
              </Text>
            </Box>
          )}
        </Box>

        {/* New achievements */}
        {newAchievements.length > 0 && (
          <Box className="mb-6">
            <Text variant="heading-sm" className="mb-3">
              New Achievements Unlocked!
            </Text>
            <Box className="flex flex-col gap-2">
              {newAchievements.map((achievement) => (
                <Box
                  key={achievement.key}
                  className={`flex items-center gap-3 p-3 rounded-lg bg-surface-secondary border border-border ${
                    showAnimations
                      ? "animate-[slideInUp_0.4s_ease-out_forwards]"
                      : ""
                  }`}
                >
                  <Box className="text-2xl" aria-hidden="true">
                    {ACHIEVEMENT_ICONS[achievement.icon] ?? "\uD83C\uDFC5"}
                  </Box>
                  <Box className="text-left">
                    <Text variant="body-md" className="font-semibold">
                      {achievement.name}
                    </Text>
                    <Text variant="body-sm" muted>
                      {achievement.description}
                    </Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        <Button variant="primary" size="lg" onClick={onDismiss} className="w-full">
          Keep Going
        </Button>
      </Box>

      {/* CSS animations via style tag */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes confettiFall {
          0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translateY(100vh) rotate(720deg);
          }
        }
        @keyframes celebrationPop {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes celebrationBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </Box>
  );
});

InboxZeroCelebration.displayName = "InboxZeroCelebration";
