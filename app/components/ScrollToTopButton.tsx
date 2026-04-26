"use client";

import { useEffect, useRef, useState } from "react";

interface ScrollToTopButtonProps {
  threshold?: number;
  label?: string;
  className?: string;
}

type ScrollTarget = HTMLElement | Window;

const DEFAULT_THRESHOLD = 320;
const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

export default function ScrollToTopButton({
  threshold = DEFAULT_THRESHOLD,
  label = "Revenir en haut",
  className = "",
}: ScrollToTopButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const targetRef = useRef<ScrollTarget | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const target = findScrollTarget(buttonRef.current);
    targetRef.current = target;

    const updateVisibility = () => {
      setIsVisible(getScrollTop(target) > threshold);
    };

    updateVisibility();
    target.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      target.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [threshold]);

  function handleClick() {
    const target = targetRef.current ?? window;
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";

    if (isWindowTarget(target)) {
      window.scrollTo({ top: 0, behavior });
      return;
    }

    target.scrollTo({ top: 0, behavior });
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      onClick={handleClick}
      className={`fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/95 text-brand-amber shadow-lg shadow-black/15 backdrop-blur transition duration-200 hover:border-brand-amber hover:bg-brand-amber hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-amber/50 ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      } ${className}`}
    >
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    </button>
  );
}

function findScrollTarget(anchor: HTMLElement | null): ScrollTarget {
  let current = anchor?.parentElement ?? null;

  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (SCROLLABLE_OVERFLOW.has(overflowY)) return current;
    current = current.parentElement;
  }

  return window;
}

function getScrollTop(target: ScrollTarget) {
  if (isWindowTarget(target)) {
    return window.scrollY || document.documentElement.scrollTop;
  }

  return target.scrollTop;
}

function isWindowTarget(target: ScrollTarget): target is Window {
  return target === window;
}
