import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Stack } from 'expo-router';
import { Shield, Eye, MapPin, Database, Lock, Users, Trash2, Scale, ChevronDown } from 'lucide-react-native';
import colors from '@/constants/colors';

type SectionId = 'overview' | 'data_collection' | 'location' | 'storage' | 'sharing' | 'security' | 'rights' | 'terms';

interface PolicySection {
  id: SectionId;
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  content: string[];
}

const LAST_UPDATED = '21 February 2026';

const SECTIONS: PolicySection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: <Eye size={20} color="#3b82f6" />,
    accentColor: '#3b82f6',
    content: [
      'RunNation ("the App") is a fitness and community platform that enables users to track walking, running, and treadmill activities, participate in events, engage with a social feed, and purchase merchandise.',
      'This document outlines how we collect, use, store, and protect your personal data in compliance with applicable data protection laws. By using the App, you agree to the practices described herein.',
    ],
  },
  {
    id: 'data_collection',
    title: 'Data We Collect',
    icon: <Database size={20} color="#10b981" />,
    accentColor: '#10b981',
    content: [
      'Account Information: When you register, we collect your first name, other names, username, email address, sex, age, country, residence, occupation, academic year, and a profile photo (optional).',
      'Activity Data: We record exercise type (Walk, Run, Treadmill), distance covered, start/end times, pace, activity date, and GPS route coordinates for outdoor activities.',
      'Treadmill Submissions: For treadmill activities, we collect distance, duration, and a photo of the treadmill screen for admin verification.',
      'Event Participation: We store event enrollment details including your name, email, registration status, and medal/completion progress.',
      'Social Posts: Any photos, captions, or activity data you choose to share on the community feed.',
      'Shop & Orders: Delivery information, order details, and purchase history when you use the merchandise shop.',
      'Device Information: We may collect device identifiers and platform information for app functionality and security purposes.',
    ],
  },
  {
    id: 'location',
    title: 'Location Data',
    icon: <MapPin size={20} color="#f59e0b" />,
    accentColor: '#f59e0b',
    content: [
      'The App uses GPS location services to track your outdoor walking and running routes in real time. Location data is collected only while you are actively recording an exercise session.',
      'Background location access may be used to continue tracking your route if the app is minimised during an active session. This ensures accurate distance and route recording.',
      'Location data is stored as coordinate points linked to your activity record. You can disable location services at any time through your device settings, though this will prevent GPS-based activity tracking.',
      'We do not sell, rent, or share your raw GPS location data with any third parties. Location data is used solely for activity tracking and route display within the App.',
    ],
  },
  {
    id: 'storage',
    title: 'Data Storage & Retention',
    icon: <Lock size={20} color="#8b5cf6" />,
    accentColor: '#8b5cf6',
    content: [
      'Your data is stored securely using Supabase, a cloud-hosted database platform with enterprise-grade security, including encryption at rest and in transit.',
      'Authentication credentials (PIN) are hashed and stored securely. We never store plain-text passwords or PINs.',
      'Sensitive session data is stored on your device using encrypted secure storage (Expo SecureStore) and is not transmitted to external servers.',
      'Activity records and account data are retained for as long as your account is active. You may request deletion of your data at any time (see Your Rights below).',
      'Rejected treadmill submissions and rejected event enrollments are deleted from our systems upon rejection.',
    ],
  },
  {
    id: 'sharing',
    title: 'Data Sharing & Visibility',
    icon: <Users size={20} color="#ec4899" />,
    accentColor: '#ec4899',
    content: [
      'Community Feed: Posts you share on the social feed (photos, captions, activity summaries) are visible to all App users. You control what you post.',
      'Activity Leaderboards: Your username and activity statistics may appear on event leaderboards and medal lists visible to other participants.',
      'Private Mode: You can enable Private Mode in Settings to hide your data from public leaderboards and community views.',
      'Admin Access: App administrators can view activity records, pending submissions, event enrollments, and shop orders for operational and verification purposes.',
      'We do not share your personal data with third-party advertisers. We do not sell your data to any external entity.',
      'We may disclose data if required by law or to protect the safety and rights of our users.',
    ],
  },
  {
    id: 'security',
    title: 'Security Measures',
    icon: <Shield size={20} color={colors.primary} />,
    accentColor: colors.primary,
    content: [
      'PIN-based authentication with configurable lockout after multiple failed attempts (5 attempts, 15-minute lockout).',
      'Biometric authentication (Face ID / Fingerprint) support for convenient and secure access on supported devices.',
      'All network communications between the App and our servers use HTTPS encryption.',
      'Row-level security policies are enforced at the database level, ensuring users can only access and modify their own data.',
      'Admin access is protected by a separate authentication system with restricted permissions.',
    ],
  },
  {
    id: 'rights',
    title: 'Your Rights',
    icon: <Trash2 size={20} color="#ef4444" />,
    accentColor: '#ef4444',
    content: [
      'Access: You have the right to view all personal data we hold about you, accessible through the Profile and Activity sections of the App.',
      'Correction: You may update your personal information at any time through your profile settings.',
      'Deletion: You may request complete deletion of your account and all associated data by contacting an administrator through the Send Feedback feature in Settings.',
      'Portability: You may request an export of your activity data by contacting an administrator.',
      'Withdraw Consent: You may stop using the App at any time. Disabling location services or notifications does not affect your account status.',
      'Objection: If you believe your data is being processed unfairly, you may raise a concern through the feedback system or contact the App administrators directly.',
    ],
  },
  {
    id: 'terms',
    title: 'Terms of Use',
    icon: <Scale size={20} color="#0ea5e9" />,
    accentColor: '#0ea5e9',
    content: [
      'Eligibility: You must provide accurate registration information to use the App. Falsifying activity data (e.g. fraudulent treadmill submissions) may result in account suspension.',
      'Acceptable Use: The App is intended for personal fitness tracking and community engagement. You agree not to misuse the platform, harass other users, or upload inappropriate content to the social feed.',
      'Admin Decisions: Administrators reserve the right to approve or reject treadmill activity submissions, event enrollments, and external activity submissions at their discretion.',
      'Shop Purchases: All merchandise purchases are subject to availability. Order statuses are managed by administrators. Refund and return policies are handled on a case-by-case basis.',
      'Intellectual Property: All content, design, and functionality of the RunNation app are the property of the App operators. User-generated content (posts, photos) remains the property of the user but is licensed to the App for display purposes.',
      'Modifications: We reserve the right to update this policy and these terms at any time. Continued use of the App after changes constitutes acceptance of the updated terms.',
      'Limitation of Liability: The App is provided "as is" for fitness tracking purposes. We are not liable for inaccuracies in distance tracking, GPS data, or any health-related decisions made based on App data. Always consult a medical professional before starting any exercise programme.',
    ],
  },
];

