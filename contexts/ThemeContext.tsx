import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  secondary: string;
  secondaryDark: string;
  accent: string;
  success: string;
  warning: string;
  error: string;

  background: string;
  surface: string;
  cardBackground: string;
  elevated: string;

  text: string;
  textSecondary: string;
  textLight: string;
  textInverse: string;

  border: string;
  divider: string;
  separator: string;

  inputBackground: string;
  inputBorder: string;

  iconDefault: string;
  iconMuted: string;

  modalOverlay: string;
  modalBackground: string;

  tabBar: string;
  tabBarBorder: string;

  headerBackground: string;
  headerText: string;

  skeleton: string;

  gradient: {
    orange: readonly [string, string];
    teal: readonly [string, string];
    blue: readonly [string, string];
    purple: readonly [string, string];
    sunset: readonly [string, string];
    gold: readonly [string, string];
    silver: readonly [string, string];
    bronze: readonly [string, string];
  };

  stats: {
    distance: string;
    time: string;
    pace: string;
  };
}

const lightColors: ThemeColors = {
  primary: '#FF6B35',
  primaryDark: '#E85A2B',
  secondary: '#00C9A7',
  secondaryDark: '#00B396',
  accent: '#FFD23F',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',

  background: '#FAFAFA',
  surface: '#FFFFFF',
  cardBackground: '#FFFFFF',
  elevated: '#FFFFFF',

  text: '#1A1A1A',
  textSecondary: '#666666',
  textLight: '#999999',
  textInverse: '#FFFFFF',

  border: '#E0E0E0',
  divider: '#F0F0F0',
  separator: '#E5E5E5',

  inputBackground: '#F5F5F5',
  inputBorder: '#E0E0E0',

  iconDefault: '#666666',
  iconMuted: '#999999',

  modalOverlay: 'rgba(0,0,0,0.5)',
  modalBackground: '#FFFFFF',

  tabBar: '#FFFFFF',
  tabBarBorder: 'transparent',

  headerBackground: '#FF6B35',
  headerText: '#FFFFFF',

  skeleton: '#F0F0F0',

  gradient: {
    orange: ['#FF6B35', '#FF8C42'] as const,
    teal: ['#00C9A7', '#00E5BE'] as const,
    blue: ['#4A90E2', '#5BA3F5'] as const,
    purple: ['#8B5CF6', '#A78BFA'] as const,
    sunset: ['#FF6B35', '#FFD23F'] as const,
    gold: ['#FFD700', '#FFA500'] as const,
    silver: ['#E5E5E5', '#C0C0C0'] as const,
    bronze: ['#CD7F32', '#B8860B'] as const,
  },

  stats: {
    distance: '#FF6B35',
    time: '#00C9A7',
    pace: '#4A90E2',
  },
};

const darkColors: ThemeColors = {
  primary: '#FF8C5A',
  primaryDark: '#FF6B35',
  secondary: '#00E5BE',
  secondaryDark: '#00C9A7',
  accent: '#FFD23F',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',

  background: '#0F0F0F',
  surface: '#1A1A1A',
  cardBackground: '#1E1E1E',
  elevated: '#262626',

  text: '#F0F0F0',
  textSecondary: '#A0A0A0',
  textLight: '#707070',
  textInverse: '#1A1A1A',

  border: '#333333',
  divider: '#252525',
  separator: '#2A2A2A',

  inputBackground: '#252525',
  inputBorder: '#3A3A3A',

  iconDefault: '#A0A0A0',
  iconMuted: '#666666',

  modalOverlay: 'rgba(0,0,0,0.7)',
  modalBackground: '#1E1E1E',

  tabBar: '#141414',
  tabBarBorder: '#252525',

  headerBackground: '#1A1A1A',
  headerText: '#F0F0F0',

  skeleton: '#252525',

  gradient: {
    orange: ['#FF6B35', '#FF8C42'] as const,
    teal: ['#00C9A7', '#00E5BE'] as const,
    blue: ['#4A90E2', '#5BA3F5'] as const,
    purple: ['#8B5CF6', '#A78BFA'] as const,
    sunset: ['#FF6B35', '#FFD23F'] as const,
    gold: ['#FFD700', '#FFA500'] as const,
    silver: ['#555555', '#444444'] as const,
    bronze: ['#CD7F32', '#B8860B'] as const,
  },

  stats: {
    distance: '#FF8C5A',
    time: '#00E5BE',
    pace: '#5BA3F5',
  },
};

interface ThemeContextValue {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  setDarkMode: (enabled: boolean) => void;
}

const STORAGE_KEY = 'dark_mode_enabled';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val === 'true') setIsDark(true);
        setIsLoaded(true);
      })
      .catch(() => setIsLoaded(true));
  }, []);

  const setDarkMode = useCallback((enabled: boolean) => {
    setIsDark(enabled);
    AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false').catch((e) =>
      console.error('[ThemeContext] Failed to save dark mode:', e)
    );
  }, []);

  const toggleTheme = useCallback(() => {
    setDarkMode(!isDark);
  }, [isDark, setDarkMode]);

  const themeColors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  const value = useMemo<ThemeContextValue>(
    () => ({ isDark, colors: themeColors, toggleTheme, setDarkMode }),
    [isDark, themeColors, toggleTheme, setDarkMode]
  );

  if (!isLoaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { lightColors, darkColors };
