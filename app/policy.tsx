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
import brandColors from '@/constants/colors';

type SectionId = 'overview' | 'data_collection' | 'location' | 'storage' | 'sharing' | 'security' | 'rights' | 'terms';

interface PolicySection {
  id: SectionId;
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  content: string[];
}

const LAST_UPDATED = '27 April 2026';

const SECTIONS: PolicySection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: <Eye size={20} color="#3b82f6" />,
    accentColor: '#3b82f6',
    content: [
      'RunNation ("the App") is a fitness, community, events, shopping, chat, and magazine platform for runners and walkers. It helps users track activity, join clubs, participate in events, share social content, discover country-specific shop items, and read or submit RunNation Magazine stories.',
      'This document explains how we collect, use, store, protect, moderate, and display your information. By creating an account, signing in with email or a supported social provider, or using the App, you agree to these practices and terms.',
      'Some features are country-specific or role-specific. For example, shopping and event access may depend on your profile country, while admin tools are available only to users with approved roles.',
    ],
  },
  {
    id: 'data_collection',
    title: 'Data We Collect',
    icon: <Database size={20} color="#10b981" />,
    accentColor: '#10b981',
    content: [
      'Account Information: When you register or complete your profile, we may collect your name, username, email address, phone number, sex, date of birth, country, residence, occupation, club, profile photo, and other profile details you choose to provide.',
      'Authentication Information: Accounts are created through Supabase Auth using email/password or supported social sign-in providers such as Google. Apple sign-in may be shown as a future or coming-soon option until fully enabled.',
      'Activity Data: We record exercise type (Walk, Run, Treadmill), distance covered, start/end times, pace, activity date, GPS route coordinates for outdoor activities, and any supporting evidence required for activity verification.',
      'Treadmill Submissions: For treadmill activities, we collect distance, duration, and a photo of the treadmill screen for admin verification.',
      'Events and Clubs: We store event enrollment details, country and club information, registration status, medal or completion progress, event entry type (such as free, club-approved, or paid), and whether an event is local, virtual, or available to all users.',
      'Chat and Social Content: We store posts, photos, captions, comments, reactions, mentions, polls, and activity summaries that you choose to share in the community areas of the App.',
      'Magazine Submissions: If you submit a story, attachment, event pictorial, or photo for Picture of the Week, we collect the submitted text, images, files, country, club, event date, and related details for admin review and possible publication.',
      'Shop and Orders: We collect delivery information, order details, currency, country, and purchase history when you use the merchandise shop. Shop availability may vary by country.',
      'Device and Session Information: We may collect device identifiers, platform information, app logs, and session data needed for app functionality, troubleshooting, security, and abuse prevention.',
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
      'Your data is stored using Supabase database, authentication, and storage services. Data is protected using encryption in transit and platform security controls.',
      'Authentication credentials are handled by Supabase Auth and are never stored by RunNation as plain-text passwords. Passwords and recovery flows should use the secure authentication provider process.',
      'Sensitive session data is stored on your device using encrypted secure storage (Expo SecureStore) and is not transmitted to external servers.',
      'Images, attachments, social uploads, magazine submissions, and pictorial photos may be stored in Supabase Storage or an equivalent app storage service so they can be displayed in the App.',
      'Activity records, account data, social content, order records, event records, role assignments, and magazine submissions are retained for as long as needed to operate the App, maintain records, resolve disputes, or comply with lawful requirements.',
      'Rejected treadmill submissions and rejected event enrollments are deleted from our systems upon rejection.',
      'Deleted posts, submissions, images, or account data may not disappear immediately from backups or logs, but they will no longer be actively displayed once removed from the live App.',
    ],
  },
  {
    id: 'sharing',
    title: 'Data Sharing & Visibility',
    icon: <Users size={20} color="#ec4899" />,
    accentColor: '#ec4899',
    content: [
      'Community Feed and Chat: Posts, photos, comments, reactions, mentions, polls, and activity summaries you share may be visible to other App users. You are responsible for the content you choose to publish.',
      'Magazine and Pictorials: Stories, attachments, event pictorial photos, and Picture of the Week submissions may be reviewed by admins and, if selected, displayed in RunNation Magazine or on magazine front-page areas.',
      'Activity Leaderboards: Your username, profile details, country or club, and activity statistics may appear on event leaderboards, medal lists, and community views visible to other participants.',
      'Private Mode: You can enable Private Mode in Settings to hide your data from public leaderboards and community views.',
      'Admin Access: Approved admins can view relevant records such as activities, pending submissions, event enrollments, shop orders, social reports, magazine submissions, pictorials, and role assignments for operational, moderation, and verification purposes.',
      'Role-Based Access: Global admins, country admins, and club coordinators may see different information depending on their role and scope. Admin actions may be logged for accountability.',
      'We do not share your personal data with third-party advertisers. We do not sell your data to any external entity.',
      'We may disclose data if required by law or to protect the safety and rights of our users.',
    ],
  },
  {
    id: 'security',
    title: 'Security Measures',
    icon: <Shield size={20} color={brandColors.primary} />,
    accentColor: brandColors.primary,
    content: [
      'Authentication is handled through Supabase Auth using email/password and supported social sign-in providers. Password reset and account recovery are handled through secure authentication flows.',
      'Biometric authentication (Face ID / Fingerprint) may be supported for convenient access on supported devices where enabled.',
      'All network communications between the App and our servers use HTTPS encryption.',
      'The App uses backend checks, database permissions, and role-based access controls to restrict sensitive operations.',
      'Admin access uses the same main authentication system and is restricted by assigned roles such as super_admin, country_admin, and club_coordinator.',
      'Country and club scope may limit what admins can view or manage. For example, country-specific shop and event operations may be restricted to the relevant country.',
      'No system is perfectly secure, but we take reasonable technical and operational steps to protect user data and reduce unauthorized access.',
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
      'Content Removal: You may request removal of your own posts, submitted stories, pictorial photos, or other user-generated content, subject to operational, safety, legal, or recordkeeping needs.',
      'Withdraw Consent: You may stop using the App at any time. Disabling location services, notifications, or optional profile fields may limit certain features but does not automatically delete your account.',
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
      'Acceptable Use: The App is intended for personal fitness tracking, community engagement, events, shopping, and editorial participation. You agree not to misuse the platform, harass users, impersonate others, post harmful content, spam, or upload illegal or inappropriate material.',
      'Country and Event Rules: Some events and shop items are country-specific. You may be prevented from enrolling in non-virtual events outside your registered country unless the App operators allow it.',
      'Event Fees and Payment Handling: Some events may be free, may require club approval, or may require payment before confirmation. Where event fees apply, payment instructions should be communicated clearly through the app or the relevant RunNation-administered process. Bulk-collected event funds may be remitted to the relevant club or independent event organiser through the approved RunNation payment handling workflow.',
      'Admin Decisions: Administrators may approve, reject, edit visibility, remove, or moderate treadmill submissions, event enrollments, shop orders, social posts, comments, reactions, magazine submissions, pictorials, and reported content.',
      'Magazine Rights: You keep ownership of stories, photos, and attachments you submit, but you grant RunNation permission to review, store, edit for formatting, display, promote, and publish accepted submissions inside the App and related RunNation channels.',
      'Picture of the Week: By submitting an event pictorial or photo, you agree that selected images may be used as a magazine cover, front-page background, highlight, or promotional community feature with appropriate contextual details where practical.',
      'Shop Purchases: All merchandise purchases are subject to availability, supported country, local currency, delivery limits, and admin processing. Refund and return policies are handled on a case-by-case basis unless a specific policy is published.',
      'Admin Roles: Users with admin roles must use their access only for legitimate RunNation operations. Global admins may have broader rights, including deletion and role management, while country admins and club coordinators may be limited by assigned scope.',
      'Intellectual Property: All content, design, branding, and functionality of the RunNation app are the property of the App operators. User-generated content remains the property of the user but is licensed to the App for display, moderation, community, and magazine purposes.',
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
          headerTintColor: brandColors.dark,
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
    backgroundColor: brandColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: brandColors.primary,
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
    backgroundColor: brandColors.primary + '0D',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: brandColors.primary + '20',
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
