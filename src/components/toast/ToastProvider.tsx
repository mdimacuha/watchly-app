'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore } from '@/client/stores/toast';
import { ToastItem } from './ToastItem';

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="fixed bottom-6 right-6 z-60 flex flex-col gap-3 w-full max-w-[420px] pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="pointer-events-auto"
          >
            <ToastItem toast={toast} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
