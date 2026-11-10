/**
 * theme.ts — light, dark, or whatever the machine is set to.
 *
 * The choice is written to the root element as `data-theme` and kept in
 * localStorage. "system" writes no attribute at all, which is what lets
 * the CSS fall through to `prefers-color-scheme` — so the three states in
 * the stylesheet and the three states here are the same three states.
 *
 * The initial value is applied by a snippet in index.html before React
 * mounts, so the page never flashes the wrong theme.
 */
import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'bioreact.theme';

export function readStoredTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* private windows and blocked storage are fine; fall through */
  }
  return 'system';
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** True when the page is currently rendering dark, whatever the choice. */
export function isDark(choice: ThemeChoice): boolean {
  if (choice !== 'system') return choice === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readStoredTheme);
  const [dark, setDark] = useState<boolean>(() => isDark(readStoredTheme()));

  useEffect(() => {
    applyTheme(choice);
    setDark(isDark(choice));
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* nothing to do: the choice still applies for this visit */
    }
  }, [choice]);

  // Follow the system while the choice is "system".
  useEffect(() => {
    if (choice !== 'system' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((current) =>
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system',
    );
  }, []);

  return { choice, setChoice, cycle, dark };
}
