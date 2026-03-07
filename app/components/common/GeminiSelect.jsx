'use client';

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

const SIZE_STYLES = {
  sm: {
    warmButton: 'rounded-xl px-4 py-2.5 text-sm',
    vibrantButton: 'rounded-2xl px-4 py-3 text-sm',
    option: 'px-4 py-3 text-sm',
  },
  md: {
    warmButton: 'rounded-xl px-4 py-3 text-sm',
    vibrantButton: 'rounded-2xl px-5 py-4 text-sm',
    option: 'px-5 py-4 text-sm',
  },
};

export default function GeminiSelect({
  label,
  value,
  options = [],
  onChange,
  variant = 'warm',
  size = 'md',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  labelClassName = '',
  disabled = false,
  placeholder = 'Select',
  name,
  required = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const styles = SIZE_STYLES[size] || SIZE_STYLES.md;
  const isVibrant = variant === 'vibrant';

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? placeholder;

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`.trim()}>
      {label ? (
        <label
          className={`mb-2 block font-mono text-xs font-semibold uppercase tracking-[0.16em] text-aa-gray ${labelClassName}`.trim()}
        >
          // {label}
        </label>
      ) : null}

      <select
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>
            {typeof option.label === 'string' ? option.label : String(option.value)}
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        className={`${
          isVibrant
            ? `group relative flex w-full items-center justify-between overflow-hidden bg-gradient-to-r from-[#FE8802] to-[#FDA913] text-left font-bold text-white shadow-lg transition-all duration-300 hover:shadow-2xl hover:shadow-[#FE8802]/35 ${styles.vibrantButton}`
            : `flex w-full items-center justify-between border-2 border-[#FDA913] bg-white text-left text-gray-900 shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-[#FDA913]/25 ${styles.warmButton}`
        } ${disabled ? 'cursor-not-allowed opacity-60 hover:shadow-none' : ''} ${buttonClassName}`.trim()}
      >
        {isVibrant ? (
          <span className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-700 group-hover:translate-x-full" />
        ) : null}

        <span className="relative z-10 flex min-w-0 items-center gap-3 font-medium">
          <span className={`h-3 w-3 shrink-0 rounded-full ${isVibrant ? 'bg-white' : 'bg-[#FDA913]'}`} />
          <span className="truncate">{selectedLabel}</span>
        </span>

        <FontAwesomeIcon
          icon={faChevronDown}
          className={`relative z-10 shrink-0 text-sm transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          } ${isVibrant ? 'text-white' : 'text-[#FDA913]'}`}
        />
      </button>

      {isOpen ? (
        <div
          role="listbox"
          className={`absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-auto ${
            isVibrant
              ? 'rounded-2xl border-2 border-[#FDA913] bg-gradient-to-b from-[#FFFAF0] to-[#FFF5E6] shadow-2xl shadow-[#FDA913]/20'
              : 'rounded-xl border-2 border-[#FDA913] bg-white shadow-2xl shadow-[#FDA913]/20'
          } ${menuClassName}`.trim()}
        >
          {options.map((option) => {
            const optionSelected = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-3 border-b text-left transition-all duration-200 last:border-b-0 ${
                  isVibrant
                    ? `${styles.option} font-semibold ${
                        optionSelected
                          ? 'border-[#FDA913]/30 bg-gradient-to-r from-[#FE8802]/15 to-transparent text-[#FE8802]'
                          : 'border-[#FDA913]/30 text-gray-900 hover:bg-gradient-to-r hover:from-[#FE8802]/10 hover:to-transparent hover:text-[#FE8802]'
                      }`
                    : `${styles.option} font-medium ${
                        optionSelected
                          ? 'border-gray-200 bg-[#FE8802]/10 text-[#FE8802]'
                          : 'border-gray-200 text-gray-900 hover:bg-[#FE8802]/10 hover:text-[#FE8802]'
                      }`
                }`.trim()}
              >
                <span className="h-3 w-3 shrink-0 rounded-full bg-[#FDA913]" />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
