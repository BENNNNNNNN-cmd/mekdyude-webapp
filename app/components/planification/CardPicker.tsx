"use client";

import { useMemo, useState } from "react";
import type { Card } from "@/lib/production-tree/types";

interface CardPickerProps {
  cards: Card[];
  value: string | null;
  onChange: (id: string | null) => void;
}

export default function CardPicker({ cards, value, onChange }: CardPickerProps) {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const c of cards) {
      const key = c.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [cards]);

  const searchMatches = useMemo(() => {
    if (search.trim().length < 2) return [];
    const q = search.toLowerCase();
    return cards.filter((c) => c.title.toLowerCase().includes(q)).slice(0, 12);
  }, [cards, search]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="card-select" className="block text-sm font-medium text-foreground">
          Sélectionner une carte
        </label>
        <select
          id="card-select"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground shadow-sm focus:border-brand-amber focus:outline-none focus:ring-2 focus:ring-brand-amber/30"
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v || null);
          }}
        >
          <option value="">— Choisir une carte —</option>
          {grouped.map(([cat, list]) => (
            <optgroup key={cat} label={cat}>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="card-search" className="block text-sm font-medium text-foreground">
          ... ou rechercher
        </label>
        <input
          id="card-search"
          type="text"
          placeholder="Tapez au moins 2 caractères…"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground shadow-sm focus:border-brand-amber focus:outline-none focus:ring-2 focus:ring-brand-amber/30"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searchMatches.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-md">
            {searchMatches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setSearch("");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-brand-amber/10"
                >
                  <span>{c.title}</span>
                  <span className="ml-2 text-xs text-foreground/50">{c.category}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
