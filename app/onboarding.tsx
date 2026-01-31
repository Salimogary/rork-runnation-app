import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import colors from '@/constants/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Slide {
  id: number;
  image: string | number;
  title: string;
  description: string;
  gradient: readonly [string, string, ...string[]];
}

const slides: Slide[] = [
  {
    id: 1,
    image: require('../assets/images/adaptive-icon.png'),
    title: 'Maun Run',
    description: 'Everyday Counts',
    gradient: ['#FF6B35', '#F7931E'] as const,
  },
  {
    id: 2,
    image: 'https://r2-pub.rork.com/generated-images/b4ac6807-b531-477c-afbc-19ef039dd502.png',
    title: 'Move Outdoors',
    description: 'Hit the trails or pound the pavement. Indoor treadmill? That counts too. Just move.',
    gradient: ['#4CAF50', '#8BC34A'] as const,
  },
  {
    id: 3,
    image: 'https://r2-pub.rork.com/generated-images/e119001e-a94d-4d88-bfe2-69ef0c65a8d6.png',
    title: 'Track Your Progress',
    description: 'Monitor your journey and see how you stack up with the entire community.',
    gradient: ['#2196F3', '#03A9F4'] as const,
  },
  {
    id: 4,
    image: 'https://r2-pub.rork.com/generated-images/7e87af6c-26ce-4cba-ba04-81008fd3e5ab.png',
    title: 'Never Run Alone',
    description: "Connect, share, and get motivated. Your support squad is waiting to cheer you on!",
    gradient: ['#FF9800', '#FF5722'] as const,
  },
  {
    id: 5,
    image: 'https://r2-pub.rork.com/generated-images/f693316a-a29c-4034-8585-5222f528f09c.png',
    title: 'Gear Up',
    description: 'Shop premium running gear delivered to your location. Everything you need in one place.',
    gradient: ['#9C27B0', '#E91E63'] as const,
  },
  {
    id: 6,
    image: 'https://r2-pub.rork.com/generated-images/75291e2f-c866-475d-a957-a23e45e2b851.png',
    title: 'Race & Win Medals',
    description: 'Join events, complete challenges, and earn medals that prove your dedication.',
    gradient: ['#FFD700', '#FFA000'] as const,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const handleSkip = async () => {
    console.log('Navigating to register page...');
    try {
      await router.replace('/register');
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      scrollViewRef.current?.scrollTo({
        x: SCREEN_WIDTH * (currentIndex + 1),
        animated: true,
      });
    } else {
      handleSkip();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
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
        {slides.map((slide) => (
          <View key={slide.id} style={styles.slide}>
            <LinearGradient
              colors={slide.gradient}
              style={styles.imageContainer}
            >
              <Image
                source={typeof slide.image === 'string' ? { uri: slide.image } : slide.image}
                style={slide.id === 1 ? styles.logoImage : styles.image}
                resizeMode="cover"
              />
            </LinearGradient>

            <View style={styles.contentContainer}>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.description}>{slide.description}</Text>
              {slide.id === 1 && (
                <Text style={styles.welcomeHeading}>Welcome</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentIndex === index && styles.activeDot,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>
            {currentIndex === slides.length - 1 ? "Let's Go!" : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  skipButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.mediumGray,
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.55,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.2 }],
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  welcomeHeading: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: 32,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lightGray,
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: colors.primary,
  },
  nextButton: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
