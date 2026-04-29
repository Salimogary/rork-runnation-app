import { useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Image,
  Platform,
  Linking,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { ADMIN_TERMS_VERSION, getAdminTermsDocReference, getAdminTermsRoleLabel, getAdminTermsSections, type AdminTermsRole } from "@/lib/admin-terms";
import { Package, ChevronRight, Edit, X, ClipboardCheck, LogOut, CheckCircle, XCircle, Calendar, Plus, Users, Download, ShoppingBag, Dumbbell, UserPlus, Upload, Activity, Star, Printer, Truck, MessageSquare, Archive, Trash2, AlertTriangle, ArrowLeft, BookOpen, Camera, FileText, ShieldAlert, Globe2, MapPin } from "lucide-react-native";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode as decodeBase64 } from "base64-arraybuffer";
import { formatCountryList, formatCountryName } from "@/constants/country-utils";

type AdminTab =
  | "orders"
  | "stock"
  | "approvals"
  | "events"
  | "enrollments"
  | "clubRequests"
  | "activityUploads"
  | "externalActivities"
  | "ratings"
  | "suggestions"
  | "magazine"
  | "adminTerms"
  | "roles"
  | "dataHealth"
  | "auditLog"
  | "archive";

type AuditLogUserType = "all" | "country_admin" | "country_coordinator" | "club_coordinator";

interface AuditLogEntry {
  id: string;
  createdAt: string;
  actionType: string;
  actorUserId: string | null;
  actorName: string;
  actorUsername: string | null;
  actorType: string;
  roleNames: string[];
  countryCodes: string[];
  clubIds: string[];
  targetUserId: string | null;
  targetName: string | null;
  targetCountryCode: string | null;
  targetClubId: string | null;
  metadata: Record<string, unknown>;
}

type ManageableRoleName =
  | "country_admin"
  | "country_coordinator"
  | "club_coordinator"
  | "event_organizer";
type EventEntryMode = "free" | "club_approved" | "paid";
type AdminMenuScopeGroup = "global" | "country" | "club";

interface PendingRoleRequest {
  inviteId: string;
  email: string;
  roleName: ManageableRoleName;
  countryCode: string | null;
  countryName: string | null;
  clubId: string | null;
  clubName: string | null;
  organizerId: string | null;
  organizerName: string | null;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  invitedByName: string | null;
}

interface ActiveRoleAssignment {
  assignmentId: number;
  userId: string;
  userName: string;
  username: string | null;
  roleName: ManageableRoleName;
  countryCode: string | null;
  countryName: string | null;
  clubId: string | null;
  clubName: string | null;
  organizerId: string | null;
  organizerName: string | null;
  createdAt: string;
  assignedByName: string | null;
  hasAcceptedTerms: boolean;
  termsAcceptedAt: string | null;
}

interface RoleLookupCountry {
  code: string;
  name: string;
}

interface RoleLookupClub {
  clubId: string;
  clubName: string;
  countryCode: string | null;
}

interface RoleLookupOrganizer {
  organizerId: string;
  organizerName: string;
  registrationId: string | null;
  countryCode: string | null;
  isActive: boolean;
}

interface EventOrganizerRecord {
  organizer_id: string;
  organizer_name: string;
  description: string | null;
  registration_id: string | null;
  country: string | null;
  is_active: boolean;
  created_at: string;
}

interface AccountLinkHealthIssue {
  code: string;
  message: string;
}

interface AccountLinkHealthEntry {
  key: string;
  severity: "critical" | "warning";
  authUserId: string | null;
  profileId: string | null;
  registrationId: string | null;
  provider: string | null;
  authEmail: string | null;
  contactEmail: string | null;
  displayName: string | null;
  username: string | null;
  issueCount: number;
  issues: AccountLinkHealthIssue[];
}

interface AccountLinkHealthSummary {
  authUserCount: number;
  profileCount: number;
  registrationCount: number;
  contactCount: number;
  schemaIssueCount?: number;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
}

type AccountRepairAction = "verify_social_email" | "create_missing_contact" | "sync_usernames";

function getRepairActions(entry: AccountLinkHealthEntry): Array<{ key: AccountRepairAction; label: string }> {
  const issueCodes = new Set(entry.issues.map((issue) => issue.code));
  const actions: Array<{ key: AccountRepairAction; label: string }> = [];

  if (
    entry.provider &&
    (issueCodes.has("registration_email_unverified") || issueCodes.has("contact_email_unverified"))
  ) {
    actions.push({ key: "verify_social_email", label: "Mark Verified" });
  }

  if (entry.authEmail && entry.registrationId && issueCodes.has("missing_contact")) {
    actions.push({ key: "create_missing_contact", label: "Create Contact" });
  }

  if (entry.profileId && entry.registrationId && issueCodes.has("username_mismatch")) {
    actions.push({ key: "sync_usernames", label: "Sync Usernames" });
  }

  return actions;
}

function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getDefaultAuditStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return toDateInputValue(date);
}

interface PendingActivity {
  pending_activity_id: string;
  registration_id: string;
  exercise_type: string;
  distance_entered: number;
  distance_unit: string;
  time_entered: string;
  photo_path: string;
  photoUrl?: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface ClubMembershipRequest {
  registration_id: string;
  club: string | null;
  club_id: string | null;
  club_name: string | null;
  club_country: string | null;
  club_location: string | null;
  new_member: string | null;
  request_type: string | null;
  proposed_club_name: string | null;
  proposed_country: string | null;
  proposed_description: string | null;
  status: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  member: {
    first_name: string | null;
    other_names: string | null;
    username: string | null;
    country: string | null;
    city_town_district: string | null;
  } | null;
}

const EVENT_POSTER_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

function detectMimeTypeFromBase64(base64: string): string | null {
  const normalized = base64.trim();
  if (normalized.startsWith("/9j/")) return "image/jpeg";
  if (normalized.startsWith("iVBORw0KGgo")) return "image/png";
  if (normalized.startsWith("UklGR")) return "image/webp";
  if (normalized.startsWith("AAAAIGZ0eXBhdmlm") || normalized.startsWith("AAAAHGZ0eXBhdmlm")) {
    return "image/avif";
  }
  return null;
}

function resolveEventPosterMimeType(uri: string, mimeType?: string | null): string | null {
  const normalizedMime = mimeType?.toLowerCase() || "";
  if (EVENT_POSTER_ALLOWED_MIME_TYPES.includes(normalizedMime as (typeof EVENT_POSTER_ALLOWED_MIME_TYPES)[number])) {
    return normalizedMime;
  }

  const normalizedUri = uri.toLowerCase().split("?")[0];
  if (normalizedUri.endsWith(".png")) return "image/png";
  if (normalizedUri.endsWith(".webp")) return "image/webp";
  if (normalizedUri.endsWith(".avif")) return "image/avif";
  if (normalizedUri.endsWith(".jpg") || normalizedUri.endsWith(".jpeg")) return "image/jpeg";
  if (normalizedUri.endsWith(".heic") || normalizedUri.endsWith(".heif")) return null;
  return "image/jpeg";
}

async function encodeEventPosterForUpload(
  uri: string,
  mimeType?: string | null
): Promise<{ base64: string; mimeType: string }> {
  const resolvedMimeType = resolveEventPosterMimeType(uri, mimeType);
  if (!resolvedMimeType) {
    throw new Error("Please choose a JPG, PNG, WEBP, or AVIF image.");
  }

  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read the selected poster."));
      reader.readAsDataURL(blob);
    });
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    if (!base64) {
      throw new Error("Could not prepare the selected poster.");
    }
    return {
      base64,
      mimeType: resolvedMimeType,
    };
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: "base64",
  });
  if (!base64) {
    throw new Error("Could not prepare the selected poster.");
  }

  return {
    base64,
    mimeType: resolvedMimeType,
  };
}

function getPosterFileExtension(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("avif")) return "avif";
  return "jpg";
}

function getStandardPosterFileName(mimeType: string): string {
  return `poster.${getPosterFileExtension(mimeType)}`;
}

function extractPosterStoragePath(posterLink: string | null | undefined): string | null {
  if (!posterLink) return null;
  const withoutQuery = posterLink.split("?")[0];
  const marker = "/storage/v1/object/public/event_poster/";
  const index = withoutQuery.indexOf(marker);
  if (index === -1) return null;
  return withoutQuery.slice(index + marker.length);
}

function isStandardPosterStoragePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const fileName = path.split("/").pop()?.toLowerCase() || "";
  return /^poster\.(jpg|jpeg|png|webp|avif)$/.test(fileName);
}

function getNextEventId(events: any[] | undefined): string {
  const numericIds = (events || [])
    .map((event) => Number.parseInt(String(event.event_id || event.eventId || "").replace(/^E/i, ""), 10))
    .filter((value) => Number.isFinite(value));
  const nextNumber = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
  return `E${nextNumber}`;
}

async function uploadEventPosterDirect(params: {
  eventId: string;
  uri: string;
  mimeType?: string | null;
}): Promise<string> {
  const { eventId, uri, mimeType } = params;
  const payload = await encodeEventPosterForUpload(uri, mimeType);
  const posterFileName = getStandardPosterFileName(payload.mimeType);

  const { data: existingFiles, error: listError } = await supabase.storage
    .from("event_poster")
    .list(eventId, {
      limit: 100,
      sortBy: { column: "name", order: "asc" },
    });

  if (listError) {
    throw new Error(listError.message || "Could not inspect existing event posters.");
  }

  const pathsToRemove = (existingFiles || [])
    .filter((file) => file.name)
    .map((file) => `${eventId}/${file.name}`);

  if (pathsToRemove.length > 0) {
    const { error: removeError } = await supabase.storage
      .from("event_poster")
      .remove(pathsToRemove);

    if (removeError) {
      throw new Error(removeError.message || "Could not replace the existing event poster.");
    }
  }

  const filePath = `${eventId}/${posterFileName}`;
  const fileBytes = decodeBase64(payload.base64);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("event_poster")
    .upload(filePath, fileBytes, {
      contentType: payload.mimeType,
      upsert: true,
      cacheControl: "3600",
    });

  if (uploadError || !uploadData) {
    throw new Error(uploadError?.message || "Failed to upload event poster.");
  }

  const { data: publicUrlData } = supabase.storage
    .from("event_poster")
    .getPublicUrl(uploadData.path);

  if (!publicUrlData.publicUrl) {
    throw new Error("Failed to generate event poster URL.");
  }

  return `${publicUrlData.publicUrl}?v=${Date.now()}`;
}