function AccordionSection({ section }: { section: PolicySection }) {
  const [expanded, setExpanded] = useState(false);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    const toValue = expanded ? 0 : 1;
    setExpanded(!expanded);
    Animated.parallel([
      Animated.spring(animatedHeight, {
        toValue,
        useNativeDriver: false,
        friction: 10,
        tension: 80,
      }),
      Animated.timing(rotateAnim, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const maxHeight = animatedHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, section.content.length * 120 + 40],
  });

  return (
    <View style={[sectionStyles.container, { borderLeftColor: section.accentColor }]}>
      <TouchableOpacity
        style={sectionStyles.header}
        onPress={toggleExpand}
        activeOpacity={0.7}
        testID={`policy-section-${section.id}`}
      >
        <View style={sectionStyles.headerLeft}>
          <View style={[sectionStyles.iconWrap, { backgroundColor: section.accentColor + '15' }]}>
            {section.icon}
          </View>
          <Text style={sectionStyles.title}>{section.title}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={20} color="#999" />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View style={[sectionStyles.body, { maxHeight, opacity: animatedHeight }]}>
        {section.content.map((paragraph, index) => {
          const colonIndex = paragraph.indexOf(':');
          const hasLabel = colonIndex > 0 && colonIndex < 30;

          return (
            <View key={index} style={sectionStyles.bulletRow}>
              <View style={[sectionStyles.bullet, { backgroundColor: section.accentColor }]} />
              <Text style={sectionStyles.paragraph}>
                {hasLabel ? (
                  <>
                    <Text style={sectionStyles.boldText}>{paragraph.substring(0, colonIndex + 1)}</Text>
                    {paragraph.substring(colonIndex + 1)}
                  </>
                ) : (
                  paragraph
                )}
              </Text>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

export default function PolicyScreen() {
  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: 'Policy & Terms',
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: colors.dark,
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Shield size={32} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Privacy Policy &{'\n'}Terms of Use</Text>
          <Text style={styles.heroSubtitle}>Last updated: {LAST_UPDATED}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Your privacy matters to us. Tap each section below to learn how we handle your data and the terms governing your use of RunNation.
          </Text>
        </View>

        {SECTIONS.map((section) => (
          <AccordionSection key={section.id} section={section} />
        ))}

        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Questions or Concerns?</Text>
          <Text style={styles.contactText}>
            If you have any questions about this policy, your data, or wish to exercise your rights, please use the Send Feedback option in Settings to reach the App administrators.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>RunNation v1.0.0</Text>
          <Text style={styles.footerSub}>This policy is effective as of {LAST_UPDATED}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1a1a1a',
    flex: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    color: '#444',
    flex: 1,
  },
  boldText: {
    fontWeight: '700' as const,
    color: '#1a1a1a',
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  heroIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: '#1a1a1a',
    textAlign: 'center',
    lineHeight: 30,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500' as const,
  },
  infoCard: {
    backgroundColor: colors.primary + '0D',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary + '20',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#555',
    textAlign: 'center',
  },
  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginTop: 10,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#1a1a1a',
  },
  contactText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#666',
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 4,
  },
  footerText: {
    fontSize: 13,
    color: '#bbb',
    fontWeight: '500' as const,
  },
  footerSub: {
    fontSize: 12,
    color: '#ccc',
  },
});
