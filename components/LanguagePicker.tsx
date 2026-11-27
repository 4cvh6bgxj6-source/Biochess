'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Search } from 'lucide-react';
import {
  countryCodeToFlag,
  findLocaleOption,
  WORLD_LOCALE_OPTIONS,
  type WorldLocaleOption,
} from '@/lib/world-languages';

interface LanguagePickerProps {
  lang: string;
  country: string;
  onChange: (option: WorldLocaleOption) => void;
  label?: string;
  searchPlaceholder?: string;
  variant?: 'full' | 'compact';
}

export function LanguagePicker({
  lang,
  country,
  onChange,
  label,
  searchPlaceholder = 'Search language or country...',
  variant = 'full',
}: LanguagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const current = useMemo(() => findLocaleOption(lang, country), [lang, country]);
  const currentFlag = countryCodeToFlag(current.country);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WORLD_LOCALE_OPTIONS;
    return WORLD_LOCALE_OPTIONS.filter(
      (opt) =>
        opt.nativeName.toLowerCase().includes(q) ||
        opt.keywords.toLowerCase().includes(q) ||
        opt.lang.toLowerCase() === q ||
        opt.country.toLowerCase() === q
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={variant === 'full' ? 'w-full relative' : 'relative'}>
      {label && variant === 'full' && (
        <span className="block text-xs font-semibold text-[#C3C2C0] mb-1.5">
          {label}
        </span>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={
          variant === 'compact'
            ? 'px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded bg-[#302E2B] hover:bg-[#3C3A36] border border-[#3C3A36] text-[11px] sm:text-xs font-semibold text-[#E5E4E2] inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-colors'
            : 'w-full px-3.5 py-2.5 rounded bg-[#302E2B] hover:bg-[#383632] border border-[#45433E] text-sm text-white flex items-center justify-between gap-2 transition-colors'
        }
      >
        <span className="inline-flex items-center gap-1 sm:gap-2 min-w-0">
          {currentFlag ? (
            <span
              className={
                variant === 'compact'
                  ? 'text-sm sm:text-base leading-none shrink-0'
                  : 'text-base leading-none shrink-0'
              }
              aria-hidden="true"
            >
              {currentFlag}
            </span>
          ) : (
            <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#81B64C] shrink-0" />
          )}
          <span className="truncate font-semibold">
            {variant === 'compact' ? current.country : current.nativeName}
          </span>
        </span>
        <ChevronDown
          className={`${
            variant === 'compact' ? 'w-3 h-3 sm:w-4 sm:h-4' : 'w-4 h-4'
          } text-[#9E9D9A] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`z-50 bg-[#21201D] border border-[#45433E] rounded-md shadow-2xl overflow-hidden ${
            variant === 'compact'
              ? 'fixed left-2 right-2 top-[58px] mx-auto max-w-[330px] sm:inset-x-auto sm:top-auto sm:mx-0 sm:max-w-none sm:absolute sm:right-0 sm:mt-1.5 sm:w-80'
              : 'absolute mt-1.5 left-0 right-0'
          }`}
        >
          <div className="p-2 border-b border-[#3C3A36] bg-[#262421]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#9E9D9A] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-[#302E2B] border border-[#3C3A36] rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-[#7E7D7A] focus:outline-none focus:border-[#81B64C]"
              />
            </div>
          </div>

          <div className="max-h-[55dvh] sm:max-h-60 overflow-y-auto divide-y divide-[#2B2926]">
            {filtered.length === 0 ? (
              <p className="text-xs text-[#8B8987] text-center py-4 px-3">—</p>
            ) : (
              filtered.map((opt) => {
                const flag = countryCodeToFlag(opt.country);
                const selected = opt.lang === current.lang && opt.country === current.country;
                return (
                  <button
                    key={`${opt.lang}-${opt.country}`}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                      selected
                        ? 'bg-[#302E2B] text-white font-bold'
                        : 'text-[#DAD9D7] hover:bg-[#2C2A27]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5 min-w-0">
                      <span className="text-base leading-none shrink-0" aria-hidden="true">
                        {flag}
                      </span>
                      <span className="truncate">{opt.nativeName}</span>
                    </span>
                    {selected && <Check className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
