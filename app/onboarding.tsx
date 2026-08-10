import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Activity,
  Award,
  CalendarDays,
  ChevronRight,
  BookOpen,
  Dumbbell,
  Footprints,
  MessageCircle,
  ShoppingBag,
  Smartphone,
  Target,
  Trophy,
  Users,
  Watch,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type SlideId = 'welcome' | 'inclusive' | 'goals' | 'clubs' | 'leaderboards' | 'social' | 'gear' | 'magazine' | 'events';

type Slide = {
  id: SlideId;
  pillar: string;
  title: string;
  description: string;
  gradient: readonly [string, string, ...string[]];
  accent: string;
  cta?: string;
};

const slides: Slide[] = [
  {
    id: 'welcome',
    pillar: 'Welcome',
    title: 'Runners from every nation belong here.',
    description:
      'RunNation warmly welcomes everyday runners, walkers, clubs, schools, institutions, charities, and event communities from all nations.',
    gradient: ['#020617', '#07153D', '#7C1229', '#F04A0C'] as const,
    accent: '#FF7A1A',
  },
  {
    id: 'inclusive',
    pillar: 'Inclusivity',
    title: 'A running home for every kind of runner.',
    description:
      'Beyond the usual road runners, RunNation makes space for juniors, golden age runners, para runners, indoor runners, staircase climbers, beginners, comeback stories, and activity capture from both smart phones and smart watches.',
    gradient: ['#020617', '#0A1E52', '#31216F', '#B51D35'] as const,
    accent: '#F43F5E',
  },
  {
    id: 'goals',
    pillar: 'Goals',
    title: 'Turn effort into visible progress.',
    description:
      'Set targets, build streaks, follow weight and wellness progress, and see how each workout moves you closer to the version of yourself you are building.',
    gradient: ['#030712', '#111B55', '#52206E', '#D1273C'] as const,
    accent: '#A855F7',
  },
  {
    id: 'clubs',
    pillar: 'Clubs',
    title: 'Find your people and run with them.',
    description:
      'Join clubs in your country, help your club come onto RunNation, or take up a service role that grows your local running community.',
    gradient: ['#020617', '#08204E', '#4B174F', '#D83323'] as const,
    accent: '#FB5B20',
  },
  {
    id: 'leaderboards',
    pillar: 'Leaderboards',
    title: 'Compete, compare, and celebrate fairly.',
    description:
      'Follow reports for your runs, club, community, and events with clear distance, time, pace, days, finishers, and participant progress.',
    gradient: ['#050816', '#191348', '#761730', '#F0440C'] as const,
    accent: '#FF8A16',
  },
  {
    id: 'social',
    pillar: 'Social',
    title: 'Share the journey, not just the finish.',
    description:
      'Post activity moments, talk with other runners, discover people with similar goals, and help keep the community respectful and safe.',
    gradient: ['#020617', '#151447', '#5D185C', '#C51F3B'] as const,
    accent: '#EC4899',
  },
  {
    id: 'gear',
    pillar: 'Gear Shopping',
    title: 'Find running gear inside the app.',
    description:
      'The Shop tab helps runners discover gear, apparel, and useful running items without leaving the RunNation experience.',
    gradient: ['#020617', '#0F1B44', '#154E4A', '#F97316'] as const,
    accent: '#14B8A6',
  },
  {
    id: 'magazine',
    pillar: 'Magazine',
    title: 'Read the running story as it grows.',
    description:
      'The Magazine tab brings runners stories, practical guidance, pictorials, club news, and community inspiration from the RunNation world.',
    gradient: ['#020617', '#111B55', '#3B1D68', '#DB2777'] as const,
    accent: '#EC4899',
  },
  {
    id: 'events',
    pillar: 'Events',
    title: 'Show up for runs that matter.',
    description:
      'Discover one-day, recurring, and multiday events, join challenges, chase medals, support causes, and keep your results in one RunNation story.',
    gradient: ['#01040F', '#07173F', '#4B153E', '#E53B0B'] as const,
    accent: '#FF6B16',
    cta: 'Join RunNation',
  },
];

