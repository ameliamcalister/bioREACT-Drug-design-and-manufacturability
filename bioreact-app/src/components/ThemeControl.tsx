/**
 * ThemeControl.tsx — light, dark, or follow the machine.
 *
 * Three states rather than two, because "follow the system" is what most
 * people actually want and a two-way switch cannot express it. The choice
 * is remembered per browser.
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeChoice } from '../theme';
import { Segmented } from './ui';

export function ThemeControl() {
  const { choice, setChoice } = useTheme();

  return (
    <Segmented<ThemeChoice>
      label="Colour theme"
      value={choice}
      onChange={setChoice}
      options={[
        {
          value: 'light',
          title: 'Light',
          label: <Sun className="h-3.5 w-3.5" aria-label="Light" />,
        },
        {
          value: 'system',
          title: 'Follow the system setting',
          label: <Monitor className="h-3.5 w-3.5" aria-label="System" />,
        },
        {
          value: 'dark',
          title: 'Dark',
          label: <Moon className="h-3.5 w-3.5" aria-label="Dark" />,
        },
      ]}
    />
  );
}
