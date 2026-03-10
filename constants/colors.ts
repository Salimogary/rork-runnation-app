const colors = {
  primary: '#FF6B35',
  primaryDark: '#E85A2B',
  secondary: '#00C9A7',
  secondaryDark: '#00B396',
  accent: '#FFD23F',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  
  dark: '#1A1A1A',
  darkGray: '#2D2D2D',
  mediumGray: '#666666',
  lightGray: '#CCCCCC',
  extraLightGray: '#F5F5F5',
  
  white: '#FFFFFF',
  black: '#000000',
  
  background: '#FAFAFA',
  cardBackground: '#FFFFFF',
  
  text: '#1A1A1A',
  textSecondary: '#666666',
  textLight: '#999999',
  
  border: '#E0E0E0',
  divider: '#F0F0F0',
  
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

export default colors;

export { colors };