const flagRows = [
  ['🇺🇬', '🇰🇪', '🇹🇿', '🇷🇼', '🇳🇬', '🇿🇦'],
  ['🇬🇧', '🇺🇸', '🇨🇦', '🇮🇳', '🇯🇵', '🇧🇷'],
  ['🇫🇷', '🇩🇪', '🇦🇺', '🇪🇹', '🇬🇭', '🇲🇦'],
];

const inclusivityChips = [
  { label: 'Juniors', detail: '8-15' },
  { label: 'Golden Age', detail: '60+' },
  { label: 'Para Runners', detail: 'Access' },
  { label: 'Stairs', detail: 'Buildings' },
  { label: 'Phone Capture', detail: 'Smart phone' },
  { label: 'Watch Capture', detail: 'Smart watch' },
];

const goalCards = [
  { label: 'Run Days', value: '82%' },
  { label: 'Distance', value: '125 km' },
  { label: 'Weight', value: '-3.4 kg' },
];

const clubCards = [
  { name: 'City Striders', members: '128 runners' },
  { name: 'Junior Runners', members: 'Global club' },
  { name: 'Treadmill Club', members: 'Indoor miles' },
];

const leaderboardRows = [
  { rank: '1', name: 'Amina', value: '42.5 km' },
  { rank: '2', name: 'Brian', value: '39.1 km' },
  { rank: '3', name: 'Gary', value: '37.8 km' },
];

const eventCards = [
  { type: 'One Day', name: 'City 10K', date: '12 May' },
  { type: 'Recurring', name: 'Wednesday Run', date: 'Weekly' },
  { type: 'Multiday', name: '100 Day Challenge', date: 'Ongoing' },
];

