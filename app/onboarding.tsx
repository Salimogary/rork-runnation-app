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
import Svg, { Circle, G, Path } from 'react-native-svg';
import {
  CalendarDays,
  MessageCircle,
  ShoppingBag,
  Target,
  UserCircle2,
  Users,
  Footprints,
  Activity,
  ChevronRight,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type SlideId = 'welcome' | 'vision' | 'benefits' | 'explore' | 'personalize';

interface Slide {
  id: SlideId;
  eyebrow: string;
  eyebrow2?: string;
  title: string;
  title2?: string;
  description: string;
  gradient: readonly [string, string, ...string[]];
  cta?: string;
}

const slides: Slide[] = [
  {
    description:
      'From the North Pole to the South Pole, runners and walkers everywhere, this is your community.',    
    id: 'welcome',
    eyebrow: 'Welcome to the',
    title: 'RunNation.',
    title2: 'Where every runner belongs.',

    gradient: ['#FF7A18', '#F24912', '#B9330B'] as const,
  },
  {
    id: 'vision',
    eyebrow: 'Our Vision',
    title: 'One vibrant global running community.',
    description:
      'We connect individuals and clubs across countries, cities, and neighborhoods so belonging replaces solitude.',
    gradient: ['#0F8B8D', '#136F63', '#114B5F'] as const,
  },
  {
    id: 'benefits',
    eyebrow: 'What You Will Achieve',
    title: 'Build momentum that lasts.',
    description:
      'Stay active, join a club, hit meaningful goals, share your journey, and discover events worth showing up for.',
    gradient: ['#1D4ED8', '#0F766E', '#14532D'] as const,
  },
  {
    id: 'explore',
    eyebrow: 'Explore the App',
    title: 'Everything you need in one place.',
    description:
    'Set your goals, record every run and walk, relive your history, connect with fellow athletes, discover sports gear, and explore exciting events.',
    gradient: ['#7C3AED', '#DB2777', '#EA580C'] as const,
  },
  {
    id: 'personalize',
    eyebrow: 'Make It Yours',
    title: 'Shape the experience around your journey.',
    description:
      'Customize your profile, manage app preferences, RunNation adapts to you.',
    gradient: ['#111827', '#1F2937', '#374151'] as const,
    cta: 'Join RunNation',
  },
];

const featureList = [
  { icon: Footprints, label: 'Stay Active' },
  { icon: Users, label: 'Join a Club' },
  { icon: Target, label: 'Reach Goals' },
  { icon: MessageCircle, label: 'Be Social' },
  { icon: CalendarDays, label: 'Find Events' },
];

const tabFeatures = [
  { icon: Footprints, label: 'Exercise', tint: '#F97316' },
  { icon: Target, label: 'Goals', tint: '#2563EB' },
  { icon: Activity, label: 'Activity', tint: '#059669' },
  { icon: MessageCircle, label: 'Chat', tint: '#EC4899' },
  { icon: ShoppingBag, label: 'Shop', tint: '#7C3AED' },
  { icon: CalendarDays, label: 'Events', tint: '#DC2626' },
];

function WorldVisual() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(spin, {
        toValue: 1,
        duration: 3600,
        useNativeDriver: true,
      }),
      Animated.timing(spin, {
        toValue: 0,
        duration: 3600,
        useNativeDriver: true,
      }),
    ]));

    animation.start();

    return () => {
      animation.stop();
      spin.stopAnimation();
    };
  }, [spin]);

  const rotateY = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['-16deg', '16deg'],
  });

  const globeShift = spin.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-4, 4, -4],
  });

  return (
    <View style={styles.visualFrame}>
      <View style={styles.worldScene}>
        <Animated.View
          style={[
            styles.globeShell,
            {
              transform: [
                { perspective: 700 },
                { translateX: globeShift },
                { rotateY },
              ],
            },
          ]}
        >
          <Svg width={220} height={220} viewBox="0 0 220 220">
            <Circle cx="110" cy="110" r="88" fill="#8EDBFF" stroke="#FFFFFF" strokeWidth="4" />
            <G fill="#FF9D2A" stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
              <Path d="M89 49 C78 45, 67 48, 60 57 C53 66, 48 74, 49 87 C50 97, 58 102, 62 111 C66 118, 69 124, 74 129 C77 133, 79 139, 80 146 C82 159, 90 170, 99 177 C104 181, 112 180, 116 173 C119 168, 120 161, 122 155 C126 144, 132 136, 139 128 C145 121, 149 113, 151 104 C153 94, 154 85, 151 78 C148 71, 142 64, 136 61 C129 58, 121 55, 114 57 C108 59, 105 62, 101 61 C96 59, 94 52, 89 49 Z" />
              <Path d="M92 40 C99 35, 109 34, 117 37 C123 39, 127 44, 126 49 C124 54, 117 56, 110 54 C103 52, 96 49, 92 40 Z" />
              <Path d="M119 47 C127 41, 138 39, 149 40 C163 41, 175 47, 182 57 C187 64, 188 72, 184 78 C180 84, 171 87, 166 94 C161 101, 158 109, 153 111 C148 113, 142 107, 141 100 C140 94, 145 88, 143 83 C141 78, 132 80, 128 76 C123 72, 122 64, 119 47 Z" />
              <Path d="M153 128 C159 129, 164 134, 165 140 C166 147, 161 154, 155 157 C151 159, 148 155, 149 149 C150 143, 148 136, 153 128 Z" />
              <Path d="M73 98 C77 95, 83 95, 86 98 C88 101, 87 106, 83 108 C79 110, 73 109, 71 105 C70 102, 71 100, 73 98 Z" />
              <Path d="M172 86 C176 84, 181 85, 183 89 C184 93, 182 98, 177 100 C173 101, 169 99, 168 95 C167 91, 169 88, 172 86 Z" />
            </G>
            <Path d="M57 57 C51 69, 48 83, 49 98" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" strokeLinecap="round" />
            <Path d="M152 38 C134 30, 113 27, 94 31" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" strokeLinecap="round" />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

function VisionVisual() {
  const topNode = useRef(new Animated.Value(-20)).current;
  const leftNode = useRef(new Animated.Value(-24)).current;
  const rightNode = useRef(new Animated.Value(24)).current;
  const bottomNode = useRef(new Animated.Value(20)).current;
  const pulse = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(topNode, {
            toValue: -6,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(leftNode, {
            toValue: -8,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(rightNode, {
            toValue: 8,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(bottomNode, {
            toValue: 6,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(topNode, {
            toValue: -20,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(leftNode, {
            toValue: -24,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(rightNode, {
            toValue: 24,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(bottomNode, {
            toValue: 20,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0.85,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
      topNode.stopAnimation();
      leftNode.stopAnimation();
      rightNode.stopAnimation();
      bottomNode.stopAnimation();
      pulse.stopAnimation();
    };
  }, [bottomNode, leftNode, pulse, rightNode, topNode]);

  return (
    <View style={styles.visualFrame}>
      <View style={styles.communityFrame}>
        <View style={styles.communityHaloOuter} />
        <View style={styles.communityHaloInner} />
        <View style={styles.communityLineVertical} />
        <View style={styles.communityLineHorizontal} />
        <View style={styles.communityLineDiagLeft} />
        <View style={styles.communityLineDiagRight} />

        <Animated.View
          style={[
            styles.communityCenter,
            {
              transform: [{ scale: pulse }],
            },
          ]}
        >
          <Users size={36} color="#FFFFFF" />
          <Text style={styles.communityCenterText}>One Community</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.communityNode,
            styles.communityNodeTop,
            { transform: [{ translateY: topNode }] },
          ]}
        >
          <Footprints size={18} color="#114B5F" />
        </Animated.View>
        <Animated.View
          style={[
            styles.communityNode,
            styles.communityNodeLeft,
            { transform: [{ translateX: leftNode }] },
          ]}
        >
          <MessageCircle size={18} color="#114B5F" />
        </Animated.View>
        <Animated.View
          style={[
            styles.communityNode,
            styles.communityNodeRight,
            { transform: [{ translateX: rightNode }] },
          ]}
        >
          <Target size={18} color="#114B5F" />
        </Animated.View>
        <Animated.View
          style={[
            styles.communityNode,
            styles.communityNodeBottom,
            { transform: [{ translateY: bottomNode }] },
          ]}
        >
          <CalendarDays size={18} color="#114B5F" />
        </Animated.View>

        <View style={styles.communityCaption}>
          <Text style={styles.communityCaptionText}>Connecting communities</Text>
        </View>
      </View>
    </View>
  );
}

function BenefitsVisual() {
  return (
    <View style={styles.visualFrame}>
      <View style={styles.benefitGrid}>
        {featureList.map(({ icon: Icon, label }) => (
          <View key={label} style={styles.benefitCard}>
            <View style={styles.benefitIconWrap}>
              <Icon size={22} color="#14532D" />
            </View>
            <Text style={styles.benefitLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ExploreVisual() {
  return (
    <View style={styles.visualFrame}>
      <View style={styles.phoneMock}>
        <LinearGradient colors={['#FFF7ED', '#FFFFFF']} style={styles.phoneScreen}>
          <View style={styles.phoneHeader}>
            <Text style={styles.phoneTitle}>RunNation</Text>
            <View style={styles.phoneDots}>
              <View style={styles.phoneDot} />
              <View style={styles.phoneDot} />
              <View style={styles.phoneDot} />
            </View>
          </View>

          <View style={styles.featurePreviewGrid}>
            {tabFeatures.map(({ icon: Icon, label, tint }) => (
              <View key={label} style={styles.featurePreviewCard}>
                <View style={[styles.featurePreviewIcon, { backgroundColor: `${tint}18` }]}>
                  <Icon size={20} color={tint} />
                </View>
                <Text style={styles.featurePreviewLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

function PersonalizeVisual() {
  const leftShift = useRef(new Animated.Value(-10)).current;
  const rightShift = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(leftShift, {
            toValue: -2,
            duration: 950,
            useNativeDriver: true,
          }),
          Animated.timing(rightShift, {
            toValue: 2,
            duration: 950,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(leftShift, {
            toValue: -10,
            duration: 950,
            useNativeDriver: true,
          }),
          Animated.timing(rightShift, {
            toValue: 10,
            duration: 950,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
      leftShift.stopAnimation();
      rightShift.stopAnimation();
    };
  }, [leftShift, rightShift]);

  return (
    <View style={styles.visualFrame}>
      <View style={styles.personalizePanel}>
        <View style={styles.personalizeHero}>
          <Animated.View
            style={[
              styles.motionIconWrap,
              styles.motionIconLeft,
              { transform: [{ translateX: leftShift }] },
            ]}
          >
            <View style={styles.editIconCardLarge}>
              <UserCircle2 size={56} color="#111827" />
            </View>
          </Animated.View>

          <View style={styles.personalizePlusBadge}>
            <Text style={styles.editPlusText}>+</Text>
          </View>

          <Animated.View
            style={[
              styles.motionIconWrap,
              styles.motionIconRight,
              { transform: [{ translateX: rightShift }] },
            ]}
          >
            <View style={styles.editIconCardLarge}>
              <Svg width={64} height={64} viewBox="0 0 64 64">
                <G fill="none" stroke="#111827" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M32 8 L37 8 L39 15 L45 17 L50 13 L54 17 L50 23 L52 29 L59 32 L59 37 L52 39 L50 45 L54 50 L50 54 L45 50 L39 52 L37 59 L32 59 L30 52 L24 50 L19 54 L15 50 L19 45 L17 39 L10 37 L10 32 L17 29 L19 23 L15 17 L19 13 L24 17 L30 15 Z" />
                  <Circle cx="32" cy="34" r="10" />
                </G>
              </Svg>
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function SlideVisual({ id }: { id: SlideId }) {
  switch (id) {
    case 'welcome':
      return <WorldVisual />;
    case 'vision':
      return <VisionVisual />;
    case 'benefits':
      return <BenefitsVisual />;
    case 'explore':
      return <ExploreVisual />;
    case 'personalize':
      return <PersonalizeVisual />;
    default:
      return null;
  }
}

function OnboardingSlide({
  slide,
  isActive,
}: {
  slide: Slide;
  isActive: boolean;
}) {
  const contentOpacity = useRef(new Animated.Value(isActive ? 1 : 0.7)).current;
  const contentShift = useRef(new Animated.Value(isActive ? 0 : 18)).current;
  const visualFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: isActive ? 1 : 0.72,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(contentShift, {
        toValue: isActive ? 0 : 18,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, contentShift, isActive]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(visualFloat, {
          toValue: isActive ? -8 : -3,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(visualFloat, {
          toValue: 0,
          duration: 2200,
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
    <View style={styles.slide}>
      <LinearGradient colors={slide.gradient} style={styles.heroSection}>
        <Animated.View
          style={[
            styles.ambientOrbOne,
            {
              transform: [
                {
                  translateY: visualFloat.interpolate({
                    inputRange: [-8, 0],
                    outputRange: [-10, 0],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.ambientOrbTwo,
            {
              transform: [
                {
                  translateY: visualFloat.interpolate({
                    inputRange: [-8, 0],
                    outputRange: [6, 0],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View style={{ transform: [{ translateY: visualFloat }] }}>
          <SlideVisual id={slide.id} />
        </Animated.View>
      </LinearGradient>

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
          {slide.id === 'welcome' ? (
            <>
              <Text style={styles.description}>{slide.description}</Text>
              <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
              {slide.eyebrow2 ? <Text style={styles.eyebrowSecondary}>{slide.eyebrow2}</Text> : null}
              <Text style={styles.title}>{slide.title}</Text>
              {slide.title2 ? <Text style={styles.titleSecondary}>{slide.title2}</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
              {slide.eyebrow2 ? <Text style={styles.eyebrowSecondary}>{slide.eyebrow2}</Text> : null}
              <Text style={styles.title}>{slide.title}</Text>
              {slide.title2 ? <Text style={styles.titleSecondary}>{slide.title2}</Text> : null}
              <Text style={styles.description}>{slide.description}</Text>
            </>
          )}

          {slide.id === 'personalize' && (
            <View style={styles.finalPrompt}>
              <Text style={styles.finalPromptText}>Let&apos;s get started.</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
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
          <OnboardingSlide
            key={slide.id}
            slide={slide}
            isActive={index === currentIndex}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {slides.map((slide, index) => (
            <View
              key={slide.id}
              style={[styles.dot, index === currentIndex && styles.activeDot]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.9}>
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
    backgroundColor: '#F7F4EE',
  },
  skipButton: {
    position: 'absolute',
    top: 54,
    right: 20,
    zIndex: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    minHeight: SCREEN_HEIGHT,
  },
  heroSection: {
    height: SCREEN_HEIGHT * 0.53,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ambientOrbOne: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.12)',
    top: -40,
    right: -30,
  },
  ambientOrbTwo: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
    bottom: -20,
    left: -35,
  },
  contentSection: {
    flex: 1,
    marginTop: -24,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  contentCard: {
    flex: 1,
    backgroundColor: '#F7F4EE',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 28,
    paddingHorizontal: 24,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 6,
  },
  description: {
    fontSize: 17,
    lineHeight: 27,
    color: '#4B5563',
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: '#C2410C',
    marginBottom: 12,
  },
  eyebrowSecondary: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  title: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '900',
    color: '#B91C1C',
    letterSpacing: -1.2,
    marginBottom: 8,
  },
  titleSecondary: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#171717',
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  finalPrompt: {
    marginTop: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  finalPromptText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
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
    gap: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(23,23,23,0.16)',
  },
  activeDot: {
    width: 30,
    backgroundColor: '#111827',
  },
  nextButton: {
    backgroundColor: '#111827',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  visualFrame: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    paddingTop: 48,
    paddingBottom: 18,
  },
  worldScene: {
    width: 300,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  globeShell: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  communityFrame: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  communityHaloOuter: {
    position: 'absolute',
    width: 232,
    height: 232,
    borderRadius: 116,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  communityHaloInner: {
    position: 'absolute',
    width: 184,
    height: 184,
    borderRadius: 92,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  communityLineVertical: {
    position: 'absolute',
    width: 2,
    height: 156,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  communityLineHorizontal: {
    position: 'absolute',
    width: 156,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  communityLineDiagLeft: {
    position: 'absolute',
    width: 132,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.24)',
    transform: [{ rotate: '45deg' }],
  },
  communityLineDiagRight: {
    position: 'absolute',
    width: 132,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.24)',
    transform: [{ rotate: '-45deg' }],
  },
  communityCenter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  communityCenterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  communityNode: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECFEFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  communityNodeTop: {
    top: 28,
  },
  communityNodeLeft: {
    left: 24,
  },
  communityNodeRight: {
    right: 24,
  },
  communityNodeBottom: {
    bottom: 56,
  },
  communityCaption: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  communityCaptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#114B5F',
  },
  benefitGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  benefitCard: {
    width: '46%',
    backgroundColor: '#F0FDF4',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 10,
  },
  benefitIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#14532D',
    textAlign: 'center',
  },
  phoneMock: {
    width: 255,
    height: 380,
    borderRadius: 34,
    backgroundColor: '#111827',
    padding: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 12,
  },
  phoneScreen: {
    flex: 1,
    borderRadius: 24,
    padding: 18,
  },
  phoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  phoneTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  phoneDots: {
    flexDirection: 'row',
    gap: 4,
  },
  phoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
  },
  featurePreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  featurePreviewCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 10,
  },
  featurePreviewIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featurePreviewLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  personalizePanel: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  personalizeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 120,
  },
  motionIconWrap: {
    width: 96,
    alignItems: 'center',
  },
  motionIconLeft: {
    marginRight: 10,
  },
  motionIconRight: {
    marginLeft: 10,
  },
  editIconCardLarge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  personalizePlusBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPlusText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
});
