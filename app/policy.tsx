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

const LAST_UPDATED = '01 Jun 2026';

const SECTIONS: PolicySection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: <Eye size={20} color="#3b82f6" />,
    accentColor: '#3b82f6',
    content: [
      'RunNation ("the App") is a fitness, community, events, shopping, chat, goals, reports, and magazine platform for runners and walkers. It helps users track workouts, join clubs, participate in same-day, recurring, and multiday events, share social content, discover country-specific shop items, and read or submit magazine stories.',
      'This document explains how we collect, use, store, protect, moderate, and display your information. By creating an account, signing in with email or a supported social provider, or using the App, you agree to these practices and terms.',
      'Some features are country-specific, travel-specific, age-specific, club-specific, or role-specific. For example, shopping and event access may depend on your profile or travel country, special clubs may depend on age or preference, while admin tools are available only to users with approved roles.',
      'RunNation is designed with concern for inclusion across different running communities. Special groups such as Junior Runners, Golden Age Runners, Para Runners, Treadmill Runners, SmartFit users, beginners, and other eligible groups may have dedicated clubs, reporting views, coordinator roles, safeguards, and ranking contexts so users can participate in fairer and more relevant communities.',
    ],
  },
  {
    id: 'data_collection',
    title: 'Data We Collect',
    icon: <Database size={20} color="#10b981" />,
    accentColor: '#10b981',
    content: [
      'Account Information: When you register or complete your profile, we collect or may collect your name, username, email address, phone number, sex, date of birth, nationality, country, residence, occupation, club, profile photo, travel destination/date range, and other profile details you choose to provide. Minimum age rules apply to registration and some clubs.',
      'Authentication Information: Accounts are created through Supabase Auth using email/password or supported social sign-in providers such as Google. Apple sign-in may be shown as a future or coming-soon option until fully enabled.',
      'Activity Data: We record workout type (Walk, Run, Cycle, Treadmill, smart watch import, or other sports app import), distance covered, start/end times, pause duration, pace in minutes per kilometre by default, activity date, GPS route coordinates for outdoor activities, and any supporting evidence required for verification. Cycle is reserved for Para users who declare wheelchair or handcycle equipment.',
      'Treadmill Submissions: Treadmill activities count for workouts, goals, and normal activity records, but not for event credit. We may collect distance, duration, date, and proof photo where verification is required.',
      'External Activity Imports: Smart watch and other sports app imports may include screenshots or supporting evidence. These can count for event credit only through the relevant club or organizer approval process; screenshots are not required for ordinary non-event workout records unless the app says otherwise.',
      'Goals and Health Metrics: We may store goal preferences, target dates, activity days, weight, distance, duration, and progress calculations such as effectiveness per kilometre or per hour of activity.',
      'Events and Clubs: We store event enrollment details, country and club information, registration status, recurring event rules, minimum distance requirements, medal or completion progress, event entry type (such as free, approved, or paid), and whether an event is local, virtual, recurring, multiday, or available to all users.',
      'Service Team Roles: If you apply for a role such as club coordinator, country coordinator, event organizer, shop manager, special club coordinator, or magazine columnist, we store your request, country or global scope, approval status, optional suitability statement, optional website, LinkedIn, or social links, and any contact consent or contact instructions you choose to provide.',
      'Donations and Rewards: If you use donation or reward features, we may store donation intent details such as amount, currency, country, selected payment option, optional remarks, reward nominations, reward source, reward type, approval status, and fulfilment notes.',
      'Chat and Social Content: We store posts, photos, captions, comments, reactions, mentions, polls, reports, screenshots submitted with reports, moderation decisions, and activity summaries that you choose to share in the community areas of the App.',
      'Magazine Submissions: If you submit a story, event-linked article, pictorial, gallery photo, author name, photo, or external link, we collect the submitted text, images, files, country, club, event date, and related details for admin review and possible publication.',
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
      'Activity records, account data, social content, report records, order records, event records, role assignments, travel settings, goals, donation records, reward records, resignation requests, club deletion requests, and magazine submissions are retained for as long as needed to operate the App, maintain records, resolve disputes, or comply with lawful requirements.',
      'When an admin role is deleted, RunNation may keep a summarized resigned-admin audit log showing the role removed, who removed it, recent activity, action counts, and related role context. This preserves accountability without keeping unnecessary live access.',
      'Rejected submissions may remain visible to admins for audit and abuse-prevention purposes even where they no longer appear to ordinary users. This helps prevent repeated action on the same rejected request.',
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
      'Magazine and Pictorials: Stories, event-linked articles, author names, external links, event pictorial photos, gallery photos, and Picture of the Week submissions may be reviewed by admins and, if selected, displayed in The Running Post or related RunNation magazine areas.',
      'Activity Leaderboards: Your username, profile details, flag, country or club, sex, distance, time, pace, days participated, medal or finisher status, and activity statistics may appear on event leaderboards, reports, medal lists, and community views visible to other participants.',
      'Private Mode: You can enable Private Mode in Settings to hide your data from public leaderboards and community views.',
      'Admin Access: Approved admins can view relevant records such as activities, pending submissions, event enrollments, shop orders, social reports, screenshots, magazine submissions, pictorials, role requests, role assignments, service role notes, donation intents, reward records, resignation requests, club deletion requests, special club records, and moderation flags for operational, moderation, and verification purposes.',
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
      'Rate limiting, input sanitization, upload file-type checks, CORS restrictions, and security headers may be used to reduce spam, duplicate submissions, automated abuse, and unsafe requests.',
      'Admin access uses the same main authentication system and is restricted by assigned roles such as Global Admin, Country Admin, Country Coordinator, Club Coordinator, Event Organizer, Shop Manager, Special Club Coordinator, and approved magazine columnist roles where applicable.',
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
      'Eligibility: You must be at least 8 years old to create and keep a RunNation account. You must provide accurate registration information, including required age and nationality details, to use the App. Falsifying activity data, age, identity, country, screenshots, or evidence may result in rejection, suspension, or removal.',
      'Acceptable Use: The App is intended for personal fitness tracking, community engagement, events, shopping, and editorial participation. You agree not to misuse the platform, harass users, impersonate others, post harmful content, spam, or upload illegal or inappropriate material.',
      'Country, Travel, Club, and Event Rules: Some events and shop items are country-specific. Travel settings may allow temporary event access in another country during the travel date range. A user may belong to one normal club and any number of eligible special clubs. Normal club membership requires coordinator/admin approval; eligible special clubs may be granted automatically from profile, age, disability, indoor workout, smart watch, and goal information.',
      'Special Groups and Inclusivity: RunNation may create special clubs, coordinator roles, reports, event pathways, and ranking rules to support groups with distinct participation needs, including juniors, older runners, para runners, indoor/treadmill runners, SmartFit users, beginners, and other communities. Junior runners are kept out of adult/general competition contexts and rank within their own running community. Para users who use wheelchair, handcycle, prosthetic blades, or other declared equipment stay in Para club leaderboards for exercise records and may appear in separate Para athlete event sections. Para users who do not use equipment may also appear in broader community leaderboards where appropriate.',
      'Workout Rules: GPS workouts must meet the app minimum distance and time requirements to be saved as completed records. Shorter attempts may be paused and resumed later where the app supports it. The three main activity types are Walk, Run, and Cycle, with Cycle reserved for Para users who use wheelchair or handcycle equipment. Treadmill records count for workouts and goals but not for event credit.',
      'Event Result Rules: Event results may be separated into Finishers and Participants. Finishers must submit qualifying activity and meet any minimum daily or cumulative distance requirements set for the event. Smart watch and sports app imports require approval for event credit.',
      'Event Fees and Payment Handling: Some events may be free, may require club approval, or may require payment before confirmation. Where event fees apply, payment instructions should be communicated clearly through the app or the relevant RunNation-administered process. Bulk-collected event funds may be remitted to the relevant club or independent event organiser through the approved RunNation payment handling workflow.',
      'Admin Decisions: Administrators may approve, reject, edit visibility, remove, or moderate treadmill submissions, event enrollments, shop orders, social posts, comments, reactions, magazine submissions, pictorials, and reported content.',
      'Community Safety: Users must not post abusive, hateful, pornographic, divisive, sectarian, threatening, harassing, disrespectful, illegal, misleading, or unsafe content. Reports may include screenshots and descriptions, and repeat offenders may be flagged, restricted, or banned.',
      'Magazine Rights: You keep ownership of stories, photos, attachments, and external links you submit, but you grant RunNation permission to review, store, edit for formatting, display, promote, and publish accepted submissions inside the App and related RunNation channels.',
      'Service Team Roles: Users may apply for service roles through Join Service Team. Most users may hold only one active admin/service role at a time. Global Admins may hold additional roles for operational setup. Applicants may optionally submit a suitability statement, links, and consent for contact if selected. Rejected role requests must be resubmitted only through the approved process.',
      'Under-18 Service Roles: Users under 18 generally may not take service roles. The Junior Runners Club Coordinator role is the exceptional case because it is specifically designed to support the junior community under RunNation safeguards.',
      'Admin Resignation and Role Removal: Non-Global Admins may request resignation by giving a reason. Such requests remain pending for 12 hours unless a Global Admin acts sooner. Before admin access is removed, RunNation may store a summarized resigned-admin audit record for accountability and dispute resolution.',
      'Club Deletion: A club coordinator may request deletion of a club they created. Clubs without members may be deleted immediately where the App allows it; clubs with members enter a pending deletion process and admin approval leg before final removal.',
      'Donations and Rewards: Donations are voluntary support for RunNation as a startup and may be recorded with amount, payment option, country, and optional remarks. Donation recording does not by itself guarantee payment processing until the selected payment channel is completed. Rewards may be given through community polls, admin causes, Global Admin selection, or outstanding user contribution, and may include sports gear or a free subscription period.',
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