export default function AdminScreen() {
  const router = useRouter();
  const { roleSession, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab | null>(null);
  const [eventsSubTab, setEventsSubTab] = useState<"calendar" | "participants">("calendar");
  const [selectedOrganizerFilter, setSelectedOrganizerFilter] = useState<string>("all");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
  const [showStockModal, setShowStockModal] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [newStock, setNewStock] = useState<string>("");
  const [selectedActivity, setSelectedActivity] = useState<PendingActivity | null>(null);
  const [showActivityModal, setShowActivityModal] = useState<boolean>(false);
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [showOrganizerModal, setShowOrganizerModal] = useState<boolean>(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingOrganizerId, setEditingOrganizerId] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");
  const [eventCountry, setEventCountry] = useState<string>("");
  const [eventOrganizerId, setEventOrganizerId] = useState<string>("");
  const [eventIsVirtual, setEventIsVirtual] = useState<boolean>(false);
  const [eventEntry, setEventEntry] = useState<EventEntryMode>("free");
  const [eventHasMedal, setEventHasMedal] = useState<boolean>(false);
  const [eventEntryFee, setEventEntryFee] = useState<string>("");
  const [eventPaymentDetails, setEventPaymentDetails] = useState<string>("");
  const [organizerNameInput, setOrganizerNameInput] = useState<string>("");
  const [organizerDescriptionInput, setOrganizerDescriptionInput] = useState<string>("");
  const [organizerCountryInput, setOrganizerCountryInput] = useState<string>("");
  const [eventPosterAsset, setEventPosterAsset] = useState<{
    uri: string;
    mimeType?: string | null;
  } | null>(null);
  const [eventPosterPreview, setEventPosterPreview] = useState<string | null>(null);
  const [eventPosterMarkedForRemoval, setEventPosterMarkedForRemoval] = useState<boolean>(false);
  const [medalMinDailyDistance, setMedalMinDailyDistance] = useState<string>("");
  const [medalMinCumulativeDistance, setMedalMinCumulativeDistance] = useState<string>("");
  const [medalDateStart, setMedalDateStart] = useState<string>("");
  const [medalDateEnd, setMedalDateEnd] = useState<string>("");
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState<boolean>(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [auditStartDate, setAuditStartDate] = useState<string>(getDefaultAuditStartDate());
  const [auditEndDate, setAuditEndDate] = useState<string>(toDateInputValue(new Date()));
  const [auditUserType, setAuditUserType] = useState<AuditLogUserType>("all");
  const [isDownloadingAuditLog, setIsDownloadingAuditLog] = useState<boolean>(false);
  const [adminTermsAcceptedChecked, setAdminTermsAcceptedChecked] = useState<boolean>(false);
  const [showRoleModal, setShowRoleModal] = useState<boolean>(false);
  const [editingRoleAssignment, setEditingRoleAssignment] = useState<ActiveRoleAssignment | null>(null);
  const [roleRequestEmail, setRoleRequestEmail] = useState<string>("");
  const [selectedRoleName, setSelectedRoleName] = useState<ManageableRoleName>("country_admin");
  const [selectedRoleCountryCode, setSelectedRoleCountryCode] = useState<string>("");
  const [selectedRoleClubId, setSelectedRoleClubId] = useState<string>("");

  const queryClient = useQueryClient();
  const hasRoleBasedAccess = roleSession.hasAdminAccess;
  const isSuperAdmin = roleSession.isSuperAdmin;
  const isCountryAdmin = roleSession.isCountryAdmin;
  const isCountryCoordinator = roleSession.isCountryCoordinator;
  const isClubCoordinator = roleSession.isClubCoordinator;
  const isEventOrganizer = roleSession.isEventOrganizer;
  const isAuthenticated = hasRoleBasedAccess;
  const isChecking = false;
  const { data: countryList = [] } = trpc.auth.getCountries.useQuery();
  const canUseProtectedAdminRoutes = hasRoleBasedAccess;
  const protectedTabs: AdminTab[] = ["orders", "events", "enrollments", "clubRequests", "activityUploads", "externalActivities", "adminTerms", "roles", "dataHealth", "auditLog"];

  const allowedTabs = useMemo<AdminTab[]>(() => {
    if (isSuperAdmin) {
      return ["orders", "stock", "approvals", "events", "enrollments", "clubRequests", "activityUploads", "externalActivities", "ratings", "suggestions", "magazine", "adminTerms", "roles", "dataHealth", "auditLog", "archive"];
    }
    if (isCountryAdmin) {
      return ["orders", "stock", "events", "enrollments", "clubRequests", "activityUploads", "externalActivities", "magazine", "adminTerms"];
    }
    if (isCountryCoordinator) {
      return ["approvals", "events", "enrollments", "clubRequests", "activityUploads", "externalActivities", "magazine", "adminTerms"];
    }
    if (isClubCoordinator) {
      return ["approvals", "events", "enrollments", "clubRequests", "activityUploads", "externalActivities", "magazine", "adminTerms"];
    }
    if (isEventOrganizer) {
      return ["events", "enrollments", "adminTerms"];
    }
    return [];
  }, [isSuperAdmin, isCountryAdmin, isCountryCoordinator, isClubCoordinator, isEventOrganizer]);

  const adminRoleLabel = useMemo(() => {
  if (isSuperAdmin) return "Global Admin";
    if (isCountryAdmin) return "Country Admin";
    if (isCountryCoordinator) return "Country Coordinator";
    if (isClubCoordinator) return "Club Coordinator";
    if (isEventOrganizer) return "Event Organizer";
    return "Role-Based Admin";
  }, [isSuperAdmin, isCountryAdmin, isCountryCoordinator, isClubCoordinator, isEventOrganizer]);

  const adminTermsRole = useMemo<AdminTermsRole>(() => {
    if (isSuperAdmin) return "global_admin";
    if (isCountryAdmin) return "country_admin";
    if (isCountryCoordinator) return "country_coordinator";
    if (isClubCoordinator) return "club_coordinator";
    return "event_organizer";
  }, [isSuperAdmin, isCountryAdmin, isCountryCoordinator, isClubCoordinator]);
  const adminTermsDocs = useMemo(() => getAdminTermsDocReference(adminTermsRole), [adminTermsRole]);

  const { data: stockProducts, isLoading: stockLoading, error: stockError } = useQuery<any[]>({
    queryKey: ["catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogue")
        .select("*")
        .order("catalogue_item", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: isAuthenticated && activeTab === "stock",
  });

  useEffect(() => {
    if (!user || !hasRoleBasedAccess) {
      router.replace("/admin-login" as any);
    }
  }, [hasRoleBasedAccess, router, user]);

  useEffect(() => {
    if (activeTab && !allowedTabs.includes(activeTab)) {
      setActiveTab(null);
    }
  }, [activeTab, allowedTabs]);

  useEffect(() => {
    if (isEventOrganizer && eventsSubTab === "participants") {
      setEventsSubTab("calendar");
    }
  }, [eventsSubTab, isEventOrganizer]);

  const handleLogout = () => {
    const confirmLogout = async () => {
      router.replace("/settings" as any);
    };

    if (Platform.OS !== 'web') {
      Alert.alert(
        "Leave Admin Portal",
        "Return to the main app?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Leave", style: "destructive", onPress: confirmLogout }
        ]
      );
    } else {
      if (confirm("Return to the main app?")) {
        void confirmLogout();
      }
    }
  };

  const { data: deliveryOrders, isLoading: deliveryOrdersLoading, error: deliveryOrdersError, refetch: refetchDeliveryOrders } = trpc.admin.getDeliveryOrders.useQuery(
    undefined,
    { enabled: canUseProtectedAdminRoutes && activeTab === "orders", retry: 1, refetchOnMount: true }
  );

  const { data: events, isLoading: eventsLoading, error: eventsError, refetch: refetchEvents } = trpc.admin.getEvents.useQuery(
    undefined,
    { 
      enabled: canUseProtectedAdminRoutes,
      retry: 1,
      refetchOnMount: true,
    }
  );

  const { data: eventOrganizers = [] } = trpc.admin.getEventOrganizers.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && activeTab === "events",
    refetchOnMount: true,
  });

  const { data: enrollments, isLoading: enrollmentsLoading, error: enrollmentsError, refetch: refetchEnrollments } = trpc.admin.getEnrollments.useQuery(
    { eventId: undefined },
    { 
      enabled: canUseProtectedAdminRoutes && activeTab === "enrollments",
      refetchOnMount: true,
    }
  );

  const { data: participants, isLoading: participantsLoading, error: participantsError, refetch: refetchParticipants } = trpc.admin.getParticipants.useQuery(
    { eventId: selectedEventId },
    { 
      enabled: canUseProtectedAdminRoutes && activeTab === "events" && eventsSubTab === "participants" && !!selectedEventId,
      refetchOnMount: true,
    }
  );

  const { data: activityUploads, isLoading: activityUploadsLoading, error: activityUploadsError, refetch: refetchActivityUploads } = trpc.admin.getActivityUploads.useQuery(
    undefined,
    { 
      enabled: canUseProtectedAdminRoutes && activeTab === "activityUploads",
      refetchOnMount: true,
    }
  );

  interface AppRating {
    rating_id: number;
    registration_id: string;
    rating: number;
    feedback: string | null;
    created_at: string;
  }

  const { data: appRatings = [], isLoading: ratingsLoading } = useQuery<AppRating[]>({
    queryKey: ['adminAppRatings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_ratings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching app ratings:', error);
        throw error;
      }
      return data || [];
    },
    enabled: isAuthenticated && activeTab === 'ratings',
  });

  interface Suggestion {
    suggestion_id: number;
    registration_id: string;
    suggestion: string;
    created_at: string;
  }

  interface InactiveUser {
    registration_id: string;
    first_name: string | null;
    other_names: string | null;
    created_at: string;
    subscription: number | null;
    lastActivityDate: string | null;
    activityCount: number;
  }

  const { data: inactiveUsers = [], isLoading: archiveLoading, refetch: refetchArchive } = useQuery<InactiveUser[]>({
    queryKey: ['adminArchiveCandidates'],
    queryFn: async () => {
      console.log('[Archive] Fetching inactive expired users...');
      const cutoffDate180 = new Date();
      cutoffDate180.setDate(cutoffDate180.getDate() - 180);
      const cutoff180Str = cutoffDate180.toISOString().split('T')[0];

      const { data: expiredUsers, error: regError } = await supabase
        .from('registrations')
        .select('registration_id, first_name, other_names, created_at, subscription')
        .eq('subscription', 2)
        .lt('created_at', cutoff180Str);

      if (regError) {
        console.error('[Archive] Error fetching expired registrations:', JSON.stringify(regError, null, 2));
        throw new Error(regError.message || JSON.stringify(regError));
      }

      if (!expiredUsers || expiredUsers.length === 0) {
        console.log('[Archive] No expired users found older than 180 days');
        return [];
      }

      console.log('[Archive] Found', expiredUsers.length, 'expired registrations older than 180 days');

      const regIds = expiredUsers.map((u: any) => u.registration_id);

      const { data: activities, error: actError } = await supabase
        .from('activities')
        .select('registration_id, activity_date')
        .in('registration_id', regIds)
        .order('activity_date', { ascending: false });

      if (actError) {
        console.error('[Archive] Error fetching activities:', JSON.stringify(actError, null, 2));
        throw new Error(actError.message || JSON.stringify(actError));
      }

      const activityMap = new Map<string, { lastDate: string; count: number }>();
      (activities || []).forEach((a: any) => {
        const existing = activityMap.get(a.registration_id);
        if (!existing) {
          activityMap.set(a.registration_id, { lastDate: a.activity_date, count: 1 });
        } else {
          existing.count++;
          if (a.activity_date > existing.lastDate) {
            existing.lastDate = a.activity_date;
          }
        }
      });

      const result: InactiveUser[] = [];
      for (const user of expiredUsers) {
        const actInfo = activityMap.get((user as any).registration_id);
        const lastDate = actInfo?.lastDate || null;
        const hasRecentActivity = lastDate && lastDate > cutoff180Str;

        if (!hasRecentActivity) {
          result.push({
            registration_id: (user as any).registration_id,
            first_name: (user as any).first_name,
            other_names: (user as any).other_names,
            created_at: (user as any).created_at,
            subscription: (user as any).subscription,
            lastActivityDate: lastDate,
            activityCount: actInfo?.count || 0,
          });
        }
      }

      console.log('[Archive] Found', result.length, 'users eligible for archiving');
      return result;
    },
    enabled: isAuthenticated && activeTab === 'archive',
  });

  const archiveMutation = useMutation({
    mutationFn: async (registrationIds: string[]) => {
      console.log('[Archive] Archiving activities for', registrationIds.length, 'users');

      for (const regId of registrationIds) {
        const { data: userActivities, error: fetchErr } = await supabase
          .from('activities')
          .select('*')
          .eq('registration_id', regId);

        if (fetchErr) {
          console.error('[Archive] Error fetching activities for', regId, fetchErr);
          throw new Error(`Failed to fetch activities for ${regId}: ${fetchErr.message}`);
        }

        if (userActivities && userActivities.length > 0) {
          const { error: insertErr } = await supabase
            .from('activities_archive')
            .insert(userActivities);

          if (insertErr) {
            console.error('[Archive] Error inserting into archive for', regId, insertErr);
            throw new Error(`Failed to archive activities for ${regId}: ${insertErr.message}`);
          }

          const { error: deleteErr } = await supabase
            .from('activities')
            .delete()
            .eq('registration_id', regId);

          if (deleteErr) {
            console.error('[Archive] Error deleting activities for', regId, deleteErr);
            throw new Error(`Failed to delete archived activities for ${regId}: ${deleteErr.message}`);
          }

          console.log('[Archive] Archived', userActivities.length, 'activities for', regId);
        } else {
          console.log('[Archive] No activities to archive for', regId);
        }
      }

      return registrationIds;
    },
    onSuccess: (archivedIds) => {
      void queryClient.invalidateQueries({ queryKey: ['adminArchiveCandidates'] });
      setSelectedArchiveIds([]);
      setArchiveConfirmVisible(false);
      Alert.alert('Success', `Archived activities for ${archivedIds.length} user(s) successfully.`);
    },
    onError: (error: any) => {
      console.error('[Archive] Archive mutation error:', error);
      Alert.alert('Error', error.message || 'Failed to archive activities');
    },
  });

  const toggleArchiveSelection = (regId: string) => {
    setSelectedArchiveIds(prev =>
      prev.includes(regId) ? prev.filter(id => id !== regId) : [...prev, regId]
    );
  };

  const selectAllArchive = () => {
    if (selectedArchiveIds.length === inactiveUsers.length) {
      setSelectedArchiveIds([]);
    } else {
      setSelectedArchiveIds(inactiveUsers.map(u => u.registration_id));
    }
  };

  const handleArchive = () => {
    if (selectedArchiveIds.length === 0) {
      Alert.alert('No Selection', 'Please select at least one user to archive.');
      return;
    }
    setArchiveConfirmVisible(true);
  };

  const confirmArchive = () => {
    archiveMutation.mutate(selectedArchiveIds);
  };

  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery<Suggestion[]>({
    queryKey: ['adminSuggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suggestions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching suggestions:', error);
        throw error;
      }
      return data || [];
    },
    enabled: isAuthenticated && activeTab === 'suggestions',
  });

  const averageRating = appRatings.length > 0
    ? appRatings.reduce((sum, r) => sum + r.rating, 0) / appRatings.length
    : 0;

  const ratingBreakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: appRatings.filter((r) => r.rating === star).length,
    percentage: appRatings.length > 0
      ? (appRatings.filter((r) => r.rating === star).length / appRatings.length) * 100
      : 0,
  }));

  const { data: externalSubmissions, isLoading: externalSubmissionsLoading } = trpc.activities.getExternalSubmissions.useQuery(
    undefined,
    { 
      enabled: canUseProtectedAdminRoutes && activeTab === "externalActivities",
      refetchOnMount: true,
    }
  );

  const { data: magazineSubmissions = [], isLoading: magazineSubmissionsLoading } = trpc.admin.getMagazineSubmissions.useQuery(
    undefined,
    {
      enabled: canUseProtectedAdminRoutes && activeTab === "magazine",
      refetchOnMount: true,
    }
  );

  const { data: magazinePictorials = [], isLoading: magazinePictorialsLoading } = trpc.admin.getMagazinePictorials.useQuery(
    undefined,
    {
      enabled: canUseProtectedAdminRoutes && activeTab === "magazine",
      refetchOnMount: true,
    }
  );

  const {
    data: clubMembershipRequests = [],
    isLoading: clubMembershipRequestsLoading,
    error: clubMembershipRequestsError,
    refetch: refetchClubMembershipRequests,
  } = trpc.admin.getClubMembershipRequests.useQuery(
    undefined,
    {
      enabled: canUseProtectedAdminRoutes && (activeTab === "clubRequests" || activeTab === null),
      refetchOnMount: true,
    }
  );

  const {
    data: auditLogs = [],
    isLoading: auditLogsLoading,
    error: auditLogsError,
    refetch: refetchAuditLogs,
  } = trpc.admin.getAuditLogs.useQuery(
    {
      startDate: auditStartDate,
      endDate: auditEndDate,
      userType: auditUserType,
    },
    {
      enabled: canUseProtectedAdminRoutes && isSuperAdmin && activeTab === "auditLog",
      refetchOnMount: true,
    }
  );

  const {
    data: roleManagementData,
    isLoading: roleManagementLoading,
    error: roleManagementError,
    refetch: refetchRoleManagement,
  } = trpc.admin.getRoleManagement.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && isSuperAdmin && activeTab === "roles",
    refetchOnMount: true,
  });

  const {
    data: accountLinkHealthData,
    isLoading: accountLinkHealthLoading,
    error: accountLinkHealthError,
    refetch: refetchAccountLinkHealth,
  } = trpc.admin.getAccountLinkHealth.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && isSuperAdmin && activeTab === "dataHealth",
    refetchOnMount: true,
  });

  const {
    data: adminTermsStatus,
    isLoading: adminTermsStatusLoading,
    error: adminTermsStatusError,
    refetch: refetchAdminTermsStatus,
  } = trpc.admin.getAdminTermsStatus.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes,
    refetchOnMount: true,
  });

  const acceptAdminTermsMutation = trpc.admin.acceptAdminTerms.useMutation({
    onSuccess: () => {
      setAdminTermsAcceptedChecked(false);
      void refetchAdminTermsStatus();
      void queryClient.invalidateQueries({ queryKey: ["profileBundle"] });
      Alert.alert("Accepted", "Admin terms saved successfully.");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Could not save your admin terms acceptance.");
    },
  });

  const repairAccountLinkMutation = trpc.admin.repairAccountLink.useMutation({
    onSuccess: (result) => {
      void refetchAccountLinkHealth();
      Alert.alert("Repaired", result.message || "The account issue was repaired.");
    },
    onError: (error) => {
      Alert.alert("Repair Error", error.message || "Could not repair this account issue.");
    },
  });

  const createRoleRequestMutation = trpc.admin.createRoleRequest.useMutation({
    onSuccess: () => {
      void refetchRoleManagement();
      setShowRoleModal(false);
      resetRoleModal();
      Alert.alert("Saved", "Role access request created. You can review it from the pending list.");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Could not create the role request.");
    },
  });

  const approveRoleRequestMutation = trpc.admin.approveRoleRequest.useMutation({
    onSuccess: () => {
      void refetchRoleManagement();
      Alert.alert("Approved", "The role request has been accepted.");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Could not approve the role request.");
    },
  });

  const rejectRoleRequestMutation = trpc.admin.rejectRoleRequest.useMutation({
    onSuccess: () => {
      void refetchRoleManagement();
      Alert.alert("Rejected", "The role request has been rejected.");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Could not reject the role request.");
    },
  });

  const updateRoleAssignmentMutation = trpc.admin.updateRoleAssignment.useMutation({
    onSuccess: () => {
      void refetchRoleManagement();
      setShowRoleModal(false);
      resetRoleModal();
      Alert.alert("Updated", "Role access updated successfully.");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Could not update the role assignment.");
    },
  });

  const deleteRoleAssignmentMutation = trpc.admin.deleteRoleAssignment.useMutation({
    onSuccess: () => {
      void refetchRoleManagement();
      Alert.alert("Deleted", "Role access removed successfully.");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Could not delete the role assignment.");
    },
  });

  const pendingRoleRequests = (roleManagementData?.pendingRequests ?? []) as PendingRoleRequest[];
  const activeRoleAssignments = (roleManagementData?.activeAssignments ?? []) as ActiveRoleAssignment[];
  const roleCountries = (roleManagementData?.countries ?? []) as RoleLookupCountry[];
  const roleClubs = (roleManagementData?.clubs ?? []) as RoleLookupClub[];
  const roleOrganizers = (roleManagementData?.organizers ?? []) as RoleLookupOrganizer[];
  const accountLinkHealthSummary = (accountLinkHealthData?.summary ?? null) as AccountLinkHealthSummary | null;
  const accountLinkHealthIssues = (accountLinkHealthData?.issues ?? []) as AccountLinkHealthEntry[];
  const hasAcceptedAdminTerms = !!adminTermsStatus?.hasAcceptedCurrentVersion;
  const mustAcceptAdminTerms = hasRoleBasedAccess && !adminTermsStatusLoading && !hasAcceptedAdminTerms;

  function resetRoleModal() {
    setEditingRoleAssignment(null);
    setRoleRequestEmail("");
    setSelectedRoleName("country_admin");
    setSelectedRoleCountryCode("");
    setSelectedRoleClubId("");
  }

  function getRoleDisplayName(roleName: ManageableRoleName): string {
    switch (roleName) {
      case "country_admin":
        return "Country Admin";
      case "country_coordinator":
        return "Country Coordinator";
      case "club_coordinator":
        return "Club Coordinator";
      case "event_organizer":
        return "Event Organizer";
      default:
        return roleName;
    }
  }

  function openCreateRoleModal() {
    resetRoleModal();
    setShowRoleModal(true);
  }

  function resetOrganizerModal() {
    setEditingOrganizerId(null);
    setOrganizerNameInput("");
    setOrganizerDescriptionInput("");
    setOrganizerCountryInput("");
  }

  function openEditOrganizerModal(organizer: EventOrganizerRecord) {
    setEditingOrganizerId(organizer.organizer_id);
    setOrganizerNameInput(organizer.organizer_name || "");
    setOrganizerDescriptionInput(organizer.description || "");
    setOrganizerCountryInput(organizer.country || "");
    setShowOrganizerModal(true);
  }

  function handleSaveOrganizer() {
    if (!editingOrganizerId) {
      Alert.alert("Not Ready", "Only existing event organizers can be edited here.");
      return;
    }
    if (!organizerNameInput.trim()) {
      Alert.alert("Missing Name", "Please enter the organizer name.");
      return;
    }

    updateEventOrganizerMutation.mutate({
      organizerId: editingOrganizerId,
      organizerName: organizerNameInput.trim(),
      description: organizerDescriptionInput.trim() || null,
      country: organizerCountryInput.trim() || null,
      isActive: true,
    });
  }

  function handleDeactivateOrganizer(organizer: EventOrganizerRecord) {
    Alert.alert(
      "Deactivate Organizer",
      `Deactivate ${organizer.organizer_name}? They will stop appearing in organizer pickers, but existing event records will keep their organizer reference.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () => deactivateEventOrganizerMutation.mutate({ organizerId: organizer.organizer_id }),
        },
      ]
    );
  }

  function openEditRoleModal(assignment: ActiveRoleAssignment) {
    setEditingRoleAssignment(assignment);
    setRoleRequestEmail(assignment.username ?? assignment.userName);
    setSelectedRoleName(assignment.roleName);
    setSelectedRoleCountryCode(assignment.countryCode ?? "");
    setSelectedRoleClubId(assignment.clubId ?? "");
    setShowRoleModal(true);
  }

  function handleSaveRoleRequest() {
    if (selectedRoleName === "club_coordinator") {
      if (!selectedRoleClubId) {
        Alert.alert("Missing Club", "Please choose a club for this club coordinator role.");
        return;
      }
    } else if (selectedRoleName !== "event_organizer" && !selectedRoleCountryCode.trim()) {
      Alert.alert("Missing Country", "Please choose a country for this country-scoped role.");
      return;
    }

    if (editingRoleAssignment) {
      updateRoleAssignmentMutation.mutate({
        assignmentId: editingRoleAssignment.assignmentId,
        roleName: selectedRoleName,
        countryCode:
          selectedRoleName === "club_coordinator" || selectedRoleName === "event_organizer"
            ? null
            : selectedRoleCountryCode.trim().toUpperCase(),
        clubId: selectedRoleName === "club_coordinator" ? selectedRoleClubId : null,
      });
      return;
    }

    if (!roleRequestEmail.trim()) {
      Alert.alert("Missing User", "Please enter the user's email or username.");
      return;
    }

    createRoleRequestMutation.mutate({
      email: roleRequestEmail.trim(),
      roleName: selectedRoleName,
      countryCode:
        selectedRoleName === "club_coordinator" || selectedRoleName === "event_organizer"
          ? null
          : selectedRoleCountryCode.trim().toUpperCase(),
      clubId: selectedRoleName === "club_coordinator" ? selectedRoleClubId : null,
    });
  }

  const filteredAdminEvents = useMemo(() => {
    const list = (events as any[]) || [];
    if (selectedOrganizerFilter === "all") return list;
    if (selectedOrganizerFilter === "clubs") {
      return list.filter((event) => !event.organizer);
    }
    return list.filter((event) => (event.organizer || "") === selectedOrganizerFilter);
  }, [events, selectedOrganizerFilter]);

  const organizerEventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let clubOwnedCount = 0;
    const list = (events as any[]) || [];

    for (const event of list) {
      const organizerId = String(event.organizer || "").trim();
      if (organizerId) {
        counts.set(organizerId, (counts.get(organizerId) ?? 0) + 1);
      } else {
        clubOwnedCount += 1;
      }
    }

    return {
      total: list.length,
      clubOwnedCount,
      organizerCounts: counts,
    };
  }, [events]);

  useEffect(() => {
    if (mustAcceptAdminTerms) {
      setActiveTab("adminTerms");
    }
  }, [mustAcceptAdminTerms]);

  const pendingClubMembershipRequests = (clubMembershipRequests as ClubMembershipRequest[])
    .filter((request) => (request.status ?? "pending") === "pending");

  const updateMagazineSubmissionStatusMutation = trpc.admin.updateMagazineSubmissionStatus.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazineSubmissions"]] });
      Alert.alert("Updated", "Magazine submission updated.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not update magazine submission.");
    },
  });

  const deleteMagazineSubmissionMutation = trpc.admin.deleteMagazineSubmission.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazineSubmissions"]] });
      Alert.alert("Deleted", "Magazine submission deleted.");
    },
    onError: (error: any) => {
      Alert.alert("Global Admin Required", error.message || "Only global admins can delete magazine submissions.");
    },
  });

  const updateMagazinePictorialStatusMutation = trpc.admin.updateMagazinePictorialStatus.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazinePictorials"]] });
      Alert.alert("Updated", "Event pictorial updated.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not update pictorial.");
    },
  });

  const setPictureOfWeekMutation = trpc.admin.setPictureOfWeek.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazinePictorials"]] });
      Alert.alert("Featured", "Picture of the Week has been selected.");
    },
    onError: (error: any) => {
      Alert.alert("Permission Required", error.message || "Could not set Picture of the Week.");
    },
  });

  const deleteMagazinePictorialMutation = trpc.admin.deleteMagazinePictorial.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazinePictorials"]] });
      Alert.alert("Deleted", "Event pictorial deleted.");
    },
    onError: (error: any) => {
      Alert.alert("Global Admin Required", error.message || "Only global admins can delete pictorials.");
    },
  });

  const updateClubMembershipRequestMutation = trpc.admin.updateClubMembershipRequest.useMutation({
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getClubMembershipRequests"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEventOrganizers"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getRoleManagement"]] });
      Alert.alert(
        variables.status === "approved" ? "Approved" : "Rejected",
        variables.status === "approved"
          ? data?.requestType === "event_organizer"
            ? data?.roleAssigned
              ? "Request approved. Organizer profile created and admin access assigned."
              : data?.organizerCreated
                ? "Request approved. Organizer profile created."
                : "Request approved."
            : "Request approved."
          : "Request rejected."
      );
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not update request.");
    },
  });

  const updateEventApprovalMutation = trpc.admin.updateEventApproval.useMutation({
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEvents"]] });
      Alert.alert(
        data.status === "approved" ? "Approved" : "Rejected",
        data.status === "approved"
          ? "Organizer event approved and now live."
          : "Organizer event rejected. It will stay hidden from the public event list."
      );
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not update the event approval status.");
    },
  });



  useEffect(() => {
    if (eventsError) {
      console.error("[AdminScreen] Error fetching events:", eventsError);
      console.error("[AdminScreen] Error message:", eventsError.message);
      console.error("[AdminScreen] Error data:", eventsError.data);
      console.error("[AdminScreen] Error code:", eventsError.data?.code);
      console.error("[AdminScreen] Full error:", JSON.stringify({
        message: eventsError.message,
        data: eventsError.data,
        shape: eventsError.shape,
      }, null, 2));
    }
  }, [eventsError]);

  useEffect(() => {
    if (events) {
      console.log("[AdminScreen] Events loaded successfully:", events);
    }
  }, [events]);

const { data: pendingActivities = [], error: pendingActivitiesError, isLoading: pendingActivitiesLoading } = trpc.admin.getPendingActivities.useQuery(
    undefined,
    { enabled: isAuthenticated && activeTab === "approvals", refetchOnMount: true }
  );

  const approveMutation = trpc.admin.approvePendingActivity.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getPendingActivities"]] });
      setSelectedActivity(null);
      setShowActivityModal(false);
      Alert.alert("Approved", "Activity approved and added to the records.");
    },
    onError: (error: any) => {
      console.error("Error approving activity:", error);
      Alert.alert("Error", error.message || "Failed to approve activity");
    },
  });

  const rejectMutation = trpc.admin.rejectPendingActivity.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getPendingActivities"]] });
      setSelectedActivity(null);
      setShowActivityModal(false);
      Alert.alert("Rejected", "Activity rejected.");
    },
    onError: (error: any) => {
      console.error("Error rejecting activity:", error);
      Alert.alert("Error", error.message || "Failed to reject activity");
    },
  });

  const updateDeliveryStatusMutation = trpc.admin.updateDeliveryOrderStatus.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getDeliveryOrders"]] });
      setShowStatusModal(false);
      Alert.alert("Updated", "Order status updated.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update order status");
    },
  });

  const updateStockMutation = trpc.admin.updateStock.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["catalogue"]] });
      setShowStockModal(false);
      Alert.alert("Updated", "Stock updated successfully.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update stock");
    },
  });

  const addEventMutation = trpc.admin.addEvent.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEvents"]] });
      resetEventModal();
      Alert.alert("Created", "Event added successfully.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to add event");
    },
  });

  const updateEventMutation = trpc.admin.updateEvent.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEvents"]] });
      resetEventModal();
      Alert.alert("Updated", "Event updated successfully.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update event");
    },
  });

  const approveEnrollmentMutation = trpc.admin.approveEnrollment.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEnrollments"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getParticipants"]] });
      Alert.alert("Approved", "Participant added to the event.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to approve the enrollment.");
    },
  });

  const rejectEnrollmentMutation = trpc.admin.rejectEnrollment.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEnrollments"]] });
      Alert.alert("Rejected", "Enrollment removed from the queue.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to reject the enrollment.");
    },
  });

  const markEnrollmentPaidMutation = trpc.admin.markEnrollmentPaid.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEnrollments"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getParticipants"]] });
      Alert.alert("Payment Confirmed", "The user has been moved to the participant list.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to confirm payment.");
    },
  });

  const updateEventOrganizerMutation = trpc.admin.updateEventOrganizer.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEventOrganizers"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEvents"]] });
      setShowOrganizerModal(false);
      resetOrganizerModal();
      Alert.alert("Updated", "Event organizer updated successfully.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not update the event organizer.");
    },
  });

  const deactivateEventOrganizerMutation = trpc.admin.deactivateEventOrganizer.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEventOrganizers"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEvents"]] });
      Alert.alert("Removed", "Event organizer deactivated.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not deactivate the event organizer.");
    },
  });

const handleUpdateOrderStatus = (orderId: string, status: string) => {
    setSelectedOrderId(orderId);
    setSelectedStatus(status);
    setShowStatusModal(true);
  };

  const confirmStatusUpdate = () => {
    if (!selectedOrderId || !selectedStatus) return;

    updateDeliveryStatusMutation.mutate({
      orderId: selectedOrderId,
      status: selectedStatus as any,
    });
  };

  const handlePrintSticker = (order: any) => {
    const items = order.items || [];
    const itemLines = items.map((item: any) => `${item.name}${item.size ? ` (${item.size})` : ''} x${item.qty}`).join('\n');
    const orderCountry = formatCountryName(order.country || order.country_code);
    const stickerContent = [
      '================================',
      '       DELIVERY STICKER',
      '================================',
      '',
      `Order #: ${(order.order_id || '').substring(0, 8)}`,
      `Date: ${new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      '',
      '--- DELIVER TO ---',
      `Phone: ${order.phone_number || 'N/A'}`,
      `Address: ${order.delivery_address || 'N/A'}`,
      ...(orderCountry ? [`Country: ${orderCountry}`] : []),
      '',
      '--- DELIVERY TIME ---',
      order.delivery_time_slots || 'N/A',
      '',
      '--- ITEMS ---',
      itemLines || 'No items',
      '',
      `TOTAL: ugx.${(order.total_amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      '',
      '================================',
    ].join('\n');

    if (Platform.OS === 'web') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const itemsHtml = items.map((item: any) =>
          `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${item.name}${item.size ? ` (${item.size})` : ''}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;">x${item.qty}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">ugx.${(item.subtotal || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td></tr>`
        ).join('');
        printWindow.document.write(`
          <html><head><title>Delivery Sticker</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
            .sticker { border: 2px dashed #333; padding: 20px; border-radius: 8px; }
            .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .section-title { font-weight: bold; font-size: 13px; color: #666; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 1px; }
            .field { margin: 4px 0; font-size: 15px; }
            .field-label { color: #666; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin: 8px 0; }
            .total { font-size: 20px; font-weight: bold; text-align: right; margin-top: 12px; padding-top: 10px; border-top: 2px solid #333; }
            .order-id { font-size: 12px; color: #888; text-align: center; margin-bottom: 8px; }
            @media print { body { padding: 0; } }
          </style></head><body>
          <div class="sticker">
            <div class="header">DELIVERY STICKER</div>
            <div class="order-id">Order #${(order.order_id || '').substring(0, 8)} &bull; ${new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div class="section-title">Deliver To</div>
            <div class="field"><span class="field-label">Phone:</span> ${order.phone_number || 'N/A'}</div>
            <div class="field"><span class="field-label">Address:</span> ${order.delivery_address || 'N/A'}</div>
            ${orderCountry ? `<div class="field"><span class="field-label">Country:</span> ${orderCountry}</div>` : ''}
            <div class="section-title">Delivery Time</div>
            <div class="field">${order.delivery_time_slots || 'N/A'}</div>
            <div class="section-title">Items</div>
            <table>${itemsHtml}</table>
            <div class="total">TOTAL: ugx.${(order.total_amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
          </div>
          <script>window.onload = function() { window.print(); }</script>
          </body></html>
        `);
        printWindow.document.close();
      }
    } else {
      Alert.alert(
        'Delivery Sticker',
        stickerContent,
        [{ text: 'OK' }]
      );
    }
  };

  const handleUpdateStock = (product: any) => {
    setSelectedProduct(product);
    setNewStock(String(product.Quanity || 0));
    setShowStockModal(true);
  };

  const confirmStockUpdate = () => {
    if (!selectedProduct) return;
    const stockValue = parseInt(newStock, 10);

    if (isNaN(stockValue) || stockValue < 0) {
      Alert.alert("Invalid Stock", "Please enter a valid stock quantity");
      return;
    }

    updateStockMutation.mutate({
      catalogueId: selectedProduct.catalogue_id,
      quantity: stockValue,
    });
  };

  const resetEventModal = () => {
    setShowEventModal(false);
    setEditingEventId(null);
    setEventName("");
    setStartsAt("");
    setEndsAt("");
    setEventCountry("");
    setEventOrganizerId(isEventOrganizer ? roleSession.eventOrganizerScopes[0] ?? "" : "");
    setEventIsVirtual(false);
    setEventEntry("free");
    setEventHasMedal(false);
    setEventEntryFee("");
    setEventPaymentDetails("");
    setEventPosterAsset(null);
    setEventPosterPreview(null);
    setEventPosterMarkedForRemoval(false);
    setMedalMinDailyDistance("");
    setMedalMinCumulativeDistance("");
    setMedalDateStart("");
    setMedalDateEnd("");
  };

  const handleOpenAddEvent = () => {
    resetEventModal();
    setShowEventModal(true);
  };

  const resolvedEventCurrencyCode = useMemo(() => {
    const rawCountry = eventCountry.trim().toLowerCase();
    if (!rawCountry) return "";
    const matchedCountry = (countryList as Array<any>).find((country) => {
      return (
        String(country.iso_alpha2 || "").trim().toLowerCase() === rawCountry ||
        String(country.name || "").trim().toLowerCase() === rawCountry
      );
    });
    return String(matchedCountry?.currency_code || "").trim().toUpperCase();
  }, [countryList, eventCountry]);

  const handleAddEvent = async () => {
    if (!eventName.trim() || !startsAt.trim() || !endsAt.trim()) {
      Alert.alert("Missing Details", "Please enter the event name, start date, and end date.");
      return;
    }
    if (!eventOrganizerId) {
      Alert.alert("Missing Organizer", "Please choose the event organizer for this event.");
      return;
    }
    if (eventEntry === "paid" && !eventPaymentDetails.trim()) {
      Alert.alert("Missing Payment Details", "Please explain how payment for this event should be handled.");
      return;
    }
    if (eventEntry === "paid" && !eventEntryFee.trim()) {
      Alert.alert("Missing Entry Fee", "Please enter the paid event fee.");
      return;
    }

    const numericEntryFee =
      eventEntry === "paid" ? Number.parseFloat(eventEntryFee.replace(/,/g, "").trim()) : undefined;
    if (
      eventEntry === "paid" &&
      (numericEntryFee === undefined || !Number.isFinite(numericEntryFee) || numericEntryFee < 0)
    ) {
      Alert.alert("Invalid Entry Fee", "Please enter a valid numeric fee for this paid event.");
      return;
    }

    let directPosterLink: string | null | undefined = undefined;
    const currentPosterPath = extractPosterStoragePath(eventPosterPreview);
    const shouldNormalizeExistingPoster =
      Boolean(
        editingEventId &&
        !eventPosterAsset &&
        !eventPosterMarkedForRemoval &&
        eventPosterPreview?.startsWith("http") &&
        currentPosterPath &&
        !isStandardPosterStoragePath(currentPosterPath)
      );
    if (eventPosterAsset?.uri) {
      try {
        const targetEventId = editingEventId || getNextEventId(events as any[] | undefined);
        directPosterLink = await uploadEventPosterDirect({
          eventId: targetEventId,
          uri: eventPosterAsset.uri,
          mimeType: eventPosterAsset.mimeType,
        });
      } catch (error: any) {
        Alert.alert("Poster Error", error?.message || "Could not prepare the selected poster.");
        return;
      }
    } else if (eventPosterMarkedForRemoval) {
      directPosterLink = null;
    }

    const payload = {
      eventName: eventName.trim(),
      startsAt,
      endsAt,
      country: eventCountry.trim() || undefined,
      organizerId: eventOrganizerId || null,
      isVirtual: eventIsVirtual,
      entry: eventEntry,
      entryFee: eventEntry === "paid" ? numericEntryFee : undefined,
      hasMedal: eventHasMedal,
      paymentDetails: eventEntry === "paid" ? eventPaymentDetails.trim() || undefined : undefined,
      medalMinDailyDistance: eventHasMedal && medalMinDailyDistance ? parseFloat(medalMinDailyDistance) : undefined,
      medalMinCumulativeDistance: eventHasMedal && medalMinCumulativeDistance ? parseFloat(medalMinCumulativeDistance) : undefined,
      medalDateStart: eventHasMedal ? medalDateStart || undefined : undefined,
      medalDateEnd: eventHasMedal ? medalDateEnd || undefined : undefined,
      posterLink: directPosterLink ?? (shouldNormalizeExistingPoster ? eventPosterPreview : undefined),
      clearPoster: eventPosterMarkedForRemoval && !eventPosterAsset,
      posterBase64: null,
      posterMimeType: null,
    };

    if (editingEventId) {
      updateEventMutation.mutate({
        eventId: editingEventId,
        ...payload,
      });
      return;
    }

    addEventMutation.mutate(payload);
  };

  const handleEditEvent = (event: any) => {
    setEditingEventId(event.event_id || event.eventId);
    setEventName(event.event_name || event.eventName || "");
    setStartsAt(String(event.starts_at || event.startsAt || "").slice(0, 10));
    setEndsAt(String(event.ends_at || event.endsAt || "").slice(0, 10));
    setEventCountry(event.country || "");
    setEventOrganizerId(event.organizer || "");
    setEventIsVirtual(Boolean(event.is_virtual ?? event.isVirtual));
    setEventEntry((event.entry as EventEntryMode) || "free");
    setEventHasMedal(Boolean(event.has_medal ?? event.hasMedal));
    setEventEntryFee(
      event.entry_fee !== null && event.entry_fee !== undefined
        ? String(event.entry_fee)
        : event.entryFee !== null && event.entryFee !== undefined
        ? String(event.entryFee)
        : ""
    );
    setEventPaymentDetails(event.payment_details || event.paymentDetails || "");
    setEventPosterAsset(null);
    setEventPosterPreview(event.poster_link || event.posterLink || null);
    setEventPosterMarkedForRemoval(false);
    setMedalMinDailyDistance(
      event.medal_min_daily_distance !== null && event.medal_min_daily_distance !== undefined
        ? String(event.medal_min_daily_distance)
        : ""
    );
    setMedalMinCumulativeDistance(
      event.medal_min_cumulative_distance !== null && event.medal_min_cumulative_distance !== undefined
        ? String(event.medal_min_cumulative_distance)
        : ""
    );
    setMedalDateStart(event.medal_date_start ? String(event.medal_date_start).slice(0, 10) : "");
    setMedalDateEnd(event.medal_date_end ? String(event.medal_date_end).slice(0, 10) : "");
    setShowEventModal(true);
  };

  const handlePickEventPoster = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: false,
      quality: 1,
      base64: Platform.OS === "web",
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    try {
      const resolvedMimeType = resolveEventPosterMimeType(asset.uri, asset.mimeType);
      if (!resolvedMimeType) {
        Alert.alert("Unsupported Poster", "Please choose a JPG, PNG, WEBP, or AVIF image.");
        return;
      }
      setEventPosterAsset({
        uri: asset.uri,
        mimeType: resolvedMimeType,
      });
      setEventPosterPreview(asset.uri);
      setEventPosterMarkedForRemoval(false);
    } catch (error: any) {
      Alert.alert("Poster Error", error?.message || "Could not prepare the selected poster.");
      return;
    }
  };

  const handleRemoveEventPoster = async () => {
    if (!editingEventId) {
      setEventPosterAsset(null);
      setEventPosterPreview(null);
      setEventPosterMarkedForRemoval(false);
      return;
    }

    try {
      const { data: existingFiles, error: listError } = await supabase.storage
        .from("event_poster")
        .list(editingEventId, {
          limit: 100,
          sortBy: { column: "name", order: "asc" },
        });

      if (listError) {
        throw new Error(listError.message || "Could not inspect existing event poster files.");
      }

      const pathsToRemove = (existingFiles || [])
        .filter((file) => file.name)
        .map((file) => `${editingEventId}/${file.name}`);

      if (pathsToRemove.length > 0) {
        const { error: removeError } = await supabase.storage
          .from("event_poster")
          .remove(pathsToRemove);

        if (removeError) {
          throw new Error(removeError.message || "Could not remove the current event poster.");
        }
      }

      setEventPosterAsset(null);
      setEventPosterPreview(null);
      setEventPosterMarkedForRemoval(true);
      Alert.alert("Poster Removed", "The current poster will be cleared when you save the event.");
    } catch (error: any) {
      Alert.alert("Poster Error", error?.message || "Could not remove the current poster.");
    }
  };

  const handleOpenPosterUrl = async (posterUrl: string | null) => {
    if (!posterUrl) {
      Alert.alert("No Poster", "There is no poster URL to open.");
      return;
    }

    try {
      await Linking.openURL(posterUrl);
    } catch (error: any) {
      Alert.alert("Open Poster", error?.message || "Could not open the poster URL.");
    }
  };

  const handleFileDownload = (upload: any) => {
    try {
      console.log("[Download] Starting download for:", upload.fileName);
      console.log("[Download] File path:", upload.filePath);
      
      const downloadUrl = upload.downloadUrl || upload.filePath;
      if (!downloadUrl) {
        Alert.alert("Error", "File URL not available");
        return;
      }

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = upload.fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        Alert.alert("Download Started", "Your file download has started.");
      } else {
        Alert.alert(
          "Download File",
          `File: ${upload.fileName}\nUser: ${upload.userName}\nEmail: ${upload.email}\n\nURL: ${downloadUrl}\n\nCopy the URL above to download the file on your device.`,
          [{ text: "OK" }]
        );
      }
    } catch (error: any) {
      console.error("[Download] Error:", error);
        Alert.alert("Download Error", error.message || "Could not download the file.");
    }
  };

  const handleRepairAccountLink = (entry: AccountLinkHealthEntry, action: AccountRepairAction) => {
    const actionLabel =
      action === "verify_social_email"
        ? "mark this social sign-in email as verified"
        : action === "create_missing_contact"
        ? "create the missing contact row from the auth email"
        : "sync profile and registration usernames";

    Alert.alert(
      "Confirm Repair",
      `Do you want to ${actionLabel}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () =>
            repairAccountLinkMutation.mutate({
              action,
              authUserId: entry.authUserId,
              profileId: entry.profileId,
              registrationId: entry.registrationId,
            }),
        },
      ]
    );
  };

const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "#f59e0b";
      case "processing":
        return "#3b82f6";
      case "shipped":
        return "#8b5cf6";
      case "delivered":
        return "#10b981";
      case "cancelled":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getEventEntryLabel = (entry?: string | null): string => {
    switch (entry) {
      case "club_approved":
        return "Club Approved";
      case "paid":
        return "Paid";
      default:
        return "Free";
    }
  };

  const getEventOrganizerLabel = (event: any): string => {
    if (event.organizer_name || event.organizerName) {
      return String(event.organizer_name || event.organizerName);
    }
    if (event.organizer) {
      return String(event.organizer);
    }
    return "RunNation";
  };

  const getEnrollmentStatusLabel = (status?: string | null): string => {
    switch (status) {
      case "awaiting_payment":
        return "Awaiting Payment";
      case "pending":
        return "Pending Approval";
      default:
        return getStatusLabel(status || "pending");
    }
  };

  const getEnrollmentStatusColor = (status?: string | null): string => {
    switch (status) {
      case "awaiting_payment":
        return "#0ea5e9";
      case "pending":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  const getEventApprovalLabel = (status?: string | null): string => {
    switch (status) {
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      case "pending":
      default:
        return "Pending Review";
    }
  };

  const getEventApprovalColor = (status?: string | null): string => {
    switch (status) {
      case "approved":
        return "#10b981";
      case "rejected":
        return "#dc2626";
      case "pending":
      default:
        return "#f59e0b";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const formatTimeInterval = (interval: string): string => {
    const parts = interval.split(':');
    const hours = parseInt(parts[0] || '0', 10);
    const minutes = parseInt(parts[1] || '0', 10);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatAuditAction = (actionType: string): string =>
    actionType
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const getAuditMetadataSummary = (metadata: Record<string, unknown> | null | undefined): string => {
    if (!metadata || Object.keys(metadata).length === 0) return "No metadata";
    return Object.entries(metadata)
      .slice(0, 4)
      .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
      .join(" / ");
  };

  const csvEscape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const handleDownloadAuditLog = async () => {
    const entries = auditLogs as AuditLogEntry[];

    if (entries.length === 0) {
      Alert.alert("No Data", "There are no audit log entries for the selected date range.");
      return;
    }

    setIsDownloadingAuditLog(true);
    try {
      const headers = [
        "Date",
        "User Type",
        "Admin Name",
        "Username",
        "Action",
        "Target User",
        "Target Country",
        "Target Club",
        "Metadata",
      ];
      const rows = entries.map((entry) => [
        entry.createdAt,
        entry.actorType,
        entry.actorName,
        entry.actorUsername ?? "",
        formatAuditAction(entry.actionType),
        entry.targetName ?? entry.targetUserId ?? "",
        formatCountryName(entry.targetCountryCode) ?? formatCountryList(entry.countryCodes).join("|"),
        entry.targetClubId ?? entry.clubIds.join("|"),
        JSON.stringify(entry.metadata ?? {}),
      ]);
      const csvContent = [headers, ...rows]
        .map((row) => row.map(csvEscape).join(","))
        .join("\n");
      const fileName = `audit_log_${auditUserType}_${auditStartDate}_to_${auditEndDate}.csv`;

      if (Platform.OS === "web") {
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const { File: FSFile, Paths: FSPaths } = await import("expo-file-system/next");
        const file = new FSFile(FSPaths.cache, fileName);
        file.write(csvContent);
        const sharingModule = await import("expo-sharing");
        await sharingModule.shareAsync(file.uri, {
          mimeType: "text/csv",
          dialogTitle: "Save Audit Log CSV",
          UTI: "public.comma-separated-values-text",
        });
      }
    } catch (error: any) {
      console.error("[AuditLog] Export failed:", error);
      Alert.alert("Export Error", error.message || "Could not export the audit log.");
    } finally {
      setIsDownloadingAuditLog(false);
    }
  };

  if (isChecking) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  const getTabTitle = (tab: typeof activeTab): string => {
    switch (tab) {
      case "orders": return "Orders";
      case "stock": return "Stock";
      case "approvals": return "Treadmill";
      case "events": return "Events";
      case "enrollments": return "Enrollments";
      case "clubRequests": return "Club & Organiser Requests";
      case "activityUploads": return "Activity Uploads";
      case "externalActivities": return "External Activities";
      case "ratings": return "Ratings";
      case "suggestions": return "Suggestions";
      case "magazine": return "Magazine";
      case "adminTerms": return "Admin Terms";
      case "roles": return "Role Access";
      case "dataHealth": return "Data Health";
      case "auditLog": return "Audit Log";
      case "archive": return "Archive";
      default: return "Admin Dashboard";
    }
  };

  const menuItems: {
    key: AdminTab;
    label: string;
    icon: React.ReactNode;
    badgeCount?: number;
  }[] = [
    { key: "orders", label: "Orders", icon: <ShoppingBag size={24} color="#10b981" /> },
    { key: "stock", label: "Stock", icon: <Package size={24} color="#10b981" /> },
    { key: "approvals", label: "Treadmill", icon: <Dumbbell size={24} color="#10b981" />, badgeCount: pendingActivities.length },
    { key: "events", label: "Events", icon: <Calendar size={24} color="#10b981" /> },
    { key: "enrollments", label: "Enrollments", icon: <UserPlus size={24} color="#10b981" /> },
    { key: "clubRequests", label: "Club & Organiser Requests", icon: <Users size={24} color="#10b981" />, badgeCount: pendingClubMembershipRequests.length },
    { key: "activityUploads", label: "Activity Uploads", icon: <Upload size={24} color="#10b981" /> },
    { key: "externalActivities", label: "External Activities", icon: <Activity size={24} color="#10b981" />, badgeCount: externalSubmissions?.length || 0 },
    { key: "ratings", label: "Ratings", icon: <Star size={24} color="#10b981" />, badgeCount: appRatings.length },
    { key: "suggestions", label: "Suggestions", icon: <MessageSquare size={24} color="#10b981" />, badgeCount: suggestions.length },
    { key: "magazine", label: "Magazine", icon: <BookOpen size={24} color="#10b981" />, badgeCount: magazineSubmissions.length + magazinePictorials.length },
    { key: "adminTerms", label: "Admin Terms", icon: <ClipboardCheck size={24} color="#10b981" /> },
    { key: "roles", label: "Roles", icon: <UserPlus size={24} color="#10b981" />, badgeCount: pendingRoleRequests.length },
    { key: "dataHealth", label: "Data Health", icon: <ShieldAlert size={24} color="#10b981" />, badgeCount: accountLinkHealthSummary?.issueCount ?? 0 },
    { key: "auditLog", label: "Audit Log", icon: <FileText size={24} color="#10b981" />, badgeCount: (auditLogs as AuditLogEntry[]).length },
    { key: "archive", label: "Archive", icon: <Archive size={24} color="#10b981" /> },
  ];

  const visibleMenuItems = useMemo(() => {
    const priorityByRole: Record<string, AdminTab[]> = {
      super_admin: [
        "roles",
        "dataHealth",
        "auditLog",
        "orders",
        "events",
        "stock",
        "approvals",
        "enrollments",
        "clubRequests",
        "activityUploads",
        "externalActivities",
        "magazine",
        "suggestions",
        "ratings",
        "adminTerms",
        "archive",
      ],
      country_admin: [
        "orders",
        "stock",
        "events",
        "enrollments",
        "clubRequests",
        "activityUploads",
        "externalActivities",
        "magazine",
        "adminTerms",
      ],
      country_coordinator: [
        "approvals",
        "events",
        "enrollments",
        "clubRequests",
        "activityUploads",
        "externalActivities",
        "magazine",
        "adminTerms",
      ],
      club_coordinator: [
        "approvals",
        "events",
        "enrollments",
        "clubRequests",
        "activityUploads",
        "externalActivities",
        "magazine",
        "adminTerms",
      ],
      event_organizer: [
        "events",
        "enrollments",
        "adminTerms",
      ],
    };

    const roleKey = isSuperAdmin
      ? "super_admin"
      : isCountryAdmin
      ? "country_admin"
      : isCountryCoordinator
      ? "country_coordinator"
      : isClubCoordinator
      ? "club_coordinator"
      : isEventOrganizer
      ? "event_organizer"
      : "super_admin";

    const orderedTabs = priorityByRole[roleKey] ?? [];
    const orderIndex = new Map(orderedTabs.map((tab, index) => [tab, index]));

    return menuItems
      .filter((item) => allowedTabs.includes(item.key))
      .sort((a, b) => {
        const aIndex = orderIndex.get(a.key) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = orderIndex.get(b.key) ?? Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.label.localeCompare(b.label);
      });
  }, [
    allowedTabs,
    isSuperAdmin,
    isCountryAdmin,
    isCountryCoordinator,
    isClubCoordinator,
    isEventOrganizer,
  ]);

  const getMenuScopeGroup = (tab: AdminTab): AdminMenuScopeGroup => {
    if (["roles", "dataHealth", "auditLog", "ratings", "suggestions", "archive"].includes(tab)) {
      return "global";
    }
    if (["orders", "stock"].includes(tab)) {
      return "country";
    }
    return "club";
  };

  const groupedMenuSections = useMemo(() => {
    if (!isSuperAdmin && !isCountryAdmin) {
      return [];
    }

    const enabledGroups: AdminMenuScopeGroup[] = isSuperAdmin
      ? ["global", "country", "club"]
      : ["country", "club"];

    return enabledGroups
      .map((group) => ({
        key: group,
        title: group === "global" ? "Global Admin" : group === "country" ? "Country" : "Club",
        items: visibleMenuItems.filter((item) => getMenuScopeGroup(item.key) === group),
      }))
      .filter((section) => section.items.length > 0);
  }, [isSuperAdmin, isCountryAdmin, visibleMenuItems]);

  const renderAdminTermsContent = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      <View style={styles.auditFilterCard}>
        <View style={styles.auditFilterHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.auditFilterTitle}>Admin Terms and Conditions</Text>
            <View style={styles.organizerTermsPill}>
              <Text style={styles.organizerTermsPillText}>{getAdminTermsRoleLabel(adminTermsRole)}</Text>
            </View>
            <Text style={styles.auditFilterSubtitle}>
              Version {ADMIN_TERMS_VERSION}
              {adminTermsStatus?.acceptedAt ? ` • Accepted ${formatDate(adminTermsStatus.acceptedAt)}` : ""}
            </Text>
          </View>
          {adminTermsStatusError ? (
            <TouchableOpacity style={styles.retryButton} onPress={() => refetchAdminTermsStatus()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.auditLogCard}>
        <Text style={styles.auditLogAction}>Docs Reference</Text>
        <View style={styles.auditLogDetails}>
          <Text style={styles.auditMetadata}>Index: docs/{adminTermsDocs.indexDoc}</Text>
          <Text style={styles.auditMetadata}>Role file: docs/{adminTermsDocs.roleDoc}</Text>
        </View>
      </View>

      {getAdminTermsSections(adminTermsRole).map((section) => (
        <View key={section.title} style={styles.auditLogCard}>
          <Text style={styles.auditLogAction}>{section.title}</Text>
          <View style={styles.auditLogDetails}>
            {section.body.map((paragraph) => (
              <Text key={paragraph} style={styles.auditMetadata}>
                {paragraph}
              </Text>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.auditLogCard}>
        <Text style={styles.auditLogAction}>Acceptance</Text>
        <TouchableOpacity
          style={styles.roleAcceptanceRow}
          onPress={() => setAdminTermsAcceptedChecked((value) => !value)}
          disabled={hasAcceptedAdminTerms}
        >
          <View style={[styles.archiveCheckbox, (adminTermsAcceptedChecked || hasAcceptedAdminTerms) && styles.archiveCheckboxSelected]}>
            {(adminTermsAcceptedChecked || hasAcceptedAdminTerms) ? <CheckCircle size={18} color="#fff" /> : null}
          </View>
          <Text style={styles.roleAcceptanceText}>
            I have read and accept the RunNation Admin Terms and Conditions.
          </Text>
        </TouchableOpacity>
        {!hasAcceptedAdminTerms ? (
          <View style={styles.submissionActions}>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => {
                setAdminTermsAcceptedChecked(false);
                router.replace("/settings" as any);
              }}
            >
              <XCircle size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.approveButton, (!adminTermsAcceptedChecked || acceptAdminTermsMutation.isPending) && styles.disabledButton]}
              disabled={!adminTermsAcceptedChecked || acceptAdminTermsMutation.isPending}
              onPress={() => acceptAdminTermsMutation.mutate()}
            >
              <CheckCircle size={18} color="#fff" />
              <Text style={styles.actionButtonText}>
                {acceptAdminTermsMutation.isPending ? "Saving..." : "Accept"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.eventPosterHint}>
            Accepted admins can continue using the portal. This acceptance is also counted in profile completion.
          </Text>
        )}
      </View>
    </ScrollView>
  );

  if (!isAuthenticated) {
    return null;
  }

  if (activeTab && protectedTabs.includes(activeTab) && !hasRoleBasedAccess) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: getTabTitle(activeTab),
            headerLeft: () => (
              <TouchableOpacity onPress={() => setActiveTab(null)} style={{ marginLeft: 8, padding: 4 }}>
                <ArrowLeft size={24} color="#111827" />
              </TouchableOpacity>
            ),
            headerRight: () => (
              <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
                <LogOut size={22} color="#ef4444" />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={styles.emptyContainer}>
          <AlertTriangle size={56} color="#f59e0b" />
          <Text style={styles.errorText}>RBAC Sign-In Required</Text>
          <Text style={styles.errorSubtext}>
            This admin section now requires a Supabase-authenticated admin account with an active role assignment.
          </Text>
          <Text style={styles.errorHint}>
            Sign in through the admin screen using your admin email and password to access protected tools during the migration.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setActiveTab(null)}>
            <Text style={styles.retryButtonText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: activeTab ? getTabTitle(activeTab) : "Admin Dashboard",
          headerLeft: activeTab ? () => (
            <TouchableOpacity onPress={() => setActiveTab(null)} style={{ marginLeft: 8, padding: 4 }}>
              <ArrowLeft size={24} color="#111827" />
            </TouchableOpacity>
          ) : undefined,
          headerRight: () => (
            <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
              <LogOut size={22} color="#ef4444" />
            </TouchableOpacity>
          ),
        }} 
      />

      {mustAcceptAdminTerms ? (
      renderAdminTermsContent()
      ) : activeTab === null ? (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.menuGridScroll}>
      <View style={styles.roleBanner}>
        <View style={styles.roleBannerHeader}>
          <Text style={styles.roleBannerTitle}>{adminRoleLabel}</Text>
          {user?.username ? <Text style={styles.roleBannerUser}>@{user.username}</Text> : null}
        </View>
        <Text style={styles.roleBannerText}>
          {isSuperAdmin
            ? "Full platform management access is enabled across all countries."
            : isCountryAdmin
            ? "Country-scoped access is enabled for orders, stock, events, enrollments, club requests, uploads, external activity, and magazine tools."
            : isEventOrganizer
            ? "Organizer-scoped access is enabled for your assigned events, organizer-side enrollment decisions, and admin terms acceptance. Organizer-created events stay pending until Country or Global Admin approval."
            : "Club-scoped access is enabled for treadmill, events, enrollments, club requests, uploads, external activity, and magazine tools."}
        </Text>
      </View>
      {groupedMenuSections.length > 0 ? (
        groupedMenuSections.map((section) => (
          <View
            key={section.key}
            style={[
              styles.menuSection,
              section.key === "global"
                ? styles.menuSectionGlobal
                : section.key === "country"
                ? styles.menuSectionCountry
                : styles.menuSectionClub,
            ]}
          >
            <View style={styles.menuSectionHeader}>
              <View
                style={[
                  styles.menuSectionAccent,
                  section.key === "global"
                    ? styles.menuSectionAccentGlobal
                    : section.key === "country"
                    ? styles.menuSectionAccentCountry
                    : styles.menuSectionAccentClub,
                ]}
              />
              <View
                style={[
                  styles.menuSectionIconWrap,
                  section.key === "global"
                    ? styles.menuSectionIconWrapGlobal
                    : section.key === "country"
                    ? styles.menuSectionIconWrapCountry
                    : styles.menuSectionIconWrapClub,
                ]}
              >
                {section.key === "global" ? (
                  <Globe2 size={12} color="#334155" />
                ) : section.key === "country" ? (
                  <MapPin size={12} color="#9a3412" />
                ) : (
                  <Users size={12} color="#047857" />
                )}
              </View>
              <Text
                style={[
                  styles.menuSectionTitle,
                  section.key === "global"
                    ? styles.menuSectionTitleGlobal
                    : section.key === "country"
                    ? styles.menuSectionTitleCountry
                    : styles.menuSectionTitleClub,
                ]}
              >
                {section.title}
              </Text>
            </View>
            <View style={styles.menuGrid}>
              {section.items.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.menuButton}
                  onPress={() => setActiveTab(item.key)}
                >
                  <View style={styles.iconCircle}>
                    {item.icon}
                  </View>
                  <Text style={styles.menuButtonText}>{item.label}</Text>
                  {(item.badgeCount || 0) > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badgeCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.menuGrid}>
          {visibleMenuItems.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.menuButton}
              onPress={() => setActiveTab(item.key)}
            >
              <View style={styles.iconCircle}>
                {item.icon}
              </View>
              <Text style={styles.menuButtonText}>{item.label}</Text>
              {(item.badgeCount || 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badgeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
      </ScrollView>
      ) : activeTab === "adminTerms" ? (
        renderAdminTermsContent()
      ) : activeTab === "roles" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.auditFilterCard}>
            <View style={styles.auditFilterHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditFilterTitle}>Admin Role Access</Text>
                <Text style={styles.auditFilterSubtitle}>Global Admin can review pending role requests and manage active role access.</Text>
              </View>
              <TouchableOpacity style={styles.downloadButton} onPress={openCreateRoleModal}>
                <Plus size={18} color="#fff" />
                <Text style={styles.downloadButtonText}>Add Role Access</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.sectionDivider}>
            <Text style={styles.sectionTitle}>Pending Requests</Text>
          </View>

          {roleManagementLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading role requests...</Text>
            </View>
          ) : roleManagementError ? (
            <View style={styles.emptyContainer}>
              <AlertTriangle size={56} color="#f59e0b" />
              <Text style={styles.errorText}>Error loading role access</Text>
              <Text style={styles.errorSubtext}>{roleManagementError.message || "Could not load role access details."}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetchRoleManagement()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : pendingRoleRequests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <UserPlus size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No pending role requests</Text>
              <Text style={styles.emptySubtext}>Create one with Add Role Access, then approve it here.</Text>
            </View>
          ) : (
            pendingRoleRequests.map((request) => (
              <View key={request.inviteId} style={styles.auditLogCard}>
                <View style={styles.auditLogHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.auditLogAction}>{request.email}</Text>
                    <Text style={styles.auditLogDate}>{getRoleDisplayName(request.roleName)} • {formatDate(request.createdAt)}</Text>
                  </View>
                  <View style={styles.auditTypeBadge}>
                    <Text style={styles.auditTypeText}>PENDING</Text>
                  </View>
                </View>
                <View style={styles.auditLogDetails}>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Scope:</Text>
                    <Text style={styles.orderValue}>
                      {request.roleName === "club_coordinator"
                        ? request.clubName || request.clubId || "No club"
                        : request.roleName === "event_organizer"
                        ? request.organizerName || "Organizer profile will be created on approval"
                        : request.countryName || formatCountryName(request.countryCode) || request.countryCode || "No country"}
                    </Text>
                  </View>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Requested by:</Text>
                        <Text style={styles.orderValue}>{request.invitedByName || "Global Admin"}</Text>
                  </View>
                  <View style={styles.submissionActions}>
                    <TouchableOpacity
                      style={styles.approveButton}
                      onPress={() => approveRoleRequestMutation.mutate({ inviteId: request.inviteId })}
                      disabled={approveRoleRequestMutation.isPending}
                    >
                      <CheckCircle size={18} color="#fff" />
                      <Text style={styles.actionButtonText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => rejectRoleRequestMutation.mutate({ inviteId: request.inviteId })}
                      disabled={rejectRoleRequestMutation.isPending}
                    >
                      <XCircle size={18} color="#fff" />
                      <Text style={styles.actionButtonText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}

          <View style={styles.sectionDivider}>
            <Text style={styles.sectionTitle}>Active Assignments</Text>
          </View>

          {activeRoleAssignments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Users size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No active assignments yet</Text>
            </View>
          ) : (
            activeRoleAssignments.map((assignment) => (
              <View key={assignment.assignmentId} style={styles.auditLogCard}>
                <View style={styles.auditLogHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.auditLogAction}>{assignment.userName}</Text>
                    <Text style={styles.auditLogDate}>
                      {getRoleDisplayName(assignment.roleName)}
                      {assignment.username ? ` • @${assignment.username}` : ""}
                    </Text>
                  </View>
                  <View style={styles.auditTypeBadge}>
                    <Text style={styles.auditTypeText}>ACTIVE</Text>
                  </View>
                </View>
                <View style={styles.auditLogDetails}>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Scope:</Text>
                    <Text style={styles.orderValue}>
                      {assignment.roleName === "club_coordinator"
                        ? assignment.clubName || assignment.clubId || "No club"
                        : assignment.roleName === "event_organizer"
                        ? assignment.organizerName || assignment.organizerId || "No organizer"
                        : assignment.countryName || formatCountryName(assignment.countryCode) || assignment.countryCode || "No country"}
                    </Text>
                  </View>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Assigned:</Text>
                    <Text style={styles.orderValue}>{formatDate(assignment.createdAt)}</Text>
                  </View>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Assigned by:</Text>
                    <Text style={styles.orderValue}>{assignment.assignedByName || "Unknown"}</Text>
                  </View>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Admin T&Cs:</Text>
                    <Text style={styles.orderValue}>
                      {assignment.hasAcceptedTerms
                        ? `Accepted${assignment.termsAcceptedAt ? ` • ${formatDate(assignment.termsAcceptedAt)}` : ""}`
                        : "Not accepted"}
                    </Text>
                  </View>
                  <View style={styles.submissionActions}>
                    <TouchableOpacity
                      style={styles.downloadButton}
                      onPress={() => openEditRoleModal(assignment)}
                    >
                      <Edit size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Edit Access</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.archiveActionBtn}
                      onPress={() =>
                        Alert.alert("Remove Role Access", "Remove this role access assignment?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => deleteRoleAssignmentMutation.mutate({ assignmentId: assignment.assignmentId }) },
                        ])
                      }
                    >
                      <Trash2 size={18} color="#fff" />
                      <Text style={styles.archiveActionBtnText}>Remove Access</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === "dataHealth" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.auditFilterCard}>
            <View style={styles.auditFilterHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditFilterTitle}>Linked Account Health</Text>
                <Text style={styles.auditFilterSubtitle}>
                Global Admin can review mismatches between auth users, profiles, registrations, and contacts.
                </Text>
              </View>
              <TouchableOpacity style={styles.downloadButton} onPress={() => refetchAccountLinkHealth()}>
                <Activity size={18} color="#fff" />
                <Text style={styles.downloadButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          {accountLinkHealthSummary ? (
            <View style={styles.healthSummaryGrid}>
              <View style={styles.healthSummaryCard}>
                <Text style={styles.healthSummaryValue}>{accountLinkHealthSummary.issueCount}</Text>
                <Text style={styles.healthSummaryLabel}>Open issues</Text>
              </View>
              <View style={styles.healthSummaryCard}>
                <Text style={[styles.healthSummaryValue, { color: "#dc2626" }]}>{accountLinkHealthSummary.criticalCount}</Text>
                <Text style={styles.healthSummaryLabel}>Critical</Text>
              </View>
              <View style={styles.healthSummaryCard}>
                <Text style={[styles.healthSummaryValue, { color: "#b45309" }]}>{accountLinkHealthSummary.warningCount}</Text>
                <Text style={styles.healthSummaryLabel}>Warnings</Text>
              </View>
              <View style={styles.healthSummaryCard}>
                <Text style={styles.healthSummaryValue}>{accountLinkHealthSummary.authUserCount}</Text>
                <Text style={styles.healthSummaryLabel}>Auth users</Text>
              </View>
              <View style={styles.healthSummaryCard}>
                <Text style={[styles.healthSummaryValue, { color: "#7c3aed" }]}>{accountLinkHealthSummary.schemaIssueCount ?? 0}</Text>
                <Text style={styles.healthSummaryLabel}>Schema</Text>
              </View>
            </View>
          ) : null}

          {accountLinkHealthLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Checking linked accounts...</Text>
            </View>
          ) : accountLinkHealthError ? (
            <View style={styles.emptyContainer}>
              <AlertTriangle size={56} color="#f59e0b" />
              <Text style={styles.errorText}>Could not load account health</Text>
              <Text style={styles.errorSubtext}>{accountLinkHealthError.message || "Try refreshing the report."}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetchAccountLinkHealth()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : accountLinkHealthIssues.length === 0 ? (
            <View style={styles.emptyContainer}>
              <CheckCircle size={56} color="#10b981" />
              <Text style={styles.emptyText}>No linked-account issues found</Text>
              <Text style={styles.emptySubtext}>Auth users, profiles, registrations, and contacts look aligned right now.</Text>
            </View>
          ) : (
            accountLinkHealthIssues.map((entry) => {
              const repairActions = getRepairActions(entry);

              return <View key={entry.key} style={styles.auditLogCard}>
                <View style={styles.auditLogHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.auditLogAction}>{entry.displayName || entry.authEmail || entry.registrationId || "Unknown account"}</Text>
                    <Text style={styles.auditLogDate}>
                      {entry.provider ? `${entry.provider === "apple" ? "Apple" : "Google"} sign-in` : "Linked account"}
                      {entry.username ? ` • @${entry.username}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.healthSeverityBadge, entry.severity === "critical" ? styles.healthSeverityCritical : styles.healthSeverityWarning]}>
                    <Text style={styles.healthSeverityText}>{entry.severity === "critical" ? "CRITICAL" : "WARNING"}</Text>
                  </View>
                </View>

                <View style={styles.auditLogDetails}>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Auth email:</Text>
                    <Text style={styles.orderValue}>{entry.authEmail || "No auth email"}</Text>
                  </View>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Contact email:</Text>
                    <Text style={styles.orderValue}>{entry.contactEmail || "No contact email"}</Text>
                  </View>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Profile ID:</Text>
                    <Text style={styles.orderValue}>{entry.profileId || "Missing"}</Text>
                  </View>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Registration:</Text>
                    <Text style={styles.orderValue}>{entry.registrationId || "Missing"}</Text>
                  </View>

                  <View style={styles.healthIssueList}>
                    {entry.issues.map((issue) => (
                      <View key={`${entry.key}-${issue.code}`} style={styles.healthIssueRow}>
                        <AlertTriangle size={16} color={entry.severity === "critical" ? "#dc2626" : "#b45309"} />
                        <Text style={styles.healthIssueText}>{issue.message}</Text>
                      </View>
                    ))}
                  </View>

                  {repairActions.length > 0 ? (
                    <View style={styles.submissionActions}>
                      {repairActions.map((action) => (
                        <TouchableOpacity
                          key={`${entry.key}-${action.key}`}
                          style={[styles.downloadButton, repairAccountLinkMutation.isPending && styles.disabledButton]}
                          onPress={() => handleRepairAccountLink(entry, action.key)}
                          disabled={repairAccountLinkMutation.isPending}
                        >
                          <CheckCircle size={18} color="#fff" />
                          <Text style={styles.downloadButtonText}>{action.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            })
          )}
        </ScrollView>
      ) : activeTab === "auditLog" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.auditFilterCard}>
            <View style={styles.auditFilterHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditFilterTitle}>Admin Activity</Text>
              <Text style={styles.auditFilterSubtitle}>Country Admin, Country Coordinator, and Club Coordinator actions</Text>
              </View>
              <TouchableOpacity
                style={[styles.downloadButton, (auditLogsLoading || isDownloadingAuditLog) && styles.disabledButton]}
                onPress={handleDownloadAuditLog}
                disabled={auditLogsLoading || isDownloadingAuditLog}
              >
                <Download size={18} color="#fff" />
                <Text style={styles.downloadButtonText}>
                  {isDownloadingAuditLog ? "Preparing..." : "Download CSV"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.auditDateRow}>
              <View style={styles.auditDateInputWrap}>
                <Text style={styles.label}>Start Date</Text>
                <TextInput
                  style={styles.input}
                  value={auditStartDate}
                  onChangeText={setAuditStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={styles.auditDateInputWrap}>
                <Text style={styles.label}>End Date</Text>
                <TextInput
                  style={styles.input}
                  value={auditEndDate}
                  onChangeText={setAuditEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            <View style={styles.auditSegment}>
              {[
                { key: "all" as const, label: "All" },
                    { key: "country_admin" as const, label: "Country Admin" },
                    { key: "country_coordinator" as const, label: "Country Coordinator" },
                    { key: "club_coordinator" as const, label: "Club Coordinator" },
              ].map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.auditSegmentButton,
                    auditUserType === option.key && styles.auditSegmentButtonActive,
                  ]}
                  onPress={() => setAuditUserType(option.key)}
                >
                  <Text
                    style={[
                      styles.auditSegmentText,
                      auditUserType === option.key && styles.auditSegmentTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.retryButton} onPress={() => refetchAuditLogs()}>
              <Text style={styles.retryButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>

          {auditLogsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading audit log...</Text>
            </View>
          ) : auditLogsError ? (
            <View style={styles.emptyContainer}>
              <AlertTriangle size={56} color="#f59e0b" />
              <Text style={styles.errorText}>Error loading audit log</Text>
              <Text style={styles.errorSubtext}>{auditLogsError.message || "Could not load audit log entries."}</Text>
            </View>
          ) : (auditLogs as AuditLogEntry[]).length === 0 ? (
            <View style={styles.emptyContainer}>
              <FileText size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No audit log entries</Text>
              <Text style={styles.emptySubtext}>Try another date range or user type.</Text>
            </View>
          ) : (
            (auditLogs as AuditLogEntry[]).map((entry) => (
              <View key={entry.id} style={styles.auditLogCard}>
                <View style={styles.auditLogHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.auditLogAction}>{formatAuditAction(entry.actionType)}</Text>
                    <Text style={styles.auditLogDate}>{formatDate(entry.createdAt)}</Text>
                  </View>
                  <View style={styles.auditTypeBadge}>
                    <Text style={styles.auditTypeText}>{entry.actorType}</Text>
                  </View>
                </View>

                <View style={styles.auditLogDetails}>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Admin:</Text>
                    <Text style={styles.orderValue}>
                      {entry.actorName}{entry.actorUsername ? ` (@${entry.actorUsername})` : ""}
                    </Text>
                  </View>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Scope:</Text>
                    <Text style={styles.orderValue}>
                      {[...formatCountryList(entry.countryCodes), ...entry.clubIds].join(", ") || "Global"}
                    </Text>
                  </View>
                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Target:</Text>
                    <Text style={styles.orderValue}>
                      {entry.targetName || entry.targetUserId || formatCountryName(entry.targetCountryCode) || entry.targetCountryCode || entry.targetClubId || "Not specified"}
                    </Text>
                  </View>
                  <Text style={styles.auditMetadata} numberOfLines={3}>
                    {getAuditMetadataSummary(entry.metadata)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === "clubRequests" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {clubMembershipRequestsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading club and organiser requests...</Text>
            </View>
          ) : clubMembershipRequestsError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading club and organiser requests</Text>
              <Text style={styles.errorSubtext}>
                {clubMembershipRequestsError.message || "Could not load club and organiser requests."}
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => refetchClubMembershipRequests()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : pendingClubMembershipRequests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Users size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No pending club or organiser requests</Text>
              <Text style={styles.emptySubtext}>
                New club memberships, club start requests, and organiser requests will appear here.
              </Text>
            </View>
          ) : (
            pendingClubMembershipRequests.map((request) => {
              const memberName = [
                request.member?.first_name,
                request.member?.other_names,
              ].filter(Boolean).join(" ") || request.member?.username || "Unknown member";

              return (
                <View key={request.registration_id} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderId}>{memberName}</Text>
                      {request.member?.username ? (
                        <Text style={styles.errorHint}>@{request.member.username}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: "#f59e0b20" }]}>
                      <Text style={[styles.statusText, { color: "#f59e0b" }]}>Pending</Text>
                    </View>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>
                      {request.request_type === "start_club"
                        ? "Proposed Club:"
                        : request.request_type === "event_organizer"
                        ? "Organizer Name:"
                        : "Club:"}
                    </Text>
                    <Text style={styles.orderValue}>
                      {request.proposed_club_name || request.club_name || request.club || "Not provided"}
                    </Text>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Request Type:</Text>
                    <Text style={styles.orderValue}>
                      {request.request_type === "start_club"
                        ? "Start a new club"
                        : request.request_type === "event_organizer"
                          ? "Event organiser request"
                        : request.new_member === "Yes"
                          ? "New member request"
                          : "Existing member claim"}
                    </Text>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>
                      {request.request_type === "start_club" ? "Country:" : "Location:"}
                    </Text>
                    <Text style={styles.orderValue}>
                      {request.request_type === "start_club" || request.request_type === "event_organizer"
                        ? formatCountryName(request.proposed_country) || request.proposed_country || "Not provided"
                        : [request.member?.city_town_district, formatCountryName(request.member?.country)].filter(Boolean).join(", ") || "Not provided"}
                    </Text>
                  </View>

                  {(request.request_type === "start_club" || request.request_type === "event_organizer") && request.proposed_description ? (
                    <View style={styles.orderDetails}>
                      <Text style={styles.orderLabel}>Description:</Text>
                      <Text style={styles.orderValue}>{request.proposed_description}</Text>
                    </View>
                  ) : null}

                  {request.request_type === "event_organizer" ? (
                    <View style={styles.orderDetails}>
                      <Text style={styles.orderLabel}>Screening:</Text>
                      <Text style={styles.orderValue}>Country admin review is required before organiser approval.</Text>
                    </View>
                  ) : null}

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Requested:</Text>
                    <Text style={styles.orderValue}>
                      {request.created_at
                        ? new Date(request.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "Not recorded"}
                    </Text>
                  </View>

                  <View style={styles.activityActions}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      disabled={updateClubMembershipRequestMutation.isPending}
                      onPress={() =>
                        updateClubMembershipRequestMutation.mutate({
                          registrationId: request.registration_id,
                          status: "rejected",
                        })
                      }
                    >
                      <XCircle size={20} color="#fff" />
                      <Text style={styles.actionBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      disabled={updateClubMembershipRequestMutation.isPending}
                      onPress={() =>
                        updateClubMembershipRequestMutation.mutate({
                          registrationId: request.registration_id,
                          status: "approved",
                        })
                      }
                    >
                      <CheckCircle size={20} color="#fff" />
                      <Text style={styles.actionBtnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : activeTab === "orders" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {deliveryOrdersLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading delivery orders...</Text>
            </View>
          ) : deliveryOrdersError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading orders</Text>
              <Text style={styles.errorSubtext}>{deliveryOrdersError.message || "Could not load delivery orders."}</Text>
              <Text style={styles.errorHint}>Please refresh and try again. If this keeps happening, check the delivery orders setup in Supabase.</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => refetchDeliveryOrders()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !deliveryOrders || deliveryOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Truck size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No delivery orders yet</Text>
              <Text style={styles.emptySubtext}>Orders placed by users will appear here</Text>
            </View>
          ) : (
            deliveryOrders.map((order: any) => {
              const items = order.items || [];
              return (
                <View key={order.order_id} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderId}>#{(order.order_id || '').substring(0, 8)}</Text>
                    <TouchableOpacity
                      style={[styles.statusBadge, { backgroundColor: `${getStatusColor(order.status)}20` }]}
                      onPress={() => handleUpdateOrderStatus(order.order_id, order.status)}
                    >
                      <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                        {getStatusLabel(order.status)}
                      </Text>
                      <ChevronRight size={14} color={getStatusColor(order.status)} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Phone:</Text>
                    <Text style={styles.orderValue}>{order.phone_number}</Text>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Address:</Text>
                    <Text style={styles.orderValue} numberOfLines={2}>
                      {order.delivery_address}
                    </Text>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Time Slots:</Text>
                    <Text style={styles.orderValue} numberOfLines={2}>
                      {order.delivery_time_slots || 'N/A'}
                    </Text>
                  </View>

                  {items.length > 0 && (
                    <View style={styles.orderItemsList}>
                      <Text style={styles.orderItemsTitle}>Items:</Text>
                      {items.map((item: any, idx: number) => (
                        <View key={idx} style={styles.orderItemRow}>
                          <Text style={styles.orderItemName} numberOfLines={1}>
                            {item.name}{item.size ? ` (${item.size})` : ''}
                          </Text>
                          <Text style={styles.orderItemQty}>x{item.qty}</Text>
                          <Text style={styles.orderItemPrice}>
                            ugx.{(item.subtotal || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Total:</Text>
                    <Text style={styles.orderTotal}>
                      ugx.{(order.total_amount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </Text>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Date:</Text>
                    <Text style={styles.orderValue}>
                      {new Date(order.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.printStickerBtn}
                    onPress={() => handlePrintSticker(order)}
                    activeOpacity={0.8}
                  >
                    <Printer size={18} color="#fff" />
                    <Text style={styles.printStickerText}>Print Sticker</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : activeTab === "stock" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {stockLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading stock...</Text>
            </View>
          ) : stockError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading stock</Text>
              <Text style={styles.errorSubtext}>{stockError instanceof Error ? stockError.message : "Could not load stock items."}</Text>
            </View>
          ) : !stockProducts || stockProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Package size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No products in catalogue</Text>
            </View>
          ) : (
            stockProducts.map((product: any) => (
              <View key={product.catalogue_id} style={styles.stockCard}>
                <View style={styles.stockInfo}>
                  <Text style={styles.stockName}>{product.catalogue_item}</Text>
                  {product.size && <Text style={styles.stockSize}>Size: {product.size}</Text>}
                  <View style={styles.stockRow}>
                    <Text style={styles.stockLabel}>Stock:</Text>
                    <Text
                      style={[
                        styles.stockValue,
                        (product.quantity || 0) <= 5 && styles.stockValueLow,
                        (product.quantity || 0) === 0 && styles.stockValueOut,
                      ]}
                    >
                      {product.quantity || 0} units
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleUpdateStock(product)}
                >
                  <Edit size={20} color="#10b981" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === "events" ? (
        <View style={{ flex: 1 }}>
          <View style={styles.eventsSubTabBar}>
            <TouchableOpacity
              style={[styles.eventsSubTab, eventsSubTab === "calendar" && styles.eventsSubTabActive]}
              onPress={() => setEventsSubTab("calendar")}
            >
              <Calendar size={18} color={eventsSubTab === "calendar" ? "#10b981" : "#6b7280"} />
              <Text style={[styles.eventsSubTabText, eventsSubTab === "calendar" && styles.eventsSubTabTextActive]}>
                Calendar
              </Text>
            </TouchableOpacity>
            {!isEventOrganizer ? (
              <TouchableOpacity
                style={[styles.eventsSubTab, eventsSubTab === "participants" && styles.eventsSubTabActive]}
                onPress={() => setEventsSubTab("participants")}
              >
                <Users size={18} color={eventsSubTab === "participants" ? "#10b981" : "#6b7280"} />
                <Text style={[styles.eventsSubTabText, eventsSubTab === "participants" && styles.eventsSubTabTextActive]}>
                  Participants
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {eventsSubTab === "calendar" ? (
            <View style={{ flex: 1 }}>
              <View style={styles.addEventContainer}>
                <TouchableOpacity
                  style={styles.addEventButton}
                  onPress={handleOpenAddEvent}
                >
                  <Plus size={20} color="#fff" />
                  <Text style={styles.addEventButtonText}>Create Event</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={styles.auditFilterCard}>
                  <View style={styles.auditFilterHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.auditFilterTitle}>Organizer Filter</Text>
                      <Text style={styles.auditFilterSubtitle}>
                        Narrow the event list by club-owned events or a specific independent organizer.
                      </Text>
                    </View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventFilterScroll}>
                    <TouchableOpacity
                      style={[styles.eventFilterChip, selectedOrganizerFilter === "all" && styles.eventFilterChipActive]}
                      onPress={() => setSelectedOrganizerFilter("all")}
                    >
                      <Text style={[styles.eventFilterChipText, selectedOrganizerFilter === "all" && styles.eventFilterChipTextActive]}>
                        All ({organizerEventCounts.total})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.eventFilterChip, selectedOrganizerFilter === "clubs" && styles.eventFilterChipActive]}
                      onPress={() => setSelectedOrganizerFilter("clubs")}
                    >
                      <Text style={[styles.eventFilterChipText, selectedOrganizerFilter === "clubs" && styles.eventFilterChipTextActive]}>
                        Clubs ({organizerEventCounts.clubOwnedCount})
                      </Text>
                    </TouchableOpacity>
                    {(eventOrganizers as EventOrganizerRecord[]).map((organizer) => (
                      <TouchableOpacity
                        key={organizer.organizer_id}
                        style={[
                          styles.eventFilterChip,
                          (organizerEventCounts.organizerCounts.get(organizer.organizer_id) ?? 0) === 0 &&
                            styles.eventFilterChipMuted,
                          selectedOrganizerFilter === organizer.organizer_id && styles.eventFilterChipActive,
                        ]}
                        onPress={() => setSelectedOrganizerFilter(organizer.organizer_id)}
                      >
                        <Text
                          style={[
                            styles.eventFilterChipText,
                            (organizerEventCounts.organizerCounts.get(organizer.organizer_id) ?? 0) === 0 &&
                              styles.eventFilterChipTextMuted,
                            selectedOrganizerFilter === organizer.organizer_id && styles.eventFilterChipTextActive,
                          ]}
                        >
                          {organizer.organizer_name} ({organizerEventCounts.organizerCounts.get(organizer.organizer_id) ?? 0})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {isSuperAdmin ? (
                  <View style={styles.auditFilterCard}>
                    <View style={styles.auditFilterHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.auditFilterTitle}>Organizer Manager</Text>
                        <Text style={styles.auditFilterSubtitle}>
                          Edit organizer name, description, and country for independent event managers.
                        </Text>
                      </View>
                    </View>
                    {(eventOrganizers as EventOrganizerRecord[]).length === 0 ? (
                      <Text style={styles.eventPosterHint}>No active event organizers yet. Approve an Event Organizer role first.</Text>
                    ) : (
                      (eventOrganizers as EventOrganizerRecord[]).map((organizer) => (
                        <View key={organizer.organizer_id} style={styles.orderCard}>
                          <View style={styles.orderHeader}>
                            <Text style={styles.orderId}>{organizer.organizer_name}</Text>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              <TouchableOpacity style={styles.editButton} onPress={() => openEditOrganizerModal(organizer)}>
                                <Edit size={18} color="#2563eb" />
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.deleteIconButton} onPress={() => handleDeactivateOrganizer(organizer)}>
                                <Trash2 size={16} color="#b91c1c" />
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={styles.orderDetails}>
                            <Text style={styles.orderLabel}>Country:</Text>
                            <Text style={styles.orderValue}>
                              {formatCountryName(organizer.country) || organizer.country || "Unspecified"}
                            </Text>
                          </View>
                          {organizer.description ? (
                            <View style={styles.orderDetails}>
                              <Text style={styles.orderLabel}>Notes:</Text>
                              <Text style={styles.orderValue}>{organizer.description}</Text>
                            </View>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                ) : null}

                {eventsError ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.errorText}>Error loading events</Text>
                    <Text style={styles.errorSubtext}>
                      {eventsError.message || "Could not load events."}
                    </Text>
                    <Text style={styles.errorHint}>Please refresh and try again. If the issue continues, check the events setup in Supabase.</Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => refetchEvents()}
                    >
                      <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : eventsLoading ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Loading events...</Text>
                  </View>
                ) : !filteredAdminEvents || filteredAdminEvents.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Calendar size={64} color="#d1d5db" />
                    <Text style={styles.emptyText}>No matching events</Text>
                  </View>
                ) : (
                  filteredAdminEvents.map((event: any) => {
                    const approvalStatus = event.approval_status || "approved";
                    const isOrganizerOwned = Boolean(event.organizer);
                    const canReviewOrganizerEvent =
                      isOrganizerOwned &&
                      (isSuperAdmin ||
                        (isCountryAdmin &&
                          (!event.country_code ||
                            roleSession.countryAdminScopes.includes(event.country_code))));

                    return (
                    <View key={event.event_id || event.eventId} style={styles.eventCard}>
                      <View style={styles.eventCardHeader}>
                        <View style={styles.eventInfo}>
                          <Text style={styles.eventName}>{event.event_name || event.eventName}</Text>
                          <View style={styles.eventDates}>
                            <View style={styles.eventDateRow}>
                              <Text style={styles.eventDateLabel}>Start:</Text>
                              <Text style={styles.eventDateValue}>
                                {new Date(event.starts_at || event.startsAt).toLocaleDateString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </Text>
                            </View>
                            <View style={styles.eventDateRow}>
                              <Text style={styles.eventDateLabel}>End:</Text>
                              <Text style={styles.eventDateValue}>
                                {new Date(event.ends_at || event.endsAt).toLocaleDateString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.eventMetaInline}>
                        {[formatCountryName(event.country), getEventOrganizerLabel(event)]
                              .filter(Boolean)
                              .join(", ") || "No country or organizer set"}
                          </Text>
                          <Text style={styles.eventMetaInline}>
                            Organizer: {getEventOrganizerLabel(event)}
                          </Text>
                          <View style={styles.eventConfigRow}>
                            <Text style={styles.eventConfigChip}>{getEventEntryLabel(event.entry)}</Text>
                            <Text style={styles.eventConfigChip}>
                              {event.has_medal ?? event.hasMedal ? "Medal Event" : "No Medal"}
                            </Text>
                            <Text
                              style={[
                                styles.eventConfigChip,
                                {
                                  color: getEventApprovalColor(approvalStatus),
                                  borderColor: `${getEventApprovalColor(approvalStatus)}40`,
                                  backgroundColor: `${getEventApprovalColor(approvalStatus)}12`,
                                },
                              ]}
                            >
                              {getEventApprovalLabel(approvalStatus)}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity style={styles.editButton} onPress={() => handleEditEvent(event)}>
                          <Edit size={18} color="#10b981" />
                        </TouchableOpacity>
                      </View>
                      {event.poster_link ? (
                        <Image source={{ uri: event.poster_link }} style={styles.adminEventPosterThumb} />
                      ) : (
                        <View style={styles.adminNoPosterState}>
                          <Text style={styles.adminNoPosterText}>NO POSTER</Text>
                        </View>
                      )}
                      <View style={styles.eventPosterCaptionRow}>
                        <Text style={styles.eventPosterCaption}>
                          {event.is_virtual ? "Virtual" : "Physical"}
                        </Text>
                        <Text style={styles.eventPosterCaption}>
                          {getEventEntryLabel(event.entry)}
                        </Text>
                        <Text style={styles.eventPosterCaption}>
                          {event.poster_link ? "Edit to replace poster" : "Edit to add poster"}
                        </Text>
                      </View>
                      {((event.entry || event.entryType) === "paid") && (event.payment_details || event.paymentDetails) ? (
                        <Text style={styles.eventPosterHint}>
                          Payment details: {event.payment_details || event.paymentDetails}
                        </Text>
                      ) : null}
                      {isOrganizerOwned ? (
                        <Text style={styles.eventPosterHint}>
                          {approvalStatus === "approved"
                            ? "Organizer event is approved and visible to users."
                            : approvalStatus === "rejected"
                              ? "Organizer event is rejected and hidden from the public event list until resubmitted."
                              : "Organizer event is awaiting Country or Global Admin approval before it goes live."}
                        </Text>
                      ) : null}
                      <Text style={styles.eventPosterHint}>
                        Organizer: {getEventOrganizerLabel(event)}
                      </Text>
                      <Text style={styles.eventPosterHint}>
                        Poster folder: {event.event_id || event.eventId}
                      </Text>
                      <Text style={styles.eventPosterHint}>
                        Current file: {extractPosterStoragePath(event.poster_link || event.posterLink) || "No poster"}
                      </Text>
                      {event.poster_link ? (
                        <TouchableOpacity
                          style={styles.posterLinkButton}
                          onPress={() => handleOpenPosterUrl(event.poster_link || event.posterLink)}
                        >
                          <FileText size={14} color="#0369a1" />
                          <Text style={styles.posterLinkButtonText}>Open Poster URL</Text>
                        </TouchableOpacity>
                      ) : null}
                      {canReviewOrganizerEvent && approvalStatus !== "approved" ? (
                        <View style={styles.eventApprovalActions}>
                          <TouchableOpacity
                            style={[styles.downloadButton, styles.approveActionButton]}
                            onPress={() =>
                              updateEventApprovalMutation.mutate({
                                eventId: event.event_id || event.eventId,
                                status: "approved",
                              })
                            }
                            disabled={updateEventApprovalMutation.isPending}
                          >
                            <CheckCircle size={16} color="#fff" />
                            <Text style={styles.downloadButtonText}>
                              {updateEventApprovalMutation.isPending ? "Saving..." : "Approve Event"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.downloadButton, styles.rejectActionButton]}
                            onPress={() =>
                              updateEventApprovalMutation.mutate({
                                eventId: event.event_id || event.eventId,
                                status: "rejected",
                              })
                            }
                            disabled={updateEventApprovalMutation.isPending}
                          >
                            <XCircle size={16} color="#fff" />
                            <Text style={styles.downloadButtonText}>
                              {updateEventApprovalMutation.isPending ? "Saving..." : "Reject Event"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={styles.eventFilterContainer}>
                <Text style={styles.eventFilterLabel}>Filter by Event:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventFilterScroll}>
                  {events && events.map((event: any) => (
                    <TouchableOpacity
                      key={event.event_id || event.eventId}
                      style={[
                        styles.eventFilterChip,
                        selectedEventId === (event.event_id || event.eventId) && styles.eventFilterChipActive
                      ]}
                      onPress={() => setSelectedEventId(event.event_id || event.eventId)}
                    >
                      <Text style={[
                        styles.eventFilterChipText,
                        selectedEventId === (event.event_id || event.eventId) && styles.eventFilterChipTextActive
                      ]}>
                        {event.event_name || event.eventName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {!selectedEventId ? (
                  <View style={styles.emptyContainer}>
                    <Users size={64} color="#d1d5db" />
                    <Text style={styles.emptyText}>Select an event to view participants</Text>
                  </View>
                ) : participantsError ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.errorText}>Error loading participants</Text>
                    <Text style={styles.errorSubtext}>
                      {participantsError.message || "Could not load participants."}
                    </Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => refetchParticipants()}
                    >
                      <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : participantsLoading ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Loading participants...</Text>
                  </View>
                ) : !participants || participants.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Users size={64} color="#d1d5db" />
                    <Text style={styles.emptyText}>No participants yet</Text>
                    <Text style={styles.emptySubtext}>No one has registered for this event</Text>
                  </View>
                ) : (
                  participants.map((participant: any) => (
                    <View key={participant.ParticipantID || participant.id} style={styles.participantCard}>
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName}>
                          {`${participant.user?.["First Name"] || participant.firstName || ''} ${participant.user?.["Other Names"] || participant.otherNames || ''}`.trim() || "Unknown User"}
                        </Text>
                        <View style={styles.participantDetails}>
                          <View style={styles.participantDetailRow}>
                            <Text style={styles.participantDetailLabel}>Event:</Text>
                            <Text style={styles.participantDetailValue}>{participant.eventName}</Text>
                          </View>
                          {(participant.user?.Sex || participant.sex) && (
                            <View style={styles.participantDetailRow}>
                              <Text style={styles.participantDetailLabel}>Sex:</Text>
                              <Text style={styles.participantDetailValue}>{participant.user?.Sex || participant.sex}</Text>
                            </View>
                          )}
                          {(participant.user?.Residence || participant.residence) && (
                            <View style={styles.participantDetailRow}>
                              <Text style={styles.participantDetailLabel}>Residence:</Text>
                              <Text style={styles.participantDetailValue}>{participant.user?.Residence || participant.residence}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}
        </View>
      ) : activeTab === "enrollments" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {enrollmentsError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading enrollments</Text>
              <Text style={styles.errorSubtext}>
                {enrollmentsError.message || "Could not load enrollments."}
              </Text>
              <Text style={styles.errorHint}>Please refresh and try again. If the issue continues, check the enrollments setup in Supabase.</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => refetchEnrollments()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : enrollmentsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading enrollments...</Text>
            </View>
          ) : !enrollments || enrollments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Calendar size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No enrollments yet</Text>
            </View>
          ) : (
            enrollments.map((enrollment: any) => {
              const event = events?.find((e: any) => (e.event_id || e.eventId) === enrollment.event_id);
              return (
                <View key={enrollment.event_enrollment_id} style={styles.enrollmentCard}>
                  <View style={styles.enrollmentHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.enrollmentEvent}>{event?.event_name || event?.eventName || enrollment.event_id}</Text>
                      <Text style={styles.enrollmentDate}>{formatDate(enrollment.enrolled_at)}</Text>
                    </View>
                    <Text
                      style={[
                        styles.enrollmentStatusBadge,
                        { backgroundColor: getEnrollmentStatusColor(enrollment.status) },
                      ]}
                    >
                      {getEnrollmentStatusLabel(enrollment.status)}
                    </Text>
                  </View>
                  <View style={styles.enrollmentDetails}>
                    <View style={styles.enrollmentRow}>
                      <Text style={styles.enrollmentLabel}>Name:</Text>
                      <Text style={styles.enrollmentValue}>
                        {enrollment.first_name} {enrollment.other_names}
                      </Text>
                    </View>
                    <View style={styles.enrollmentRow}>
                      <Text style={styles.enrollmentLabel}>Email:</Text>
                      <Text style={styles.enrollmentValue} numberOfLines={1}>
                        {enrollment.email}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.enrollmentActions}>
                    {enrollment.status === "awaiting_payment" ? (
                      <TouchableOpacity
                        style={[styles.downloadButton, styles.paymentConfirmButton]}
                        onPress={() =>
                          markEnrollmentPaidMutation.mutate({
                            enrollmentId: enrollment.event_enrollment_id,
                          })
                        }
                        disabled={markEnrollmentPaidMutation.isPending}
                      >
                        <CheckCircle size={16} color="#fff" />
                        <Text style={styles.downloadButtonText}>
                          {markEnrollmentPaidMutation.isPending ? "Confirming..." : "Mark Paid & Add"}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.downloadButton, styles.approveActionButton]}
                        onPress={() =>
                          approveEnrollmentMutation.mutate({
                            enrollmentId: enrollment.event_enrollment_id,
                          })
                        }
                        disabled={approveEnrollmentMutation.isPending}
                      >
                        <CheckCircle size={16} color="#fff" />
                        <Text style={styles.downloadButtonText}>
                          {approveEnrollmentMutation.isPending ? "Approving..." : "Approve"}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.downloadButton, styles.rejectActionButton]}
                      onPress={() =>
                        rejectEnrollmentMutation.mutate({
                          enrollmentId: enrollment.event_enrollment_id,
                        })
                      }
                      disabled={rejectEnrollmentMutation.isPending}
                    >
                      <XCircle size={16} color="#fff" />
                      <Text style={styles.downloadButtonText}>
                        {rejectEnrollmentMutation.isPending ? "Rejecting..." : "Reject"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : activeTab === "activityUploads" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {activityUploadsError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading activity uploads</Text>
              <Text style={styles.errorSubtext}>
                {activityUploadsError.message || "Could not load activity uploads."}
              </Text>
              <Text style={styles.errorHint}>Please refresh and try again. If the issue continues, check the activity uploads setup in Supabase.</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => refetchActivityUploads()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : activityUploadsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading activity uploads...</Text>
            </View>
          ) : !activityUploads || activityUploads.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ClipboardCheck size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No activity uploads yet</Text>
            </View>
          ) : (
            activityUploads.map((upload: any) => (
              <View key={upload.id} style={styles.uploadCard}>
                <View style={styles.uploadInfo}>
                  <Text style={styles.uploadFileName}>{upload.fileName}</Text>
                  <View style={styles.uploadDetails}>
                    <View style={styles.uploadDetailRow}>
                      <Text style={styles.uploadDetailLabel}>User:</Text>
                      <Text style={styles.uploadDetailValue}>{upload.userName}</Text>
                    </View>
                    <View style={styles.uploadDetailRow}>
                      <Text style={styles.uploadDetailLabel}>Email:</Text>
                      <Text style={styles.uploadDetailValue} numberOfLines={1}>{upload.email}</Text>
                    </View>
                    <View style={styles.uploadDetailRow}>
                      <Text style={styles.uploadDetailLabel}>Uploaded:</Text>
                      <Text style={styles.uploadDetailValue}>
                        {new Date(upload.uploadedAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={() => handleFileDownload(upload)}
                  >
                    <Download size={18} color="#fff" />
                    <Text style={styles.downloadButtonText}>Download Upload</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === "ratings" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {ratingsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading ratings...</Text>
            </View>
          ) : appRatings.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Star size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No ratings yet</Text>
              <Text style={styles.emptySubtext}>User ratings will appear here</Text>
            </View>
          ) : (
            <>
              <View style={styles.ratingSummaryCard}>
                <View style={styles.ratingSummaryLeft}>
                  <Text style={styles.ratingSummaryScore}>{averageRating.toFixed(1)}</Text>
                  <View style={styles.ratingSummaryStars}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={16}
                        color={s <= Math.round(averageRating) ? '#f59e0b' : '#d1d5db'}
                        fill={s <= Math.round(averageRating) ? '#f59e0b' : 'transparent'}
                      />
                    ))}
                  </View>
                  <Text style={styles.ratingSummaryCount}>{appRatings.length} {appRatings.length === 1 ? 'rating' : 'ratings'}</Text>
                </View>
                <View style={styles.ratingSummaryRight}>
                  {ratingBreakdown.map((item) => (
                    <View key={item.star} style={styles.ratingBarRow}>
                      <Text style={styles.ratingBarLabel}>{item.star}</Text>
                      <Star size={12} color="#f59e0b" fill="#f59e0b" />
                      <View style={styles.ratingBarTrack}>
                        <View style={[styles.ratingBarFill, { width: `${item.percentage}%` }]} />
                      </View>
                      <Text style={styles.ratingBarCount}>{item.count}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {appRatings.map((rating) => (
                <View key={rating.rating_id} style={styles.ratingCard}>
                  <View style={styles.ratingCardHeader}>
                    <View style={styles.ratingCardStars}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={14}
                          color={s <= rating.rating ? '#f59e0b' : '#d1d5db'}
                          fill={s <= rating.rating ? '#f59e0b' : 'transparent'}
                        />
                      ))}
                    </View>
                    <Text style={styles.ratingCardDate}>{formatDate(rating.created_at)}</Text>
                  </View>
                  <Text style={styles.ratingCardUser}>{rating.registration_id}</Text>
                  {rating.feedback && (
                    <Text style={styles.ratingCardFeedback}>{rating.feedback}</Text>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      ) : activeTab === "suggestions" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {suggestionsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading suggestions...</Text>
            </View>
          ) : suggestions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MessageSquare size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No suggestions yet</Text>
              <Text style={styles.emptySubtext}>User suggestions will appear here</Text>
            </View>
          ) : (
            suggestions.map((item) => (
              <View key={item.suggestion_id} style={styles.suggestionCard}>
                <View style={styles.suggestionHeader}>
                  <Text style={styles.suggestionUser} numberOfLines={1}>{item.registration_id}</Text>
                  <Text style={styles.suggestionDate}>{formatDate(item.created_at)}</Text>
                </View>
                <Text style={styles.suggestionText}>{item.suggestion}</Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === "magazine" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {magazineSubmissionsLoading || magazinePictorialsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading magazine submissions...</Text>
            </View>
          ) : magazineSubmissions.length === 0 && magazinePictorials.length === 0 ? (
            <View style={styles.emptyContainer}>
              <BookOpen size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No magazine submissions yet</Text>
              <Text style={styles.emptySubtext}>User-submitted articles and event pictorials will appear here for review.</Text>
            </View>
          ) : (
            <>
              <View style={styles.archiveSummaryCard}>
                <BookOpen size={20} color="#f59e0b" />
                <Text style={styles.archiveSummaryText}>
                  {magazineSubmissions.length} article submission{magazineSubmissions.length !== 1 ? "s" : ""} / {magazinePictorials.length} pictorial{magazinePictorials.length !== 1 ? "s" : ""}
                </Text>
              </View>

              {magazinePictorials.map((item: any) => (
                <View key={item.pictorial_id} style={styles.suggestionCard}>
                  <View style={styles.suggestionHeader}>
                    <Text style={styles.suggestionUser} numberOfLines={1}>{item.submitter_name} / {formatCountryName(item.country) || item.country}</Text>
                    <Text style={styles.suggestionDate}>{formatDate(item.created_at)}</Text>
                  </View>
                  <Image source={{ uri: item.photo_url }} style={styles.magazinePictorialAdminImage} resizeMode="cover" />
                  <Text style={styles.magazineSubmissionTitle}>{item.event_name}</Text>
                  <Text style={styles.suggestionText}>{item.caption}</Text>
                    <Text style={styles.errorHint}>
                      {[item.club, formatCountryName(item.country) || item.country, item.event_date].filter(Boolean).join(" / ")} / Status: {item.status}
                      {item.is_picture_of_week ? " / Picture of the Week" : ""}
                  </Text>
                  <View style={styles.submissionActions}>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => updateMagazinePictorialStatusMutation.mutate({ pictorialId: item.pictorial_id, status: "accepted" })}
                    >
                      <CheckCircle size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => updateMagazinePictorialStatusMutation.mutate({ pictorialId: item.pictorial_id, status: "rejected" })}
                    >
                      <XCircle size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                  {(isSuperAdmin || isCountryAdmin) && (
                    <TouchableOpacity
                      style={styles.downloadButton}
                      onPress={() => setPictureOfWeekMutation.mutate({ pictorialId: item.pictorial_id, weekLabel: null })}
                    >
                      <Camera size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Feature as Picture of the Week</Text>
                    </TouchableOpacity>
                  )}
                  {isSuperAdmin && (
                    <TouchableOpacity
                      style={styles.archiveActionBtn}
                      onPress={() =>
      Alert.alert("Delete Pictorial", "Only global admins can delete pictorial entries. Continue?", [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => deleteMagazinePictorialMutation.mutate({ pictorialId: item.pictorial_id }),
                          },
                        ])
                      }
                    >
                      <Trash2 size={18} color="#fff" />
                      <Text style={styles.archiveActionBtnText}>Delete Entry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {magazineSubmissions.map((item: any) => (
                <View key={item.submission_id} style={styles.suggestionCard}>
                  <View style={styles.suggestionHeader}>
                    <Text style={styles.suggestionUser} numberOfLines={1}>{item.author_name} / {item.category}</Text>
                    <Text style={styles.suggestionDate}>{formatDate(item.created_at)}</Text>
                  </View>
                  <Text style={styles.magazineSubmissionTitle}>{item.title}</Text>
                  <Text style={styles.suggestionText}>{item.pitch}</Text>
                  {!!item.attachment_name && (
                    <Text style={styles.errorHint}>Attachment: {item.attachment_name}</Text>
                  )}
                  <Text style={styles.errorHint}>Status: {item.status} / {item.email}</Text>
                  <View style={styles.submissionActions}>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => updateMagazineSubmissionStatusMutation.mutate({ submissionId: item.submission_id, status: "accepted" })}
                    >
                      <CheckCircle size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => updateMagazineSubmissionStatusMutation.mutate({ submissionId: item.submission_id, status: "rejected" })}
                    >
                      <XCircle size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                  {isSuperAdmin && (
                    <TouchableOpacity
                      style={styles.archiveActionBtn}
                      onPress={() =>
      Alert.alert("Delete Submission", "Only global admins can delete magazine submissions. Continue?", [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => deleteMagazineSubmissionMutation.mutate({ submissionId: item.submission_id }),
                          },
                        ])
                      }
                    >
                      <Trash2 size={18} color="#fff" />
                      <Text style={styles.archiveActionBtnText}>Delete Entry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      ) : activeTab === "archive" ? (
        <View style={{ flex: 1 }}>
          <View style={styles.archiveHeaderBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.archiveHeaderTitle}>Inactive Users</Text>
              <Text style={styles.archiveHeaderSubtitle}>
                Subscription expired 90+ days &bull; No activity 180+ days
              </Text>
            </View>
            {inactiveUsers.length > 0 && (
              <TouchableOpacity
                style={styles.selectAllBtn}
                onPress={selectAllArchive}
              >
                <Text style={styles.selectAllBtnText}>
                  {selectedArchiveIds.length === inactiveUsers.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {archiveLoading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Scanning for inactive users...</Text>
              </View>
            ) : inactiveUsers.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Archive size={64} color="#d1d5db" />
                <Text style={styles.emptyText}>No users eligible for archiving</Text>
                <Text style={styles.emptySubtext}>
                  No expired users with 180+ days of inactivity found
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => refetchArchive()}>
                  <Text style={styles.retryButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.archiveSummaryCard}>
                  <AlertTriangle size={20} color="#f59e0b" />
                  <Text style={styles.archiveSummaryText}>
                    {inactiveUsers.length} user{inactiveUsers.length !== 1 ? 's' : ''} found &bull;{' '}
                    {selectedArchiveIds.length} selected
                  </Text>
                </View>

                {inactiveUsers.map((user) => {
                  const isSelected = selectedArchiveIds.includes(user.registration_id);
                  return (
                    <TouchableOpacity
                      key={user.registration_id}
                      style={[styles.archiveUserCard, isSelected && styles.archiveUserCardSelected]}
                      onPress={() => toggleArchiveSelection(user.registration_id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.archiveCheckbox, isSelected && styles.archiveCheckboxSelected]}>
                        {isSelected && <CheckCircle size={18} color="#fff" />}
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.archiveUserName}>
                          {`${user.first_name || ''} ${user.other_names || ''}`.trim() || 'Unknown'}
                        </Text>
                        <Text style={styles.archiveRegId}>{user.registration_id}</Text>
                        <View style={styles.archiveMetaRow}>
                          <View style={styles.archiveMetaItem}>
                            <Text style={styles.archiveMetaLabel}>Registered</Text>
                            <Text style={styles.archiveMetaValue}>{formatDate(user.created_at)}</Text>
                          </View>
                          <View style={styles.archiveMetaItem}>
                            <Text style={styles.archiveMetaLabel}>Last Activity</Text>
                            <Text style={styles.archiveMetaValue}>
                              {user.lastActivityDate ? formatDate(user.lastActivityDate) : 'Never'}
                            </Text>
                          </View>
                          <View style={styles.archiveMetaItem}>
                            <Text style={styles.archiveMetaLabel}>Activities</Text>
                            <Text style={styles.archiveMetaValue}>{user.activityCount}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>

          {inactiveUsers.length > 0 && selectedArchiveIds.length > 0 && (
            <View style={styles.archiveActionBar}>
              <TouchableOpacity
                style={styles.archiveActionBtn}
                onPress={handleArchive}
                disabled={archiveMutation.isPending}
              >
                <Trash2 size={20} color="#fff" />
                <Text style={styles.archiveActionBtnText}>
                  {archiveMutation.isPending
                    ? 'Archiving...'
                    : `Archive ${selectedArchiveIds.length} User${selectedArchiveIds.length !== 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : activeTab === "externalActivities" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {externalSubmissionsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading submissions...</Text>
            </View>
          ) : !externalSubmissions || externalSubmissions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ClipboardCheck size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No external activity submissions</Text>
              <Text style={styles.emptySubtext}>Users can submit historical activities via the Activity tab</Text>
            </View>
          ) : (
            externalSubmissions.map((dateGroup: any, index: number) => (
              <View key={`${dateGroup.activityDate}-${index}`} style={styles.dateGroupCard}>
                <View style={styles.dateGroupHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dateGroupDate}>{formatDate(dateGroup.activityDate)}</Text>
                    <Text style={styles.dateGroupSubtext}>{dateGroup.users.length} {dateGroup.users.length === 1 ? 'user' : 'users'}</Text>
                  </View>
                  <View style={styles.totalEntriesBadge}>
                    <Text style={styles.totalEntriesText}>{dateGroup.totalEntries}</Text>
                    <Text style={styles.totalEntriesLabel}>entries</Text>
                  </View>
                </View>
                
                <View style={styles.usersList}>
                  {dateGroup.users.map((user: any, userIndex: number) => (
                    <View key={`${user.registrationId}-${userIndex}`} style={styles.userRow}>
                      <View style={styles.userInfo}>
                        <Text style={styles.userRowId}>{user.registrationId}</Text>
                        <Text style={styles.userRowName}>{user.userName}</Text>
                      </View>
                      <View style={styles.userCountBadge}>
                        <Text style={styles.userCountText}>{user.activityCount}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {pendingActivitiesError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading activities</Text>
              <Text style={styles.errorSubtext}>
                {pendingActivitiesError instanceof Error 
                  ? pendingActivitiesError.message 
                  : "Could not load pending treadmill activities."}
              </Text>
              <Text style={styles.errorHint}>Please refresh and try again. If the issue continues, check the treadmill activity setup in Supabase.</Text>
            </View>
          ) : pendingActivitiesLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading pending activities...</Text>
            </View>
          ) : !pendingActivitiesError && pendingActivities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ClipboardCheck size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No pending approvals</Text>
            </View>
          ) : (
            pendingActivities.map((activity) => (
              <TouchableOpacity
                key={activity.pending_activity_id}
                style={styles.activityCard}
                onPress={() => {
                  setSelectedActivity(activity);
                  setShowActivityModal(true);
                }}
              >
                <View style={styles.activityInfo}>
                  <Text style={styles.activityType}>{activity.exercise_type}</Text>
                  <Text style={styles.activityDate}>{formatDate(activity.created_at)}</Text>
                  <View style={styles.activityStats}>
                    <Text style={styles.activityStat}>
                      {activity.distance_entered.toFixed(2)} {activity.distance_unit}
                    </Text>
                    <Text style={styles.activityStat}>
                      {formatTimeInterval(activity.time_entered)}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#6b7280" />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={showStatusModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Order Status</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.statusOptions}>
              {["pending", "processing", "shipped", "delivered", "cancelled"].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusOption,
                    selectedStatus === status && styles.statusOptionSelected,
                  ]}
                  onPress={() => setSelectedStatus(status)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      selectedStatus === status && styles.statusOptionTextSelected,
                    ]}
                  >
                    {getStatusLabel(status)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={confirmStatusUpdate}
              disabled={updateDeliveryStatusMutation.isPending}
            >
              <Text style={styles.confirmButtonText}>
                {updateDeliveryStatusMutation.isPending ? "Updating..." : "Update Status"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showStockModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Stock</Text>
              <TouchableOpacity onPress={() => setShowStockModal(false)}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {selectedProduct && (
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{selectedProduct.catalogue_item}</Text>
                <Text style={styles.productCurrentStock}>
                  Current Stock: {selectedProduct.quantity || 0}
                </Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>New Stock Quantity</Text>
              <TextInput
                style={styles.input}
                value={newStock}
                onChangeText={setNewStock}
                placeholder="Enter stock quantity"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
              />
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={confirmStockUpdate}
              disabled={updateStockMutation.isPending}
            >
              <Text style={styles.confirmButtonText}>
                {updateStockMutation.isPending ? "Updating..." : "Update Stock"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

<Modal visible={showActivityModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.activityModalContent}>
            {selectedActivity && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Review Activity</Text>
                  <TouchableOpacity onPress={() => setShowActivityModal(false)}>
                    <X size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.activityModalBody}>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Type</Text>
                    <Text style={styles.detailValue}>{selectedActivity.exercise_type}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Submitted At</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedActivity.created_at)}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Distance</Text>
                      <Text style={styles.detailValue}>{selectedActivity.distance_entered.toFixed(2)} {selectedActivity.distance_unit}</Text>
                    </View>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Time</Text>
                      <Text style={styles.detailValue}>
                        {formatTimeInterval(selectedActivity.time_entered)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Treadmill Photo</Text>
                    <Image
                      source={{ uri: selectedActivity.photoUrl || selectedActivity.photo_path }}
                      style={styles.activityImage}
                      resizeMode="contain"
                    />
                  </View>
                </ScrollView>

                <View style={styles.activityActions}>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => rejectMutation.mutate({ pendingActivityId: selectedActivity.pending_activity_id })}
                    disabled={rejectMutation.isPending}
                  >
                    <XCircle size={22} color="#fff" />
                    <Text style={styles.actionBtnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => approveMutation.mutate({ pendingActivityId: selectedActivity.pending_activity_id })}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle size={22} color="#fff" />
                    <Text style={styles.actionBtnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showRoleModal} transparent animationType="slide" onRequestClose={() => { setShowRoleModal(false); resetRoleModal(); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "85%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingRoleAssignment ? "Edit Role Access" : "New Role Request"}</Text>
              <TouchableOpacity onPress={() => { setShowRoleModal(false); resetRoleModal(); }}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {!editingRoleAssignment ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>User Email or Username</Text>
                  <TextInput
                    style={styles.textInput}
                    value={roleRequestEmail}
                    onChangeText={setRoleRequestEmail}
                    placeholder="user@example.com"
                    autoCapitalize="none"
                  />
                </View>
              ) : (
                <View style={styles.auditMetadata}>
                  <Text style={styles.orderValue}>Editing access for {editingRoleAssignment.userName}</Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Role</Text>
                <View style={styles.auditSegment}>
                  {([
                    { key: "country_admin" as const, label: "Country Admin" },
                    { key: "country_coordinator" as const, label: "Country Coordinator" },
                    { key: "club_coordinator" as const, label: "Club Coordinator" },
                    { key: "event_organizer" as const, label: "Event Organizer" },
                  ]).map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.auditSegmentButton, selectedRoleName === option.key && styles.auditSegmentButtonActive]}
                      onPress={() => {
                        setSelectedRoleName(option.key);
                        if (option.key === "club_coordinator") {
                          setSelectedRoleCountryCode("");
                        } else if (option.key === "event_organizer") {
                          setSelectedRoleCountryCode("");
                          setSelectedRoleClubId("");
                        } else {
                          setSelectedRoleClubId("");
                        }
                      }}
                    >
                      <Text style={[styles.auditSegmentText, selectedRoleName === option.key && styles.auditSegmentTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {selectedRoleName === "club_coordinator" ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Club</Text>
                  <View style={styles.roleChipWrap}>
                    {roleClubs.map((club) => (
                      <TouchableOpacity
                        key={club.clubId}
                        style={[styles.roleChip, selectedRoleClubId === club.clubId && styles.roleChipActive]}
                        onPress={() => setSelectedRoleClubId(club.clubId)}
                      >
                        <Text style={[styles.roleChipText, selectedRoleClubId === club.clubId && styles.roleChipTextActive]}>
                          {club.clubName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : selectedRoleName === "event_organizer" ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Organizer Scope</Text>
                  <Text style={styles.eventPosterHint}>
                    An organizer profile will be created automatically for the user after approval. This role is limited to organizer-owned events and organizer-scoped enrollment handling.
                  </Text>
                </View>
              ) : (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Country</Text>
                  <TextInput
                    style={styles.textInput}
                    value={selectedRoleCountryCode}
                    onChangeText={setSelectedRoleCountryCode}
                    placeholder="UG"
                    autoCapitalize="characters"
                    maxLength={2}
                  />
                  <View style={styles.roleChipWrap}>
                    {roleCountries.map((country) => (
                      <TouchableOpacity
                        key={country.code}
                        style={[styles.roleChip, selectedRoleCountryCode.toUpperCase() === country.code && styles.roleChipActive]}
                        onPress={() => setSelectedRoleCountryCode(country.code)}
                      >
                          <Text style={[styles.roleChipText, selectedRoleCountryCode.toUpperCase() === country.code && styles.roleChipTextActive]}>
                           {country.name} ({country.code})
                          </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <Text style={styles.eventPosterHint}>
                {editingRoleAssignment
                  ? "Save changes to update this active role access."
                  : "New requests appear in Pending Requests first, where you can approve or reject them."}
              </Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowRoleModal(false); resetRoleModal(); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleSaveRoleRequest}
                disabled={createRoleRequestMutation.isPending || updateRoleAssignmentMutation.isPending}
              >
                <Text style={styles.confirmButtonText}>
                  {editingRoleAssignment
                    ? (updateRoleAssignmentMutation.isPending ? "Saving..." : "Save Role Access")
                    : (createRoleRequestMutation.isPending ? "Creating..." : "Create Request")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={archiveConfirmVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Archive</Text>
              <TouchableOpacity onPress={() => setArchiveConfirmVisible(false)}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.archiveConfirmBody}>
              <AlertTriangle size={40} color="#f59e0b" />
              <Text style={styles.archiveConfirmText}>
                This will move all activities for {selectedArchiveIds.length} user{selectedArchiveIds.length !== 1 ? 's' : ''} from the live activities table to activities_archive.
              </Text>
              <Text style={styles.archiveConfirmWarning}>
                This action cannot be easily undone.
              </Text>
            </View>

            <View style={styles.archiveConfirmActions}>
              <TouchableOpacity
                style={styles.archiveCancelBtn}
                onPress={() => setArchiveConfirmVisible(false)}
              >
                <Text style={styles.archiveCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.archiveConfirmBtn}
                onPress={confirmArchive}
                disabled={archiveMutation.isPending}
              >
                <Text style={styles.confirmButtonText}>
                  {archiveMutation.isPending ? 'Archiving...' : 'Confirm Archive'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showEventModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.eventModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingEventId ? "Edit Event" : "Create Event"}</Text>
              <TouchableOpacity onPress={resetEventModal}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.eventModalScroll}
              contentContainerStyle={styles.eventModalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.formGroup}>
                <Text style={styles.label}>Event Name</Text>
                <TextInput
                  style={styles.input}
                  value={eventName}
                  onChangeText={setEventName}
                  placeholder="Enter event name"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Start Date</Text>
                <TextInput
                  style={styles.input}
                  value={startsAt}
                  onChangeText={setStartsAt}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>End Date</Text>
                <TextInput
                  style={styles.input}
                  value={endsAt}
                  onChangeText={setEndsAt}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.formRow}>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.label}>Country</Text>
                  <TextInput
                    style={styles.input}
                    value={eventCountry}
                    onChangeText={setEventCountry}
                    placeholder="UG / Kenya"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.label}>Owner Model</Text>
                  <View style={styles.segmentRow}>
                    <View style={[styles.segmentChip, styles.segmentChipActive]}>
                      <Text style={[styles.segmentChipText, styles.segmentChipTextActive]}>Organizer</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Event Organizer</Text>
                <View style={styles.roleChipWrap}>
                  {(eventOrganizers as any[]).map((organizer: any) => (
                    <TouchableOpacity
                      key={organizer.organizer_id}
                      style={[styles.roleChip, eventOrganizerId === organizer.organizer_id && styles.roleChipActive]}
                      onPress={() => setEventOrganizerId(organizer.organizer_id)}
                    >
                      <Text style={[styles.roleChipText, eventOrganizerId === organizer.organizer_id && styles.roleChipTextActive]}>
                        {organizer.organizer_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.eventPosterHint}>
                  {isEventOrganizer
                    ? "Your event organizer profile is used automatically for events you create."
                    : "Choose the organizer responsible for this event. Club-owned events should use the club's organizer profile."}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.statusOption, eventIsVirtual && styles.statusOptionSelected]}
                onPress={() => setEventIsVirtual((prev) => !prev)}
              >
                <Text
                  style={[
                    styles.statusOptionText,
                    eventIsVirtual && styles.statusOptionTextSelected,
                  ]}
                >
                  {eventIsVirtual ? "Virtual Event: Yes" : "Virtual Event: No"}
                </Text>
              </TouchableOpacity>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Entry Type</Text>
                <View style={styles.segmentRow}>
                  {([
                    ["free", "Free"],
                    ["club_approved", "Club Approved"],
                    ["paid", "Paid"],
                  ] as Array<[EventEntryMode, string]>).map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      style={[styles.segmentChip, eventEntry === value && styles.segmentChipActive]}
                      onPress={() => setEventEntry(value)}
                    >
                      <Text
                        style={[styles.segmentChipText, eventEntry === value && styles.segmentChipTextActive]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {eventEntry === "paid" ? (
                <>
                  <View style={styles.formRow}>
                    <View style={styles.formGroupHalf}>
                      <Text style={styles.label}>Entry Fee</Text>
                      <TextInput
                        style={styles.input}
                        value={eventEntryFee}
                        onChangeText={setEventEntryFee}
                        placeholder="25000"
                        placeholderTextColor="#9ca3af"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.formGroupHalf}>
                      <Text style={styles.label}>Currency</Text>
                      <View style={styles.readOnlyField}>
                        <Text style={styles.readOnlyFieldText}>
                          {resolvedEventCurrencyCode || "Set country first"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Payment Details</Text>
                    <TextInput
                      style={[styles.input, styles.inputMultiline]}
                      value={eventPaymentDetails}
                      onChangeText={setEventPaymentDetails}
                      placeholder="Explain how payment will be handled and what admins should communicate."
                      placeholderTextColor="#9ca3af"
                      multiline
                    />
                  </View>
                </>
              ) : null}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Completion Medal</Text>
                <View style={styles.segmentRow}>
                  <TouchableOpacity
                    style={[styles.segmentChip, eventHasMedal && styles.segmentChipActive]}
                    onPress={() => setEventHasMedal(true)}
                  >
                    <Text style={[styles.segmentChipText, eventHasMedal && styles.segmentChipTextActive]}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentChip, !eventHasMedal && styles.segmentChipActive]}
                    onPress={() => setEventHasMedal(false)}
                  >
                    <Text style={[styles.segmentChipText, !eventHasMedal && styles.segmentChipTextActive]}>No</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Poster</Text>
                <TouchableOpacity style={styles.posterPickerButton} onPress={handlePickEventPoster}>
                  <Camera size={18} color="#10b981" />
                  <Text style={styles.posterPickerButtonText}>
                    {eventPosterPreview ? "Change Poster" : "Choose Poster"}
                  </Text>
                </TouchableOpacity>
                {eventPosterPreview ? (
                  <Image source={{ uri: eventPosterPreview }} style={styles.eventPosterPreview} />
                ) : (
                  <View style={styles.posterPlaceholder}>
                    <Text style={styles.posterPlaceholderText}>No poster selected</Text>
                  </View>
                )}
                <Text style={styles.posterMetaHint}>
                  Poster folder: {(editingEventId || getNextEventId(events as any[] | undefined))}
                </Text>
                <Text style={styles.posterMetaHint}>
                  Current file: {eventPosterPreview ? extractPosterStoragePath(eventPosterPreview) || "Selected local file" : "No poster"}
                </Text>
                {eventPosterMarkedForRemoval ? (
                  <Text style={styles.posterPendingHint}>
                    Poster removal pending. Save changes to clear it from this event.
                  </Text>
                ) : null}
                {!eventPosterAsset && eventPosterPreview?.startsWith("http") && !isStandardPosterStoragePath(extractPosterStoragePath(eventPosterPreview)) ? (
                  <Text style={styles.posterPendingHint}>
                    Saving this event will rename the current poster to the standard poster file name.
                  </Text>
                ) : null}
                {eventPosterPreview ? (
                  <TouchableOpacity style={styles.posterLinkButton} onPress={() => handleOpenPosterUrl(eventPosterPreview)}>
                    <FileText size={14} color="#0369a1" />
                    <Text style={styles.posterLinkButtonText}>Open Poster URL</Text>
                  </TouchableOpacity>
                ) : null}
                {(eventPosterPreview || eventPosterMarkedForRemoval) && (
                  <TouchableOpacity style={styles.posterRemoveButton} onPress={handleRemoveEventPoster}>
                    <Trash2 size={16} color="#b91c1c" />
                    <Text style={styles.posterRemoveButtonText}>
                      {eventPosterMarkedForRemoval ? "Poster will be removed on save" : "Remove Poster"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {eventHasMedal ? (
                <>
                  <View style={styles.sectionDivider}>
                    <Text style={styles.sectionTitle}>Medal Criteria (Optional)</Text>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Min Daily Distance (km)</Text>
                    <TextInput
                      style={styles.input}
                      value={medalMinDailyDistance}
                      onChangeText={setMedalMinDailyDistance}
                      placeholder="e.g., 5"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Min Cumulative Distance (km)</Text>
                    <TextInput
                      style={styles.input}
                      value={medalMinCumulativeDistance}
                      onChangeText={setMedalMinCumulativeDistance}
                      placeholder="e.g., 100"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Medal Tracking Start Date</Text>
                    <TextInput
                      style={styles.input}
                      value={medalDateStart}
                      onChangeText={setMedalDateStart}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Medal Tracking End Date</Text>
                    <TextInput
                      style={styles.input}
                      value={medalDateEnd}
                      onChangeText={setMedalDateEnd}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </>
              ) : null}

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleAddEvent}
                disabled={addEventMutation.isPending || updateEventMutation.isPending}
              >
                <Text style={styles.confirmButtonText}>
                  {editingEventId
                    ? updateEventMutation.isPending
                      ? "Saving..."
                      : "Save Changes"
                    : addEventMutation.isPending
                    ? "Adding..."
                    : "Add Event"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showOrganizerModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowOrganizerModal(false);
          resetOrganizerModal();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Event Organizer</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowOrganizerModal(false);
                  resetOrganizerModal();
                }}
              >
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Organizer Name</Text>
              <TextInput
                style={styles.input}
                value={organizerNameInput}
                onChangeText={setOrganizerNameInput}
                placeholder="Organizer name"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Country</Text>
              <TextInput
                style={styles.input}
                value={organizerCountryInput}
                onChangeText={setOrganizerCountryInput}
                placeholder="UG / Uganda"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={organizerDescriptionInput}
                onChangeText={setOrganizerDescriptionInput}
                placeholder="Optional organizer notes"
                placeholderTextColor="#9ca3af"
                multiline
              />
            </View>

            <Text style={styles.eventPosterHint}>
              Editing here updates the organizer label shown on event tiles and keeps the event-owner list tidy.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowOrganizerModal(false);
                  resetOrganizerModal();
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleSaveOrganizer}
                disabled={updateEventOrganizerMutation.isPending}
              >
                <Text style={styles.confirmButtonText}>
                  {updateEventOrganizerMutation.isPending ? "Saving..." : "Save Organizer"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  menuGridScroll: {
    padding: 12,
    paddingBottom: 20,
  },
  roleBanner: {
    backgroundColor: "#FFF7ED",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FED7AA",
    marginBottom: 10,
    gap: 6,
  },
  roleBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  roleBannerTitle: {
    fontSize: 16,
    fontWeight: "800" as const,
    color: "#9A3412",
  },
  roleBannerUser: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#C2410C",
  },
  roleBannerText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#9A3412",
  },
  menuGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: "#f9fafb",
  },
  menuSection: {
    gap: 8,
    marginBottom: 10,
    borderRadius: 12,
    padding: 8,
  },
  menuSectionGlobal: {
    backgroundColor: "#f8fafc",
  },
  menuSectionCountry: {
    backgroundColor: "#fff7ed",
  },
  menuSectionClub: {
    backgroundColor: "#ecfdf5",
  },
  menuSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  menuSectionAccent: {
    width: 4,
    height: 16,
    borderRadius: 999,
  },
  menuSectionIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  menuSectionIconWrapGlobal: {
    backgroundColor: "#e2e8f0",
  },
  menuSectionIconWrapCountry: {
    backgroundColor: "#fed7aa",
  },
  menuSectionIconWrapClub: {
    backgroundColor: "#a7f3d0",
  },
  menuSectionAccentGlobal: {
    backgroundColor: "#334155",
  },
  menuSectionAccentCountry: {
    backgroundColor: "#ea580c",
  },
  menuSectionAccentClub: {
    backgroundColor: "#10b981",
  },
  menuSectionTitle: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
  menuSectionTitleGlobal: {
    color: "#334155",
  },
  menuSectionTitleCountry: {
    color: "#9a3412",
  },
  menuSectionTitleClub: {
    color: "#047857",
  },
  menuButton: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 88,
    width: "31.2%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 2,
    borderColor: "transparent",
  },
  menuButtonActive: {
    backgroundColor: "#10b98108",
    borderColor: "#10b981",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#10b98115",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: "#10b981",
  },
  menuButtonText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#374151",
    textAlign: "center",
    lineHeight: 14,
  },
  menuButtonTextActive: {
    color: "#10b981",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 16,
    marginTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#374151",
  },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  orderId: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  orderDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  orderLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500" as const,
    minWidth: 110,
  },
  orderValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600" as const,
    flex: 1,
    minWidth: 140,
    textAlign: "right",
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#10b981",
  },
  stockCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stockInfo: {
    flex: 1,
    gap: 4,
  },
  stockName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
  },
  stockSize: {
    fontSize: 13,
    color: "#6b7280",
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  stockLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  stockValue: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#10b981",
  },
  stockValueLow: {
    color: "#f59e0b",
  },
  stockValueOut: {
    color: "#ef4444",
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  deleteIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    maxHeight: "92%",
    gap: 20,
  },
  eventModalContent: {
    maxHeight: "88%",
  },
  eventModalScroll: {
    flexGrow: 0,
  },
  eventModalScrollContent: {
    gap: 20,
    paddingBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#111827",
  },
  modalBody: {
    maxHeight: 460,
  },
  modalActions: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 20,
  },
  statusOptions: {
    gap: 10,
  },
  statusOption: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  statusOptionSelected: {
    backgroundColor: "#10b98110",
    borderColor: "#10b981",
  },
  statusOptionText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#374151",
    textAlign: "center",
  },
  statusOptionTextSelected: {
    color: "#10b981",
  },
  confirmButton: {
    flexGrow: 1,
    minWidth: 130,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  cancelButton: {
    flex: 1,
    flexGrow: 1,
    minWidth: 130,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    backgroundColor: "#fff",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#374151",
  },
  productInfo: {
    backgroundColor: "#f9fafb",
    padding: 16,
    borderRadius: 12,
    gap: 4,
  },
  productName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
  },
  productCurrentStock: {
    fontSize: 14,
    color: "#6b7280",
  },
  formGroup: {
    gap: 8,
  },
  inputGroup: {
    gap: 8,
  },
  formRow: {
    flexDirection: "row",
    gap: 12,
  },
  formGroupHalf: {
    flex: 1,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#374151",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#374151",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  inputMultiline: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentChipActive: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  segmentChipText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#374151",
  },
  segmentChipTextActive: {
    color: "#fff",
  },
  textInput: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  posterPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#10b981",
    backgroundColor: "#ECFDF5",
  },
  posterPickerButtonText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#047857",
  },
  posterMetaHint: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 6,
  },
  posterPendingHint: {
    fontSize: 12,
    color: "#b45309",
    marginTop: 6,
  },
  posterLinkButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  posterLinkButtonText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#0369a1",
  },
  posterRemoveButton: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  posterRemoveButtonText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#b91c1c",
  },
  eventPosterPreview: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    marginTop: 4,
  },
  posterPlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },
  posterPlaceholderText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#9CA3AF",
  },
  activityCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  activityInfo: {
    flex: 1,
    gap: 4,
  },
  activityType: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
  },
  activityDate: {
    fontSize: 14,
    color: "#6b7280",
  },
  activityStats: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  activityStat: {
    fontSize: 13,
    color: "#10b981",
    fontWeight: "600" as const,
  },
  activityModalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "90%",
    maxWidth: 500,
    maxHeight: "85%",
  },
  activityModalBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#6b7280",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: "#111827",
  },
  activityImage: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  activityActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  rejectBtn: {
    flex: 1,
    minWidth: 140,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 48,
  },
  approveBtn: {
    flex: 1,
    minWidth: 140,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 48,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#fff",
  },
  rejectButton: {
    flex: 1,
    minWidth: 140,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 48,
  },
  approveButton: {
    flex: 1,
    minWidth: 140,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 48,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#fff",
  },

  errorText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 8,
  },
  errorHint: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    fontStyle: "italic" as const,
  },
  addEventContainer: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  addEventButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  addEventButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
  },
  eventCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  eventCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  eventInfo: {
    gap: 12,
    flex: 1,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
  },
  eventDates: {
    gap: 8,
  },
  eventDateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  eventDateLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
  },
  eventDateValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
  },
  eventMetaInline: {
    fontSize: 13,
    color: "#6b7280",
  },
  eventConfigRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  eventConfigChip: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#047857",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  adminEventPosterThumb: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    marginTop: 14,
    backgroundColor: "#f3f4f6",
  },
  adminNoPosterState: {
    marginTop: 14,
    height: 220,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
  },
  adminNoPosterText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#9ca3af",
  },
  eventPosterCaptionRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eventApprovalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
  },
  eventPosterCaption: {
    flex: 1,
    fontSize: 12,
    color: "#6b7280",
  },
  eventPosterHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#6b7280",
  },
  organizerTermsPill: {
    alignSelf: "flex-start" as const,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#10b98115",
    borderWidth: 1,
    borderColor: "#10b98133",
  },
  organizerTermsPillText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#059669",
  },
  errorDetails: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center" as const,
    marginTop: 8,
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 16,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  enrollmentCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  enrollmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  enrollmentEvent: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#10b981",
    flex: 1,
  },
  enrollmentDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  enrollmentDetails: {
    gap: 8,
  },
  enrollmentStatusBadge: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700" as const,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  enrollmentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  enrollmentLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
    width: 80,
  },
  enrollmentValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
    flex: 1,
  },
  enrollmentActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  eventsSubTabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  eventsSubTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  eventsSubTabActive: {
    borderBottomColor: "#10b981",
  },
  eventsSubTabText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#6b7280",
  },
  eventsSubTabTextActive: {
    color: "#10b981",
  },
  eventFilterContainer: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  eventFilterLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#374151",
    marginBottom: 12,
  },
  eventFilterScroll: {
    flexGrow: 0,
  },
  eventFilterChip: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  eventFilterChipActive: {
    backgroundColor: "#10b98110",
    borderColor: "#10b981",
  },
  eventFilterChipMuted: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
  },
  eventFilterChipText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#6b7280",
  },
  eventFilterChipTextMuted: {
    color: "#9ca3af",
  },
  eventFilterChipTextActive: {
    color: "#10b981",
  },
  readOnlyField: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  readOnlyFieldText: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "600" as const,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 4,
  },
  participantCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  participantInfo: {
    gap: 12,
  },
  participantName: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
  },
  participantDetails: {
    gap: 8,
  },
  participantDetailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  participantDetailLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
    width: 140,
    maxWidth: "100%",
  },
  participantDetailValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
    flex: 1,
  },
  participantStatus: {
    textTransform: "capitalize" as const,
  },
  participantDaysCompleted: {
    color: "#10b981",
    fontWeight: "700" as const,
  },
  uploadCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  uploadInfo: {
    gap: 12,
  },
  uploadFileName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
  },
  uploadDetails: {
    gap: 8,
  },
  uploadDetailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  uploadDetailLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
    width: 100,
  },
  uploadDetailValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
    flex: 1,
  },
  downloadButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: "#2563eb",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      minHeight: 46,
      minWidth: 140,
      marginTop: 12,
    },
  downloadButtonText: {
      fontSize: 14,
      fontWeight: "700" as const,
      color: "#fff",
    },
  approveActionButton: {
    backgroundColor: "#10b981",
  },
  paymentConfirmButton: {
    backgroundColor: "#0ea5e9",
  },
  rejectActionButton: {
    backgroundColor: "#dc2626",
  },
  disabledButton: {
    opacity: 0.6,
  },
  auditFilterCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  auditFilterHeader: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  auditFilterTitle: {
    fontSize: 19,
    fontWeight: "800" as const,
    color: "#111827",
  },
  auditFilterSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 3,
  },
  auditDateRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 12,
  },
  auditDateInputWrap: {
    flex: 1,
    minWidth: 140,
  },
  auditSegment: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  auditSegmentButton: {
    flex: 1,
    minHeight: 42,
    minWidth: 120,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 9,
    paddingHorizontal: 6,
  },
  auditSegmentButtonActive: {
    backgroundColor: "#10b981",
  },
  auditSegmentText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#6b7280",
    textAlign: "center" as const,
  },
  auditSegmentTextActive: {
    color: "#fff",
  },
  healthSummaryGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 12,
  },
  healthSummaryCard: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 6,
  },
  healthSummaryValue: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: "#111827",
  },
  healthSummaryLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#6b7280",
  },
  roleChipWrap: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 10,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  roleChipActive: {
    backgroundColor: "#10b98115",
    borderColor: "#10b981",
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#4b5563",
  },
  roleChipTextActive: {
    color: "#10b981",
  },
  roleAcceptanceRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  roleAcceptanceText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
    fontWeight: "600" as const,
  },
  auditLogCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  auditLogHeader: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  auditLogAction: {
    fontSize: 17,
    fontWeight: "800" as const,
    color: "#111827",
  },
  auditLogDate: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 3,
  },
  auditTypeBadge: {
    backgroundColor: "#10b98115",
    borderWidth: 1,
    borderColor: "#10b98130",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  auditTypeText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#10b981",
  },
  healthSeverityBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  healthSeverityCritical: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  healthSeverityWarning: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  healthSeverityText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#111827",
  },
  auditLogDetails: {
    gap: 8,
  },
  healthIssueList: {
    gap: 8,
    marginTop: 4,
  },
  healthIssueRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 10,
  },
  healthIssueText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#374151",
    fontWeight: "600" as const,
  },
  auditMetadata: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    lineHeight: 18,
    color: "#4b5563",
  },
  submissionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  submissionHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    gap: 6,
  },
  submissionUser: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
    flex: 1,
  },
  submissionDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  submissionDetails: {
    gap: 8,
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 12,
  },
  submissionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  submissionLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
    width: 100,
  },
  submissionValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
    flex: 1,
  },
  submissionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  submissionRegId: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  activityCountBadge: {
    backgroundColor: "#10b981",
    borderRadius: 20,
    minWidth: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  activityCountText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
  },
  dateGroupCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  dateGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  dateGroupDate: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: "#111827",
  },
  dateGroupSubtext: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  totalEntriesBadge: {
    backgroundColor: "#10b98115",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#10b98130",
  },
  totalEntriesText: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#10b981",
    lineHeight: 20,
  },
  totalEntriesLabel: {
    fontSize: 10,
    color: "#10b981",
    fontWeight: "600" as const,
  },
  usersList: {
    gap: 8,
  },
  userRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userRowId: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "500" as const,
  },
  userRowName: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600" as const,
  },
  userCountBadge: {
    backgroundColor: "#10b981",
    borderRadius: 8,
    minWidth: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  userCountText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#fff",
  },
  sectionDivider: {
    paddingTop: 8,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#6b7280",
    paddingTop: 8,
  },
  ratingSummaryCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 8,
  },
  ratingSummaryLeft: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    minWidth: 80,
  },
  ratingSummaryScore: {
    fontSize: 40,
    fontWeight: "800" as const,
    color: "#111827",
    lineHeight: 44,
  },
  ratingSummaryStars: {
    flexDirection: "row" as const,
    gap: 2,
  },
  ratingSummaryCount: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  ratingSummaryRight: {
    flex: 1,
    gap: 6,
    justifyContent: "center" as const,
  },
  ratingBarRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  ratingBarLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#374151",
    width: 14,
    textAlign: "right" as const,
  },
  ratingBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
    overflow: "hidden" as const,
  },
  ratingBarFill: {
    height: 8,
    backgroundColor: "#f59e0b",
    borderRadius: 4,
  },
  ratingBarCount: {
    fontSize: 12,
    color: "#6b7280",
    width: 24,
    textAlign: "right" as const,
  },
  ratingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  ratingCardHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  ratingCardStars: {
    flexDirection: "row" as const,
    gap: 2,
  },
  ratingCardDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  ratingCardUser: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500" as const,
  },
  ratingCardFeedback: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
    marginTop: 2,
  },
  orderItemsList: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 4,
  },
  orderItemsTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#6b7280",
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  orderItemRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 4,
  },
  orderItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
  },
  orderItemQty: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#6b7280",
    minWidth: 30,
    textAlign: "center" as const,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#10b981",
    minWidth: 80,
    textAlign: "right" as const,
  },
  printStickerBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: "#0f766e",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 46,
    marginTop: 8,
  },
  printStickerText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#fff",
  },
  suggestionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 10,
  },
  suggestionHeader: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  suggestionUser: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500" as const,
    flex: 1,
    marginRight: 8,
  },
  suggestionDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  suggestionText: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
  },
  magazineSubmissionTitle: {
    fontSize: 17,
    color: "#111827",
    fontWeight: "800" as const,
    lineHeight: 22,
  },
  magazinePictorialAdminImage: {
    width: "100%",
    height: 190,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: "#e5e7eb",
  },
  archiveHeaderBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    gap: 12,
  },
  archiveHeaderTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: "#111827",
  },
  archiveHeaderSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  selectAllBtn: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  selectAllBtnText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#374151",
  },
  archiveSummaryCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    backgroundColor: "#fef3c7",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fbbf2440",
  },
  archiveSummaryText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#92400e",
    flex: 1,
  },
  archiveUserCard: {
    flexDirection: "row" as const,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    alignItems: "flex-start" as const,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 2,
    borderColor: "transparent",
  },
  archiveUserCardSelected: {
    borderColor: "#ef4444",
    backgroundColor: "#fef2f210",
  },
  archiveCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 2,
  },
  archiveCheckboxSelected: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  archiveUserName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
  },
  archiveRegId: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "500" as const,
  },
  archiveMetaRow: {
    flexDirection: "row" as const,
    gap: 16,
    flexWrap: "wrap" as const,
    marginTop: 4,
  },
  archiveMetaItem: {
    gap: 2,
  },
  archiveMetaLabel: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "500" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  archiveMetaValue: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600" as const,
  },
  archiveActionBar: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  archiveActionBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: "#991b1b",
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  archiveActionBtnText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
  },
  archiveConfirmBody: {
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 8,
  },
  archiveConfirmText: {
    fontSize: 15,
    color: "#374151",
    textAlign: "center" as const,
    lineHeight: 22,
  },
  archiveConfirmWarning: {
    fontSize: 13,
    color: "#ef4444",
    fontWeight: "600" as const,
    textAlign: "center" as const,
  },
  archiveConfirmActions: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 12,
  },
  archiveCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center" as const,
  },
  archiveCancelBtnText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#374151",
  },
  archiveConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center" as const,
  },
});
