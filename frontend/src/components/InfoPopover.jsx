import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

/**
 * Compact "(i)" info popover button that keeps technical explanations out of the
 * primary visual hierarchy until requested by the user.
 */
export default function InfoPopover({ title, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={title || 'Explanation'}
        className="w-5 h-5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          className={`absolute top-7 z-40 w-72 p-3.5 bg-white border border-slate-200 rounded-xl shadow-lg text-left space-y-1.5 ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800">{title}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-xs text-slate-600 leading-relaxed">{children}</div>
        </div>
      )}
    </div>
  );
}

