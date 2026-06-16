'use client';
import { useState, useCallback } from 'react';
import type { Toast } from '@/lib/types';

let toastCounter = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info', ms = 4000) => {
    const id = String(++toastCounter);
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ms);
  }, []);

  return { toasts, toast };
}
