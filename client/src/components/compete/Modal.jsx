import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useOverlay } from '../../context/UIContext.jsx';
import { springSmooth } from '../../animations/transitions.js';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

/**
 * Dialog shell for the compete and friends flows. Escape closes it through the app's
 * overlay stack (which also pauses the typing test underneath), focus stays inside
 * while it's open and returns to where it was afterwards.
 */
export default function Modal({ id, open, onClose, title, description, children, wide = false }) {
  const reduce = useReducedMotion();
  const dialogRef = useRef(null);
  const returnTo = useRef(null);
  useOverlay(id, open, onClose);

  useEffect(() => {
    if (!open) return undefined;
    returnTo.current = document.activeElement;
    const t = setTimeout(() => {
      const el = dialogRef.current;
      if (el && !el.contains(document.activeElement)) (el.querySelector('[data-autofocus]') || el.querySelector(FOCUSABLE))?.focus();
    }, 40);
    return () => { clearTimeout(t); returnTo.current?.focus?.({ preventScroll: true }); };
  }, [open]);

  const trap = e => {
    if (e.key !== 'Tab') return;
    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="overlay fm" key={id}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div ref={dialogRef} className={`dialog fm cp-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true"
            aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-desc` : undefined} onKeyDown={trap}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.14 } }}
            transition={reduce ? { duration: 0.12 } : springSmooth}>
            <button type="button" className="icon-btn cp-modal-x" aria-label="Close" onClick={onClose}><X size="1em" /></button>
            <h2 id={`${id}-title`}>{title}</h2>
            {description && <p className="sub" id={`${id}-desc`}>{description}</p>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
