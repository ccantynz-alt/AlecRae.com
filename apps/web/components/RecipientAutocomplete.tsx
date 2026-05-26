"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";

interface Suggestion {
  email: string;
  name: string;
  avatarUrl?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface RecipientAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function RecipientAutocomplete({
  value,
  onChange,
  placeholder = "Recipients...",
  label,
  className = "",
}: RecipientAutocompleteProps): React.ReactNode {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokens = value.split(",").map((t) => t.trim());
  const currentToken = tokens[tokens.length - 1] ?? "";

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("alecrae_api_key") ?? "" : "";
      const res = await fetch(
        `${API_BASE}/v1/contacts/suggestions?q=${encodeURIComponent(query)}&limit=5`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { data: Suggestion[] };
        setSuggestions(data.data);
        setShowDropdown(data.data.length > 0);
        setActiveIndex(-1);
      }
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(currentToken);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentToken, fetchSuggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (suggestion: Suggestion): void => {
    const before = tokens.slice(0, -1);
    const newValue = [...before, suggestion.email].join(", ") + ", ";
    onChange(newValue);
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]!);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const initials = (name: string): string =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-content-secondary mb-1">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setShowDropdown(true);
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-content placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
      />

      <AnimatePresence>
        {showDropdown && suggestions.length > 0 && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 right-0 mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg overflow-hidden"
            role="listbox"
          >
            {suggestions.map((suggestion, idx) => (
              <button
                key={suggestion.email}
                id={`suggestion-${idx}`}
                type="button"
                onClick={() => selectSuggestion(suggestion)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 transition-colors ${
                  idx === activeIndex ? "bg-brand-50" : "hover:bg-surface-secondary"
                }`}
                role="option"
                aria-selected={idx === activeIndex}
              >
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-brand-700">
                    {initials(suggestion.name)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content truncate">
                    {suggestion.name}
                  </p>
                  <p className="text-xs text-content-tertiary truncate">
                    {suggestion.email}
                  </p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