function FlagWelcomeVisual() {
  return (
    <View style={styles.visualStage}>
      <View style={styles.flagPanel}>
        {flagRows.map((row, rowIndex) => (
          <View key={`flag-row-${rowIndex}`} style={styles.flagRow}>
            {row.map((flag) => (
              <View key={`${rowIndex}-${flag}`} style={styles.flagChip}>
                <Text style={styles.flagText}>{flag}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.welcomeBadge}>
        <Footprints size={28} color="#F97316" />
        <View>
          <Text style={styles.badgeTitle}>RunNation</Text>
          <Text style={styles.badgeSubtitle}>Where runners belong</Text>
        </View>
      </View>
    </View>
  );
}

function InclusivityVisual() {
  return (
    <View style={styles.visualStage}>
      <View style={styles.peopleCircle}>
        <View style={styles.inclusiveIconCluster}>
          <Users size={44} color="#0F766E" />
          <View style={styles.captureIconBadgeLeft}>
            <Smartphone size={16} color="#0F766E" />
          </View>
          <View style={styles.captureIconBadgeRight}>
            <Watch size={16} color="#0F766E" />
          </View>
        </View>
      </View>
      <View style={styles.inclusiveGrid}>
        {inclusivityChips.map((chip) => (
          <View key={chip.label} style={styles.inclusiveCard}>
            <Text style={styles.inclusiveLabel}>{chip.label}</Text>
            <Text style={styles.inclusiveDetail}>{chip.detail}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function GoalsVisual() {
  return (
    <View style={styles.visualStage}>
      <View style={styles.targetWrap}>
        <Target size={72} color="#2563EB" />
      </View>
      <View style={styles.goalCardRow}>
        {goalCards.map((goal) => (
          <View key={goal.label} style={styles.goalCard}>
            <Text style={styles.goalValue}>{goal.value}</Text>
            <Text style={styles.goalLabel}>{goal.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ClubsVisual() {
  return (
    <View style={styles.visualStage}>
      <View style={styles.clubStack}>
        {clubCards.map((club, index) => (
          <View key={club.name} style={[styles.clubCard, index === 1 && styles.clubCardMiddle]}>
            <View style={styles.clubIcon}>
              {index === 2 ? <Dumbbell size={22} color="#059669" /> : <Users size={22} color="#059669" />}
            </View>
            <View style={styles.clubTextWrap}>
              <Text style={styles.clubName}>{club.name}</Text>
              <Text style={styles.clubMembers}>{club.members}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function LeaderboardsVisual() {
  return (
    <View style={styles.visualStage}>
      <View style={styles.boardCard}>
        <View style={styles.boardHeader}>
          <Trophy size={24} color="#EA580C" />
          <Text style={styles.boardTitle}>Community Leaders</Text>
        </View>
        {leaderboardRows.map((row) => (
          <View key={row.rank} style={styles.boardRow}>
            <Text style={styles.boardRank}>#{row.rank}</Text>
            <Text style={styles.boardName}>{row.name}</Text>
            <Text style={styles.boardValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SocialVisual() {
  return (
    <View style={styles.visualStage}>
      <View style={styles.chatStack}>
        <View style={[styles.chatBubble, styles.chatBubbleLeft]}>
          <MessageCircle size={20} color="#9333EA" />
          <Text style={styles.chatText}>Morning run done.</Text>
        </View>
        <View style={[styles.chatBubble, styles.chatBubbleRight]}>
          <Activity size={20} color="#DB2777" />
          <Text style={styles.chatText}>Great pace today.</Text>
        </View>
        <View style={[styles.chatBubble, styles.chatBubbleLeft]}>
          <Users size={20} color="#4F46E5" />
          <Text style={styles.chatText}>See you at club run.</Text>
        </View>
      </View>
    </View>
  );
}

function FeatureTabVisual({ kind }: { kind: 'gear' | 'magazine' }) {
  const isGear = kind === 'gear';
  return (
    <View style={styles.visualStage}>
      <View style={styles.extraFeatureStack}>
        <View style={styles.extraFeatureCard}>
          <View style={styles.extraFeatureIcon}>
            {isGear ? (
              <ShoppingBag size={34} color="#0F766E" />
            ) : (
              <BookOpen size={34} color="#0F766E" />
            )}
          </View>
          <View style={styles.extraFeatureTextWrap}>
            <Text style={styles.extraFeatureLabel}>{isGear ? 'Gear Shopping' : 'RunNation Magazine'}</Text>
            <Text style={styles.extraFeatureDetail}>{isGear ? 'Shop tab' : 'Magazine tab'}</Text>
          </View>
        </View>
        <View style={[styles.extraFeatureCard, styles.extraFeatureCardOffset]}>
          <View style={styles.extraFeatureIconSmall}>
            {isGear ? (
              <Footprints size={24} color="#0F766E" />
            ) : (
              <MessageCircle size={24} color="#0F766E" />
            )}
          </View>
          <View style={styles.extraFeatureTextWrap}>
            <Text style={styles.extraFeatureLabel}>{isGear ? 'Running essentials' : 'Stories and guidance'}</Text>
            <Text style={styles.extraFeatureDetail}>{isGear ? 'Gear for the journey' : 'Community inspiration'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function EventsVisual() {
  return (
    <View style={styles.visualStage}>
      <View style={styles.eventStack}>
        {eventCards.map((event) => (
          <View key={event.type} style={styles.eventCard}>
            <View style={styles.eventIcon}>
              {event.type === 'Multiday' ? (
                <Award size={22} color="#111827" />
              ) : (
                <CalendarDays size={22} color="#111827" />
              )}
            </View>
            <View style={styles.eventCopy}>
              <Text style={styles.eventType}>{event.type}</Text>
              <Text style={styles.eventName}>{event.name}</Text>
            </View>
            <Text style={styles.eventDate}>{event.date}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SlideVisual({ id }: { id: SlideId }) {
  switch (id) {
    case 'welcome':
      return <FlagWelcomeVisual />;
    case 'inclusive':
      return <InclusivityVisual />;
    case 'goals':
      return <GoalsVisual />;
    case 'clubs':
      return <ClubsVisual />;
    case 'leaderboards':
      return <LeaderboardsVisual />;
    case 'social':
      return <SocialVisual />;
    case 'gear':
      return <FeatureTabVisual kind="gear" />;
    case 'magazine':
      return <FeatureTabVisual kind="magazine" />;
    case 'events':
      return <EventsVisual />;
    default:
      return null;
  }
}

function ThemeStreaks() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.themeGlow, styles.themeGlowTop]} />
      <View style={[styles.themeGlow, styles.themeGlowBottom]} />
      <View style={[styles.themeStreak, styles.themeStreakOne]} />
      <View style={[styles.themeStreak, styles.themeStreakTwo]} />
      <View style={[styles.themeStreak, styles.themeStreakThree]} />
      <View style={[styles.themeStreak, styles.themeStreakFour]} />
    </View>
  );
}

function OnboardingSlide({ slide, isActive }: { slide: Slide; isActive: boolean }) {
  const contentOpacity = useRef(new Animated.Value(isActive ? 1 : 0.75)).current;
  const contentShift = useRef(new Animated.Value(isActive ? 0 : 14)).current;
  const visualFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: isActive ? 1 : 0.75,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(contentShift, {
        toValue: isActive ? 0 : 14,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, contentShift, isActive]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(visualFloat, {
          toValue: isActive ? -6 : -2,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(visualFloat, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
      visualFloat.stopAnimation();
    };
  }, [isActive, visualFloat]);

  return (
    <LinearGradient colors={slide.gradient} style={styles.slide}>
      <ThemeStreaks />
      <View style={styles.heroSection}>
        <Animated.View style={{ transform: [{ translateY: visualFloat }] }}>
          <SlideVisual id={slide.id} />
        </Animated.View>
      </View>

      <View style={styles.contentSection}>
        <Animated.View
          style={[
            styles.contentCard,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentShift }],
            },
          ]}
        >
          <Text style={[styles.pillar, { color: slide.accent, borderColor: `${slide.accent}66` }]}>
            {slide.pillar}
          </Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.description}>{slide.description}</Text>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const finishOnboarding = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      router.replace('/register');
    } catch (error) {
      console.error('Onboarding error:', error);
    }
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      scrollViewRef.current?.scrollTo({
        x: SCREEN_WIDTH * (currentIndex + 1),
        animated: true,
      });
      return;
    }

    void finishOnboarding();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipButton} onPress={() => void finishOnboarding()}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {slides.map((slide, index) => (
          <OnboardingSlide key={slide.id} slide={slide} isActive={index === currentIndex} />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {slides.map((slide, index) => (
            <View
              key={slide.id}
              style={[
                styles.dot,
                index === currentIndex && styles.activeDot,
                index === currentIndex && { backgroundColor: slides[currentIndex]?.accent },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: slides[currentIndex]?.accent }]}
          onPress={handleNext}
          activeOpacity={0.9}
        >
          <Text style={styles.nextButtonText}>
            {slides[currentIndex]?.cta || (currentIndex === slides.length - 1 ? 'Get Started' : 'Next')}
          </Text>
          <ChevronRight size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  skipButton: {
    position: 'absolute',
    top: 54,
    right: 20,
    zIndex: 20,
    backgroundColor: 'rgba(3,7,24,0.44)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    minHeight: SCREEN_HEIGHT,
    overflow: 'hidden',
  },
  heroSection: {
    height: SCREEN_HEIGHT * 0.46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentSection: {
    flex: 1,
    marginTop: -20,
    paddingHorizontal: 20,
    paddingBottom: 124,
  },
  contentCard: {
    flex: 1,
    backgroundColor: 'rgba(3,7,24,0.72)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingTop: 24,
    paddingHorizontal: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  pillar: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 13,
  },
  title: {
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.78)',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    paddingHorizontal: 24,
    gap: 16,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  activeDot: {
    width: 28,
  },
  nextButton: {
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 12,
    elevation: 5,
  },
  themeGlow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,82,20,0.14)',
  },
  themeGlowTop: {
    width: 280,
    height: 280,
    top: -120,
    left: -110,
  },
  themeGlowBottom: {
    width: 420,
    height: 420,
    right: -190,
    bottom: -170,
    backgroundColor: 'rgba(255,74,12,0.22)',
  },
  themeStreak: {
    position: 'absolute',
    height: 3,
    borderRadius: 999,
    right: -90,
    backgroundColor: 'rgba(255,77,18,0.42)',
    transform: [{ rotate: '-38deg' }],
  },
  themeStreakOne: {
    width: 470,
    top: '13%',
  },
  themeStreakTwo: {
    width: 560,
    top: '20%',
    height: 5,
    backgroundColor: 'rgba(225,30,62,0.3)',
  },
  themeStreakThree: {
    width: 620,
    bottom: '25%',
    height: 2,
    backgroundColor: 'rgba(255,126,23,0.52)',
  },
  themeStreakFour: {
    width: 520,
    bottom: '18%',
    height: 6,
    backgroundColor: 'rgba(230,37,37,0.25)',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  visualStage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 42,
  },
  flagPanel: {
    width: '100%',
    maxWidth: 330,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 26,
    padding: 14,
    gap: 10,
  },
  flagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  flagChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 24,
  },
  welcomeBadge: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  badgeTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },
  badgeSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  peopleCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  inclusiveIconCluster: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureIconBadgeLeft: {
    position: 'absolute',
    left: -2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureIconBadgeRight: {
    position: 'absolute',
    right: -2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inclusiveGrid: {
    width: '100%',
    maxWidth: 330,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  inclusiveCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  inclusiveLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  inclusiveDetail: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
  },
  extraFeatureStack: {
    width: '100%',
    maxWidth: 330,
    gap: 14,
  },
  extraFeatureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  extraFeatureCardOffset: {
    marginLeft: 28,
  },
  extraFeatureIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraFeatureIconSmall: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraFeatureTextWrap: {
    flex: 1,
  },
  extraFeatureLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  extraFeatureDetail: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
  },
  targetWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  goalCardRow: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    gap: 10,
  },
  goalCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  goalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },
  goalLabel: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    textAlign: 'center',
  },
  clubStack: {
    width: '100%',
    maxWidth: 330,
    gap: 12,
  },
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clubCardMiddle: {
    marginLeft: 24,
  },
  clubIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubTextWrap: {
    flex: 1,
  },
  clubName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
  },
  clubMembers: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  boardCard: {
    width: '100%',
    maxWidth: 330,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    gap: 10,
  },
  boardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  boardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#FFF7ED',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  boardRank: {
    width: 42,
    fontSize: 15,
    fontWeight: '900',
    color: '#EA580C',
  },
  boardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  boardValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#374151',
  },
  chatStack: {
    width: '100%',
    maxWidth: 330,
    gap: 14,
  },
  chatBubble: {
    maxWidth: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatBubbleLeft: {
    alignSelf: 'flex-start',
  },
  chatBubbleRight: {
    alignSelf: 'flex-end',
  },
  chatText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  eventStack: {
    width: '100%',
    maxWidth: 340,
    gap: 12,
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eventIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventCopy: {
    flex: 1,
  },
  eventType: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F766E',
    textTransform: 'uppercase',
  },
  eventName: {
    marginTop: 3,
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  eventDate: {
    fontSize: 13,
    fontWeight: '900',
    color: '#475569',
  },
});
