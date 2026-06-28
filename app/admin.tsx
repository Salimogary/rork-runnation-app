import { useState, useEffect, useMemo, useCallback } from "react";
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
  Clipboard,
  Share,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import type { AdminTermsRole } from "@/lib/admin-terms";
import { Package, ChevronRight, Edit, X, ClipboardCheck, LogOut, CheckCircle, XCircle, Calendar, Plus, Users, Download, ShoppingBag, Dumbbell, UserPlus, Upload, Activity, Star, Printer, Truck, MessageSquare, Archive, Trash2, AlertTriangle, ArrowLeft, BookOpen, Camera, FileText, ShieldAlert, Globe2, MapPin, CreditCard, MessageCircle, Save, Building2 } from "lucide-react-native";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { hasAdminPortalAccess } from "@/lib/role-session";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import { decode as decodeBase64 } from "base64-arraybuffer";
import { formatCountryList, formatCountryName } from "@/constants/country-utils";

function getRoleRequestLinks(request: PendingRoleRequest) {
  return [
    { label: "Website", url: request.websiteUrl },
    { label: "LinkedIn", url: request.linkedinUrl },
    { label: "Social", url: request.socialUrl },
  ].filter((link): link is { label: string; url: string } => Boolean(link.url));
}

type AdminTab =
  | "orders"
  | "stock"
  | "approvals"
  | "events"
  | "enrollments"
  | "payments"
  | "whatsapp"
  | "clubAdmin"
  | "clubRequests"
  | "activityUploads"
  | "externalActivities"
  | "ratings"
  | "suggestions"
  | "magazine"
  | "myArticles"
  | "adminTerms"
  | "roles"
  | "dataHealth"
  | "auditLog"
  | "milestones"
  | "resign"
  | "moderation"
  | "reports"
  | "myTeam"
  | "archive";

type AuditLogUserType = "all" | "country_admin" | "country_coordinator" | "club_coordinator";
type ClubRequestStatusFilter = "pending" | "approved" | "rejected";

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
  | "event_organizer"
  | "shop_manager"
  | "junior_runners_club_coordinator"
  | "golden_age_runners_club_coordinator"
  | "treadmill_runners_club_coordinator"
  | "para_runners_club_coordinator"
  | "smartfit_club_coordinator"
  | "magazine_editor"
  | "chat_room_administrator"
  | "magazine_columnist_fitness_coach"
  | "magazine_columnist_sports_journalist"
  | "magazine_columnist_motivation_speaker";
type AssignableRoleName = "country_coordinator" | "club_coordinator" | "event_organizer";
type EventEntryMode = "free" | "club_approved" | "paid";
type EventTypeMode = "same_day" | "recurring" | "multiday";
type EventRecurrenceFrequency = "weekly" | "monthly";
type EventMonthlyMode = "day_of_month" | "weekend";
type EventOrganizerMode = "self" | "other";
type AdminMenuPurposeGroup = "approvals" | "reporting" | "administration" | "operations";
type MagazineCreatePage = "News" | "Events" | "Community" | "Columns" | "Gallery";
type MagazineReviewStatusFilter = "pending" | "accepted" | "rejected";

const MEDAL_DISTANCE_OPTIONS_KM = [3, 5, 10, 21.1, 42.2];

const GLOBAL_ROLE_ACCESS_NAMES = new Set<ManageableRoleName>([
  "country_admin",
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
  "smartfit_club_coordinator",
  "magazine_editor",
  "chat_room_administrator",
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
]);

const SPECIAL_CLUB_ROLE_CLUB_NAMES: Partial<Record<ManageableRoleName, string>> = {
  junior_runners_club_coordinator: "Junior Runners Club",
  golden_age_runners_club_coordinator: "Golden Age Runners Club",
  treadmill_runners_club_coordinator: "Treadmill Runners Club",
  para_runners_club_coordinator: "Para Runners Club",
  smartfit_club_coordinator: "SmartFit Club",
};

const MAGAZINE_CREATE_PAGES: MagazineCreatePage[] = ["News", "Events", "Community", "Columns", "Gallery"];
const MAGAZINE_REVIEW_STATUS_TABS: Array<{ key: MagazineReviewStatusFilter; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
];

const RUN_DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => {
  const day = index + 1;
  const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  return { value: day, label: `${day}${suffix}` };
});

const MONTH_WEEKEND_OPTIONS = Array.from({ length: 5 }, (_, index) => {
  const week = index + 1;
  const suffix = week === 1 ? "st" : week === 2 ? "nd" : week === 3 ? "rd" : "th";
  return { value: week, label: `${week}${suffix}` };
});

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
  websiteUrl: string | null;
  linkedinUrl: string | null;
  socialUrl: string | null;
  applicantStatement: string | null;
  contactConsent: boolean;
  contactInstructions: string | null;
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

interface MyTeamMember {
  assignmentId: number;
  userId: string;
  name: string;
  username: string | null;
  email: string | null;
  roleName: ManageableRoleName | string;
  countryCode: string | null;
  countryName: string | null;
  userCountryCode: string | null;
  userCountryName: string | null;
  clubName: string | null;
  organizerName: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  socialUrl: string | null;
  applicantStatement: string | null;
  contactConsent: boolean;
  contactInstructions: string | null;
  assignedAt: string;
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

function getAccountHealthRecommendation(issueCode: string): string {
  switch (issueCode) {
    case "missing_profile":
      return "Create/repair profile, or consider auth account deletion if it is unused.";
    case "missing_registration":
      return "Relink the profile to a registration before the user continues.";
    case "missing_contact":
      return "Create the missing contact row from the auth email.";
    case "registration_email_unverified":
    case "contact_email_unverified":
      return "Mark verified for trusted Google/Apple sign-ins.";
    case "email_mismatch":
      return "Confirm the correct login email, then update contact details.";
    case "username_mismatch":
      return "Sync username values between profile and registration.";
    case "orphan_profile":
      return "Delete orphan profile or recreate the missing auth user if needed.";
    case "unlinked_registration":
      return "Invite user to sign in or link this registration to an auth profile.";
    case "uuid_pk_missing_default":
      return "Add a UUID default generator migration for this primary key.";
    default:
      return "Review the affected accounts and apply the safest repair.";
  }
}

function getCountryFlag(countryCode?: string | null): string {
  const code = String(countryCode || "").trim().toUpperCase();
  if (code.length !== 2) return "";
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}

function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getDefaultAuditStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return toDateInputValue(date);
}

interface ChatModerationReport {
  reportId: string;
  reporterRegistrationId: string;
  reportedRegistrationId: string | null;
  postId: string | null;
  commentId: string | null;
  reasonCategory: string;
  description: string;
  screenshotUrl: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  reporterName: string | null;
  reportedName: string | null;
  reportedUsername: string | null;
  reportedCountry: string | null;
  offenderFlags: {
    confirmed_flags: number;
    dismissed_reports: number;
    is_banned: boolean;
    ban_reason: string | null;
    suspended_until: string | null;
    suspension_status: string | null;
  } | null;
}

interface DeletedChatLog {
  logId: number | string;
  createdAt: string;
  contentType: string;
  contentId: string | null;
  deletionSource: string;
  deletedByRole: string;
  deletedByName: string;
  deletedByUsername: string | null;
  ownerName: string | null;
  ownerUsername: string | null;
  ownerRegistrationId: string | null;
  contentPreview: string;
  hadPhoto: boolean;
}

function formatDisplayDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function isValidDisplayDate(value: string): boolean {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return false;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function toApiDate(value: string): string {
  const [day, month, year] = value.split("-");
  return `${year}-${month}-${day}`;
}

function fromApiDate(value: string | null | undefined): string {
  const normalized = String(value || "").slice(0, 10);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function stripRtfToPlainText(value: string): string {
  return value
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeArticleText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isSupportedArticleTextFile(name?: string | null, mimeType?: string | null): boolean {
  const lowerName = String(name || "").toLowerCase();
  const lowerMime = String(mimeType || "").toLowerCase();
  return (
    [".txt", ".text", ".md", ".markdown", ".csv", ".log", ".rtf"].some((ext) =>
      lowerName.endsWith(ext)
    ) ||
    [
      "text/plain",
      "text/markdown",
      "text/csv",
      "text/rtf",
      "application/rtf",
    ].includes(lowerMime)
  );
}

async function readArticleFileText(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === "web") {
    const webFile = (asset as any).file;
    if (webFile && typeof webFile.text === "function") {
      return webFile.text();
    }

    const response = await fetch(asset.uri);
    if (!response.ok) {
      throw new Error("Could not read the selected article text file.");
    }
    return response.text();
  }

  return FileSystem.readAsStringAsync(asset.uri, { encoding: "utf8" });
}

function parseClubMemberCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one member.");

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const column = (name: string) => headers.indexOf(name);
  if (column("name") === -1 || column("phone") === -1 || column("email") === -1) {
    throw new Error("CSV columns must include name, nickname, phone, and email.");
  }
  return rows.slice(1).map((values) => ({
    name: values[column("name")] || "",
    nickname: column("nickname") >= 0 ? values[column("nickname")] || null : null,
    phone: values[column("phone")] || null,
    email: values[column("email")] || null,
  })).filter((member) => member.name && (member.phone || member.email));
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
  username?: string | null;
  runnerName?: string | null;
  isTreadmillClubMember?: boolean;
  treadmillClubMember?: "Y" | "N" | string;
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

interface ClubDeletionClub {
  clubId: string;
  clubName: string;
  country: string | null;
  location: string | null;
  memberCount: number;
  inactiveFlag?: boolean;
  inactiveReason?: string | null;
  canRequestDeletion: boolean;
}

interface ClubDeletionRequest {
  requestId: string;
  clubId: string;
  clubName: string;
  country: string | null;
  requestedBy: string;
  reason: string;
  status: string;
  eligibleAt: string;
  actionedBy: string | null;
  actionedAt: string | null;
  createdAt: string;
}

interface ClubPaymentMember {
  registrationId: string;
  name: string;
  username: string | null;
  sex: string | null;
  status: "unpaid" | "pending" | "paid" | "waived";
  amountPaid: number;
  paidAt: string | null;
  notes: string | null;
}

interface ClubPaymentItem {
  paymentId: string;
  clubId: string;
  clubName: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  dueDate: string | null;
  isActive: boolean;
  createdAt: string;
  members: ClubPaymentMember[];
  totals: {
    members: number;
    paid: number;
    unpaid: number;
    pending: number;
    waived: number;
    collected: number;
  };
}

interface ClubPaymentClub {
  clubId: string;
  clubName: string;
  country: string | null;
}

interface ClubPayoutRequest {
  requestId: string;
  clubId: string;
  clubName: string;
  amount: number;
  currency: string;
  destinationType: "bank" | "mobile_money";
  destinationDetails: string;
  status: string;
  createdAt: string;
}

interface ClubWhatsappAdminClub {
  clubId: string;
  clubName: string;
  country: string | null;
}

interface ClubWhatsappAdminLink {
  linkId: string;
  clubId: string;
  clubName: string;
  link: string;
}

interface AdminWhatsappGlobalLink {
  linkType: "service_team" | "admins";
  link: string;
  updatedAt: string | null;
}

type WhatsappSection = "club" | "service_team" | "admins";

interface AdminMilestoneRow {
  key: string;
  category: string;
  milestone: string;
  threshold?: number;
  milestoneDate: string | null;
  note?: string | null;
}

const EVENT_POSTER_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

function detectMimeTypeFromBase64(base64: string): string | null {
  const normalized = normalizeImageBase64(base64);
  if (normalized.startsWith("/9j/")) return "image/jpeg";
  if (normalized.startsWith("iVBORw0KGgo")) return "image/png";
  if (normalized.startsWith("UklGR")) return "image/webp";
  if (normalized.startsWith("AAAAIGZ0eXBhdmlm") || normalized.startsWith("AAAAHGZ0eXBhdmlm")) {
    return "image/avif";
  }
  return null;
}

function normalizeImageBase64(value: string): string {
  return value
    .trim()
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/\s/g, "");
}

function isMagazineImageUrl(value?: string | null): boolean {
  return /\.(jpe?g|png|webp)(\?|#|$)/i.test(String(value || "").trim());
}

function getMagazineImageUrl(...values: Array<string | null | undefined>): string | null {
  return values.find((value): value is string => isMagazineImageUrl(value)) ?? null;
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

async function encodeMagazineArticlePhotoForUpload(
  uri: string,
  mimeType?: string | null
): Promise<{ base64: string; mimeType: string }> {
  let base64 = "";
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read the selected magazine photo."));
      reader.readAsDataURL(blob);
    });
    base64 = normalizeImageBase64(dataUrl);
  } else {
    base64 = normalizeImageBase64(
      await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      })
    );
  }

  const detectedMimeType = detectMimeTypeFromBase64(base64);
  if (!base64 || !detectedMimeType || !["image/jpeg", "image/png", "image/webp"].includes(detectedMimeType)) {
    throw new Error("Could not read the selected magazine photo as a JPG, PNG, or WEBP image.");
  }

  const providedMimeType = String(mimeType || "").trim().toLowerCase();
  if (providedMimeType && ["image/jpeg", "image/png", "image/webp"].includes(providedMimeType) && providedMimeType !== detectedMimeType) {
    throw new Error("The selected magazine photo type did not match the image file bytes.");
  }

  return {
    base64,
    mimeType: detectedMimeType,
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
  const { roleSession, user, isLoading: isAuthLoading, isRoleSessionLoading, refreshRoleSession } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab | null>(null);
  const [eventApprovalTab, setEventApprovalTab] = useState<"pending" | "approved" | "closed">("pending");
  const [selectedOrganizerFilter, setSelectedOrganizerFilter] = useState<string>("all");
  const [showEventOrganizerFilterModal, setShowEventOrganizerFilterModal] = useState<boolean>(false);
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
  const [registrationClosesAt, setRegistrationClosesAt] = useState<string>("");
  const [eventCountry, setEventCountry] = useState<string>("");
  const [eventOrganizerMode, setEventOrganizerMode] = useState<EventOrganizerMode>("self");
  const [eventOrganizerId, setEventOrganizerId] = useState<string>("");
  const [eventExternalOrganizerName, setEventExternalOrganizerName] = useState<string>("");
  const [eventLocation, setEventLocation] = useState<string>("");
  const [eventTypeMode, setEventTypeMode] = useState<EventTypeMode>("same_day");
  const [eventRecurrenceWeekday, setEventRecurrenceWeekday] = useState<number>(3);
  const [eventRecurrenceFrequency, setEventRecurrenceFrequency] = useState<EventRecurrenceFrequency>("weekly");
  const [eventRecurrenceWeekdays, setEventRecurrenceWeekdays] = useState<number[]>([3]);
  const [eventMonthlyMode, setEventMonthlyMode] = useState<EventMonthlyMode>("day_of_month");
  const [eventRecurrenceMonthDay, setEventRecurrenceMonthDay] = useState<number>(1);
  const [eventRecurrenceWeekOfMonth, setEventRecurrenceWeekOfMonth] = useState<number>(1);
  const [eventIsVirtual, setEventIsVirtual] = useState<boolean>(false);
  const [eventEntry, setEventEntry] = useState<EventEntryMode>("free");
  const [eventHasMedal, setEventHasMedal] = useState<boolean>(false);
  const [eventEntryFee, setEventEntryFee] = useState<string>("");
  const [eventPaymentDetails, setEventPaymentDetails] = useState<string>("");
  const [eventRegistrationLink, setEventRegistrationLink] = useState<string>("");
  const [eventOrganizerPaymentLink, setEventOrganizerPaymentLink] = useState<string>("");
  const [eventRunNationPaymentLinkEnabled, setEventRunNationPaymentLinkEnabled] = useState<boolean>(false);
  const [eventParticipantLimitEnabled, setEventParticipantLimitEnabled] = useState<boolean>(false);
  const [eventParticipantLimit, setEventParticipantLimit] = useState<string>("");
  const [eventMagazineArticleTitle, setEventMagazineArticleTitle] = useState<string>("");
  const [eventMagazineArticleBody, setEventMagazineArticleBody] = useState<string>("");
  const [eventMagazineWriterName, setEventMagazineWriterName] = useState<string>("");
  const [eventMagazineArticleFileName, setEventMagazineArticleFileName] = useState<string | null>(null);
  const [organizerNameInput, setOrganizerNameInput] = useState<string>("");
  const [organizerDescriptionInput, setOrganizerDescriptionInput] = useState<string>("");
  const [organizerCountryInput, setOrganizerCountryInput] = useState<string>("");
  const [eventPosterAsset, setEventPosterAsset] = useState<{
    uri: string;
    mimeType?: string | null;
  } | null>(null);
  const [eventPosterPreview, setEventPosterPreview] = useState<string | null>(null);
  const [eventPosterMarkedForRemoval, setEventPosterMarkedForRemoval] = useState<boolean>(false);
  const [eventMagazinePhotoAsset, setEventMagazinePhotoAsset] = useState<{
    uri: string;
    base64?: string | null;
    mimeType?: string | null;
  } | null>(null);
  const [eventMagazinePhotoPreview, setEventMagazinePhotoPreview] = useState<string | null>(null);
  const [selectedEventPreview, setSelectedEventPreview] = useState<any | null>(null);
  const [selectedPosterPreview, setSelectedPosterPreview] = useState<{ url: string; title: string } | null>(null);
  const [eventMinimumDistanceEnabled, setEventMinimumDistanceEnabled] = useState<boolean>(false);
  const [eventMedalDistances, setEventMedalDistances] = useState<number[]>([]);
  const [eventCustomMedalDistance, setEventCustomMedalDistance] = useState<string>("");
  const [medalMinDailyDistance, setMedalMinDailyDistance] = useState<string>("");
  const [medalMinCumulativeDistance, setMedalMinCumulativeDistance] = useState<string>("");
  const [medalDateStart, setMedalDateStart] = useState<string>("");
  const [medalDateEnd, setMedalDateEnd] = useState<string>("");
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState<boolean>(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [auditStartDate, setAuditStartDate] = useState<string>(getDefaultAuditStartDate());
  const [auditEndDate, setAuditEndDate] = useState<string>(toDateInputValue(new Date()));
  const [auditUserType, setAuditUserType] = useState<AuditLogUserType>("all");
  const [registrationReportStartDate, setRegistrationReportStartDate] = useState<string>(getDefaultAuditStartDate());
  const [registrationReportEndDate, setRegistrationReportEndDate] = useState<string>(toDateInputValue(new Date()));
  const [clubActivityStartDate, setClubActivityStartDate] = useState<string>(getDefaultAuditStartDate());
  const [clubActivityEndDate, setClubActivityEndDate] = useState<string>(toDateInputValue(new Date()));
  const [selectedActivityReportClubId, setSelectedActivityReportClubId] = useState<string>("");
  const [isExportingClubActivity, setIsExportingClubActivity] = useState(false);
  const [isDownloadingAuditLog, setIsDownloadingAuditLog] = useState<boolean>(false);
  const [adminTermsAcceptedChecked, setAdminTermsAcceptedChecked] = useState<boolean>(false);
  const [showRoleModal, setShowRoleModal] = useState<boolean>(false);
  const [roleAccessTab, setRoleAccessTab] = useState<"pending" | "active">("pending");
  const [selectedMagazinePreview, setSelectedMagazinePreview] = useState<any | null>(null);
  const [selectedMagazineEditTarget, setSelectedMagazineEditTarget] = useState<any | null>(null);
  const [magazineEditTitle, setMagazineEditTitle] = useState("");
  const [magazineEditAuthor, setMagazineEditAuthor] = useState("");
  const [magazineEditCategory, setMagazineEditCategory] = useState("");
  const [magazineEditPitch, setMagazineEditPitch] = useState("");
  const [magazineEditBody, setMagazineEditBody] = useState("");
  const [magazineEditExternalLink, setMagazineEditExternalLink] = useState("");
  const [magazineEditEventDate, setMagazineEditEventDate] = useState("");
  const [magazineEditPhotoAsset, setMagazineEditPhotoAsset] = useState<{
    uri: string;
    base64?: string | null;
    mimeType?: string | null;
  } | null>(null);
  const [magazineEditPhotoPreview, setMagazineEditPhotoPreview] = useState<string | null>(null);
  const [isPreparingMagazineEditPhoto, setIsPreparingMagazineEditPhoto] = useState(false);
  const [magazineMode, setMagazineMode] = useState<"create" | "edit">("edit");
  const [magazineReviewStatusFilter, setMagazineReviewStatusFilter] = useState<MagazineReviewStatusFilter>("pending");
  const [magazineDateSort, setMagazineDateSort] = useState<"newest" | "oldest">("newest");
  const [newsTitle, setNewsTitle] = useState<string>("");
  const [newsAuthor, setNewsAuthor] = useState<string>("");
  const [newsBody, setNewsBody] = useState<string>("");
  const [newsExternalLink, setNewsExternalLink] = useState<string>("");
  const [newsPage, setNewsPage] = useState<MagazineCreatePage>("News");
  const [newsPhotoAsset, setNewsPhotoAsset] = useState<{
    uri: string;
    base64?: string | null;
    mimeType?: string | null;
  } | null>(null);
  const [newsPhotoPreview, setNewsPhotoPreview] = useState<string | null>(null);
  const [editingRoleAssignment, setEditingRoleAssignment] = useState<ActiveRoleAssignment | null>(null);
  const [roleRequestEmail, setRoleRequestEmail] = useState<string>("");
  const [selectedRoleName, setSelectedRoleName] = useState<AssignableRoleName>("country_coordinator");
  const [selectedRoleCountryCode, setSelectedRoleCountryCode] = useState<string>("");
  const [selectedRoleClubId, setSelectedRoleClubId] = useState<string>("");
  const [selectedPaymentClubId, setSelectedPaymentClubId] = useState<string>("");
  const [newPaymentTitle, setNewPaymentTitle] = useState<string>("");
  const [newPaymentAmount, setNewPaymentAmount] = useState<string>("");
  const [newPaymentCurrency, setNewPaymentCurrency] = useState<string>("UGX");
  const [newPaymentDueDate, setNewPaymentDueDate] = useState<string>("");
  const [newPaymentDescription, setNewPaymentDescription] = useState<string>("");
  const [payoutAmount, setPayoutAmount] = useState<string>("");
  const [payoutDestinationType, setPayoutDestinationType] = useState<"bank" | "mobile_money">("mobile_money");
  const [payoutDestinationDetails, setPayoutDestinationDetails] = useState<string>("");
  const [selectedWhatsappClubId, setSelectedWhatsappClubId] = useState<string>("");
  const [whatsappSection, setWhatsappSection] = useState<WhatsappSection>("club");
  const [whatsappLinkInput, setWhatsappLinkInput] = useState<string>("");
  const [serviceTeamWhatsappInput, setServiceTeamWhatsappInput] = useState<string>("");
  const [adminWhatsappInput, setAdminWhatsappInput] = useState<string>("");
  const [clubRequestStatusFilter, setClubRequestStatusFilter] = useState<ClubRequestStatusFilter>("pending");
  const [directoryClubId, setDirectoryClubId] = useState("");
  const [directoryMemberId, setDirectoryMemberId] = useState<string | null>(null);
  const [directoryName, setDirectoryName] = useState("");
  const [directoryNickname, setDirectoryNickname] = useState("");
  const [directoryPhone, setDirectoryPhone] = useState("");
  const [directoryEmail, setDirectoryEmail] = useState("");
  const [clubRequestCountryFilter, setClubRequestCountryFilter] = useState<string>("all");
  const [clubProfileName, setClubProfileName] = useState<string>("");
  const [clubProfileLocation, setClubProfileLocation] = useState<string>("");
  const [clubProfileDescription, setClubProfileDescription] = useState<string>("");
  const [clubProfilePresenceTowns, setClubProfilePresenceTowns] = useState<string>("");
  const [adminProfileName, setAdminProfileName] = useState<string>("");
  const [adminProfileLocation, setAdminProfileLocation] = useState<string>("");
  const [adminProfileDescription, setAdminProfileDescription] = useState<string>("");
  const [adminProfilePresenceTowns, setAdminProfilePresenceTowns] = useState<string>("");
  const [resignationReason, setResignationReason] = useState<string>("");
  const [clubDeletionReasonById, setClubDeletionReasonById] = useState<Record<string, string>>({});
  const [milestoneDateInputs, setMilestoneDateInputs] = useState<Record<string, string>>({});
  const [isExportingMilestones, setIsExportingMilestones] = useState(false);
  const [selectedReportEventId, setSelectedReportEventId] = useState<string>("");
  const [isExportingClubStatus, setIsExportingClubStatus] = useState(false);
  const [isExportingEventResults, setIsExportingEventResults] = useState(false);

  const queryClient = useQueryClient();
  const hasRoleBasedAccess = hasAdminPortalAccess(roleSession);
  const isSuperAdmin =
    roleSession.isSuperAdmin ||
    roleSession.roles.some((role) => {
      const roleName = role.roleName.trim().toLowerCase();
      return roleName === "super_admin" || roleName === "global_admin";
    });
  const isCountryAdmin = roleSession.isCountryAdmin;
  const isCountryCoordinator = roleSession.isCountryCoordinator;
  const isClubCoordinator = roleSession.isClubCoordinator;
  const isSpecialClubCoordinator = roleSession.isSpecialClubCoordinator;
  const isEventOrganizer = roleSession.isEventOrganizer;
  const isMagazineEditor = roleSession.isMagazineEditor;
  const isMagazineColumnist = roleSession.isMagazineColumnist;
  const isFitnessCoachColumnist = roleSession.roles.some((role) => role.roleName === "magazine_columnist_fitness_coach");
  const isChatRoomAdministrator = roleSession.isChatRoomAdministrator;
  const isJuniorRunnersCoordinator = roleSession.roles.some((role) => role.roleName === "junior_runners_club_coordinator");
  const isGoldenAgeCoordinator = roleSession.roles.some((role) => role.roleName === "golden_age_runners_club_coordinator");
  const isTreadmillCoordinator = roleSession.roles.some((role) => role.roleName === "treadmill_runners_club_coordinator");
  const isParaRunnersCoordinator = roleSession.roles.some((role) => role.roleName === "para_runners_club_coordinator");
  const isSmartFitCoordinator = roleSession.roles.some((role) => role.roleName === "smartfit_club_coordinator");
  const pendingClubSetupRole = roleSession.roles.find((role) => role.roleName === "club_coordinator" && role.countryCode && !role.clubId);
  const needsClubProfileSetup = isClubCoordinator && Boolean(pendingClubSetupRole) && roleSession.clubCoordinatorScopes.length === 0;
  const isAuthenticated = hasRoleBasedAccess;
  const isChecking = isAuthLoading || isRoleSessionLoading;
  const { data: countryList = [] } = trpc.auth.getCountries.useQuery();
  const canUseProtectedAdminRoutes = hasRoleBasedAccess;
  const canUseEventAdminRoutes =
    isSuperAdmin ||
    isCountryAdmin ||
    isCountryCoordinator ||
    isClubCoordinator ||
    isSpecialClubCoordinator ||
    isEventOrganizer;
  const protectedTabs: AdminTab[] = ["orders", "events", "enrollments", "payments", "whatsapp", "clubAdmin", "clubRequests", "activityUploads", "externalActivities", "moderation", "adminTerms", "roles", "dataHealth", "auditLog", "milestones", "reports", "myTeam", "myArticles", "archive"];

  const allowedTabs = useMemo<AdminTab[]>(() => {
    if (isSuperAdmin) {
      return ["orders", "stock", "approvals", "events", "enrollments", "payments", "whatsapp", "clubAdmin", "clubRequests", "activityUploads", "externalActivities", "ratings", "suggestions", "magazine", "moderation", "reports", "myTeam", "adminTerms", "roles", "dataHealth", "auditLog", "milestones", "archive"];
    }
    if (isCountryAdmin) {
      return ["orders", "stock", "events", "enrollments", "payments", "whatsapp", "clubAdmin", "clubRequests", "activityUploads", "externalActivities", "magazine", "reports", "adminTerms", "resign"];
    }
    if (isCountryCoordinator) {
      return ["orders", "stock", "approvals", "events", "enrollments", "payments", "whatsapp", "clubAdmin", "clubRequests", "activityUploads", "externalActivities", "magazine", "reports", "myTeam", "adminTerms", "archive", "resign"];
    }
    if (isClubCoordinator) {
      if (needsClubProfileSetup) {
        return ["clubAdmin", "adminTerms", "resign"];
      }
      return ["approvals", "events", "enrollments", "payments", "whatsapp", "clubAdmin", "clubRequests", "activityUploads", "externalActivities", "magazine", "reports", "adminTerms", "resign"];
    }
    if (isSpecialClubCoordinator) {
      return isTreadmillCoordinator
        ? ["approvals", "events", "whatsapp", "magazine", "reports", "adminTerms", "resign"]
        : ["events", "externalActivities", "whatsapp", "magazine", "reports", "adminTerms", "resign"];
    }
    if (isEventOrganizer) {
      return ["clubAdmin", "events", "enrollments", "reports", "adminTerms", "resign"];
    }
    if (isMagazineEditor) {
      return ["magazine", "myTeam", "adminTerms", "resign"];
    }
    if (isMagazineColumnist) {
      return ["myArticles", "magazine", "adminTerms", "resign"];
    }
    if (isChatRoomAdministrator) {
      return ["moderation", "adminTerms", "resign"];
    }
    return [];
  }, [isSuperAdmin, isCountryAdmin, isCountryCoordinator, isClubCoordinator, needsClubProfileSetup, isSpecialClubCoordinator, isTreadmillCoordinator, isEventOrganizer, isMagazineEditor, isMagazineColumnist, isChatRoomAdministrator]);

  const adminRoleLabel = useMemo(() => {
  if (isSuperAdmin) return "Global Admin";
    if (isCountryAdmin) return "Country Admin";
    if (isCountryCoordinator) return "Country Coordinator";
    if (isClubCoordinator) return "Club Coordinator";
    if (isJuniorRunnersCoordinator) return "Junior Runners Club Coordinator";
    if (isGoldenAgeCoordinator) return "Golden Age Runners Club Coordinator";
    if (isTreadmillCoordinator) return "Treadmill Runners Club Coordinator";
    if (isParaRunnersCoordinator) return "Para Runners Club Coordinator";
    if (isSmartFitCoordinator) return "SmartFit Club Coordinator";
    if (isSpecialClubCoordinator) return "Club Coordinator";
    if (isEventOrganizer) return "Event Organizer";
    if (isMagazineEditor) return "Magazine Editor";
    if (isFitnessCoachColumnist) return "Fitness Coach";
    if (isMagazineColumnist) return "Magazine Columnist";
    if (isChatRoomAdministrator) return "Chat Room Administrator";
    return "Role-Based Admin";
  }, [isSuperAdmin, isCountryAdmin, isCountryCoordinator, isClubCoordinator, isJuniorRunnersCoordinator, isGoldenAgeCoordinator, isTreadmillCoordinator, isParaRunnersCoordinator, isSmartFitCoordinator, isSpecialClubCoordinator, isEventOrganizer, isMagazineEditor, isFitnessCoachColumnist, isMagazineColumnist, isChatRoomAdministrator]);

  const adminTermsRole = useMemo<AdminTermsRole>(() => {
    if (isSuperAdmin) return "global_admin";
    if (isCountryAdmin) return "country_admin";
    if (isCountryCoordinator) return "country_coordinator";
    if (isClubCoordinator) return "club_coordinator";
    if (isJuniorRunnersCoordinator) return "junior_runners_club_coordinator";
    if (isGoldenAgeCoordinator) return "golden_age_runners_club_coordinator";
    if (isTreadmillCoordinator) return "treadmill_runners_club_coordinator";
    if (isParaRunnersCoordinator) return "para_runners_club_coordinator";
    if (isSmartFitCoordinator) return "smartfit_club_coordinator";
    if (isSpecialClubCoordinator) return "special_club_coordinator";
    if (isMagazineEditor) return "magazine_editor";
    if (isMagazineColumnist) return "magazine_columnist";
    if (isChatRoomAdministrator) return "chat_room_administrator";
    return "event_organizer";
  }, [isSuperAdmin, isCountryAdmin, isCountryCoordinator, isClubCoordinator, isJuniorRunnersCoordinator, isGoldenAgeCoordinator, isTreadmillCoordinator, isParaRunnersCoordinator, isSmartFitCoordinator, isSpecialClubCoordinator, isEventOrganizer, isMagazineEditor, isMagazineColumnist, isChatRoomAdministrator]);

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
    if (isChecking) {
      return;
    }
    if (!user || !hasRoleBasedAccess) {
      router.replace("/admin-login" as any);
    }
  }, [hasRoleBasedAccess, isChecking, router, user]);

  useEffect(() => {
    if (activeTab && !allowedTabs.includes(activeTab)) {
      setActiveTab(null);
    }
  }, [activeTab, allowedTabs]);

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
      enabled: canUseProtectedAdminRoutes && canUseEventAdminRoutes && (activeTab === "events" || activeTab === "reports" || activeTab === "enrollments"),
      retry: 1,
      refetchOnMount: true,
    }
  );

  const { data: eventOrganizers = [] } = trpc.admin.getEventOrganizers.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && activeTab === "events",
    refetchOnMount: true,
  });

  const {
    data: adminProfile,
    isLoading: adminProfileLoading,
    error: adminProfileError,
    refetch: refetchAdminProfile,
  } = trpc.admin.getAdminProfile.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && (activeTab === "clubAdmin" || activeTab === "events"),
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!adminProfile) return;
    setAdminProfileName(adminProfile.name || "");
    setAdminProfileLocation(adminProfile.location || "");
    setAdminProfileDescription(adminProfile.description || "");
    setAdminProfilePresenceTowns((adminProfile.presenceTowns || []).join(", "));
  }, [adminProfile]);

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
      enabled: false,
      refetchOnMount: true,
    }
  );

  const {
    data: clubStatusReport,
    isLoading: clubStatusReportLoading,
    error: clubStatusReportError,
    refetch: refetchClubStatusReport,
  } = trpc.admin.getClubStatusReport.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && activeTab === "reports" && (isClubCoordinator || isSpecialClubCoordinator || isSuperAdmin || isCountryAdmin || isCountryCoordinator),
    refetchOnMount: true,
  });

  const {
    data: eventResultsReport,
    isLoading: eventResultsReportLoading,
    error: eventResultsReportError,
    refetch: refetchEventResultsReport,
  } = trpc.admin.getEventResultsReport.useQuery(
    { eventId: selectedReportEventId },
    {
      enabled: canUseProtectedAdminRoutes && activeTab === "reports" && !!selectedReportEventId,
      refetchOnMount: true,
    }
  );

  const {
    data: registrationGrowthReport,
    isLoading: registrationGrowthReportLoading,
    error: registrationGrowthReportError,
    refetch: refetchRegistrationGrowthReport,
  } = trpc.admin.getRegistrationGrowthReport.useQuery(
    {
      startDate: registrationReportStartDate,
      endDate: registrationReportEndDate,
    },
    {
      enabled:
        canUseProtectedAdminRoutes &&
        activeTab === "reports" &&
        (isSuperAdmin || isCountryCoordinator),
      refetchOnMount: true,
    }
  );

  const {
    data: clubActivityReport,
    isLoading: clubActivityReportLoading,
    error: clubActivityReportError,
    refetch: refetchClubActivityReport,
  } = trpc.admin.getClubActivityReport.useQuery(
    {
      clubId: selectedActivityReportClubId,
      startDate: clubActivityStartDate,
      endDate: clubActivityEndDate,
    },
    {
      enabled:
        canUseProtectedAdminRoutes &&
        activeTab === "reports" &&
        !!selectedActivityReportClubId &&
        (isSuperAdmin || isCountryCoordinator || isClubCoordinator || isSpecialClubCoordinator),
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
    name?: string;
    country?: string | null;
  }

  const {
    data: inactiveUsers = [],
    isLoading: archiveLoading,
    refetch: refetchArchive,
  } = trpc.admin.getArchivedAccounts.useQuery(undefined, {
    enabled: isAuthenticated && activeTab === "archive",
  });
  const deleteArchivedAccountMutation = trpc.admin.deleteArchivedAccount.useMutation();

  const archiveMutation = useMutation({
    mutationFn: async (registrationIds: string[]) => {
      for (const regId of registrationIds) {
        await deleteArchivedAccountMutation.mutateAsync({ registrationId: regId });
      }
      return registrationIds;
    },
    onSuccess: (deletedIds) => {
      void refetchArchive();
      setSelectedArchiveIds([]);
      setArchiveConfirmVisible(false);
      Alert.alert('Accounts Deleted', `${deletedIds.length} archived account(s) were permanently deleted.`);
    },
    onError: (error: any) => {
      console.error('[Archive] Delete mutation error:', error);
      Alert.alert('Error', error.message || 'Failed to delete archived accounts');
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
      setSelectedArchiveIds(inactiveUsers.map(u => u.registrationId));
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
      const rows = data || [];
      const registrationIds = Array.from(new Set(rows.map((item) => item.registration_id).filter(Boolean)));
      const { data: registrations, error: registrationsError } = registrationIds.length > 0
        ? await supabase
            .from('registrations')
            .select('registration_id, first_name, other_names, username, country')
            .in('registration_id', registrationIds)
        : { data: [], error: null };

      if (registrationsError) {
        console.warn('Could not enrich suggestions with registration data:', registrationsError.message);
      }

      const registrationById = new Map((registrations || []).map((registration: any) => [registration.registration_id, registration]));
      return rows.map((item) => {
        const registration = registrationById.get(item.registration_id);
        const name = registration
          ? [registration.first_name, registration.other_names].filter(Boolean).join(' ').trim() ||
            registration.username ||
            item.registration_id
          : item.registration_id;
        return {
          ...item,
          name,
          country: registration?.country ?? null,
        };
      });
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

  const { data: externalSubmissions, isLoading: externalSubmissionsLoading, refetch: refetchExternalSubmissions } = trpc.activities.getExternalSubmissions.useQuery(
    undefined,
    { 
      enabled: canUseProtectedAdminRoutes && activeTab === "externalActivities",
      refetchOnMount: true,
    }
  );

  const approveExternalSubmissionMutation = trpc.activities.approveExternalSubmission.useMutation({
    onSuccess: () => {
      void refetchExternalSubmissions();
      Alert.alert("Approved", "External activity approved and added to the runner's records.");
    },
    onError: (error) => {
      Alert.alert("Approval Error", error.message || "Could not approve this external activity.");
    },
  });

  const rejectExternalSubmissionMutation = trpc.activities.rejectExternalSubmission.useMutation({
    onSuccess: () => {
      void refetchExternalSubmissions();
      Alert.alert("Rejected", "External activity submission removed.");
    },
    onError: (error) => {
      Alert.alert("Reject Error", error.message || "Could not reject this external activity.");
    },
  });

  const { data: magazineSubmissions = [], isLoading: magazineSubmissionsLoading } = trpc.admin.getMagazineSubmissions.useQuery(
    undefined,
    {
      enabled: canUseProtectedAdminRoutes && activeTab === "magazine" && !isMagazineColumnist,
      refetchOnMount: true,
    }
  );

  const { data: myMagazineArticles = [], isLoading: myMagazineArticlesLoading } = trpc.admin.getMyMagazineArticles.useQuery(
    undefined,
    {
      enabled: canUseProtectedAdminRoutes && activeTab === "myArticles",
      refetchOnMount: true,
    }
  );

  const { data: magazinePictorials = [], isLoading: magazinePictorialsLoading } = trpc.admin.getMagazinePictorials.useQuery(
    undefined,
    {
      enabled: canUseProtectedAdminRoutes && activeTab === "magazine" && !isMagazineColumnist,
      refetchOnMount: true,
    }
  );

  const {
    data: chatReports = [],
    isLoading: chatReportsLoading,
    refetch: refetchChatReports,
  } = trpc.admin.getChatReports.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && activeTab === "moderation",
    refetchOnMount: true,
  });

  const {
    data: deletedChatLogs = [],
    isLoading: deletedChatLogsLoading,
    refetch: refetchDeletedChatLogs,
  } = trpc.admin.getDeletedChatLogs.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && activeTab === "moderation",
    refetchOnMount: true,
  });

  const reviewChatReportMutation = trpc.admin.reviewChatReport.useMutation({
    onSuccess: () => {
      void refetchChatReports();
      void refetchDeletedChatLogs();
      Alert.alert("Updated", "Chat report reviewed.");
    },
    onError: (error: any) => {
      Alert.alert("Moderation Error", error.message || "Could not review this report.");
    },
  });

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
    data: clubPaymentsData,
    isLoading: clubPaymentsLoading,
    error: clubPaymentsError,
    refetch: refetchClubPayments,
  } = trpc.admin.getClubPayments.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && activeTab === "payments",
    refetchOnMount: true,
  });

  const {
    data: clubWhatsappData,
    isLoading: clubWhatsappLoading,
    error: clubWhatsappError,
    refetch: refetchClubWhatsappLinks,
  } = trpc.admin.getClubWhatsappLinks.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && activeTab === "whatsapp",
    refetchOnMount: true,
  });
  const {
    data: clubDeletionData,
    isLoading: clubDeletionLoading,
    error: clubDeletionError,
    refetch: refetchClubDeletionManagement,
  } = trpc.admin.getClubDeletionManagement.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && activeTab === "clubAdmin",
    refetchOnMount: true,
  });

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
    data: myTeamData,
    isLoading: myTeamLoading,
    error: myTeamError,
    refetch: refetchMyTeam,
  } = trpc.admin.getMyTeam.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && activeTab === "myTeam",
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
    data: milestonesData,
    isLoading: milestonesLoading,
    error: milestonesError,
    refetch: refetchMilestones,
  } = trpc.admin.getMilestones.useQuery(undefined, {
    enabled: canUseProtectedAdminRoutes && isSuperAdmin && activeTab === "milestones",
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

  const {
    data: adminTermsContent,
    isLoading: adminTermsContentLoading,
    error: adminTermsContentError,
    refetch: refetchAdminTermsContent,
  } = trpc.admin.getAdminTermsContent.useQuery(
    { role: adminTermsRole },
    {
      enabled: canUseProtectedAdminRoutes,
      refetchOnMount: true,
    }
  );

  const requestRoleResignationMutation = trpc.admin.requestRoleResignation.useMutation({
    onSuccess: (result) => {
      setResignationReason("");
      Alert.alert("Submitted", result.message || "Your resignation request is pending.");
    },
    onError: (error) => {
      Alert.alert("Resignation Error", error.message || "Could not submit your resignation request.");
    },
  });

  const upsertMilestoneMutation = trpc.admin.upsertMilestone.useMutation({
    onSuccess: () => {
      void refetchMilestones();
      Alert.alert("Saved", "Milestone date saved.");
    },
    onError: (error) => {
      Alert.alert("Milestone Error", error.message || "Could not save milestone date.");
    },
  });

  const milestoneCompletion = useMemo(() => {
    const calculatedRows = (milestonesData?.calculated ?? []) as AdminMilestoneRow[];
    const manualRows = (milestonesData?.manual ?? []) as AdminMilestoneRow[];
    const calculatedCompleted = calculatedRows.filter((row) => isMilestoneReached(row.milestoneDate)).length;
    const manualCompleted = manualRows.filter((row) => {
      const currentDate = (milestoneDateInputs[row.key] ?? row.milestoneDate ?? "").trim();
      return isMilestoneReached(currentDate);
    }).length;
    const total = calculatedRows.length + manualRows.length;
    const completed = calculatedCompleted + manualCompleted;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }, [milestoneDateInputs, milestonesData?.calculated, milestonesData?.manual]);

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
      Alert.alert(
        "Approved",
        "The role request has been accepted. If this request included applicant notes or links, delete or clear them from storage when they are no longer needed."
      );
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

  const createClubPaymentMutation = trpc.admin.createClubPayment.useMutation({
    onSuccess: () => {
      void refetchClubPayments();
      setNewPaymentTitle("");
      setNewPaymentAmount("");
      setNewPaymentDueDate("");
      setNewPaymentDescription("");
      Alert.alert("Saved", "Club payment item created.");
    },
    onError: (error) => {
      Alert.alert("Payment Error", error.message || "Could not create the payment item.");
    },
  });

  const updateClubPaymentRecordMutation = trpc.admin.updateClubPaymentRecord.useMutation({
    onSuccess: () => {
      void refetchClubPayments();
    },
    onError: (error) => {
      Alert.alert("Payment Error", error.message || "Could not update the member payment status.");
    },
  });

  const requestClubPayoutMutation = trpc.admin.requestClubPayout.useMutation({
    onSuccess: () => {
      void refetchClubPayments();
      setPayoutAmount("");
      setPayoutDestinationDetails("");
      Alert.alert("Requested", "Payout request sent to RunNation for review.");
    },
    onError: (error) => {
      Alert.alert("Payout Error", error.message || "Could not request the payout.");
    },
  });

  const upsertClubWhatsappLinkMutation = trpc.admin.upsertClubWhatsappLink.useMutation({
    onSuccess: () => {
      void refetchClubWhatsappLinks();
      Alert.alert("Saved", "Club WhatsApp group link updated.");
    },
    onError: (error) => {
      Alert.alert("WhatsApp Link Error", error.message || "Could not save the WhatsApp group link.");
    },
  });

  const deleteClubWhatsappLinkMutation = trpc.admin.deleteClubWhatsappLink.useMutation({
    onSuccess: () => {
      void refetchClubWhatsappLinks();
      setWhatsappLinkInput("");
      Alert.alert("Deleted", "Club WhatsApp group link removed.");
    },
    onError: (error) => {
      Alert.alert("WhatsApp Link Error", error.message || "Could not delete the WhatsApp group link.");
    },
  });

  const upsertAdminWhatsappLinkMutation = trpc.admin.upsertAdminWhatsappLink.useMutation({
    onSuccess: () => {
      void refetchClubWhatsappLinks();
      Alert.alert("Saved", "WhatsApp group link updated.");
    },
    onError: (error) => {
      Alert.alert("WhatsApp Link Error", error.message || "Could not save the WhatsApp group link.");
    },
  });

  const deleteAdminWhatsappLinkMutation = trpc.admin.deleteAdminWhatsappLink.useMutation({
    onSuccess: () => {
      void refetchClubWhatsappLinks();
      Alert.alert("Deleted", "WhatsApp group link removed.");
    },
    onError: (error) => {
      Alert.alert("WhatsApp Link Error", error.message || "Could not delete the WhatsApp group link.");
    },
  });

  const requestClubDeletionMutation = trpc.admin.requestClubDeletion.useMutation({
    onSuccess: (result) => {
      setClubDeletionReasonById({});
      void refetchClubDeletionManagement();
      void refetchClubStatusReport();
      Alert.alert("Club deletion", result.message || "Club deletion request submitted.");
    },
    onError: (error) => {
      Alert.alert("Club Deletion Error", error.message || "Could not request club deletion.");
    },
  });

  const reviewClubDeletionMutation = trpc.admin.reviewClubDeletion.useMutation({
    onSuccess: () => {
      void refetchClubDeletionManagement();
      Alert.alert("Saved", "Club deletion request updated.");
    },
    onError: (error) => {
      Alert.alert("Club Deletion Error", error.message || "Could not update club deletion request.");
    },
  });

  const pendingRoleRequests = (roleManagementData?.pendingRequests ?? []) as PendingRoleRequest[];
  const pendingRoleRequestCount = pendingRoleRequests.filter((request) => request.status === "pending").length;
  const visiblePendingRoleRequests = pendingRoleRequests.filter((request) => request.status === "pending");
  const activeRoleAssignments = (roleManagementData?.activeAssignments ?? []) as ActiveRoleAssignment[];
  const myTeamMembers = (myTeamData?.members ?? []) as MyTeamMember[];
  const roleCountries = (roleManagementData?.countries ?? []) as RoleLookupCountry[];
  const roleClubs = (roleManagementData?.clubs ?? []) as RoleLookupClub[];
  const roleOrganizers = (roleManagementData?.organizers ?? []) as RoleLookupOrganizer[];
  const accountLinkHealthSummary = (accountLinkHealthData?.summary ?? null) as AccountLinkHealthSummary | null;
  const accountLinkHealthIssues = (accountLinkHealthData?.issues ?? []) as AccountLinkHealthEntry[];
  const accountHealthGroups = Object.values(
    accountLinkHealthIssues.reduce((groups, entry) => {
      entry.issues.forEach((issue) => {
        if (!groups[issue.code]) {
          groups[issue.code] = {
            code: issue.code,
            message: issue.message,
            severity: entry.severity,
            recommendation: getAccountHealthRecommendation(issue.code),
            count: 0,
          };
        }
        groups[issue.code].count += 1;
        if (entry.severity === "critical") {
          groups[issue.code].severity = "critical";
        }
      });
      return groups;
    }, {} as Record<string, { code: string; message: string; severity: "critical" | "warning"; recommendation: string; count: number }>)
  ).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.count - a.count;
  });
  const clubPaymentClubs = (clubPaymentsData?.clubs ?? []) as ClubPaymentClub[];
  const clubPaymentItems = (clubPaymentsData?.paymentItems ?? []) as ClubPaymentItem[];
  const clubPayoutRequests = (clubPaymentsData?.withdrawals ?? []) as ClubPayoutRequest[];
  const clubPaymentSummary = clubPaymentsData?.summary ?? { collected: 0, requested: 0, available: 0 };
  const activePaymentClubId = selectedPaymentClubId || clubPaymentClubs[0]?.clubId || "";
  const activePaymentClub = clubPaymentClubs.find((club) => club.clubId === activePaymentClubId) ?? clubPaymentClubs[0] ?? null;
  const visibleClubPaymentItems = activePaymentClubId
    ? clubPaymentItems.filter((payment) => payment.clubId === activePaymentClubId)
    : clubPaymentItems;
  const visiblePayoutRequests = activePaymentClubId
    ? clubPayoutRequests.filter((request) => request.clubId === activePaymentClubId)
    : clubPayoutRequests;
  const clubWhatsappClubs = (clubWhatsappData?.clubs ?? []) as ClubWhatsappAdminClub[];
  const clubWhatsappLinks = (clubWhatsappData?.links ?? []) as ClubWhatsappAdminLink[];
  const adminWhatsappGlobalLinks = (clubWhatsappData?.globalLinks ?? []) as AdminWhatsappGlobalLink[];
  const clubDeletionClubs = (clubDeletionData?.clubs ?? []) as ClubDeletionClub[];
  const clubDeletionRequests = (clubDeletionData?.deletionRequests ?? []) as ClubDeletionRequest[];
  const pendingClubDeletionRequests = clubDeletionRequests.filter((request) => request.status === "pending");
  const clubStatusSummaries = ((clubStatusReport?.clubSummaries ?? []) as any[]);
  const inactiveClubSummaries = clubStatusSummaries.filter((club) => club.inactiveFlag);
  const activeWhatsappClubId = selectedWhatsappClubId || clubWhatsappClubs[0]?.clubId || "";
  const activeWhatsappClub = clubWhatsappClubs.find((club) => club.clubId === activeWhatsappClubId) ?? clubWhatsappClubs[0] ?? null;
  const activeWhatsappLink = clubWhatsappLinks.find((link) => link.clubId === activeWhatsappClubId) ?? null;
  const serviceTeamWhatsappLink = adminWhatsappGlobalLinks.find((link) => link.linkType === "service_team") ?? null;
  const adminWhatsappLink = adminWhatsappGlobalLinks.find((link) => link.linkType === "admins") ?? null;
  const whatsappSections = useMemo(() => ([
    clubWhatsappClubs.length > 0 ? { key: "club" as const, label: "Club" } : null,
    { key: "service_team" as const, label: "Service Team" },
    (isSuperAdmin || isCountryAdmin || isCountryCoordinator) ? { key: "admins" as const, label: "Admins" } : null,
  ].filter(Boolean)) as { key: WhatsappSection; label: string }[], [clubWhatsappClubs.length, isCountryAdmin, isCountryCoordinator, isSuperAdmin]);
  const hasAcceptedAdminTerms = !!adminTermsStatus?.hasAcceptedCurrentVersion;
  const mustAcceptAdminTerms = hasRoleBasedAccess && !adminTermsStatusLoading && !hasAcceptedAdminTerms;
  const clubRequestCountries = Array.from(
    new Map(
      (clubMembershipRequests as ClubMembershipRequest[])
        .map((request) => {
          const code =
            request.request_type === "start_club" || request.request_type === "event_organizer"
              ? request.proposed_country
              : request.member?.country;
          return code ? [code, formatCountryName(code) || code] : null;
        })
        .filter(Boolean) as Array<[string, string]>
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const visibleClubMembershipRequests = (clubMembershipRequests as ClubMembershipRequest[]).filter((request) => {
    const status = (request.status ?? "pending") as ClubRequestStatusFilter;
    const code =
      request.request_type === "start_club" || request.request_type === "event_organizer"
        ? request.proposed_country
        : request.member?.country;
    return status === clubRequestStatusFilter && (clubRequestCountryFilter === "all" || code === clubRequestCountryFilter);
  });
  const sortMagazineRowsByDate = useCallback((rows: any[]) => (
    [...rows].sort((a, b) => {
      const aTime = new Date(a.created_at || a.event_date || 0).getTime();
      const bTime = new Date(b.created_at || b.event_date || 0).getTime();
      return magazineDateSort === "newest" ? bTime - aTime : aTime - bTime;
    })
  ), [magazineDateSort]);
  const getMagazineStatusPriority = useCallback((status: string | null | undefined) => {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized === "submitted") return 0;
    if (normalized === "pending") return 1;
    if (normalized === "accepted") return 2;
    if (normalized === "rejected") return 3;
    return 4;
  }, []);
  const getMagazineReviewStatusGroup = useCallback((status: string | null | undefined): MagazineReviewStatusFilter => {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized === "accepted") return "accepted";
    if (normalized === "rejected") return "rejected";
    return "pending";
  }, []);
  const sortedMagazineReviewRows = useMemo(() => {
    const rows = [
      ...(magazinePictorials as any[]).map((item) => ({ type: "pictorial" as const, ...item })),
      ...(magazineSubmissions as any[]).map((item) => ({ type: "article" as const, ...item })),
    ];

    return rows.sort((a, b) => {
      const statusDiff = getMagazineStatusPriority(a.status) - getMagazineStatusPriority(b.status);
      if (statusDiff !== 0) return statusDiff;
      const aTime = new Date(a.created_at || a.event_date || 0).getTime();
      const bTime = new Date(b.created_at || b.event_date || 0).getTime();
      return bTime - aTime;
    });
  }, [getMagazineStatusPriority, magazinePictorials, magazineSubmissions]);
  const magazineReviewStatusCounts = useMemo(() => {
    const counts: Record<MagazineReviewStatusFilter, number> = { pending: 0, accepted: 0, rejected: 0 };
    sortedMagazineReviewRows.forEach((row) => {
      counts[getMagazineReviewStatusGroup(row.status)] += 1;
    });
    return counts;
  }, [getMagazineReviewStatusGroup, sortedMagazineReviewRows]);
  const visibleMagazineReviewRows = useMemo(
    () => sortedMagazineReviewRows.filter((row) => getMagazineReviewStatusGroup(row.status) === magazineReviewStatusFilter),
    [getMagazineReviewStatusGroup, magazineReviewStatusFilter, sortedMagazineReviewRows]
  );

  useEffect(() => {
    if (!directoryClubId && roleSession.clubCoordinatorScopes.length > 0) {
      setDirectoryClubId(roleSession.clubCoordinatorScopes[0]);
    }
  }, [directoryClubId, roleSession.clubCoordinatorScopes]);

  const {
    data: clubMemberDirectory = [],
    isLoading: clubMemberDirectoryLoading,
    refetch: refetchClubMemberDirectory,
  } = trpc.admin.getClubMemberDirectory.useQuery(
    { clubId: directoryClubId },
    { enabled: Boolean(directoryClubId) && activeTab === "clubRequests" }
  );

  const upsertClubMemberDirectoryMutation = trpc.admin.upsertClubMemberDirectory.useMutation({
    onSuccess: (result) => {
      void refetchClubMemberDirectory();
      setDirectoryName("");
      setDirectoryMemberId(null);
      setDirectoryNickname("");
      setDirectoryPhone("");
      setDirectoryEmail("");
      Alert.alert("Member List Updated", `${result.count} member${result.count === 1 ? "" : "s"} saved.`);
    },
    onError: (error) => Alert.alert("Member List Error", error.message),
  });

  const deleteClubMemberDirectoryMutation = trpc.admin.deleteClubMemberDirectory.useMutation({
    onSuccess: () => void refetchClubMemberDirectory(),
    onError: (error) => Alert.alert("Member List Error", error.message),
  });

  const handleClubDirectoryCsvImport = async () => {
    if (!directoryClubId) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const members = parseClubMemberCsv(await readArticleFileText(result.assets[0]));
      if (members.length === 0) throw new Error("No valid members were found in the CSV.");
      upsertClubMemberDirectoryMutation.mutate({ clubId: directoryClubId, members });
    } catch (error) {
      Alert.alert("CSV Import Error", error instanceof Error ? error.message : "Could not import the CSV file.");
    }
  };
  const sortedMyMagazineArticles = useMemo(() => sortMagazineRowsByDate(myMagazineArticles as any[]), [myMagazineArticles, sortMagazineRowsByDate]);

  const getRoleRequestScope = useCallback((request: PendingRoleRequest) => {
    if (GLOBAL_ROLE_ACCESS_NAMES.has(request.roleName)) {
      return "Global";
    }
    return request.countryName || formatCountryName(request.countryCode) || request.countryCode || "No country";
  }, []);

  const getRoleRequestClubCompany = useCallback((request: PendingRoleRequest) => {
    const specialClubName = SPECIAL_CLUB_ROLE_CLUB_NAMES[request.roleName];
    if (specialClubName) return specialClubName;
    if (request.roleName === "club_coordinator") return request.clubName || request.clubId || "No club";
    if (request.roleName === "event_organizer") return request.organizerName || "Create organizer";
    if (GLOBAL_ROLE_ACCESS_NAMES.has(request.roleName)) return "Global";
    return request.clubName || request.organizerName || "-";
  }, []);

  const isGlobalRoleAccess = useCallback((roleName: ManageableRoleName) => (
    GLOBAL_ROLE_ACCESS_NAMES.has(roleName)
  ), []);

  const getRoleAssignmentClubCompany = useCallback((assignment: ActiveRoleAssignment) => {
    const specialClubName = SPECIAL_CLUB_ROLE_CLUB_NAMES[assignment.roleName];
    if (specialClubName) return specialClubName;
    if (isGlobalRoleAccess(assignment.roleName)) return "Global";
    if (assignment.roleName === "club_coordinator") return assignment.clubName || assignment.clubId || "No club";
    if (assignment.roleName === "event_organizer") return assignment.organizerName || assignment.organizerId || "No company";
    return assignment.clubName || assignment.organizerName || "-";
  }, [isGlobalRoleAccess]);

  const getRoleAssignmentJurisdiction = useCallback((assignment: ActiveRoleAssignment) => {
    if (isGlobalRoleAccess(assignment.roleName)) return "Global";
    return assignment.countryName || formatCountryName(assignment.countryCode) || assignment.countryCode || "No country";
  }, [isGlobalRoleAccess]);

  const getRoleAssignmentTermsStatus = useCallback((assignment: ActiveRoleAssignment) => (
    assignment.hasAcceptedTerms ? "Accepted" : "Pending"
  ), []);

  useEffect(() => {
    if (activeTab === "whatsapp") {
      setWhatsappLinkInput(activeWhatsappLink?.link ?? "");
    }
  }, [activeTab, activeWhatsappClubId, activeWhatsappLink?.link]);

  useEffect(() => {
    if (activeTab === "whatsapp" && !whatsappSections.some((section) => section.key === whatsappSection)) {
      setWhatsappSection(whatsappSections[0]?.key ?? "service_team");
    }
  }, [activeTab, whatsappSection, whatsappSections]);

  useEffect(() => {
    if (activeTab === "whatsapp") {
      setServiceTeamWhatsappInput(serviceTeamWhatsappLink?.link ?? "");
      setAdminWhatsappInput(adminWhatsappLink?.link ?? "");
    }
  }, [activeTab, serviceTeamWhatsappLink?.link, adminWhatsappLink?.link]);

  useEffect(() => {
    if (activeTab !== "milestones") return;
    const manualRows = ((milestonesData?.manual ?? []) as AdminMilestoneRow[]);
    setMilestoneDateInputs(
      manualRows.reduce((next, row) => {
        next[row.key] = row.milestoneDate || "";
        return next;
      }, {} as Record<string, string>)
    );
  }, [activeTab, milestonesData?.manual]);

  function resetRoleModal() {
    setEditingRoleAssignment(null);
    setRoleRequestEmail("");
    setSelectedRoleName("country_coordinator");
    setSelectedRoleCountryCode("");
    setSelectedRoleClubId("");
  }

  function formatMoney(amount: number, currency = "UGX"): string {
    return `${currency} ${Number(amount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }

  function handleCreateClubPayment() {
    const amount = Number(newPaymentAmount.replace(/,/g, ""));
    if (!activePaymentClubId) {
      Alert.alert("Select Club", "Choose the club this payment belongs to.");
      return;
    }
    if (!newPaymentTitle.trim()) {
      Alert.alert("Payment Name", "Enter a payment name such as Annual Membership.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      Alert.alert("Amount", "Enter a valid payment amount.");
      return;
    }

    createClubPaymentMutation.mutate({
      clubId: activePaymentClubId,
      title: newPaymentTitle.trim(),
      amount,
      currency: (newPaymentCurrency.trim() || "UGX").toUpperCase(),
      dueDate: newPaymentDueDate.trim() || null,
      description: newPaymentDescription.trim() || null,
    });
  }

  function handleRequestClubPayout() {
    const amount = Number(payoutAmount.replace(/,/g, ""));
    if (!activePaymentClubId) {
      Alert.alert("Select Club", "Choose the club requesting a payout.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Amount", "Enter a valid payout amount.");
      return;
    }
    if (!payoutDestinationDetails.trim()) {
      Alert.alert("Destination", "Enter the club bank or mobile money details.");
      return;
    }

    requestClubPayoutMutation.mutate({
      clubId: activePaymentClubId,
      amount,
      currency: "UGX",
      destinationType: payoutDestinationType,
      destinationDetails: payoutDestinationDetails.trim(),
    });
  }

  function handleSaveWhatsappLink() {
    if (!activeWhatsappClubId) {
      Alert.alert("Select Club", "Choose the club this WhatsApp group belongs to.");
      return;
    }
    if (!whatsappLinkInput.trim()) {
      Alert.alert("WhatsApp Link", "Paste the club WhatsApp group invite link.");
      return;
    }

    upsertClubWhatsappLinkMutation.mutate({
      clubId: activeWhatsappClubId,
      link: whatsappLinkInput.trim(),
    });
  }

  function handleDeleteWhatsappLink() {
    if (!activeWhatsappClubId) return;
    deleteClubWhatsappLinkMutation.mutate({ clubId: activeWhatsappClubId });
  }

  function handleSaveAdminWhatsappLink(linkType: "service_team" | "admins") {
    const link = linkType === "service_team" ? serviceTeamWhatsappInput.trim() : adminWhatsappInput.trim();
    if (!link) {
      Alert.alert("WhatsApp Link", "Paste the WhatsApp group invite link.");
      return;
    }
    upsertAdminWhatsappLinkMutation.mutate({ linkType, link });
  }

  function handleDeleteAdminWhatsappLink(linkType: "service_team" | "admins") {
    deleteAdminWhatsappLinkMutation.mutate({ linkType });
  }

  function handleCopyWhatsappLink(link: string) {
    Clipboard.setString(link);
    Alert.alert("Copied", "WhatsApp link copied.");
  }

  async function handleOpenWhatsappLink(link: string) {
    const canOpen = await Linking.canOpenURL(link);
    if (!canOpen) {
      Alert.alert("Cannot Open Link", "This WhatsApp link is not available on this device.");
      return;
    }
    await Linking.openURL(link);
  }

  function handleSaveMilestone(row: AdminMilestoneRow) {
    const milestoneDate = (milestoneDateInputs[row.key] || "").trim();
    if (milestoneDate && !/^\d{4}-\d{2}-\d{2}$/.test(milestoneDate)) {
      Alert.alert("Date Format", "Use YYYY-MM-DD for milestone dates.");
      return;
    }
    upsertMilestoneMutation.mutate({
      milestoneKey: row.key,
      milestoneDate: milestoneDate || null,
      note: row.note ?? null,
    });
  }

  function getMilestoneDateLabel(value?: string | null) {
    if (value === "soon") return "[soon]";
    return value || "Not reached";
  }

  function handleRequestChatSuspension(report: ChatModerationReport) {
    const defaultDate = report.offenderFlags?.suspended_until
      ? toDateInputValue(new Date(report.offenderFlags.suspended_until))
      : toDateInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const submitSuspension = (dateText: string | null | undefined) => {
      const suspensionUntil = String(dateText || "").trim();
      if (!suspensionUntil) return;
      reviewChatReportMutation.mutate({
        reportId: report.reportId,
        action: "ban_user",
        suspensionUntil,
        adminNotes: `${isSuperAdmin ? "User suspended" : "Suspension requested"} for @${report.reportedUsername || "reported user"} until ${suspensionUntil}.`,
      });
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      submitSuspension(window.prompt("Suspension end date (YYYY-MM-DD)", defaultDate));
      return;
    }

    Alert.alert(
      isSuperAdmin ? "Suspend chat access?" : "Request chat suspension?",
      `This removes the reported content and ${isSuperAdmin ? "suspends" : "requests suspension for"} @${report.reportedUsername || "this user"} until ${defaultDate}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: isSuperAdmin ? "Suspend" : "Request", style: "destructive", onPress: () => submitSuspension(defaultDate) },
      ]
    );
  }

  function isMilestoneReached(value?: string | null) {
    return Boolean(value && value !== "soon");
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
      case "shop_manager":
        return "Shop Manager";
      case "junior_runners_club_coordinator":
        return "Club Coordinator";
      case "golden_age_runners_club_coordinator":
        return "Club Coordinator";
      case "treadmill_runners_club_coordinator":
        return "Club Coordinator";
      case "para_runners_club_coordinator":
        return "Club Coordinator";
      case "smartfit_club_coordinator":
        return "Club Coordinator";
      case "magazine_editor":
        return "Magazine Editor";
      case "chat_room_administrator":
        return "Chat Room Administrator";
      case "magazine_columnist_fitness_coach":
        return "Magazine Columnist (Fitness Coach)";
      case "magazine_columnist_sports_journalist":
        return "Magazine Columnist (Sports Journalist)";
      case "magazine_columnist_motivation_speaker":
        return "Magazine Columnist (Empowerment Coach)";
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
    if (
      assignment.roleName !== "country_admin" &&
      assignment.roleName !== "country_coordinator" &&
      assignment.roleName !== "club_coordinator" &&
      assignment.roleName !== "event_organizer"
    ) {
      Alert.alert("Role Managed by Approval", "This global role can be approved or removed, but it is not editable from this form.");
      return;
    }
    setEditingRoleAssignment(assignment);
    setRoleRequestEmail(assignment.username ?? assignment.userName);
    setSelectedRoleName(assignment.roleName === "country_admin" ? "country_coordinator" : assignment.roleName);
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
    } else if (!editingRoleAssignment && selectedRoleName === "event_organizer" && !selectedRoleCountryCode.trim()) {
      Alert.alert("Missing Country", "Please choose a country for this event organizer request.");
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
        selectedRoleName === "club_coordinator"
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

  const displayedAdminEvents = useMemo(() => {
    return filteredAdminEvents.filter((event) => {
      const status = String(event.approval_status || "approved").toLowerCase();
      const endValue = event.ends_at || event.endsAt || event.starts_at || event.startsAt;
      const endDate = endValue ? String(endValue).slice(0, 10) : "";
      const isClosed = Boolean(endDate && endDate < new Date().toISOString().slice(0, 10));
      if (eventApprovalTab === "closed") return isClosed;
      if (isClosed) return false;
      return eventApprovalTab === "approved" ? status === "approved" : status !== "approved";
    });
  }, [eventApprovalTab, filteredAdminEvents]);

  const usesScopedEventWorkspace =
    (isClubCoordinator || isSpecialClubCoordinator || isEventOrganizer) &&
    !isSuperAdmin &&
    !isCountryAdmin &&
    !isCountryCoordinator;

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

  const selectedOrganizerFilterLabel = useMemo(() => {
    if (selectedOrganizerFilter === "all") return `All (${organizerEventCounts.total})`;
    if (selectedOrganizerFilter === "clubs") return `Clubs (${organizerEventCounts.clubOwnedCount})`;
    const organizer = (eventOrganizers as EventOrganizerRecord[]).find(
      (item) => item.organizer_id === selectedOrganizerFilter
    );
    const count = organizer ? organizerEventCounts.organizerCounts.get(organizer.organizer_id) ?? 0 : 0;
    return organizer ? `${organizer.organizer_name} (${count})` : "Organizer";
  }, [eventOrganizers, organizerEventCounts, selectedOrganizerFilter]);

  const completedReportEvents = useMemo(() => {
    const today = new Date();
    return ((events as any[]) || []).filter((event) => {
      const endValue = event.ends_at || event.endsAt || event.starts_at || event.startsAt;
      if (!endValue) return false;
      return new Date(endValue) < today;
    });
  }, [events]);

  useEffect(() => {
    if (activeTab !== "reports") return;
    if (!selectedReportEventId && completedReportEvents.length > 0) {
      setSelectedReportEventId(completedReportEvents[0].event_id || completedReportEvents[0].eventId || "");
    }
  }, [activeTab, completedReportEvents, selectedReportEventId]);

  useEffect(() => {
    if (activeTab !== "reports") return;
    const clubs = clubStatusReport?.clubs ?? [];
    if (!selectedActivityReportClubId && clubs.length > 0) {
      setSelectedActivityReportClubId(clubs[0].clubId);
    }
  }, [activeTab, clubStatusReport?.clubs, selectedActivityReportClubId]);

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
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEvents"]] });
      void queryClient.invalidateQueries({ queryKey: [["magazine", "getArticles"]] });
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
      Alert.alert("Magazine Access Required", error.message || "Only Global Admins or Magazine Editors can delete magazine submissions.");
    },
  });

  const updateMagazinePictorialStatusMutation = trpc.admin.updateMagazinePictorialStatus.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazinePictorials"]] });
      void queryClient.invalidateQueries({ queryKey: [["magazine", "getArticles"]] });
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
      Alert.alert("Magazine Access Required", error.message || "Only Global Admins or Magazine Editors can delete pictorials.");
    },
  });

  const createMagazineNewsMutation = trpc.admin.createMagazineNewsArticle.useMutation({
    onSuccess: (result) => {
      setNewsTitle("");
      setNewsAuthor("");
      setNewsBody("");
      setNewsExternalLink("");
      setNewsPage("News");
      setNewsPhotoAsset(null);
      setNewsPhotoPreview(null);
      if (!isMagazineColumnist) {
        setMagazineMode("edit");
      }
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazineSubmissions"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMyMagazineArticles"]] });
      Alert.alert(
        result.status === "accepted" ? "Published" : "Submitted",
        result.status === "accepted"
          ? "News article created and published."
          : "Article submitted for Global Admin approval."
      );
    },
    onError: (error) => {
      Alert.alert("News Article Error", error.message || "Could not create the news article.");
    },
  });

  const createClubProfileMutation = trpc.admin.createClubProfile.useMutation({
    onSuccess: async (result) => {
      setClubProfileName("");
      setClubProfileLocation("");
      setClubProfileDescription("");
      setClubProfilePresenceTowns("");
      await refreshRoleSession();
      void refetchClubDeletionManagement();
      void queryClient.invalidateQueries({ queryKey: [["admin", "getClubDeletionManagement"]] });
      Alert.alert("Club Created", `${result.clubName} is now connected to your Club Coordinator role.`);
    },
    onError: (error) => {
      Alert.alert("Club Profile Error", error.message || "Could not create the club profile.");
    },
  });

  const updateAdminProfileMutation = trpc.admin.updateAdminProfile.useMutation({
    onSuccess: async () => {
      await refetchAdminProfile();
      void queryClient.invalidateQueries({ queryKey: [["admin", "getClubDeletionManagement"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEventOrganizers"]] });
      Alert.alert("Profile Saved", "Your club/organization details were updated.");
    },
    onError: (error) => {
      Alert.alert("Profile Error", error.message || "Could not update the profile details.");
    },
  });

  const updateMagazineEntryMutation = trpc.admin.updateMagazineEntry.useMutation({
    onSuccess: () => {
      setSelectedMagazineEditTarget(null);
      setMagazineEditPhotoAsset(null);
      setMagazineEditPhotoPreview(null);
      setIsPreparingMagazineEditPhoto(false);
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazineSubmissions"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazinePictorials"]] });
      void queryClient.invalidateQueries({ queryKey: [["magazine", "getArticles"]] });
      Alert.alert("Saved", "Magazine entry updated.");
    },
    onError: (error) => {
      setIsPreparingMagazineEditPhoto(false);
      Alert.alert("Edit Error", error.message || "Could not update the magazine entry.");
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

  const deleteEventMutation = trpc.admin.deleteEvent.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEvents"]] });
      void queryClient.invalidateQueries({ queryKey: [["admin", "getMagazineSubmissions"]] });
      Alert.alert("Deleted", "Rejected event removed from the dashboard.");
    },
    onError: (error: any) => {
      Alert.alert("Delete Event", error.message || "Could not delete this event.");
    },
  });

  const handleDeleteRejectedEvent = (event: any) => {
    const eventId = event.event_id || event.eventId;
    const eventName = event.event_name || event.eventName || "this event";
    Alert.alert(
      "Delete rejected event?",
      `This will remove "${eventName}" from the dashboard and hide its linked magazine submission. The organizer can then recreate and submit again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteEventMutation.mutate({ eventId }),
        },
      ]
    );
  };



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
      `Name: ${order.customer_name || order.delivery_name || 'N/A'}`,
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
            <div class="field"><span class="field-label">Name:</span> ${order.customer_name || order.delivery_name || 'N/A'}</div>
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

  const handleShareSticker = async (order: any) => {
    const items = order.items || [];
    const itemLines = items.map((item: any) => `${item.name}${item.size ? ` (${item.size})` : ""} x${item.qty}`).join("\n");
    const orderCountry = formatCountryName(order.country || order.country_code);
    const stickerContent = [
      "DELIVERY STICKER",
      `Order #: ${(order.order_id || "").substring(0, 8)}`,
      `Name: ${order.customer_name || order.delivery_name || "N/A"}`,
      `Phone: ${order.phone_number || "N/A"}`,
      `Address: ${order.delivery_address || "N/A"}`,
      ...(orderCountry ? [`Country: ${orderCountry}`] : []),
      `Delivery time: ${order.delivery_time_slots || "N/A"}`,
      "",
      "Items:",
      itemLines || "No items",
      "",
      `TOTAL: ugx.${(order.total_amount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
    ].join("\n");

    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(stickerContent);
      Alert.alert("Copied", "Delivery sticker text copied. You can paste it to the delivery person or printer app.");
      return;
    }

    await Share.share({
      title: "Delivery Sticker",
      message: stickerContent,
    });
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
    setRegistrationClosesAt("");
    setEventCountry("");
    setEventOrganizerMode("self");
    setEventOrganizerId(isEventOrganizer ? roleSession.eventOrganizerScopes[0] ?? "" : "");
    setEventExternalOrganizerName("");
    setEventLocation("");
    setEventTypeMode("same_day");
    setEventRecurrenceWeekday(3);
    setEventRecurrenceFrequency("weekly");
    setEventRecurrenceWeekdays([3]);
    setEventMonthlyMode("day_of_month");
    setEventRecurrenceMonthDay(1);
    setEventRecurrenceWeekOfMonth(1);
    setEventIsVirtual(false);
    setEventEntry("free");
    setEventHasMedal(false);
    setEventEntryFee("");
    setEventPaymentDetails("");
    setEventRegistrationLink("");
    setEventOrganizerPaymentLink("");
    setEventRunNationPaymentLinkEnabled(false);
    setEventParticipantLimitEnabled(false);
    setEventParticipantLimit("");
    setEventMagazineArticleTitle("");
    setEventMagazineArticleBody("");
    setEventMagazineWriterName("");
    setEventMagazineArticleFileName(null);
    setEventPosterAsset(null);
    setEventPosterPreview(null);
    setEventPosterMarkedForRemoval(false);
    setEventMagazinePhotoAsset(null);
    setEventMagazinePhotoPreview(null);
    setEventMinimumDistanceEnabled(false);
    setEventMedalDistances([]);
    setEventCustomMedalDistance("");
    setMedalMinDailyDistance("");
    setMedalMinCumulativeDistance("");
    setMedalDateStart("");
    setMedalDateEnd("");
  };

  const handleOpenAddEvent = () => {
    resetEventModal();
    setShowEventModal(true);
  };

  const toggleEventMedalDistance = (distance: number) => {
    setEventMedalDistances((current) => {
      const exists = current.some((value) => Math.abs(value - distance) < 0.001);
      const next = exists ? current.filter((value) => Math.abs(value - distance) >= 0.001) : [...current, distance];
      return next.sort((a, b) => a - b);
    });
  };

  const addCustomEventMedalDistance = () => {
    const distance = Number.parseFloat(eventCustomMedalDistance.replace(/,/g, ".").trim());
    if (!Number.isFinite(distance) || distance <= 0) {
      Alert.alert("Invalid Distance", "Please enter a distance greater than 0 km.");
      return;
    }
    toggleEventMedalDistance(Number(distance.toFixed(2)));
    setEventCustomMedalDistance("");
  };

  const selectedEventOrganizer = useMemo(() => {
    return (eventOrganizers as EventOrganizerRecord[]).find(
      (organizer) => organizer.organizer_id === eventOrganizerId
    );
  }, [eventOrganizers, eventOrganizerId]);

  const selfEventOwner = useMemo(() => {
    if (adminProfile?.type === "organizer" && adminProfile.id) {
      return {
        organizerId: adminProfile.id,
        club: null as string | null,
        label: adminProfile.name || "Organizer Profile",
      };
    }
    if (eventOrganizerId) {
      const organizer = (eventOrganizers as EventOrganizerRecord[]).find(
        (item) => item.organizer_id === eventOrganizerId
      );
      return {
        organizerId: eventOrganizerId,
        club: null as string | null,
        label: organizer?.organizer_name || adminProfile?.name || "Organizer Profile",
      };
    }
    if (adminProfile?.type === "club" && adminProfile.name) {
      return {
        organizerId: null as string | null,
        club: adminProfile.name,
        label: adminProfile.name,
      };
    }
    return {
      organizerId: null as string | null,
      club: "RunNation",
      label: "RunNation",
    };
  }, [adminProfile, eventOrganizerId, eventOrganizers]);

  const resolvedEventCurrencyCode = useMemo(() => {
    const rawCountry = String(eventCountry || selectedEventOrganizer?.country || adminProfile?.country || "").trim().toLowerCase();
    if (!rawCountry) return "";
    const matchedCountry = (countryList as Array<any>).find((country) => {
      return (
        String(country.iso_alpha2 || "").trim().toLowerCase() === rawCountry ||
        String(country.name || "").trim().toLowerCase() === rawCountry
      );
    });
    return String(matchedCountry?.currency_code || "").trim().toUpperCase();
  }, [adminProfile?.country, countryList, eventCountry, selectedEventOrganizer?.country]);

  const handleAddEvent = async () => {
    const requiresEndDate = eventTypeMode === "multiday";
    if (!eventName.trim() || !startsAt.trim() || !registrationClosesAt.trim() || (requiresEndDate && !endsAt.trim())) {
      Alert.alert(
        "Missing Details",
        requiresEndDate
          ? "Please enter the event name, start date, end date, and registration close date."
          : "Please enter the event name, date, and registration close date."
      );
      return;
    }
    if (!isValidDisplayDate(startsAt) || (requiresEndDate && !isValidDisplayDate(endsAt)) || !isValidDisplayDate(registrationClosesAt)) {
      Alert.alert("Invalid Date", "Please enter dates in DD-MM-YYYY format.");
      return;
    }
    if (eventOrganizerMode === "other" && !eventExternalOrganizerName.trim()) {
      Alert.alert("Missing Organizer", "Please enter the external organizer name.");
      return;
    }
    if (!eventCountry.trim() && !selectedEventOrganizer?.country && !adminProfile?.country) {
      Alert.alert("Missing Country", "Please enter the event country.");
      return;
    }
    if (!eventIsVirtual && !eventLocation.trim()) {
      Alert.alert("Missing Location", "Please enter the race start/finish location.");
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
    if (
      eventRegistrationLink.trim() &&
      !/^https?:\/\/\S+\.\S+/i.test(eventRegistrationLink.trim())
    ) {
      Alert.alert("Invalid Registration Link", "Please enter a valid registration link beginning with http:// or https://.");
      return;
    }
    if (
      eventOrganizerPaymentLink.trim() &&
      !/^https?:\/\/\S+\.\S+/i.test(eventOrganizerPaymentLink.trim())
    ) {
      Alert.alert("Invalid Payment Link", "Please enter a valid payment link beginning with http:// or https://.");
      return;
    }
    if (!eventPosterPreview && !eventPosterAsset?.uri) {
      Alert.alert("Missing Event Poster", "Please add the event poster for the event listing.");
      return;
    }
    const isEditingEvent = Boolean(editingEventId);
    const shouldSubmitMagazineStory =
      !isEditingEvent || Boolean(eventMagazinePhotoAsset?.uri || eventMagazineArticleBody.trim());

    if (shouldSubmitMagazineStory && !eventMagazinePhotoPreview && !eventMagazinePhotoAsset?.uri) {
      Alert.alert("Missing Magazine Photo", "Please add a separate magazine photo for the event story.");
      return;
    }
    if (shouldSubmitMagazineStory && !eventMagazineArticleTitle.trim()) {
      Alert.alert("Missing Magazine Article", "Please add a magazine article title for this event.");
      return;
    }
    if (shouldSubmitMagazineStory && !eventMagazineWriterName.trim()) {
      Alert.alert("Missing Writer Name", "Please add the writer's name for the magazine article.");
      return;
    }
    const articleWordCount = countWords(eventMagazineArticleBody);
    if (shouldSubmitMagazineStory && (articleWordCount < 200 || articleWordCount > 300)) {
      Alert.alert("Magazine Article Length", "Please upload a magazine article body between 200 and 300 words.");
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
    const numericParticipantLimit = eventParticipantLimitEnabled
      ? Number.parseInt(eventParticipantLimit.replace(/,/g, "").trim(), 10)
      : null;
    if (
      eventParticipantLimitEnabled &&
      (!Number.isFinite(numericParticipantLimit) || Number(numericParticipantLimit) <= 0)
    ) {
      Alert.alert("Invalid Participant Limit", "Please enter a whole number greater than 0.");
      return;
    }
    const normalizedMedalDistances = eventHasMedal
      ? Array.from(new Set(eventMedalDistances.map((distance) => Number(distance.toFixed(2)))))
          .filter((distance) => Number.isFinite(distance) && distance > 0)
          .sort((a, b) => a - b)
      : [];
    if (eventHasMedal && normalizedMedalDistances.length === 0) {
      Alert.alert("Medal Distances", "Please choose at least one event distance for the medal categories.");
      return;
    }

    let directPosterLink: string | null | undefined = undefined;
    let posterBase64: string | null = null;
    let posterMimeType: string | null = null;
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
        if (editingEventId) {
          directPosterLink = await uploadEventPosterDirect({
            eventId: editingEventId,
            uri: eventPosterAsset.uri,
            mimeType: eventPosterAsset.mimeType,
          });
        } else {
          const posterPayload = await encodeEventPosterForUpload(eventPosterAsset.uri, eventPosterAsset.mimeType);
          posterBase64 = posterPayload.base64;
          posterMimeType = posterPayload.mimeType;
        }
      } catch (error: any) {
        Alert.alert("Poster Error", error?.message || "Could not prepare the selected poster.");
        return;
      }
    } else if (eventPosterMarkedForRemoval) {
      directPosterLink = null;
    }

    let magazinePhotoBase64: string | null = null;
    let magazinePhotoMimeType: string | null = null;
    if (eventMagazinePhotoAsset?.uri) {
      try {
        const magazinePhotoPayload = await encodeMagazineArticlePhotoForUpload(
          eventMagazinePhotoAsset.uri,
          eventMagazinePhotoAsset.mimeType
        );
        magazinePhotoBase64 = magazinePhotoPayload.base64;
        magazinePhotoMimeType = magazinePhotoPayload.mimeType;
      } catch (error: any) {
        Alert.alert("Magazine Photo Error", error?.message || "Could not prepare the selected magazine photo.");
        return;
      }
    }

    const recurrenceFrequency = eventTypeMode === "recurring" ? eventRecurrenceFrequency : null;
    const normalizedStartsAt = toApiDate(startsAt);
    const normalizedEndsAt = eventTypeMode === "multiday" ? toApiDate(endsAt) : normalizedStartsAt;
    const normalizedRegistrationClosesAt = toApiDate(registrationClosesAt);
    const medalDistanceRuleEnabled = eventHasMedal && eventMinimumDistanceEnabled;
    const numericMinDailyDistance = medalDistanceRuleEnabled
      ? Number.parseFloat(medalMinDailyDistance.replace(/,/g, "").trim())
      : undefined;
    const numericMinCumulativeDistance =
      medalDistanceRuleEnabled && eventTypeMode === "multiday"
        ? Number.parseFloat(medalMinCumulativeDistance.replace(/,/g, "").trim())
        : undefined;
    if (
      medalDistanceRuleEnabled &&
      (!Number.isFinite(numericMinDailyDistance) || Number(numericMinDailyDistance) <= 0)
    ) {
      Alert.alert("Minimum Distance", "Please enter a valid minimum daily distance in km.");
      return;
    }
    if (
      medalDistanceRuleEnabled &&
      eventTypeMode === "multiday" &&
      (!Number.isFinite(numericMinCumulativeDistance) || Number(numericMinCumulativeDistance) <= 0)
    ) {
      Alert.alert("Minimum Distance", "Please enter a valid minimum cumulative distance in km.");
      return;
    }
    const payload = {
      eventName: eventName.trim(),
      startsAt: normalizedStartsAt,
      endsAt: normalizedEndsAt,
      registrationClosesAt: normalizedRegistrationClosesAt,
      country: eventCountry.trim() || selectedEventOrganizer?.country || adminProfile?.country || undefined,
      eventType: eventTypeMode,
      recurrenceFrequency,
      recurrenceWeekday:
        eventTypeMode === "recurring" && eventRecurrenceFrequency === "weekly"
          ? eventRecurrenceWeekdays[0] ?? eventRecurrenceWeekday
          : null,
      recurrenceWeekdays:
        eventTypeMode === "recurring" && eventRecurrenceFrequency === "weekly"
          ? eventRecurrenceWeekdays
          : null,
      recurrenceMonthlyMode:
        eventTypeMode === "recurring" && eventRecurrenceFrequency === "monthly"
          ? eventMonthlyMode
          : null,
      recurrenceMonthDay:
        eventTypeMode === "recurring" && eventRecurrenceFrequency === "monthly" && eventMonthlyMode === "day_of_month"
          ? eventRecurrenceMonthDay
          : null,
      recurrenceWeekOfMonth:
        eventTypeMode === "recurring" && eventRecurrenceFrequency === "monthly" && eventMonthlyMode === "weekend"
          ? eventRecurrenceWeekOfMonth
          : null,
      organizerId: eventOrganizerMode === "self" ? selfEventOwner.organizerId : null,
      club: eventOrganizerMode === "self" ? selfEventOwner.club || undefined : undefined,
      externalOrganizerName: eventOrganizerMode === "other" ? eventExternalOrganizerName.trim() : undefined,
      eventLocation: eventIsVirtual ? null : eventLocation.trim(),
      isVirtual: eventIsVirtual,
      entry: eventEntry,
      entryFee: eventEntry === "paid" ? numericEntryFee : undefined,
      hasMedal: eventHasMedal,
      availableDistancesKm: normalizedMedalDistances,
      paymentDetails: eventEntry === "paid" ? eventPaymentDetails.trim() || undefined : undefined,
      registrationLink: eventRegistrationLink.trim() || undefined,
      organizerPaymentLink: eventOrganizerPaymentLink.trim() || undefined,
      runnationPaymentLinkEnabled: eventEntry === "paid" && eventRunNationPaymentLinkEnabled,
      participantLimit: eventParticipantLimitEnabled ? numericParticipantLimit : null,
      posterLink: directPosterLink ?? (shouldNormalizeExistingPoster ? eventPosterPreview : undefined),
      clearPoster: eventPosterMarkedForRemoval && !eventPosterAsset,
      posterBase64,
      posterMimeType,
      ...(shouldSubmitMagazineStory
        ? {
            magazineArticleTitle: eventMagazineArticleTitle.trim(),
            magazineArticleBody: eventMagazineArticleBody.trim(),
            magazineWriterName: eventMagazineWriterName.trim(),
            magazinePhotoLink: eventMagazinePhotoAsset ? undefined : eventMagazinePhotoPreview ?? undefined,
            magazinePhotoBase64,
            magazinePhotoMimeType,
          }
        : {}),
      medalMinDailyDistance: medalDistanceRuleEnabled ? numericMinDailyDistance : undefined,
      medalMinCumulativeDistance:
        medalDistanceRuleEnabled && eventTypeMode === "multiday" ? numericMinCumulativeDistance : undefined,
    };

    if (editingEventId) {
      updateEventMutation.mutate({
        eventId: editingEventId,
        ...payload,
      });
      return;
    }

    addEventMutation.mutate({
      ...payload,
      magazineArticleTitle: eventMagazineArticleTitle.trim(),
      magazineArticleBody: eventMagazineArticleBody.trim(),
      magazineWriterName: eventMagazineWriterName.trim(),
      magazinePhotoLink: eventMagazinePhotoAsset ? undefined : eventMagazinePhotoPreview ?? undefined,
      magazinePhotoBase64,
      magazinePhotoMimeType,
    });
  };

  const handleEditEvent = (event: any) => {
    setEditingEventId(event.event_id || event.eventId);
    setEventName(event.event_name || event.eventName || "");
    const existingEventType = (event.event_type || event.eventType || (String(event.starts_at || event.startsAt).slice(0, 10) === String(event.ends_at || event.endsAt).slice(0, 10) ? "same_day" : "multiday")) as EventTypeMode;
    const existingStartDate = fromApiDate(event.starts_at || event.startsAt);
    setStartsAt(existingStartDate);
    setEndsAt(existingEventType === "multiday" ? fromApiDate(event.ends_at || event.endsAt) : existingStartDate);
    setRegistrationClosesAt(fromApiDate(event.registration_closes_at || event.registrationClosesAt));
    setEventCountry(event.country || "");
    const existingExternalOrganizerName = event.external_organizer_name || event.externalOrganizerName || "";
    setEventOrganizerMode(existingExternalOrganizerName ? "other" : "self");
    setEventOrganizerId(event.organizer || "");
    setEventExternalOrganizerName(existingExternalOrganizerName);
    setEventLocation(event.event_location || event.eventLocation || "");
    setEventTypeMode(existingEventType);
    setEventRecurrenceWeekday(Number(event.recurrence_weekday ?? event.recurrenceWeekday ?? 3));
    setEventRecurrenceFrequency((event.recurrence_frequency || event.recurrenceFrequency || "weekly") as EventRecurrenceFrequency);
    setEventRecurrenceWeekdays(
      Array.isArray(event.recurrence_weekdays)
        ? event.recurrence_weekdays.map((value: any) => Number(value)).filter((value: number) => value >= 0 && value <= 6)
        : [Number(event.recurrence_weekday ?? event.recurrenceWeekday ?? 3)]
    );
    setEventMonthlyMode((event.recurrence_monthly_mode || event.recurrenceMonthlyMode || "day_of_month") as EventMonthlyMode);
    setEventRecurrenceMonthDay(Number(event.recurrence_month_day ?? event.recurrenceMonthDay ?? 1));
    setEventRecurrenceWeekOfMonth(Number(event.recurrence_week_of_month ?? event.recurrenceWeekOfMonth ?? 1));
    setEventIsVirtual(Boolean(event.is_virtual ?? event.isVirtual));
    setEventEntry((event.entry as EventEntryMode) || "free");
    const existingMedalDistances = Array.isArray(event.available_distances_km ?? event.availableDistancesKm)
      ? (event.available_distances_km ?? event.availableDistancesKm)
          .map((value: any) => Number(value))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      : [];
    setEventHasMedal(Boolean(event.has_medal ?? event.hasMedal));
    setEventMedalDistances(
      existingMedalDistances.length
        ? Array.from<number>(new Set(existingMedalDistances.map((value: number) => Number(value.toFixed(2))))).sort((a, b) => a - b)
        : event.has_medal || event.hasMedal
        ? [Number(event.medal_min_daily_distance || 0)].filter((value) => value > 0)
        : []
    );
    setEventCustomMedalDistance("");
    setEventEntryFee(
      event.entry_fee !== null && event.entry_fee !== undefined
        ? String(event.entry_fee)
        : event.entryFee !== null && event.entryFee !== undefined
        ? String(event.entryFee)
        : ""
    );
    setEventPaymentDetails(event.payment_details || event.paymentDetails || "");
    setEventRegistrationLink(event.registration_link || event.registrationLink || "");
    setEventOrganizerPaymentLink(event.organizer_payment_link || event.organizerPaymentLink || "");
    setEventRunNationPaymentLinkEnabled(Boolean(event.runnation_payment_link_enabled ?? event.runnationPaymentLinkEnabled));
    const existingParticipantLimit = event.participant_limit ?? event.participantLimit ?? null;
    setEventParticipantLimitEnabled(existingParticipantLimit !== null && existingParticipantLimit !== undefined);
    setEventParticipantLimit(
      existingParticipantLimit !== null && existingParticipantLimit !== undefined
        ? String(existingParticipantLimit)
        : ""
    );
    setEventMagazineArticleTitle(event.magazine_article_title || event.magazineArticleTitle || `Join ${event.event_name || event.eventName || "this RunNation event"}`);
    setEventMagazineArticleBody(event.magazine_article_body || event.magazineArticleBody || "");
    setEventMagazineWriterName(event.magazine_writer_name || event.magazineWriterName || "");
    setEventMagazineArticleFileName(event.magazine_article_body || event.magazineArticleBody ? "Existing article text" : null);
    setEventPosterAsset(null);
    setEventPosterPreview(event.poster_link || event.posterLink || null);
    setEventPosterMarkedForRemoval(false);
    setEventMagazinePhotoAsset(null);
    setEventMagazinePhotoPreview(event.magazine_photo_link || event.magazinePhotoLink || null);
    setEventMinimumDistanceEnabled(
      Boolean(
        (event.medal_min_daily_distance !== null && event.medal_min_daily_distance !== undefined) ||
          (event.medal_min_cumulative_distance !== null && event.medal_min_cumulative_distance !== undefined)
      )
    );
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

  const handlePickMagazinePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: false,
      quality: 1,
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    try {
      setEventMagazinePhotoAsset({
        uri: asset.uri,
        mimeType: asset.mimeType ?? null,
      });
      setEventMagazinePhotoPreview(asset.uri);
    } catch (error: any) {
      Alert.alert("Magazine Photo Error", error?.message || "Could not prepare the selected magazine photo.");
      return;
    }
  };

  const handleRemoveMagazinePhoto = () => {
    setEventMagazinePhotoAsset(null);
    setEventMagazinePhotoPreview(null);
  };

  const handlePickMagazineArticleFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/plain",
          "text/markdown",
          "text/csv",
          "text/rtf",
          "application/rtf",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      if (!isSupportedArticleTextFile(asset.name, asset.mimeType)) {
        Alert.alert("Unsupported Article File", "Please save or export the article as a plain text file first, then upload TXT, MD, CSV, LOG, or RTF.");
        return;
      }

      const rawText = await readArticleFileText(asset);
      const plainText =
        asset.name?.toLowerCase().endsWith(".rtf") || asset.mimeType?.toLowerCase().includes("rtf")
          ? stripRtfToPlainText(rawText)
          : rawText;
      const articleText = normalizeArticleText(plainText);

      const wordCount = countWords(articleText);

      if (wordCount < 200 || wordCount > 300) {
        Alert.alert("Article Length", `This article has ${wordCount} words. Please upload a 200-300 word article body.`);
        return;
      }

      setEventMagazineArticleBody(articleText);
      setEventMagazineArticleFileName(asset.name || "Article text file");
    } catch (error: any) {
      Alert.alert("Article File Error", error?.message || "Could not read the selected article text file.");
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

  const handleCreateNewsArticle = () => {
    const title = newsTitle.trim();
    const authorName = newsAuthor.trim();
    const body = newsBody.trim();
    const externalLink = newsExternalLink.trim();

    if (!title || !authorName || !body) {
      Alert.alert("Missing News Details", "Add a title, author name, and article body.");
      return;
    }

    const submit = (photoPayload?: { base64: string; mimeType: string }) => {
      createMagazineNewsMutation.mutate({
        page: isSuperAdmin ? newsPage : isMagazineColumnist ? "Columns" : "News",
        title,
        authorName,
        body,
        externalLink: externalLink || null,
        photoBase64: photoPayload?.base64 ?? null,
        photoMimeType: photoPayload?.mimeType ?? null,
      });
    };

    if (!newsPhotoAsset?.uri) {
      submit();
      return;
    }

    encodeMagazineArticlePhotoForUpload(newsPhotoAsset.uri, newsPhotoAsset.mimeType)
      .then(submit)
      .catch((error: any) => {
        Alert.alert("Photo Error", error?.message || "Could not prepare the selected article photo.");
      });
  };

  const handlePickNewsPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: false,
      quality: 1,
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    try {
      setNewsPhotoAsset({
        uri: asset.uri,
        mimeType: asset.mimeType ?? null,
      });
      setNewsPhotoPreview(asset.uri);
    } catch (error: any) {
      Alert.alert("Photo Error", error?.message || "Could not prepare the selected article photo.");
    }
  };

  const handleRemoveNewsPhoto = () => {
    setNewsPhotoAsset(null);
    setNewsPhotoPreview(null);
  };

  const openMagazineEditModal = (target: any) => {
    setSelectedMagazineEditTarget(target);
    setMagazineEditTitle(target.type === "pictorial" ? target.event_name || "" : target.title || "");
    setMagazineEditAuthor(target.article_writer_name || target.author_name || target.submitter_name || "");
    setMagazineEditCategory(target.category || (target.type === "pictorial" ? "Gallery" : "Community"));
    setMagazineEditPitch(target.pitch || "");
    setMagazineEditBody(target.type === "pictorial" ? target.caption || "" : target.body || "");
    setMagazineEditExternalLink(target.external_link || "");
    setMagazineEditEventDate(target.event_date || "");
    setMagazineEditPhotoAsset(null);
    setIsPreparingMagazineEditPhoto(false);
    setMagazineEditPhotoPreview(
      target.type === "pictorial"
        ? getMagazineImageUrl(target.photo_url, target.photo_webp_url, target.photo_avif_url)
        : getMagazineImageUrl(target.magazine_photo_url, target.attachment_url)
    );
  };

  const handlePickMagazineEditPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: false,
      quality: 1,
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    try {
      setMagazineEditPhotoAsset({
        uri: asset.uri,
        mimeType: asset.mimeType ?? null,
      });
      setMagazineEditPhotoPreview(asset.uri);
    } catch (error: any) {
      Alert.alert("Picture Error", error?.message || "Could not prepare the selected picture.");
    }
  };

  const handleSaveMagazineEdit = () => {
    if (!selectedMagazineEditTarget) return;

    const submit = (photoPayload?: { base64: string; mimeType: string }) => {
      if (selectedMagazineEditTarget.type === "pictorial") {
        updateMagazineEntryMutation.mutate({
          type: "pictorial",
          pictorialId: selectedMagazineEditTarget.pictorial_id,
          eventName: magazineEditTitle.trim(),
          caption: magazineEditBody.trim(),
          eventDate: magazineEditEventDate.trim() || null,
          photoBase64: photoPayload?.base64 ?? null,
          photoMimeType: photoPayload?.mimeType ?? null,
        });
        return;
      }

      updateMagazineEntryMutation.mutate({
        type: "article",
        submissionId: selectedMagazineEditTarget.submission_id,
        title: magazineEditTitle.trim(),
        authorName: magazineEditAuthor.trim(),
        category: magazineEditCategory.trim(),
        pitch: magazineEditPitch.trim() || null,
        body: magazineEditBody.trim(),
        externalLink: magazineEditExternalLink.trim() || null,
        photoBase64: photoPayload?.base64 ?? null,
        photoMimeType: photoPayload?.mimeType ?? null,
      });
    };

    if (magazineEditPhotoAsset?.uri) {
      setIsPreparingMagazineEditPhoto(true);
      encodeMagazineArticlePhotoForUpload(magazineEditPhotoAsset.uri, magazineEditPhotoAsset.mimeType)
        .then((photoPayload) => {
          setIsPreparingMagazineEditPhoto(false);
          submit(photoPayload);
        })
        .catch((error: any) => {
          setIsPreparingMagazineEditPhoto(false);
          Alert.alert("Picture Error", error?.message || "Could not prepare the selected picture.");
        });
      return;
    }

    submit();
  };

  const handleMagazineAction = (target: any, action: "preview" | "edit" | "accept" | "reject" | "feature" | "delete") => {
    if (action === "preview") {
      setSelectedMagazinePreview(target);
      return;
    }
    if (action === "edit") {
      setSelectedMagazinePreview(null);
      openMagazineEditModal(target);
      return;
    }

    if (target.type === "pictorial") {
      if (action === "accept") {
        setSelectedMagazinePreview(null);
        updateMagazinePictorialStatusMutation.mutate({ pictorialId: target.pictorial_id, status: "accepted" });
      } else if (action === "reject") {
        setSelectedMagazinePreview(null);
        updateMagazinePictorialStatusMutation.mutate({ pictorialId: target.pictorial_id, status: "rejected" });
      } else if (action === "feature") {
        setSelectedMagazinePreview(null);
        setPictureOfWeekMutation.mutate({ pictorialId: target.pictorial_id, weekLabel: null });
      } else if (action === "delete") {
        Alert.alert("Delete Pictorial", "Delete this pictorial entry? This is available to Global Admins and Magazine Editors.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              setSelectedMagazinePreview(null);
              deleteMagazinePictorialMutation.mutate({ pictorialId: target.pictorial_id });
            },
          },
        ]);
      }
      return;
    }

    if (action === "accept") {
      setSelectedMagazinePreview(null);
      updateMagazineSubmissionStatusMutation.mutate({ submissionId: target.submission_id, status: "accepted" });
    } else if (action === "reject") {
      setSelectedMagazinePreview(null);
      updateMagazineSubmissionStatusMutation.mutate({ submissionId: target.submission_id, status: "rejected" });
    } else if (action === "delete") {
      Alert.alert("Delete Submission", "Delete this magazine submission? This is available to Global Admins and Magazine Editors.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setSelectedMagazinePreview(null);
            deleteMagazineSubmissionMutation.mutate({ submissionId: target.submission_id });
          },
        },
      ]);
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
    if (event.external_organizer_name || event.externalOrganizerName) {
      return String(event.external_organizer_name || event.externalOrganizerName);
    }
    if (event.organizer_name || event.organizerName) {
      return String(event.organizer_name || event.organizerName);
    }
    if (event.club) {
      return String(event.club);
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

  const exportCsvFile = async (fileName: string, csvContent: string, dialogTitle: string) => {
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
      return;
    }

    const { File: FSFile, Paths: FSPaths } = await import("expo-file-system/next");
    const file = new FSFile(FSPaths.document, fileName);
    file.write(csvContent);
    Alert.alert(dialogTitle, `CSV saved to:\n${file.uri}`);
  };

  const handleExportMilestones = async () => {
    const calculatedRows = ((milestonesData?.calculated ?? []) as AdminMilestoneRow[]).map((row) => ({
      ...row,
      source: "Calculated",
      exportDate: row.milestoneDate === "soon" ? "" : row.milestoneDate || "",
      exportStatus: row.milestoneDate === "soon" ? "Soon" : row.milestoneDate ? "Reached" : "Pending",
    }));
    const manualRows = ((milestonesData?.manual ?? []) as AdminMilestoneRow[]).map((row) => ({
      ...row,
      source: "Manual",
      exportDate: (milestoneDateInputs[row.key] ?? row.milestoneDate ?? "").trim(),
      exportStatus: (milestoneDateInputs[row.key] ?? row.milestoneDate ?? "").trim() ? "Set" : "Pending",
    }));
    const rows = [...calculatedRows, ...manualRows];

    if (rows.length === 0) {
      Alert.alert("No Data", "There are no milestones to export.");
      return;
    }

    setIsExportingMilestones(true);
    try {
      const headers = ["Source", "Category", "Milestone", "Target", "Date", "Status", "Key"];
      const csvRows = rows.map((row) => [
        row.source,
        row.category,
        row.milestone,
        row.threshold ?? "",
        row.exportDate,
        row.exportStatus,
        row.key,
      ]);
      const csvContent = [headers, ...csvRows]
        .map((row) => row.map(csvEscape).join(","))
        .join("\n");
      await exportCsvFile(`runnation_milestones_${new Date().toISOString().slice(0, 10)}.csv`, csvContent, "Export Milestones CSV");
    } catch (error: any) {
      console.error("[Milestones] Export failed:", error);
      Alert.alert("Export Error", error.message || "Could not export milestones.");
    } finally {
      setIsExportingMilestones(false);
    }
  };

  const handleExportClubStatusReport = async () => {
    const rows = (clubStatusReport?.rows ?? []) as any[];
    if (rows.length === 0) {
      Alert.alert("No Data", "There are no club status rows to export.");
      return;
    }

    setIsExportingClubStatus(true);
    try {
      const headers = [
        "Club",
        "Name",
        "Sex",
        "Town",
        "Sign up date",
        "Subscription",
        "RunNation tier",
        "Runs (last 30 days)",
        "Declaration",
        "Has service role",
        "Other club membership",
      ];
      const csvRows = rows.map((row) => [
        row.clubName,
        row.name,
        row.sex,
        row.town,
        row.signUpDate ? formatDate(row.signUpDate) : "",
        row.subscription,
        row.runNationTier,
        row.runsLast30Days,
        row.declaration,
        row.hasServiceRole,
        row.otherClubMembership,
      ]);
      const csvContent = [headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
      await exportCsvFile(`club_status_${new Date().toISOString().slice(0, 10)}.csv`, csvContent, "Export Club Status CSV");
    } catch (error: any) {
      Alert.alert("Export Error", error.message || "Could not export club status.");
    } finally {
      setIsExportingClubStatus(false);
    }
  };

  const handleExportEventResultsReport = async () => {
    const rows = (eventResultsReport?.rows ?? []) as any[];
    if (!selectedReportEventId) {
      Alert.alert("Select Event", "Choose a completed event before downloading results.");
      return;
    }
    if (rows.length === 0) {
      Alert.alert("No Data", "There are no event result rows to export.");
      return;
    }

    setIsExportingEventResults(true);
    try {
      const headers = ["Rank", "Name", "Sex", "Town", "Registration date", "Distance km", "Time", "Pace"];
      const csvRows = rows.map((row) => [
        row.rank,
        row.name,
        row.sex,
        row.town,
        row.registrationDate ? formatDate(row.registrationDate) : "",
        row.distanceKm,
        row.time,
        row.pace,
      ]);
      const csvContent = [headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
      const safeEventName = String(eventResultsReport?.eventName || "event_results").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      await exportCsvFile(`${safeEventName}_${new Date().toISOString().slice(0, 10)}.csv`, csvContent, "Export Event Results CSV");
    } catch (error: any) {
      Alert.alert("Export Error", error.message || "Could not export event results.");
    } finally {
      setIsExportingEventResults(false);
    }
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

      await exportCsvFile(fileName, csvContent, "Save Audit Log CSV");
    } catch (error: any) {
      console.error("[AuditLog] Export failed:", error);
      Alert.alert("Export Error", error.message || "Could not export the audit log.");
    } finally {
      setIsDownloadingAuditLog(false);
    }
  };

  const getTabTitle = (tab: typeof activeTab): string => {
    switch (tab) {
      case "orders": return "Orders";
      case "stock": return "Stock";
      case "approvals": return "Treadmill";
      case "events": return "Events";
      case "enrollments": return "Participant Approvals";
      case "payments": return "Club Payments";
      case "whatsapp": return "WhatsApp Group";
      case "clubAdmin": return isEventOrganizer && !isClubCoordinator ? "Organization Profile" : "Club Admin";
      case "clubRequests": return "Membership Approvals";
      case "activityUploads": return "Activity Uploads";
      case "externalActivities": return "Other Source Runs";
      case "ratings": return "Ratings";
      case "suggestions": return "Suggestions";
      case "magazine": return "Magazine";
      case "myArticles": return "My Articles";
      case "adminTerms": return "Admin Terms";
      case "roles": return "Role Access";
      case "dataHealth": return "Data Health";
      case "auditLog": return "Audit Log";
      case "milestones": return "Milestones";
      case "resign": return "Resign";
      case "moderation": return "Chat Moderation";
      case "reports": return "Reports";
      case "myTeam": return "My Team";
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
    { key: "enrollments", label: "Participant Approvals", icon: <UserPlus size={24} color="#10b981" /> },
    { key: "payments", label: "Payments", icon: <CreditCard size={24} color="#10b981" />, badgeCount: clubPayoutRequests.filter((request) => request.status === "pending").length },
    { key: "whatsapp", label: "WhatsApp Group", icon: <MessageCircle size={24} color="#10b981" /> },
    { key: "clubAdmin", label: needsClubProfileSetup ? "Create Club" : isEventOrganizer && !isClubCoordinator ? "Organization Profile" : "Club Admin", icon: <Building2 size={24} color="#10b981" />, badgeCount: needsClubProfileSetup ? 1 : pendingClubDeletionRequests.length },
    { key: "clubRequests", label: "Membership Approvals", icon: <Users size={24} color="#10b981" />, badgeCount: pendingClubMembershipRequests.length },
    { key: "activityUploads", label: "Activity Uploads", icon: <Upload size={24} color="#10b981" /> },
    { key: "externalActivities", label: "Other Source Runs", icon: <Activity size={24} color="#10b981" />, badgeCount: externalSubmissions?.length || 0 },
    { key: "ratings", label: "Ratings", icon: <Star size={24} color="#10b981" />, badgeCount: appRatings.length },
    { key: "suggestions", label: "Suggestions", icon: <MessageSquare size={24} color="#10b981" />, badgeCount: suggestions.length },
    { key: "magazine", label: "Magazine", icon: <BookOpen size={24} color="#10b981" />, badgeCount: magazineSubmissions.length + magazinePictorials.length },
    { key: "myArticles", label: "My Articles", icon: <FileText size={24} color="#10b981" />, badgeCount: myMagazineArticles.length },
    { key: "moderation", label: "Chat Reports", icon: <ShieldAlert size={24} color="#10b981" />, badgeCount: (chatReports as ChatModerationReport[]).filter((report) => report.status === "pending").length },
    { key: "reports", label: "Reports", icon: <FileText size={24} color="#10b981" /> },
    { key: "myTeam", label: "My Team", icon: <Users size={24} color="#10b981" /> },
    { key: "adminTerms", label: "Admin Terms", icon: <ClipboardCheck size={24} color="#10b981" /> },
    { key: "roles", label: "Roles", icon: <UserPlus size={24} color="#10b981" />, badgeCount: pendingRoleRequestCount },
    { key: "dataHealth", label: "Data Health", icon: <ShieldAlert size={24} color="#10b981" />, badgeCount: accountLinkHealthSummary?.issueCount ?? 0 },
    { key: "auditLog", label: "Audit Log", icon: <FileText size={24} color="#10b981" />, badgeCount: (auditLogs as AuditLogEntry[]).length },
    { key: "milestones", label: "Milestones", icon: <Star size={24} color="#10b981" /> },
    { key: "resign", label: "Resign", icon: <LogOut size={24} color="#10b981" /> },
    { key: "archive", label: "Archive", icon: <Archive size={24} color="#10b981" /> },
  ];

  const visibleMenuItems = useMemo(() => {
    const priorityByRole: Record<string, AdminTab[]> = {
      super_admin: [
        "roles",
        "dataHealth",
        "auditLog",
        "milestones",
        "orders",
        "events",
        "payments",
        "whatsapp",
        "clubAdmin",
        "stock",
        "approvals",
        "enrollments",
        "clubRequests",
        "activityUploads",
        "externalActivities",
        "magazine",
        "reports",
        "myTeam",
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
        "payments",
        "whatsapp",
        "clubAdmin",
        "clubRequests",
        "activityUploads",
        "externalActivities",
        "magazine",
        "reports",
        "myTeam",
        "adminTerms",
        "resign",
      ],
      country_coordinator: [
        "orders",
        "stock",
        "approvals",
        "events",
        "enrollments",
        "payments",
        "whatsapp",
        "clubAdmin",
        "clubRequests",
        "activityUploads",
        "externalActivities",
        "magazine",
        "reports",
        "myTeam",
        "archive",
        "adminTerms",
        "resign",
      ],
      club_coordinator: [
        "approvals",
        "events",
        "enrollments",
        "payments",
        "whatsapp",
        "clubAdmin",
        "clubRequests",
        "activityUploads",
        "externalActivities",
        "magazine",
        "moderation",
        "reports",
        "adminTerms",
        "resign",
      ],
      special_club_coordinator: [
        "events",
        "externalActivities",
        "whatsapp",
        "magazine",
        "reports",
        "adminTerms",
        "resign",
      ],
      event_organizer: [
        "clubAdmin",
        "events",
        "enrollments",
        "reports",
        "adminTerms",
        "resign",
      ],
      magazine_editor: [
        "magazine",
        "myTeam",
        "adminTerms",
        "resign",
      ],
      magazine_columnist: [
        "myArticles",
        "magazine",
        "adminTerms",
        "resign",
      ],
      chat_room_administrator: [
        "moderation",
        "adminTerms",
        "resign",
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
      : isSpecialClubCoordinator
      ? "special_club_coordinator"
      : isEventOrganizer
      ? "event_organizer"
      : isMagazineEditor
      ? "magazine_editor"
      : isMagazineColumnist
      ? "magazine_columnist"
      : isChatRoomAdministrator
      ? "chat_room_administrator"
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
    isSpecialClubCoordinator,
    isEventOrganizer,
    isMagazineEditor,
    isMagazineColumnist,
    isChatRoomAdministrator,
  ]);

  const getMenuPurposeGroup = (tab: AdminTab): AdminMenuPurposeGroup => {
    if (["roles", "approvals", "events", "enrollments", "clubRequests", "activityUploads", "externalActivities", "magazine", "moderation"].includes(tab)) {
      return "approvals";
    }
    if (["milestones", "reports", "auditLog", "dataHealth", "ratings", "archive"].includes(tab)) {
      return "reporting";
    }
    if (["adminTerms", "suggestions", "whatsapp", "myTeam", "resign"].includes(tab)) {
      return "administration";
    }
    return "operations";
  };

  const handleExportClubActivityReport = async () => {
    const rows = (clubActivityReport?.rows ?? []) as any[];
    if (!selectedActivityReportClubId) {
      Alert.alert("Select Club", "Choose a club before downloading activity.");
      return;
    }
    if (rows.length === 0) {
      Alert.alert("No Data", "There is no club activity in the selected date range.");
      return;
    }

    setIsExportingClubActivity(true);
    try {
      const headers = [
        "Activity date",
        "Member",
        "Sex",
        "Country",
        "Town",
        "Activity type",
        "Distance km",
        "Duration minutes",
        "Pace min/km",
        "Start time",
        "End time",
        "Paused seconds",
      ];
      const csvRows = rows.map((row) => [
        String(row.activityDate || "").slice(0, 10),
        row.memberName,
        row.sex,
        row.country,
        row.town,
        row.exerciseType,
        Number(row.distanceKm || 0).toFixed(2),
        Number(row.durationMinutes || 0).toFixed(2),
        Number(row.paceMinPerKm || 0).toFixed(2),
        row.startTime,
        row.endTime,
        row.pauseSeconds,
      ]);
      const csvContent = [headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
      const safeClubName = String(clubActivityReport?.clubName || "club")
        .replace(/[^a-z0-9]+/gi, "_")
        .toLowerCase();
      await exportCsvFile(
        `${safeClubName}_activity_${clubActivityStartDate}_to_${clubActivityEndDate}.csv`,
        csvContent,
        "Export Club Activity CSV"
      );
    } catch (error: any) {
      Alert.alert("Export Error", error.message || "Could not export club activity.");
    } finally {
      setIsExportingClubActivity(false);
    }
  };

  const groupedMenuSections = useMemo(() => {
    const enabledGroups: Array<{ key: AdminMenuPurposeGroup; title: string }> = [
      { key: "approvals", title: "Approvals" },
      { key: "reporting", title: "Reporting" },
      { key: "administration", title: "Administration" },
      { key: "operations", title: "Operations" },
    ];

    return enabledGroups
      .map((group) => ({
        key: group.key,
        title: group.title,
        items: visibleMenuItems.filter((item) => getMenuPurposeGroup(item.key) === group.key),
      }))
      .filter((section) => section.items.length > 0);
  }, [visibleMenuItems]);

  if (isChecking) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  const handleSubmitResignation = () => {
    const reason = resignationReason.trim();
    if (reason.length < 10) {
      Alert.alert("Reason required", "Please give a short reason before submitting your resignation.");
      return;
    }

    Alert.alert(
      "Confirm resignation",
      "Are you sure you want to resign from your admin role? This request stays pending for 12 hours for automatic actioning, unless a Global Admin actions it before then.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          style: "destructive",
          onPress: () => requestRoleResignationMutation.mutate({ reason }),
        },
      ]
    );
  };

  const handleRequestClubDeletion = (club: ClubDeletionClub) => {
    const reason = (clubDeletionReasonById[club.clubId] || "").trim();
    if (reason.length < 10) {
      Alert.alert("Reason required", "Please give a short reason before requesting club deletion.");
      return;
    }

    Alert.alert(
      "Delete club?",
      club.memberCount > 0
        ? "This club has members, so deletion will stay pending for 12 hours and needs admin approval/actioning. Continue?"
        : "This club has no members, so it will be deleted immediately. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () =>
            requestClubDeletionMutation.mutate({
              clubId: club.clubId,
              reason,
              inactiveAdminDelete: Boolean(club.inactiveFlag && (isSuperAdmin || isCountryAdmin || isCountryCoordinator)),
            }),
        },
      ]
    );
  };

  const handleDeleteInactiveClub = (club: any) => {
    Alert.alert(
      "Delete inactive club?",
      `${club.clubName} is flagged as inactive: ${club.inactiveReason} This action deletes the club.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            requestClubDeletionMutation.mutate({
              clubId: club.clubId,
              reason: `Inactive club deletion: ${club.inactiveReason}`,
              inactiveAdminDelete: true,
            }),
        },
      ]
    );
  };

  const handleCreateClubProfile = () => {
    const name = clubProfileName.trim().replace(/\s+/g, " ");
    if (name.length < 3) {
      Alert.alert("Club Name Required", "Enter the club name before creating the club profile.");
      return;
    }

    const presenceTowns = clubProfilePresenceTowns
      .split(",")
      .map((town) => town.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    createClubProfileMutation.mutate({
      clubName: name,
      location: clubProfileLocation.trim() || null,
      description: clubProfileDescription.trim() || null,
      presenceTowns,
    });
  };

  const handleSaveAdminProfile = () => {
    if (!adminProfile) {
      Alert.alert("Profile Unavailable", "Could not load your club/organization profile.");
      return;
    }
    const name = adminProfileName.trim().replace(/\s+/g, " ");
    if (name.length < 2) {
      Alert.alert("Name Required", "Enter a valid club or organization name.");
      return;
    }
    const presenceTowns = adminProfilePresenceTowns
      .split(",")
      .map((town) => town.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    updateAdminProfileMutation.mutate({
      profileType: adminProfile.type,
      profileId: adminProfile.id,
      name,
      location: adminProfileLocation.trim() || null,
      description: adminProfileDescription.trim() || null,
      presenceTowns: adminProfile.type === "club" ? presenceTowns : [],
    });
  };

  const renderClubAdminContent = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      {needsClubProfileSetup ? (
        <View style={styles.auditFilterCard}>
          <View style={styles.auditFilterHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.auditFilterTitle}>Create Club Profile</Text>
              <Text style={styles.auditFilterSubtitle}>
                Your Club Coordinator role is approved for {formatCountryName(pendingClubSetupRole?.countryCode ?? null) || pendingClubSetupRole?.countryCode || "your country"}. Create the club profile first so the club tools can attach to the right club.
              </Text>
            </View>
          </View>
          <Text style={styles.label}>Club Name</Text>
          <TextInput
            style={styles.input}
            value={clubProfileName}
            onChangeText={setClubProfileName}
            placeholder="e.g. Treadmill Runners Club"
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={clubProfileLocation}
            onChangeText={setClubProfileLocation}
            placeholder="Town, city, or district"
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.label}>Presence Towns</Text>
          <TextInput
            style={styles.input}
            value={clubProfilePresenceTowns}
            onChangeText={setClubProfilePresenceTowns}
            placeholder="Separate towns with commas"
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.label}>Portfolio Notes</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={clubProfileDescription}
            onChangeText={setClubProfileDescription}
            placeholder="Briefly describe the club, routes, training style, or community focus."
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.approveButton, createClubProfileMutation.isPending && styles.disabledButton]}
            onPress={handleCreateClubProfile}
            disabled={createClubProfileMutation.isPending}
          >
            <Building2 size={18} color="#fff" />
            <Text style={styles.actionButtonText}>
              {createClubProfileMutation.isPending ? "Creating..." : "Create Club Profile"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {needsClubProfileSetup ? null : (
        <>
      <View style={styles.auditFilterCard}>
        <Text style={styles.auditFilterTitle}>
          {adminProfile?.type === "organizer" ? "Organization Profile" : "Club Profile"}
        </Text>
        <Text style={styles.auditFilterSubtitle}>
          Keep these details current. Admins and users see this identity across events, enrolments, reports, and club tools.
        </Text>
        {adminProfileLoading ? (
          <Text style={styles.emptyText}>Loading profile...</Text>
        ) : adminProfileError ? (
          <Text style={styles.errorText}>{adminProfileError.message || "Could not load profile details."}</Text>
        ) : !adminProfile ? (
          <Text style={styles.emptyText}>No editable club or organization profile is connected to this role.</Text>
        ) : (
          <>
            <Text style={styles.label}>{adminProfile.type === "organizer" ? "Organization Name" : "Club Name"}</Text>
            <TextInput
              style={styles.input}
              value={adminProfileName}
              onChangeText={setAdminProfileName}
              placeholder={adminProfile.type === "organizer" ? "Organization name" : "Club name"}
              placeholderTextColor="#9ca3af"
            />
            <Text style={styles.label}>{adminProfile.type === "organizer" ? "Base Location" : "Location"}</Text>
            <TextInput
              style={styles.input}
              value={adminProfileLocation}
              onChangeText={setAdminProfileLocation}
              placeholder="Town, city, or district"
              placeholderTextColor="#9ca3af"
            />
            {adminProfile.type === "club" ? (
              <>
                <Text style={styles.label}>Presence Towns</Text>
                <TextInput
                  style={styles.input}
                  value={adminProfilePresenceTowns}
                  onChangeText={setAdminProfilePresenceTowns}
                  placeholder="Separate towns with commas"
                  placeholderTextColor="#9ca3af"
                />
              </>
            ) : null}
            <Text style={styles.label}>{adminProfile.type === "organizer" ? "Organization Notes" : "Portfolio Notes"}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={adminProfileDescription}
              onChangeText={setAdminProfileDescription}
              placeholder={adminProfile.type === "organizer" ? "Describe your organization, event focus, or operating area." : "Briefly describe the club, routes, training style, or community focus."}
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.approveButton, updateAdminProfileMutation.isPending && styles.disabledButton]}
              onPress={handleSaveAdminProfile}
              disabled={updateAdminProfileMutation.isPending}
            >
              <Save size={18} color="#fff" />
              <Text style={styles.actionButtonText}>
                {updateAdminProfileMutation.isPending ? "Saving..." : "Save Profile"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {isEventOrganizer && !isClubCoordinator ? null : (
        <>
      <View style={styles.auditFilterCard}>
        <Text style={styles.auditFilterTitle}>Club Deletion Governance</Text>
        <Text style={styles.auditFilterSubtitle}>
          Club coordinators can delete clubs they created or coordinate. Empty clubs delete immediately; clubs with members stay pending for 12 hours and require admin approval/actioning.
        </Text>
      </View>

      {clubDeletionLoading ? (
        <View style={styles.emptyContainer}><Text style={styles.emptyText}>Loading club admin tools...</Text></View>
      ) : clubDeletionError ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.errorText}>Error loading club admin tools</Text>
          <Text style={styles.errorSubtext}>{clubDeletionError.message || "Could not load club deletion tools."}</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
            <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
              <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                <View style={[styles.adminDataCell, { width: 220 }]}><Text style={styles.adminDataHeaderText}>Club</Text></View>
                <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataHeaderText}>Country</Text></View>
                <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataHeaderText}>Members</Text></View>
                <View style={[styles.adminDataCell, { width: 300 }]}><Text style={styles.adminDataHeaderText}>Reason</Text></View>
                <View style={[styles.adminDataCell, { width: 150 }]}><Text style={styles.adminDataHeaderText}>Actions</Text></View>
              </View>
              {clubDeletionClubs.map((club) => (
                <View key={club.clubId} style={styles.adminDataRow}>
                  <View style={[styles.adminDataCell, { width: 220 }]}>
                    <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{club.clubName}</Text>
                    <Text style={styles.adminDataCellMuted} numberOfLines={1}>{club.location || "No location"}</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataCellText}>{formatCountryName(club.country) || club.country || "-"}</Text></View>
                  <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataCellText}>{club.memberCount}</Text></View>
                  <View style={[styles.adminDataCell, { width: 300 }]}>
                    <TextInput
                      style={[styles.input, { minHeight: 38, paddingVertical: 8 }]}
                      value={clubDeletionReasonById[club.clubId] || ""}
                      onChangeText={(value) => setClubDeletionReasonById((current) => ({ ...current, [club.clubId]: value }))}
                      placeholder="Reason for deletion"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={[styles.adminDataCell, { width: 150 }]}>
                    <TouchableOpacity
                      style={[styles.adminDataActionButton, styles.adminDataActionReject, (!club.canRequestDeletion || requestClubDeletionMutation.isPending) && styles.disabledButton]}
                      onPress={() => handleRequestClubDeletion(club)}
                      disabled={!club.canRequestDeletion || requestClubDeletionMutation.isPending}
                    >
                      <Text style={styles.adminDataActionText}>{club.memberCount > 0 ? "Request" : "Delete"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
            <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
              <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                <View style={[styles.adminDataCell, { width: 200 }]}><Text style={styles.adminDataHeaderText}>Club</Text></View>
                <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataHeaderText}>Requested</Text></View>
                <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataHeaderText}>Eligible</Text></View>
                <View style={[styles.adminDataCell, { width: 260 }]}><Text style={styles.adminDataHeaderText}>Reason</Text></View>
                <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataHeaderText}>Status</Text></View>
                <View style={[styles.adminDataCell, { width: 150 }]}><Text style={styles.adminDataHeaderText}>Actions</Text></View>
              </View>
              {clubDeletionRequests.map((request) => (
                <View key={request.requestId} style={styles.adminDataRow}>
                  <View style={[styles.adminDataCell, { width: 200 }]}><Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{request.clubName}</Text></View>
                  <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataCellText}>{formatDate(request.createdAt)}</Text></View>
                  <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataCellText}>{formatDate(request.eligibleAt)}</Text></View>
                  <View style={[styles.adminDataCell, { width: 260 }]}><Text style={styles.adminDataCellText} numberOfLines={3}>{request.reason}</Text></View>
                  <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataCellText}>{request.status}</Text></View>
                  <View style={[styles.adminDataCell, styles.adminDataActions, { width: 150 }]}>
                    {request.status === "pending" && (isSuperAdmin || isCountryAdmin || isCountryCoordinator) ? (
                      <>
                        <TouchableOpacity style={[styles.adminDataActionButton, styles.adminDataActionApprove]} onPress={() => reviewClubDeletionMutation.mutate({ requestId: request.requestId, action: "approve" })}>
                          <Text style={styles.adminDataActionText}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.adminDataActionButton, styles.adminDataActionReject]} onPress={() => reviewClubDeletionMutation.mutate({ requestId: request.requestId, action: "reject" })}>
                          <Text style={styles.adminDataActionText}>Reject</Text>
                        </TouchableOpacity>
                      </>
                    ) : <Text style={styles.adminDataCellMuted}>No action</Text>}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </>
      )}
        </>
      )}
        </>
      )}
    </ScrollView>
  );

  const renderResignContent = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      <View style={styles.auditFilterCard}>
        <View style={styles.auditFilterHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.auditFilterTitle}>Resign Admin Role</Text>
            <Text style={styles.auditFilterSubtitle}>
              Submit a resignation request for your admin access. Global Admins cannot use this self-service flow.
            </Text>
          </View>
        </View>
        <Text style={styles.errorHint}>
          After confirmation, the request stays pending for 12 hours before automatic actioning unless a Global Admin handles it earlier.
        </Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={resignationReason}
          onChangeText={setResignationReason}
          placeholder="Reason for resigning"
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.rejectBtn, requestRoleResignationMutation.isPending && styles.disabledButton]}
          onPress={handleSubmitResignation}
          disabled={requestRoleResignationMutation.isPending}
        >
          <LogOut size={18} color="#fff" />
          <Text style={styles.actionBtnText}>
            {requestRoleResignationMutation.isPending ? "Submitting..." : "Submit Resignation"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderRoleAccessContent = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.auditFilterCard}>
          <View style={styles.auditFilterHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.auditFilterTitle}>Admin Role Access</Text>
              <Text style={styles.auditFilterSubtitle}>Global Admin can review pending role requests and manage active role access.</Text>
            </View>
          </View>
        </View>

      {roleManagementLoading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading role access...</Text>
        </View>
      ) : roleManagementError ? (
        <View style={styles.emptyContainer}>
          <AlertTriangle size={56} color="#f59e0b" />
          <Text style={styles.errorText}>Error loading role access</Text>
          <Text style={styles.errorSubtext}>{roleManagementError?.message || "Could not load role access details."}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetchRoleManagement()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.roleAccessPanel}>
          <View style={styles.roleAccessTabs}>
            <TouchableOpacity
              style={[styles.roleAccessTabButton, roleAccessTab === "pending" && styles.roleAccessTabButtonActive]}
              onPress={() => setRoleAccessTab("pending")}
            >
              <Text style={[styles.roleAccessTabText, roleAccessTab === "pending" && styles.roleAccessTabTextActive]}>
                Pending ({visiblePendingRoleRequests.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleAccessTabButton, roleAccessTab === "active" && styles.roleAccessTabButtonActive]}
              onPress={() => setRoleAccessTab("active")}
            >
              <Text style={[styles.roleAccessTabText, roleAccessTab === "active" && styles.roleAccessTabTextActive]}>
                Active ({activeRoleAssignments.length})
              </Text>
            </TouchableOpacity>
          </View>

          {roleAccessTab === "pending" ? (
            visiblePendingRoleRequests.length === 0 ? (
              <View style={styles.roleAccessEmpty}>
                <UserPlus size={30} color="#d1d5db" />
                <Text style={styles.roleAccessEmptyTitle}>No pending requests</Text>
                <Text style={styles.roleAccessEmptyText}>Submitted role applications will appear here for approval.</Text>
              </View>
            ) : (
              <View style={styles.pendingRoleList}>
                {visiblePendingRoleRequests.map((request) => (
                  <View key={request.inviteId} style={styles.pendingRoleCard}>
                    <View style={styles.pendingRoleTopRow}>
                      <View style={styles.pendingRoleIdentity}>
                        <Text style={styles.pendingRoleEmail} numberOfLines={2}>{request.email}</Text>
                        <Text style={styles.pendingRoleMetaText}>{formatDate(request.createdAt)} • By {request.invitedByName || "Global Admin"}</Text>
                      </View>
                      <View style={styles.pendingRoleScopeBlock}>
                        <Text style={styles.pendingRoleLabel}>Role</Text>
                        <Text style={styles.pendingRoleValue} numberOfLines={2}>{getRoleDisplayName(request.roleName)}</Text>
                        <Text style={styles.pendingRoleLabel}>Club/company</Text>
                        <Text style={styles.pendingRoleValue} numberOfLines={2}>{getRoleRequestClubCompany(request)}</Text>
                        <Text style={styles.pendingRoleLabel}>Scope</Text>
                        <Text style={styles.pendingRoleValue} numberOfLines={2}>{getRoleRequestScope(request)}</Text>
                      </View>
                    </View>

                    <View style={styles.pendingRoleTextBox}>
                      <Text style={styles.pendingRoleLabel}>Application details</Text>
                      {request.applicantStatement ? (
                        <Text style={styles.pendingRoleBodyText}>{request.applicantStatement}</Text>
                      ) : (
                        <Text style={styles.pendingRoleMutedText}>No applicant statement added.</Text>
                      )}
                      {request.contactConsent ? (
                        <Text style={styles.pendingRoleContactText}>
                          Contact: {request.contactInstructions || "Applicant asked to be contacted if selected"}
                        </Text>
                      ) : null}
                      {getRoleRequestLinks(request).length > 0 ? (
                        <View style={styles.pendingRoleLinks}>
                          {getRoleRequestLinks(request).map((link) => (
                            <View key={`${request.inviteId}-${link.label}`} style={styles.pendingRoleLinkRow}>
                              <Text style={styles.pendingRoleLinkText} numberOfLines={1}>{link.label}: {link.url}</Text>
                              <View style={styles.pendingRoleLinkActions}>
                                <TouchableOpacity style={styles.pendingRoleLinkButton} onPress={() => Linking.openURL(link.url)}>
                                  <Text style={styles.pendingRoleLinkButtonText}>Open</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.pendingRoleLinkButton}
                                  onPress={() => {
                                    Clipboard.setString(link.url);
                                    Alert.alert("Copied", "Link copied.");
                                  }}
                                >
                                  <Text style={styles.pendingRoleLinkButtonText}>Copy</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.pendingRoleActions}>
                      <TouchableOpacity
                        style={[styles.pendingRoleButton, styles.roleMiniApprove]}
                        onPress={() => approveRoleRequestMutation.mutate({ inviteId: request.inviteId })}
                        disabled={approveRoleRequestMutation.isPending}
                      >
                        <CheckCircle size={14} color="#fff" />
                        <Text style={styles.roleMiniButtonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pendingRoleButton, styles.roleMiniReject]}
                        onPress={() => rejectRoleRequestMutation.mutate({ inviteId: request.inviteId })}
                        disabled={rejectRoleRequestMutation.isPending}
                      >
                        <XCircle size={14} color="#fff" />
                        <Text style={styles.roleMiniButtonText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )
          ) : activeRoleAssignments.length === 0 ? (
            <View style={styles.roleAccessEmpty}>
              <Users size={30} color="#d1d5db" />
              <Text style={styles.roleAccessEmptyTitle}>No active assignments yet</Text>
            </View>
          ) : (
            <View style={styles.roleTable}>
              <View style={[styles.roleTableRow, styles.roleTableHeader]}>
                <Text style={[styles.roleTableHeaderText, styles.roleColUser]}>User</Text>
                <Text style={[styles.roleTableHeaderText, styles.roleColRole]}>Role</Text>
                <Text style={[styles.roleTableHeaderText, styles.roleColClubCompany]}>Club/Company</Text>
                <Text style={[styles.roleTableHeaderText, styles.roleColJurisdiction]}>Jurisdiction</Text>
                <Text style={[styles.roleTableHeaderText, styles.roleColDate]}>Date</Text>
                <Text style={[styles.roleTableHeaderText, styles.roleColTerms]}>T&Cs</Text>
                <Text style={[styles.roleTableHeaderText, styles.roleColActions]}>Actions</Text>
              </View>
              {activeRoleAssignments.map((assignment) => (
                <View key={assignment.assignmentId} style={styles.roleTableRow}>
                  <View style={styles.roleColUser}>
                    <Text style={[styles.roleCellText, styles.roleCellStrong]} numberOfLines={2}>{assignment.userName}</Text>
                  </View>
                  <View style={styles.roleColRole}>
                    <Text style={styles.roleCellText} numberOfLines={2}>{getRoleDisplayName(assignment.roleName)}</Text>
                  </View>
                  <View style={styles.roleColClubCompany}>
                    <Text style={styles.roleCellText} numberOfLines={2}>{getRoleAssignmentClubCompany(assignment)}</Text>
                  </View>
                  <View style={styles.roleColJurisdiction}>
                    <Text style={styles.roleCellText} numberOfLines={2}>{getRoleAssignmentJurisdiction(assignment)}</Text>
                  </View>
                  <View style={styles.roleColDate}>
                    <Text style={styles.roleCellMuted} numberOfLines={2}>{formatDate(assignment.createdAt)}</Text>
                  </View>
                  <View style={styles.roleColTerms}>
                    <Text
                      style={[
                        styles.roleTermsBadge,
                        assignment.hasAcceptedTerms ? styles.roleTermsAccepted : styles.roleTermsPending,
                      ]}
                      numberOfLines={1}
                    >
                      {getRoleAssignmentTermsStatus(assignment)}
                    </Text>
                  </View>
                  <View style={[styles.roleColActions, styles.roleActionCell]}>
                    <TouchableOpacity
                      style={[styles.roleMiniButton, styles.roleMiniRemove]}
                      onPress={() =>
                        Alert.alert("Remove Role Access", "Remove this role access assignment?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => deleteRoleAssignmentMutation.mutate({ assignmentId: assignment.assignmentId }) },
                        ])
                      }
                    >
                      <Trash2 size={12} color="#fff" />
                      <Text style={styles.roleMiniButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );

  const renderAdminTermsContent = () => {
    const termsSections = adminTermsContent?.sections ?? [];
    const termsError = adminTermsStatusError || adminTermsContentError;

    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.auditFilterCard}>
          <View style={styles.auditFilterHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.auditFilterTitle}>Admin Terms and Conditions</Text>
              <View style={styles.organizerTermsPill}>
                <Text style={styles.organizerTermsPillText}>{adminTermsContent?.roleLabel ?? "Admin Terms"}</Text>
              </View>
              <Text style={styles.auditFilterSubtitle}>
                Version {adminTermsContent?.currentVersion ?? adminTermsStatus?.currentVersion ?? "Loading"}
                {adminTermsStatus?.acceptedAt ? ` - Accepted ${formatDate(adminTermsStatus.acceptedAt)}` : ""}
              </Text>
            </View>
            {termsError ? (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  void refetchAdminTermsStatus();
                  void refetchAdminTermsContent();
                }}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {adminTermsContentLoading ? (
          <View style={styles.auditLogCard}>
            <Text style={styles.auditLogAction}>Loading Terms</Text>
            <View style={styles.auditLogDetails}>
              <Text style={styles.auditMetadata}>Fetching the current terms from the server...</Text>
            </View>
          </View>
        ) : termsError ? (
          <View style={styles.auditLogCard}>
            <Text style={styles.auditLogAction}>Terms Unavailable</Text>
            <View style={styles.auditLogDetails}>
              <Text style={styles.auditMetadata}>{termsError.message || "Could not load the current terms."}</Text>
            </View>
          </View>
        ) : null}

        {termsSections.map((section) => (
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
  };

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
          title: activeTab ? getTabTitle(activeTab) : isFitnessCoachColumnist ? "Fitness Coach Dashboard" : "Admin Dashboard",
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
            : isSpecialClubCoordinator
            ? "Special club coordinator access is enabled for special-club events, other-source run approvals, WhatsApp links, magazine tools, and admin terms."
            : isEventOrganizer
            ? "Organizer-scoped access is enabled for your assigned events, organizer-side enrollment decisions, and admin terms acceptance. Organizer-created events stay pending until Country or Global Admin approval."
            : isMagazineEditor
            ? "Magazine editor access is enabled for creating news articles, reviewing submissions, managing magazine entries, team visibility, and admin terms."
            : isFitnessCoachColumnist
            ? "Fitness Coach access is enabled for submitting fitness-column articles, reviewing your article history, previewing past submissions, and accepting admin terms."
            : isMagazineColumnist
            ? "Magazine columnist access is enabled for submitting approved-column articles and accepting admin terms."
            : isChatRoomAdministrator
            ? "Chat room administrator access is enabled for screening chat abuse reports and accepting admin terms."
            : needsClubProfileSetup
            ? "Club Coordinator access is approved. Create your club profile first so RunNation can connect your tools, members, payments, WhatsApp group, reports, and magazine access to the right club."
            : "Club-scoped access is enabled for treadmill, events, enrollments, club requests, uploads, external activity, and magazine tools."}
        </Text>
      </View>
      {groupedMenuSections.length > 0 ? (
        groupedMenuSections.map((section) => (
          <View
            key={section.key}
            style={[
              styles.menuSection,
              section.key === "approvals"
                ? styles.menuSectionGlobal
                : section.key === "reporting"
                ? styles.menuSectionCountry
                : styles.menuSectionClub,
            ]}
          >
            <View style={styles.menuSectionHeader}>
              <View
                style={[
                  styles.menuSectionAccent,
                  section.key === "approvals"
                    ? styles.menuSectionAccentGlobal
                    : section.key === "reporting"
                    ? styles.menuSectionAccentCountry
                    : styles.menuSectionAccentClub,
                ]}
              />
              <View
                style={[
                  styles.menuSectionIconWrap,
                  section.key === "approvals"
                    ? styles.menuSectionIconWrapGlobal
                    : section.key === "reporting"
                    ? styles.menuSectionIconWrapCountry
                    : styles.menuSectionIconWrapClub,
                ]}
              >
                {section.key === "approvals" ? (
                  <ClipboardCheck size={12} color="#334155" />
                ) : section.key === "reporting" ? (
                  <FileText size={12} color="#9a3412" />
                ) : section.key === "administration" ? (
                  <Users size={12} color="#047857" />
                ) : (
                  <Package size={12} color="#047857" />
                )}
              </View>
              <Text
                style={[
                  styles.menuSectionTitle,
                  section.key === "approvals"
                    ? styles.menuSectionTitleGlobal
                    : section.key === "reporting"
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
        renderRoleAccessContent()
      ) : activeTab === "clubAdmin" ? (
        renderClubAdminContent()
      ) : activeTab === "resign" ? (
        renderResignContent()
      ) : activeTab === "reports" ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled
        >
          {isSuperAdmin || isCountryCoordinator ? (
            <View style={styles.auditFilterCard}>
              <View style={styles.auditFilterHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditFilterTitle}>New User Registrations</Text>
                  <Text style={styles.auditFilterSubtitle}>
                    Daily onboarding totals by country. Country Coordinators only see registrations from their assigned country.
                  </Text>
                </View>
                <View style={styles.healthSeverityBadge}>
                  <Text style={styles.healthSeverityText}>
                    {registrationGrowthReport?.totalRegistrations ?? 0} total
                  </Text>
                </View>
              </View>

              <View style={styles.auditDateRow}>
                <View style={styles.auditDateInputWrap}>
                  <Text style={styles.label}>Start Date</Text>
                  <TextInput
                    style={styles.input}
                    value={registrationReportStartDate}
                    onChangeText={setRegistrationReportStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <View style={styles.auditDateInputWrap}>
                  <Text style={styles.label}>End Date</Text>
                  <TextInput
                    style={styles.input}
                    value={registrationReportEndDate}
                    onChangeText={setRegistrationReportEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.retryButton, registrationGrowthReportLoading && styles.disabledButton]}
                onPress={() => refetchRegistrationGrowthReport()}
                disabled={registrationGrowthReportLoading}
              >
                <Text style={styles.retryButtonText}>
                  {registrationGrowthReportLoading ? "Loading..." : "Apply Dates"}
                </Text>
              </TouchableOpacity>

              {registrationGrowthReportError ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.errorText}>Could not load registration totals</Text>
                  <Text style={styles.errorSubtext}>
                    {registrationGrowthReportError.message || "Try refreshing the report."}
                  </Text>
                </View>
              ) : registrationGrowthReportLoading ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Loading registrations...</Text>
                </View>
              ) : !(registrationGrowthReport?.rows ?? []).length ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No new registrations</Text>
                  <Text style={styles.emptySubtext}>Try a different date range.</Text>
                </View>
              ) : (
                <View>
                  <Text style={styles.mobileTableSwipeHint}>Swipe table left or right to see all columns</Text>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    directionalLockEnabled
                    showsHorizontalScrollIndicator
                    persistentScrollbar
                    style={styles.adminDataTableScroll}
                    contentContainerStyle={styles.adminDataTableScrollContent}
                  >
                    <View style={[styles.adminDataTable, styles.registrationGrowthTable]}>
                      <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                        <View style={[styles.adminDataCell, { width: 140 }]}>
                          <Text style={styles.adminDataHeaderText}>Date</Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 260 }]}>
                          <Text style={styles.adminDataHeaderText}>Country</Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 130 }]}>
                          <Text style={styles.adminDataHeaderText}>New Users</Text>
                        </View>
                      </View>
                      {(registrationGrowthReport?.rows ?? []).map((row) => (
                        <View key={`${row.date}-${row.countryCode}`} style={styles.adminDataRow}>
                          <View style={[styles.adminDataCell, { width: 140 }]}>
                            <Text style={styles.adminDataCellText}>{formatDate(row.date)}</Text>
                          </View>
                          <View style={[styles.adminDataCell, { width: 260 }]}>
                            <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>
                              {getCountryFlag(row.countryCode)} {row.countryName}
                            </Text>
                          </View>
                          <View style={[styles.adminDataCell, { width: 130 }]}>
                            <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]}>{row.count}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>
          ) : null}

          {isSuperAdmin || isCountryCoordinator || isClubCoordinator || isSpecialClubCoordinator ? (
            <View style={styles.auditFilterCard}>
              <View style={styles.auditFilterHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditFilterTitle}>Club Activity Download</Text>
                  <Text style={styles.auditFilterSubtitle}>
                    Export each recorded activity for a selected club and date range. Club Coordinators only see their own club.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.downloadButton,
                    (!selectedActivityReportClubId || clubActivityReportLoading || isExportingClubActivity) &&
                      styles.disabledButton,
                  ]}
                  onPress={handleExportClubActivityReport}
                  disabled={!selectedActivityReportClubId || clubActivityReportLoading || isExportingClubActivity}
                >
                  <Download size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>
                    {isExportingClubActivity ? "Preparing..." : "Download CSV"}
                  </Text>
                </TouchableOpacity>
              </View>

              {(clubStatusReport?.clubs ?? []).length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventFilterScroll}>
                  {(clubStatusReport?.clubs ?? []).map((club) => (
                    <TouchableOpacity
                      key={club.clubId}
                      style={[
                        styles.eventFilterChip,
                        selectedActivityReportClubId === club.clubId && styles.eventFilterChipActive,
                      ]}
                      onPress={() => setSelectedActivityReportClubId(club.clubId)}
                    >
                      <Text
                        style={[
                          styles.eventFilterChipText,
                          selectedActivityReportClubId === club.clubId && styles.eventFilterChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {club.clubName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : clubStatusReportLoading ? (
                <Text style={styles.auditFilterSubtitle}>Loading clubs...</Text>
              ) : (
                <Text style={styles.auditFilterSubtitle}>No clubs are available in your admin scope.</Text>
              )}

              <View style={styles.auditDateRow}>
                <View style={styles.auditDateInputWrap}>
                  <Text style={styles.label}>Start Date</Text>
                  <TextInput
                    style={styles.input}
                    value={clubActivityStartDate}
                    onChangeText={setClubActivityStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <View style={styles.auditDateInputWrap}>
                  <Text style={styles.label}>End Date</Text>
                  <TextInput
                    style={styles.input}
                    value={clubActivityEndDate}
                    onChangeText={setClubActivityEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.retryButton, clubActivityReportLoading && styles.disabledButton]}
                onPress={() => refetchClubActivityReport()}
                disabled={!selectedActivityReportClubId || clubActivityReportLoading}
              >
                <Text style={styles.retryButtonText}>
                  {clubActivityReportLoading ? "Loading..." : "Apply Dates"}
                </Text>
              </TouchableOpacity>

              {clubActivityReportError ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.errorText}>Could not load club activity</Text>
                  <Text style={styles.errorSubtext}>
                    {clubActivityReportError.message || "Check the club and date range, then try again."}
                  </Text>
                </View>
              ) : selectedActivityReportClubId && !clubActivityReportLoading ? (
                <Text style={styles.auditFilterSubtitle}>
                  {(clubActivityReport?.rows ?? []).length} activities ready to download
                </Text>
              ) : null}
            </View>
          ) : null}

          {(isClubCoordinator || isSpecialClubCoordinator || isSuperAdmin || isCountryAdmin || isCountryCoordinator) ? (
            <View style={styles.auditFilterCard}>
              <View style={styles.auditFilterHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditFilterTitle}>Club Status</Text>
                  <Text style={styles.auditFilterSubtitle}>
                    Member status for club meetings and external reporting. Subscription is blank where the club has no active fee.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.downloadButton, (clubStatusReportLoading || isExportingClubStatus) && styles.disabledButton]}
                  onPress={handleExportClubStatusReport}
                  disabled={clubStatusReportLoading || isExportingClubStatus}
                >
                  <Download size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>{isExportingClubStatus ? "Preparing..." : "Download"}</Text>
                </TouchableOpacity>
              </View>

              {clubStatusReportError ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.errorText}>Could not load club status</Text>
                  <Text style={styles.errorSubtext}>{clubStatusReportError.message || "Try refreshing the report."}</Text>
                  <TouchableOpacity style={styles.retryButton} onPress={() => refetchClubStatusReport()}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : clubStatusReportLoading ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Loading club status...</Text>
                </View>
              ) : (
                <>
                  <View style={styles.auditFilterHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.auditFilterTitle}>Inactive Club Flags</Text>
                      <Text style={styles.auditFilterSubtitle}>
                        Clubs are flagged after 30 days with no enrolment, 90 days with fewer than 6 members, or 180 days with fewer than 10 members.
                      </Text>
                    </View>
                    <View style={styles.healthSeverityBadge}>
                      <Text style={styles.healthSeverityText}>{inactiveClubSummaries.length} flagged</Text>
                    </View>
                  </View>
                  {inactiveClubSummaries.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>No inactive clubs flagged</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                      <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                        <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                          <View style={[styles.adminDataCell, { width: 180 }]}><Text style={styles.adminDataHeaderText}>Club</Text></View>
                          <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataHeaderText}>Country</Text></View>
                          <View style={[styles.adminDataCell, { width: 90 }]}><Text style={styles.adminDataHeaderText}>Age</Text></View>
                          <View style={[styles.adminDataCell, { width: 90 }]}><Text style={styles.adminDataHeaderText}>Members</Text></View>
                          <View style={[styles.adminDataCell, { width: 320 }]}><Text style={styles.adminDataHeaderText}>Flag</Text></View>
                          <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataHeaderText}>Action</Text></View>
                        </View>
                        {inactiveClubSummaries.map((club) => (
                          <View key={club.clubId} style={styles.adminDataRow}>
                            <View style={[styles.adminDataCell, { width: 180 }]}><Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{club.clubName}</Text></View>
                            <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataCellText}>{formatCountryName(club.country) || club.country || "-"}</Text></View>
                            <View style={[styles.adminDataCell, { width: 90 }]}><Text style={styles.adminDataCellText}>{club.ageDays}d</Text></View>
                            <View style={[styles.adminDataCell, { width: 90 }]}><Text style={styles.adminDataCellText}>{club.memberCount}</Text></View>
                            <View style={[styles.adminDataCell, { width: 320 }]}><Text style={styles.adminDataCellText}>{club.inactiveReason}</Text></View>
                            <View style={[styles.adminDataCell, { width: 120 }]}>
                              {(isSuperAdmin || isCountryAdmin || isCountryCoordinator) ? (
                                <TouchableOpacity
                                  style={[styles.adminDataActionButton, styles.adminDataActionReject, requestClubDeletionMutation.isPending && styles.disabledButton]}
                                  onPress={() => handleDeleteInactiveClub(club)}
                                  disabled={requestClubDeletionMutation.isPending}
                                >
                                  <Text style={styles.adminDataActionText}>Delete</Text>
                                </TouchableOpacity>
                              ) : (
                                <Text style={styles.adminDataCellMuted}>No action</Text>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  )}

                  {!(clubStatusReport?.rows ?? []).length ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>No club members found</Text>
                      <Text style={styles.emptySubtext}>Approved club members will appear here.</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                      <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                        <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                          <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataHeaderText}>Club</Text></View>
                          <View style={[styles.adminDataCell, { width: 150 }]}><Text style={styles.adminDataHeaderText}>Name</Text></View>
                          <View style={[styles.adminDataCell, { width: 60 }]}><Text style={styles.adminDataHeaderText}>Sex</Text></View>
                          <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataHeaderText}>Town</Text></View>
                          <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataHeaderText}>Sign up</Text></View>
                          <View style={[styles.adminDataCell, { width: 110 }]}><Text style={styles.adminDataHeaderText}>Subscription</Text></View>
                          <View style={[styles.adminDataCell, { width: 115 }]}><Text style={styles.adminDataHeaderText}>RunNation tier</Text></View>
                          <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataHeaderText}>Runs 30d</Text></View>
                          <View style={[styles.adminDataCell, { width: 240 }]}><Text style={styles.adminDataHeaderText}>Declaration</Text></View>
                          <View style={[styles.adminDataCell, { width: 95 }]}><Text style={styles.adminDataHeaderText}>Service role</Text></View>
                          <View style={[styles.adminDataCell, { width: 115 }]}><Text style={styles.adminDataHeaderText}>Other club</Text></View>
                        </View>
                        {((clubStatusReport?.rows ?? []) as any[]).map((row) => (
                          <View key={`${row.clubId}-${row.registrationId}`} style={styles.adminDataRow}>
                            <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataCellText} numberOfLines={2}>{row.clubName}</Text></View>
                            <View style={[styles.adminDataCell, { width: 150 }]}><Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{row.name}</Text></View>
                            <View style={[styles.adminDataCell, { width: 60 }]}><Text style={styles.adminDataCellText}>{row.sex || "-"}</Text></View>
                            <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataCellText} numberOfLines={2}>{row.town || "-"}</Text></View>
                            <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataCellText}>{row.signUpDate ? formatDate(row.signUpDate) : "-"}</Text></View>
                            <View style={[styles.adminDataCell, { width: 110 }]}>
                              {row.subscription ? (
                                <TouchableOpacity
                                  style={[styles.adminDataActionButton, row.subscription === "Y" ? styles.adminDataActionApprove : styles.adminDataActionNeutral]}
                                  onPress={() => {
                                    setActiveTab("payments");
                                  }}
                                >
                                  <Text style={styles.adminDataActionText}>{row.subscription}</Text>
                                </TouchableOpacity>
                              ) : (
                                <Text style={styles.adminDataCellText}>-</Text>
                              )}
                            </View>
                            <View style={[styles.adminDataCell, { width: 115 }]}><Text style={styles.adminDataCellText}>{row.runNationTier || "-"}</Text></View>
                            <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataCellText}>{row.runsLast30Days}</Text></View>
                            <View style={[styles.adminDataCell, { width: 240 }]}><Text style={styles.adminDataCellText} numberOfLines={3}>{row.declaration || "-"}</Text></View>
                            <View style={[styles.adminDataCell, { width: 95 }]}><Text style={styles.adminDataCellText}>{row.hasServiceRole}</Text></View>
                            <View style={[styles.adminDataCell, { width: 115 }]}><Text style={styles.adminDataCellText}>{row.otherClubMembership}</Text></View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </>
              )}
            </View>
          ) : null}

          {isEventOrganizer || isClubCoordinator || isSpecialClubCoordinator || isSuperAdmin || isCountryAdmin || isCountryCoordinator ? (
            <View style={styles.auditFilterCard}>
              <View style={styles.auditFilterHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditFilterTitle}>Event Results</Text>
                  <Text style={styles.auditFilterSubtitle}>
                    Select a completed event and download participant results as CSV.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.downloadButton, (!selectedReportEventId || eventResultsReportLoading || isExportingEventResults) && styles.disabledButton]}
                  onPress={handleExportEventResultsReport}
                  disabled={!selectedReportEventId || eventResultsReportLoading || isExportingEventResults}
                >
                  <Download size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>{isExportingEventResults ? "Preparing..." : "Download"}</Text>
                </TouchableOpacity>
              </View>

              {completedReportEvents.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No completed events yet</Text>
                  <Text style={styles.emptySubtext}>Completed events in your scope will appear here.</Text>
                </View>
              ) : (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventFilterScroll}>
                    {completedReportEvents.map((event: any) => {
                      const eventId = event.event_id || event.eventId;
                      return (
                        <TouchableOpacity
                          key={eventId}
                          style={[styles.eventFilterChip, selectedReportEventId === eventId && styles.eventFilterChipActive]}
                          onPress={() => setSelectedReportEventId(eventId)}
                        >
                          <Text style={[styles.eventFilterChipText, selectedReportEventId === eventId && styles.eventFilterChipTextActive]} numberOfLines={1}>
                            {event.event_name || event.eventName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {eventResultsReportError ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.errorText}>Could not load event results</Text>
                      <Text style={styles.errorSubtext}>{eventResultsReportError.message || "Try refreshing the report."}</Text>
                      <TouchableOpacity style={styles.retryButton} onPress={() => refetchEventResultsReport()}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                      </TouchableOpacity>
                    </View>
                  ) : eventResultsReportLoading ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Loading event results...</Text>
                    </View>
                  ) : !(eventResultsReport?.rows ?? []).length ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>No results for selected event</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                      <View style={styles.adminDataTable}>
                        <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                          <View style={[styles.adminDataCell, { width: 55 }]}><Text style={styles.adminDataHeaderText}>Rank</Text></View>
                          <View style={[styles.adminDataCell, { width: 160 }]}><Text style={styles.adminDataHeaderText}>Name</Text></View>
                          <View style={[styles.adminDataCell, { width: 55 }]}><Text style={styles.adminDataHeaderText}>Sex</Text></View>
                          <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataHeaderText}>Town</Text></View>
                          <View style={[styles.adminDataCell, { width: 95 }]}><Text style={styles.adminDataHeaderText}>Distance</Text></View>
                          <View style={[styles.adminDataCell, { width: 95 }]}><Text style={styles.adminDataHeaderText}>Time</Text></View>
                          <View style={[styles.adminDataCell, { width: 95 }]}><Text style={styles.adminDataHeaderText}>Pace</Text></View>
                        </View>
                        {((eventResultsReport?.rows ?? []) as any[]).map((row) => (
                          <View key={row.participantId} style={styles.adminDataRow}>
                            <View style={[styles.adminDataCell, { width: 55 }]}><Text style={styles.adminDataCellText}>{row.rank}</Text></View>
                            <View style={[styles.adminDataCell, { width: 160 }]}><Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{row.name}</Text></View>
                            <View style={[styles.adminDataCell, { width: 55 }]}><Text style={styles.adminDataCellText}>{row.sex || "-"}</Text></View>
                            <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataCellText} numberOfLines={2}>{row.town || "-"}</Text></View>
                            <View style={[styles.adminDataCell, { width: 95 }]}><Text style={styles.adminDataCellText}>{Number(row.distanceKm || 0).toFixed(2)}</Text></View>
                            <View style={[styles.adminDataCell, { width: 95 }]}><Text style={styles.adminDataCellText}>{row.time || "-"}</Text></View>
                            <View style={[styles.adminDataCell, { width: 95 }]}><Text style={styles.adminDataCellText}>{row.pace || "-"}</Text></View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </>
              )}
            </View>
          ) : null}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={styles.adminDataTable}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  {[
                    ["Open issues", accountLinkHealthSummary.issueCount],
                    ["Critical", accountLinkHealthSummary.criticalCount],
                    ["Warnings", accountLinkHealthSummary.warningCount],
                    ["Auth users", accountLinkHealthSummary.authUserCount],
                    ["Schema", accountLinkHealthSummary.schemaIssueCount ?? 0],
                  ].map(([label, value]) => (
                    <View key={String(label)} style={[styles.adminDataCell, { width: 130 }]}>
                      <Text style={styles.adminDataHeaderText}>{label}</Text>
                      <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]}>{value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
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
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                  <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                    <View style={[styles.adminDataCell, { width: 260 }]}><Text style={styles.adminDataHeaderText}>Warning Group</Text></View>
                    <View style={[styles.adminDataCell, { width: 90 }]}><Text style={styles.adminDataHeaderText}>Severity</Text></View>
                    <View style={[styles.adminDataCell, { width: 80 }]}><Text style={styles.adminDataHeaderText}>Count</Text></View>
                    <View style={[styles.adminDataCell, { width: 430 }]}><Text style={styles.adminDataHeaderText}>Recommendation</Text></View>
                  </View>
                  {accountHealthGroups.map((group) => (
                    <View key={group.code} style={styles.adminDataRow}>
                      <View style={[styles.adminDataCell, { width: 260 }]}><Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={3}>{group.message}</Text><Text style={styles.adminDataCellMuted}>{group.code}</Text></View>
                      <View style={[styles.adminDataCell, { width: 90 }]}><Text style={[styles.adminDataCellText, group.severity === "critical" ? styles.adminDataCellDanger : styles.adminDataCellWarning]}>{group.severity}</Text></View>
                      <View style={[styles.adminDataCell, { width: 80 }]}><Text style={[styles.adminDataCellText, styles.adminDataCellStrong]}>{group.count}</Text></View>
                      <View style={[styles.adminDataCell, { width: 430 }]}><Text style={styles.adminDataCellText} numberOfLines={3}>{group.recommendation}</Text></View>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                  <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                    <View style={[styles.adminDataCell, { width: 180 }]}><Text style={styles.adminDataHeaderText}>Account</Text></View>
                    <View style={[styles.adminDataCell, { width: 170 }]}><Text style={styles.adminDataHeaderText}>Auth Email</Text></View>
                    <View style={[styles.adminDataCell, { width: 170 }]}><Text style={styles.adminDataHeaderText}>Contact Email</Text></View>
                    <View style={[styles.adminDataCell, { width: 160 }]}><Text style={styles.adminDataHeaderText}>Registration</Text></View>
                    <View style={[styles.adminDataCell, { width: 280 }]}><Text style={styles.adminDataHeaderText}>Issues</Text></View>
                    <View style={[styles.adminDataCell, { width: 150 }]}><Text style={styles.adminDataHeaderText}>Actions</Text></View>
                  </View>
                  {accountLinkHealthIssues.map((entry) => {
                    const repairActions = getRepairActions(entry);
                    return (
                      <View key={entry.key} style={styles.adminDataRow}>
                        <View style={[styles.adminDataCell, { width: 180 }]}><Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{entry.displayName || entry.authEmail || entry.registrationId || "Unknown account"}</Text><Text style={styles.adminDataCellMuted} numberOfLines={1}>{entry.provider ? `${entry.provider} sign-in` : entry.username ? `@${entry.username}` : "Linked account"}</Text></View>
                        <View style={[styles.adminDataCell, { width: 170 }]}><Text style={styles.adminDataCellText} numberOfLines={2}>{entry.authEmail || "No auth email"}</Text></View>
                        <View style={[styles.adminDataCell, { width: 170 }]}><Text style={styles.adminDataCellText} numberOfLines={2}>{entry.contactEmail || "No contact email"}</Text></View>
                        <View style={[styles.adminDataCell, { width: 160 }]}><Text style={styles.adminDataCellMuted} numberOfLines={2}>{entry.registrationId || "Missing"}</Text><Text style={styles.adminDataCellMuted} numberOfLines={1}>{entry.profileId || "No profile"}</Text></View>
                        <View style={[styles.adminDataCell, { width: 280 }]}><Text style={[styles.adminDataCellText, entry.severity === "critical" ? styles.adminDataCellDanger : styles.adminDataCellWarning]}>{entry.severity === "critical" ? "CRITICAL" : "WARNING"}</Text><Text style={styles.adminDataCellText} numberOfLines={4}>{entry.issues.map((issue) => issue.message).join(" / ")}</Text></View>
                        <View style={[styles.adminDataCell, styles.adminDataActions, { width: 150 }]}>
                          {repairActions.length > 0 ? repairActions.map((action) => (
                            <TouchableOpacity key={`${entry.key}-${action.key}`} style={[styles.adminDataActionButton, styles.adminDataActionApprove, repairAccountLinkMutation.isPending && styles.disabledButton]} onPress={() => handleRepairAccountLink(entry, action.key)} disabled={repairAccountLinkMutation.isPending}>
                              <Text style={styles.adminDataActionText}>{action.label}</Text>
                            </TouchableOpacity>
                          )) : <Text style={styles.adminDataCellMuted}>Manual review</Text>}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          )}
        </ScrollView>
      ) : activeTab === "milestones" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.auditFilterCard}>
            <View style={styles.auditFilterHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditFilterTitle}>Milestones</Text>
                <Text style={styles.auditFilterSubtitle}>
                  Global Admin can track dates worth celebrating as RunNation grows.
                </Text>
              </View>
              <View style={styles.paymentActionGroup}>
                <TouchableOpacity style={styles.downloadButton} onPress={() => refetchMilestones()}>
                  <Activity size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>Refresh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.downloadButton, isExportingMilestones && styles.disabledButton]}
                  onPress={handleExportMilestones}
                  disabled={isExportingMilestones}
                >
                  <Download size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>{isExportingMilestones ? "Exporting..." : "Export CSV"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.milestoneCompletionCard}>
            <View style={styles.milestoneCompletionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.milestoneCompletionLabel}>Overall Completion</Text>
                <Text style={styles.milestoneCompletionMeta}>
                  {milestoneCompletion.completed} of {milestoneCompletion.total} milestones achieved
                </Text>
              </View>
              <Text style={styles.milestoneCompletionPercent}>{milestoneCompletion.percentage}%</Text>
            </View>
            <View style={styles.milestoneProgressTrack}>
              <View style={[styles.milestoneProgressFill, { width: `${milestoneCompletion.percentage}%` }]} />
            </View>
          </View>

          {milestonesLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading milestones...</Text>
            </View>
          ) : milestonesError ? (
            <View style={styles.emptyContainer}>
              <AlertTriangle size={56} color="#f59e0b" />
              <Text style={styles.errorText}>Could not load milestones</Text>
              <Text style={styles.errorSubtext}>{milestonesError.message || "Try refreshing milestones."}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Calculated Milestones</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                  <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                    <View style={[styles.adminDataCell, { width: 180 }]}><Text style={styles.adminDataHeaderText}>Category</Text></View>
                    <View style={[styles.adminDataCell, { width: 320 }]}><Text style={styles.adminDataHeaderText}>Milestone</Text></View>
                    <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataHeaderText}>Target</Text></View>
                    <View style={[styles.adminDataCell, { width: 140 }]}><Text style={styles.adminDataHeaderText}>Reached Date</Text></View>
                  </View>
                  {((milestonesData?.calculated ?? []) as AdminMilestoneRow[]).map((row) => (
                    <View key={row.key} style={styles.adminDataRow}>
                      <View style={[styles.adminDataCell, { width: 180 }]}><Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{row.category}</Text></View>
                      <View style={[styles.adminDataCell, { width: 320 }]}><Text style={styles.adminDataCellText} numberOfLines={2}>{row.milestone}</Text></View>
                      <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataCellText}>{row.threshold?.toLocaleString() ?? "-"}</Text></View>
                      <View style={[styles.adminDataCell, { width: 140 }]}>
                        <Text style={[styles.adminDataCellText, isMilestoneReached(row.milestoneDate) ? styles.adminDataCellSuccess : styles.adminDataCellMuted]}>
                          {getMilestoneDateLabel(row.milestoneDate)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.sectionTitle}>Manual Milestones</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                  <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                    <View style={[styles.adminDataCell, { width: 160 }]}><Text style={styles.adminDataHeaderText}>Category</Text></View>
                    <View style={[styles.adminDataCell, { width: 360 }]}><Text style={styles.adminDataHeaderText}>Milestone</Text></View>
                    <View style={[styles.adminDataCell, { width: 180 }]}><Text style={styles.adminDataHeaderText}>Date</Text></View>
                    <View style={[styles.adminDataCell, { width: 110 }]}><Text style={styles.adminDataHeaderText}>Action</Text></View>
                  </View>
                  {((milestonesData?.manual ?? []) as AdminMilestoneRow[]).map((row) => (
                    <View key={row.key} style={styles.adminDataRow}>
                      <View style={[styles.adminDataCell, { width: 160 }]}><Text style={[styles.adminDataCellText, styles.adminDataCellStrong]}>{row.category}</Text></View>
                      <View style={[styles.adminDataCell, { width: 360 }]}><Text style={styles.adminDataCellText} numberOfLines={3}>{row.milestone}</Text></View>
                      <View style={[styles.adminDataCell, { width: 180 }]}>
                        <TextInput
                          style={styles.adminTableInput}
                          value={milestoneDateInputs[row.key] ?? ""}
                          onChangeText={(value) => setMilestoneDateInputs((prev) => ({ ...prev, [row.key]: value }))}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#9ca3af"
                        />
                      </View>
                      <View style={[styles.adminDataCell, styles.adminDataActions, { width: 110 }]}>
                        <TouchableOpacity
                          style={[styles.adminDataActionButton, styles.adminDataActionApprove, upsertMilestoneMutation.isPending && styles.disabledButton]}
                          onPress={() => handleSaveMilestone(row)}
                          disabled={upsertMilestoneMutation.isPending}
                        >
                          <Text style={styles.adminDataActionText}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </>
          )}
        </ScrollView>
      ) : activeTab === "auditLog" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.auditFilterCard}>
            <View style={styles.auditFilterHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditFilterTitle}>Admin Activity</Text>
              <Text style={styles.auditFilterSubtitle}>Country Coordinator and Club Coordinator actions</Text>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.auditTable}>
                <View style={[styles.auditTableRow, styles.auditTableHeader]}>
                  <Text style={[styles.auditTableHeaderText, styles.auditColDate]}>Date</Text>
                  <Text style={[styles.auditTableHeaderText, styles.auditColAdmin]}>Admin</Text>
                  <Text style={[styles.auditTableHeaderText, styles.auditColType]}>Type</Text>
                  <Text style={[styles.auditTableHeaderText, styles.auditColAction]}>Action</Text>
                  <Text style={[styles.auditTableHeaderText, styles.auditColDetails]}>Details</Text>
                </View>
                {(auditLogs as AuditLogEntry[]).map((entry) => (
                  <View key={entry.id} style={styles.auditTableRow}>
                    <View style={styles.auditColDate}>
                      <Text style={styles.auditTableCellText} numberOfLines={2}>{formatDate(entry.createdAt)}</Text>
                    </View>
                    <View style={styles.auditColAdmin}>
                      <Text style={[styles.auditTableCellText, styles.auditTableCellStrong]} numberOfLines={2}>{entry.actorName}</Text>
                      {entry.actorUsername ? (
                        <Text style={styles.auditTableCellMuted} numberOfLines={1}>@{entry.actorUsername}</Text>
                      ) : null}
                    </View>
                    <View style={styles.auditColType}>
                      <Text style={styles.auditTypeCellText} numberOfLines={2}>{entry.actorType}</Text>
                    </View>
                    <View style={styles.auditColAction}>
                      <Text style={styles.auditTableCellText} numberOfLines={2}>{formatAuditAction(entry.actionType)}</Text>
                    </View>
                    <View style={styles.auditColDetails}>
                      <Text style={styles.auditTableCellMuted} numberOfLines={3}>{getAuditMetadataSummary(entry.metadata)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </ScrollView>
      ) : activeTab === "whatsapp" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {clubWhatsappLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading WhatsApp links...</Text>
            </View>
          ) : clubWhatsappError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading WhatsApp links</Text>
              <Text style={styles.errorSubtext}>{clubWhatsappError.message || "Could not load club WhatsApp links."}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetchClubWhatsappLinks()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.auditFilterCard}>
                <Text style={styles.auditFilterTitle}>WhatsApp Groups</Text>
                <View style={styles.eventFilterChips}>
                  {whatsappSections.map((section) => (
                    <TouchableOpacity
                      key={section.key}
                      style={[styles.eventFilterChip, whatsappSection === section.key && styles.eventFilterChipActive]}
                      onPress={() => setWhatsappSection(section.key)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.eventFilterChipText, whatsappSection === section.key && styles.eventFilterChipTextActive]}>
                        {section.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {whatsappSection === "club" ? (
                clubWhatsappClubs.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <MessageCircle size={64} color="#d1d5db" />
                    <Text style={styles.emptyText}>No club WhatsApp applies</Text>
                    <Text style={styles.emptySubtext}>Club links appear for clubs you coordinate or administer.</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.auditFilterCard}>
                      <Text style={styles.auditFilterTitle}>Club</Text>
                      <View style={styles.eventFilterChips}>
                        {clubWhatsappClubs.map((club) => (
                          <TouchableOpacity
                            key={club.clubId}
                            style={[styles.eventFilterChip, activeWhatsappClubId === club.clubId && styles.eventFilterChipActive]}
                            onPress={() => {
                              setSelectedWhatsappClubId(club.clubId);
                              const nextLink = clubWhatsappLinks.find((link) => link.clubId === club.clubId);
                              setWhatsappLinkInput(nextLink?.link ?? "");
                            }}
                            activeOpacity={0.75}
                          >
                            <Text style={[styles.eventFilterChipText, activeWhatsappClubId === club.clubId && styles.eventFilterChipTextActive]}>
                              {club.clubName}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.paymentPanel}>
                      <View style={styles.paymentPanelHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.paymentPanelTitle}>Club WhatsApp Group</Text>
                          <Text style={styles.paymentPanelHint}>
                            {activeWhatsappClub?.clubName || "Club"} members will see this as a Join WhatsApp Group button in Profile.
                          </Text>
                        </View>
                      </View>
                      <TextInput
                        style={styles.paymentInput}
                        placeholder="Paste WhatsApp group invite link"
                        value={whatsappLinkInput}
                        onChangeText={setWhatsappLinkInput}
                        autoCapitalize="none"
                        placeholderTextColor="#9ca3af"
                      />
                      {activeWhatsappLink ? (
                        <Text style={styles.paymentStatusMeta}>Current link: {activeWhatsappLink.link}</Text>
                      ) : (
                        <Text style={styles.paymentStatusMeta}>No WhatsApp group link is saved for this club yet.</Text>
                      )}
                      <View style={styles.activityActions}>
                        {activeWhatsappLink ? (
                          <>
                            <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleOpenWhatsappLink(activeWhatsappLink.link)}>
                              <Text style={styles.secondaryButtonText}>Open</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.secondaryButton} onPress={() => handleCopyWhatsappLink(activeWhatsappLink.link)}>
                              <Text style={styles.secondaryButtonText}>Copy</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.rejectButton}
                              disabled={deleteClubWhatsappLinkMutation.isPending}
                              onPress={handleDeleteWhatsappLink}
                            >
                              <Trash2 size={18} color="#fff" />
                              <Text style={styles.actionButtonText}>
                                {deleteClubWhatsappLinkMutation.isPending ? "Deleting..." : "Delete Link"}
                              </Text>
                            </TouchableOpacity>
                          </>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.approveButton, upsertClubWhatsappLinkMutation.isPending && styles.disabledButton]}
                          disabled={upsertClubWhatsappLinkMutation.isPending}
                          onPress={handleSaveWhatsappLink}
                        >
                          <Save size={18} color="#fff" />
                          <Text style={styles.actionButtonText}>
                            {upsertClubWhatsappLinkMutation.isPending ? "Saving..." : "Save Link"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                )
              ) : null}

              {whatsappSection === "service_team" ? (
                <View style={styles.paymentPanel}>
                  <View style={styles.paymentPanelHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentPanelTitle}>Service Team WhatsApp Group</Text>
                      <Text style={styles.paymentPanelHint}>
                        Managed by Global Admin. Other admins can open or copy the link only.
                      </Text>
                    </View>
                  </View>
                  {isSuperAdmin ? (
                    <TextInput
                      style={styles.paymentInput}
                      placeholder="Paste Service Team WhatsApp group invite link"
                      value={serviceTeamWhatsappInput}
                      onChangeText={setServiceTeamWhatsappInput}
                      autoCapitalize="none"
                      placeholderTextColor="#9ca3af"
                    />
                  ) : null}
                  {serviceTeamWhatsappLink ? (
                    <Text style={styles.paymentStatusMeta}>Current link: {serviceTeamWhatsappLink.link}</Text>
                  ) : (
                    <Text style={styles.paymentStatusMeta}>No Service Team WhatsApp link is saved yet.</Text>
                  )}
                  <View style={styles.activityActions}>
                    {serviceTeamWhatsappLink ? (
                      <>
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleOpenWhatsappLink(serviceTeamWhatsappLink.link)}>
                          <Text style={styles.secondaryButtonText}>Open</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => handleCopyWhatsappLink(serviceTeamWhatsappLink.link)}>
                          <Text style={styles.secondaryButtonText}>Copy</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                    {isSuperAdmin ? (
                      <>
                        {serviceTeamWhatsappLink ? (
                          <TouchableOpacity
                            style={styles.rejectButton}
                            disabled={deleteAdminWhatsappLinkMutation.isPending}
                            onPress={() => handleDeleteAdminWhatsappLink("service_team")}
                          >
                            <Trash2 size={18} color="#fff" />
                            <Text style={styles.actionButtonText}>Delete Link</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.approveButton, upsertAdminWhatsappLinkMutation.isPending && styles.disabledButton]}
                          disabled={upsertAdminWhatsappLinkMutation.isPending}
                          onPress={() => handleSaveAdminWhatsappLink("service_team")}
                        >
                          <Save size={18} color="#fff" />
                          <Text style={styles.actionButtonText}>Save Link</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {whatsappSection === "admins" ? (
                <View style={styles.paymentPanel}>
                  <View style={styles.paymentPanelHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentPanelTitle}>Admins WhatsApp Group</Text>
                      <Text style={styles.paymentPanelHint}>
                        For Global Admin and Country Coordinator coordination. Managed by Global Admin.
                      </Text>
                    </View>
                  </View>
                  {isSuperAdmin ? (
                    <TextInput
                      style={styles.paymentInput}
                      placeholder="Paste Admins WhatsApp group invite link"
                      value={adminWhatsappInput}
                      onChangeText={setAdminWhatsappInput}
                      autoCapitalize="none"
                      placeholderTextColor="#9ca3af"
                    />
                  ) : null}
                  {adminWhatsappLink ? (
                    <Text style={styles.paymentStatusMeta}>Current link: {adminWhatsappLink.link}</Text>
                  ) : (
                    <Text style={styles.paymentStatusMeta}>No Admin WhatsApp link is saved yet.</Text>
                  )}
                  <View style={styles.activityActions}>
                    {adminWhatsappLink ? (
                      <>
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleOpenWhatsappLink(adminWhatsappLink.link)}>
                          <Text style={styles.secondaryButtonText}>Open</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => handleCopyWhatsappLink(adminWhatsappLink.link)}>
                          <Text style={styles.secondaryButtonText}>Copy</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                    {isSuperAdmin ? (
                      <>
                        {adminWhatsappLink ? (
                          <TouchableOpacity
                            style={styles.rejectButton}
                            disabled={deleteAdminWhatsappLinkMutation.isPending}
                            onPress={() => handleDeleteAdminWhatsappLink("admins")}
                          >
                            <Trash2 size={18} color="#fff" />
                            <Text style={styles.actionButtonText}>Delete Link</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.approveButton, upsertAdminWhatsappLinkMutation.isPending && styles.disabledButton]}
                          disabled={upsertAdminWhatsappLinkMutation.isPending}
                          onPress={() => handleSaveAdminWhatsappLink("admins")}
                        >
                          <Save size={18} color="#fff" />
                          <Text style={styles.actionButtonText}>Save Link</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      ) : activeTab === "payments" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {clubPaymentsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading club payments...</Text>
            </View>
          ) : clubPaymentsError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading payments</Text>
              <Text style={styles.errorSubtext}>{clubPaymentsError.message || "Could not load club collections."}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetchClubPayments()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : clubPaymentClubs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <CreditCard size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No clubs available</Text>
              <Text style={styles.emptySubtext}>Club payment collections appear when your admin role is linked to a club or country.</Text>
            </View>
          ) : (
            <>
              <View style={styles.paymentSummaryGrid}>
                <View style={styles.paymentSummaryCard}>
                  <Text style={styles.paymentSummaryLabel}>Collected</Text>
                  <Text style={styles.paymentSummaryNumber}>{formatMoney(Number(clubPaymentSummary.collected || 0))}</Text>
                </View>
                <View style={styles.paymentSummaryCard}>
                  <Text style={styles.paymentSummaryLabel}>Requested</Text>
                  <Text style={styles.paymentSummaryNumber}>{formatMoney(Number(clubPaymentSummary.requested || 0))}</Text>
                </View>
                <View style={styles.paymentSummaryCard}>
                  <Text style={styles.paymentSummaryLabel}>Available</Text>
                  <Text style={styles.paymentSummaryNumber}>{formatMoney(Number(clubPaymentSummary.available || 0))}</Text>
                </View>
              </View>

              <View style={styles.auditFilterCard}>
                <Text style={styles.auditFilterTitle}>Club</Text>
                <View style={styles.eventFilterChips}>
                  {clubPaymentClubs.map((club) => (
                    <TouchableOpacity
                      key={club.clubId}
                      style={[styles.eventFilterChip, activePaymentClubId === club.clubId && styles.eventFilterChipActive]}
                      onPress={() => setSelectedPaymentClubId(club.clubId)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.eventFilterChipText, activePaymentClubId === club.clubId && styles.eventFilterChipTextActive]}>
                        {club.clubName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.paymentPanel}>
                <View style={styles.paymentPanelHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paymentPanelTitle}>Create Other Payment</Text>
                    <Text style={styles.paymentPanelHint}>For club membership fees or coordinator-created club collections.</Text>
                  </View>
                </View>
                <View style={styles.paymentFormGrid}>
                  <TextInput
                    style={styles.paymentInput}
                    placeholder="Payment name"
                    value={newPaymentTitle}
                    onChangeText={setNewPaymentTitle}
                    placeholderTextColor="#9ca3af"
                  />
                  <TextInput
                    style={styles.paymentInput}
                    placeholder="Amount"
                    value={newPaymentAmount}
                    onChangeText={setNewPaymentAmount}
                    keyboardType="numeric"
                    placeholderTextColor="#9ca3af"
                  />
                  <TextInput
                    style={styles.paymentInput}
                    placeholder="Currency"
                    value={newPaymentCurrency}
                    onChangeText={setNewPaymentCurrency}
                    autoCapitalize="characters"
                    placeholderTextColor="#9ca3af"
                  />
                  <TextInput
                    style={styles.paymentInput}
                    placeholder="Due date YYYY-MM-DD"
                    value={newPaymentDueDate}
                    onChangeText={setNewPaymentDueDate}
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <TextInput
                  style={[styles.paymentInput, styles.paymentTextArea]}
                  placeholder="Description or payment instructions"
                  value={newPaymentDescription}
                  onChangeText={setNewPaymentDescription}
                  multiline
                  placeholderTextColor="#9ca3af"
                />
                <TouchableOpacity
                  style={[styles.approveButton, createClubPaymentMutation.isPending && styles.disabledButton]}
                  onPress={handleCreateClubPayment}
                  disabled={createClubPaymentMutation.isPending}
                >
                  <Plus size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>{createClubPaymentMutation.isPending ? "Saving..." : "Create Payment"}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.paymentPanel}>
                <View style={styles.paymentPanelHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paymentPanelTitle}>Club Collections Account</Text>
                    <Text style={styles.paymentPanelHint}>Request RunNation to transfer available collections to the club account.</Text>
                  </View>
                </View>
                <View style={styles.paymentFormGrid}>
                  <TextInput
                    style={styles.paymentInput}
                    placeholder="Amount"
                    value={payoutAmount}
                    onChangeText={setPayoutAmount}
                    keyboardType="numeric"
                    placeholderTextColor="#9ca3af"
                  />
                  <View style={styles.paymentSegment}>
                    {(["mobile_money", "bank"] as const).map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[styles.paymentSegmentButton, payoutDestinationType === type && styles.paymentSegmentButtonActive]}
                        onPress={() => setPayoutDestinationType(type)}
                      >
                        <Text style={[styles.paymentSegmentText, payoutDestinationType === type && styles.paymentSegmentTextActive]}>
                          {type === "mobile_money" ? "Mobile Money" : "Bank"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TextInput
                  style={[styles.paymentInput, styles.paymentTextArea]}
                  placeholder="Destination details"
                  value={payoutDestinationDetails}
                  onChangeText={setPayoutDestinationDetails}
                  multiline
                  placeholderTextColor="#9ca3af"
                />
                <TouchableOpacity
                  style={[styles.approveButton, requestClubPayoutMutation.isPending && styles.disabledButton]}
                  onPress={handleRequestClubPayout}
                  disabled={requestClubPayoutMutation.isPending}
                >
                  <CreditCard size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>{requestClubPayoutMutation.isPending ? "Requesting..." : "Request Transfer"}</Text>
                </TouchableOpacity>
              </View>

              {visiblePayoutRequests.length > 0 ? (
                <View style={styles.paymentPanel}>
                  <Text style={styles.paymentPanelTitle}>Transfer Requests</Text>
                  {visiblePayoutRequests.map((request) => (
                    <View key={request.requestId} style={styles.paymentStatusRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paymentStatusName}>{formatMoney(request.amount, request.currency)}</Text>
                        <Text style={styles.paymentStatusMeta}>{request.destinationType === "bank" ? "Bank" : "Mobile money"} - {request.destinationDetails}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: request.status === "paid" ? "#10b98120" : request.status === "rejected" ? "#ef444420" : "#f59e0b20" }]}>
                        <Text style={[styles.statusText, { color: request.status === "paid" ? "#10b981" : request.status === "rejected" ? "#ef4444" : "#f59e0b" }]}>
                          {request.status}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {visibleClubPaymentItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <CreditCard size={56} color="#d1d5db" />
                  <Text style={styles.emptyText}>No payment items yet</Text>
                  <Text style={styles.emptySubtext}>Create a membership fee or other club collection above.</Text>
                </View>
              ) : (
                visibleClubPaymentItems.map((payment) => (
                  <View key={payment.paymentId} style={styles.paymentPanel}>
                    <View style={styles.paymentPanelHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paymentPanelTitle}>{payment.title}</Text>
                        <Text style={styles.paymentPanelHint}>
                          {payment.clubName} - {formatMoney(payment.amount, payment.currency)}
                          {payment.dueDate ? ` - Due ${payment.dueDate}` : ""}
                        </Text>
                      </View>
                      <View style={styles.totalEntriesBadge}>
                        <Text style={styles.totalEntriesText}>{payment.totals.paid}/{payment.totals.members}</Text>
                        <Text style={styles.totalEntriesLabel}>paid</Text>
                      </View>
                    </View>
                    {payment.description ? <Text style={styles.paymentDescription}>{payment.description}</Text> : null}
                    <View style={styles.paymentStatsRow}>
                      <Text style={styles.paymentStat}>Paid {payment.totals.paid}</Text>
                      <Text style={styles.paymentStat}>Pending {payment.totals.pending}</Text>
                      <Text style={styles.paymentStat}>Unpaid {payment.totals.unpaid}</Text>
                      <Text style={styles.paymentStat}>Waived {payment.totals.waived}</Text>
                    </View>
                    {payment.members.length === 0 ? (
                      <Text style={styles.emptySubtext}>No members are linked to this club yet.</Text>
                    ) : (
                      payment.members.map((member) => (
                        <View key={`${payment.paymentId}-${member.registrationId}`} style={styles.paymentStatusRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.paymentStatusName}>{member.name}</Text>
                            <Text style={styles.paymentStatusMeta}>
                              {member.username ? `@${member.username} - ` : ""}{member.sex || "Sex not set"} - {formatMoney(member.amountPaid || 0, payment.currency)}
                            </Text>
                          </View>
                          <View style={styles.paymentActionGroup}>
                            <TouchableOpacity
                              style={[styles.paymentMiniButton, member.status === "paid" && styles.paymentMiniButtonActive]}
                              disabled={updateClubPaymentRecordMutation.isPending}
                              onPress={() => updateClubPaymentRecordMutation.mutate({
                                paymentId: payment.paymentId,
                                registrationId: member.registrationId,
                                status: "paid",
                                amountPaid: payment.amount,
                              })}
                            >
                              <Text style={[styles.paymentMiniButtonText, member.status === "paid" && styles.paymentMiniButtonTextActive]}>Paid</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.paymentMiniButton, member.status === "unpaid" && styles.paymentMiniButtonMuted]}
                              disabled={updateClubPaymentRecordMutation.isPending}
                              onPress={() => updateClubPaymentRecordMutation.mutate({
                                paymentId: payment.paymentId,
                                registrationId: member.registrationId,
                                status: "unpaid",
                                amountPaid: 0,
                              })}
                            >
                              <Text style={styles.paymentMiniButtonText}>Unpaid</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      ) : activeTab === "clubRequests" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {isClubCoordinator && roleSession.clubCoordinatorScopes.length > 0 ? (
            <View style={styles.auditFilterCard}>
              <View style={{ gap: 6 }}>
                <Text style={styles.paymentPanelTitle}>Pre-approved Club Member List</Text>
                <Text style={styles.emptySubtext}>
                  Import a CSV with name, nickname, phone, and email columns, or maintain the list manually. Matching new accounts can join immediately after confirming their club.
                </Text>
              </View>
              {roleSession.clubCoordinatorScopes.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {roleSession.clubCoordinatorScopes.map((clubId, index) => (
                    <TouchableOpacity
                      key={clubId}
                      style={[styles.eventFilterChip, directoryClubId === clubId && styles.eventFilterChipActive]}
                      onPress={() => setDirectoryClubId(clubId)}
                    >
                      <Text style={[styles.eventFilterChipText, directoryClubId === clubId && styles.eventFilterChipTextActive]}>
                        Club {index + 1}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
              <TouchableOpacity
                style={[styles.approveButton, upsertClubMemberDirectoryMutation.isPending && styles.disabledButton]}
                onPress={() => void handleClubDirectoryCsvImport()}
                disabled={upsertClubMemberDirectoryMutation.isPending}
              >
                <Upload size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Import Member CSV</Text>
              </TouchableOpacity>
              <View style={styles.formRow}>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.inputLabel}>Name *</Text>
                  <TextInput style={styles.input} value={directoryName} onChangeText={setDirectoryName} placeholder="Member name" />
                </View>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.inputLabel}>Nickname</Text>
                  <TextInput style={styles.input} value={directoryNickname} onChangeText={setDirectoryNickname} placeholder="Optional" />
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.inputLabel}>Phone</Text>
                  <TextInput style={styles.input} value={directoryPhone} onChangeText={setDirectoryPhone} placeholder="+256..." keyboardType="phone-pad" />
                </View>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput style={styles.input} value={directoryEmail} onChangeText={setDirectoryEmail} placeholder="member@email.com" keyboardType="email-address" autoCapitalize="none" />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.approveButton, (!directoryName.trim() || (!directoryPhone.trim() && !directoryEmail.trim())) && styles.disabledButton]}
                disabled={!directoryName.trim() || (!directoryPhone.trim() && !directoryEmail.trim()) || upsertClubMemberDirectoryMutation.isPending}
                onPress={() => upsertClubMemberDirectoryMutation.mutate({
                  clubId: directoryClubId,
                  members: [{
                    memberId: directoryMemberId,
                    name: directoryName,
                    nickname: directoryNickname || null,
                    phone: directoryPhone || null,
                    email: directoryEmail || null,
                  }],
                })}
              >
                <Save size={18} color="#fff" />
                <Text style={styles.actionButtonText}>{directoryMemberId ? "Update Member" : "Add Member"}</Text>
              </TouchableOpacity>
              {clubMemberDirectoryLoading ? (
                <Text style={styles.emptySubtext}>Loading member list...</Text>
              ) : clubMemberDirectory.length === 0 ? (
                <Text style={styles.emptySubtext}>No pre-approved members have been added.</Text>
              ) : (
                clubMemberDirectory.map((member) => (
                  <View key={member.member_id} style={styles.paymentStatusRow}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        setDirectoryMemberId(member.member_id);
                        setDirectoryName(member.name);
                        setDirectoryNickname(member.nickname || "");
                        setDirectoryPhone(member.phone || "");
                        setDirectoryEmail(member.email || "");
                      }}
                    >
                      <Text style={styles.paymentStatusName}>{member.name}{member.nickname ? ` (${member.nickname})` : ""}</Text>
                      <Text style={styles.paymentStatusMeta}>{member.phone || "No phone"} - {member.email || "No email"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.adminDataActionButton, styles.adminDataActionReject]}
                      onPress={() => deleteClubMemberDirectoryMutation.mutate({ clubId: directoryClubId, memberId: member.member_id })}
                    >
                      <Trash2 size={14} color="#fff" />
                      <Text style={styles.adminDataActionText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          ) : null}
          <View style={styles.auditFilterCard}>
            <View style={styles.auditSegment}>
              {[
                { key: "pending" as const, label: "Pending" },
                { key: "approved" as const, label: "Approved" },
                { key: "rejected" as const, label: "Rejected" },
              ].map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.auditSegmentButton,
                    clubRequestStatusFilter === option.key && styles.auditSegmentButtonActive,
                  ]}
                  onPress={() => setClubRequestStatusFilter(option.key)}
                >
                  <Text
                    style={[
                      styles.auditSegmentText,
                      clubRequestStatusFilter === option.key && styles.auditSegmentTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventFilterScroll}>
              <TouchableOpacity
                style={[styles.eventFilterChip, clubRequestCountryFilter === "all" && styles.eventFilterChipActive]}
                onPress={() => setClubRequestCountryFilter("all")}
              >
                <Text style={[styles.eventFilterChipText, clubRequestCountryFilter === "all" && styles.eventFilterChipTextActive]}>
                  All Countries
                </Text>
              </TouchableOpacity>
              {clubRequestCountries.map(([code, name]) => (
                <TouchableOpacity
                  key={code}
                  style={[styles.eventFilterChip, clubRequestCountryFilter === code && styles.eventFilterChipActive]}
                  onPress={() => setClubRequestCountryFilter(code)}
                >
                  <Text style={[styles.eventFilterChipText, clubRequestCountryFilter === code && styles.eventFilterChipTextActive]}>
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
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
          ) : visibleClubMembershipRequests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Users size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No matching club or organiser requests</Text>
              <Text style={styles.emptySubtext}>
                Change the status tab or country filter to review another group.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 190 }]}>
                    <Text style={styles.adminDataHeaderText}>User</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 190 }]}>
                    <Text style={styles.adminDataHeaderText}>Club/Organizer</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 150 }]}>
                    <Text style={styles.adminDataHeaderText}>Request</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 160 }]}>
                    <Text style={styles.adminDataHeaderText}>Location</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 110 }]}>
                    <Text style={styles.adminDataHeaderText}>Date</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 100 }]}>
                    <Text style={styles.adminDataHeaderText}>Status</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 140 }]}>
                    <Text style={styles.adminDataHeaderText}>Actions</Text>
                  </View>
                </View>
                {visibleClubMembershipRequests.map((request) => {
                  const memberName = [
                    request.member?.first_name,
                    request.member?.other_names,
                  ].filter(Boolean).join(" ") || request.member?.username || "Unknown member";
                  const requestStatus = request.status ?? "pending";
                  const requestLabel = request.request_type === "start_club"
                    ? "Start club"
                    : request.request_type === "event_organizer"
                      ? "Event organiser"
                      : request.new_member === "Yes"
                        ? "New member"
                        : "Existing claim";
                  const locationLabel = request.request_type === "start_club" || request.request_type === "event_organizer"
                    ? formatCountryName(request.proposed_country) || request.proposed_country || "Not provided"
                    : [request.member?.city_town_district, formatCountryName(request.member?.country)].filter(Boolean).join(", ") || "Not provided";

                  return (
                    <View key={`${request.registration_id}-${request.request_type ?? "membership"}-${request.club_id ?? request.created_at ?? "request"}`} style={styles.adminDataRow}>
                      <View style={[styles.adminDataCell, { width: 190 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{memberName}</Text>
                        {request.member?.username ? (
                          <Text style={styles.adminDataCellMuted} numberOfLines={1}>@{request.member.username}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.adminDataCell, { width: 190 }]}>
                        <Text style={styles.adminDataCellText} numberOfLines={2}>
                          {request.proposed_club_name || request.club_name || request.club || "Not provided"}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 150 }]}>
                        <Text style={styles.adminDataCellText}>{requestLabel}</Text>
                        {request.proposed_description ? (
                          <Text style={styles.adminDataCellMuted} numberOfLines={2}>{request.proposed_description}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.adminDataCell, { width: 160 }]}>
                        <Text style={styles.adminDataCellText} numberOfLines={2}>{locationLabel}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 110 }]}>
                        <Text style={styles.adminDataCellText}>
                          {request.created_at
                            ? new Date(request.created_at).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "Not recorded"}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 100 }]}>
                        <Text
                          style={[
                            styles.adminDataCellText,
                            requestStatus === "approved"
                              ? styles.adminDataCellSuccess
                              : requestStatus === "rejected"
                                ? styles.adminDataCellDanger
                                : styles.adminDataCellWarning,
                          ]}
                        >
                          {requestStatus === "approved" ? "Approved" : requestStatus === "rejected" ? "Rejected" : "Pending"}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, styles.adminDataActions, { width: 140 }]}>
                        {requestStatus === "pending" ? (
                          <>
                            <TouchableOpacity
                              style={[styles.adminDataActionButton, styles.adminDataActionApprove]}
                              disabled={updateClubMembershipRequestMutation.isPending}
                              onPress={() =>
                                updateClubMembershipRequestMutation.mutate({
                                  registrationId: request.registration_id,
                                  clubId: request.club_id,
                                  requestType: (request.request_type ?? "membership") as "membership" | "start_club" | "event_organizer",
                                  createdAt: request.created_at,
                                  status: "approved",
                                })
                              }
                            >
                              <CheckCircle size={13} color="#fff" />
                              <Text style={styles.adminDataActionText}>Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.adminDataActionButton, styles.adminDataActionReject]}
                              disabled={updateClubMembershipRequestMutation.isPending}
                              onPress={() =>
                                updateClubMembershipRequestMutation.mutate({
                                  registrationId: request.registration_id,
                                  clubId: request.club_id,
                                  requestType: (request.request_type ?? "membership") as "membership" | "start_club" | "event_organizer",
                                  createdAt: request.created_at,
                                  status: "rejected",
                                })
                              }
                            >
                              <XCircle size={13} color="#fff" />
                              <Text style={styles.adminDataActionText}>Reject</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <Text style={styles.adminDataCellMuted}>Reviewed</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 90 }]}>
                    <Text style={styles.adminDataHeaderText}>Order</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 160 }]}>
                    <Text style={styles.adminDataHeaderText}>Name</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Phone</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 190 }]}>
                    <Text style={styles.adminDataHeaderText}>Address</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 130 }]}>
                    <Text style={styles.adminDataHeaderText}>Delivery Time</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 190 }]}>
                    <Text style={styles.adminDataHeaderText}>Items</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 110 }]}>
                    <Text style={styles.adminDataHeaderText}>Total</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 110 }]}>
                    <Text style={styles.adminDataHeaderText}>Date</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Status</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 150 }]}>
                    <Text style={styles.adminDataHeaderText}>Actions</Text>
                  </View>
                </View>
                {deliveryOrders.map((order: any) => {
                  const items = order.items || [];
                  const itemSummary = items.map((item: any) => `${item.name}${item.size ? ` (${item.size})` : ""} x${item.qty}`).join(", ");
                  return (
                    <View key={order.order_id} style={styles.adminDataRow}>
                      <View style={[styles.adminDataCell, { width: 90 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]}>#{(order.order_id || "").substring(0, 8)}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 160 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>
                          {order.customer_name || order.delivery_name || "Unknown customer"}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 120 }]}>
                        <Text style={styles.adminDataCellText}>{order.phone_number || "-"}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 190 }]}>
                        <Text style={styles.adminDataCellText} numberOfLines={3}>{order.delivery_address || "-"}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 130 }]}>
                        <Text style={styles.adminDataCellText} numberOfLines={2}>{order.delivery_time_slots || "No time slot"}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 190 }]}>
                        <Text style={styles.adminDataCellText} numberOfLines={3}>{itemSummary || "No items"}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 110 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellSuccess]}>
                          ugx.{(order.total_amount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 110 }]}>
                        <Text style={styles.adminDataCellText}>
                          {new Date(order.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 120 }]}>
                        <TouchableOpacity
                          style={[styles.adminDataActionButton, styles.adminDataActionNeutral]}
                          onPress={() => handleUpdateOrderStatus(order.order_id, order.status)}
                        >
                          <Text style={styles.adminDataActionText}>{getStatusLabel(order.status)}</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={[styles.adminDataCell, styles.adminDataActions, { width: 150 }]}>
                        <TouchableOpacity
                          style={[styles.adminDataActionButton, styles.adminDataActionPrimary]}
                          onPress={() => handlePrintSticker(order)}
                          activeOpacity={0.8}
                        >
                          <Printer size={13} color="#fff" />
                          <Text style={styles.adminDataActionText}>Print</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.adminDataActionButton, styles.adminDataActionNeutral]}
                          onPress={() => handleShareSticker(order)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.adminDataActionText}>Share</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={styles.adminDataTable}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 260 }]}>
                    <Text style={styles.adminDataHeaderText}>Item</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Size</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Stock</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Actions</Text>
                  </View>
                </View>
                {stockProducts.map((product: any) => {
                  const quantity = product.quantity || 0;
                  return (
                    <View key={product.catalogue_id} style={styles.adminDataRow}>
                      <View style={[styles.adminDataCell, { width: 260 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>
                          {product.catalogue_item}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 120 }]}>
                        <Text style={styles.adminDataCellText}>{product.size || "-"}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 120 }]}>
                        <Text
                          style={[
                            styles.adminDataCellText,
                            quantity === 0
                              ? styles.adminDataCellDanger
                              : quantity <= 5
                                ? styles.adminDataCellWarning
                                : styles.adminDataCellSuccess,
                          ]}
                        >
                          {quantity} units
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 120 }]}>
                        <TouchableOpacity
                          style={[styles.adminDataActionButton, styles.adminDataActionPrimary]}
                          onPress={() => handleUpdateStock(product)}
                        >
                          <Edit size={13} color="#fff" />
                          <Text style={styles.adminDataActionText}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </ScrollView>
      ) : activeTab === "events" ? (
        <View style={{ flex: 1 }}>
          <View style={styles.addEventContainer}>
            <TouchableOpacity style={styles.addEventButton} onPress={handleOpenAddEvent}>
              <Plus size={20} color="#fff" />
              <Text style={styles.addEventButtonText}>Create Event</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.eventsSubTabBar}>
            {(["pending", "approved", "closed"] as const).map((status) => (
              <TouchableOpacity
                key={status}
                style={[styles.eventsSubTab, eventApprovalTab === status && styles.eventsSubTabActive]}
                onPress={() => setEventApprovalTab(status)}
              >
                <Text style={[styles.eventsSubTabText, eventApprovalTab === status && styles.eventsSubTabTextActive]}>
                  {status === "pending" ? "Pending" : status === "approved" ? "Approved" : "Closed"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {!usesScopedEventWorkspace ? (
              <View style={styles.auditFilterCard}>
                <View style={styles.auditFilterHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.auditFilterTitle}>Events Table</Text>
                    <Text style={styles.auditFilterSubtitle}>
                      Use Preview to review details and take action.
                    </Text>
                  </View>
                </View>
                <View style={styles.auditDateRow}>
                  <TouchableOpacity
                    style={[styles.eventFilterChip, styles.auditDateInputWrap]}
                    onPress={() => setShowEventOrganizerFilterModal(true)}
                  >
                    <Text style={styles.eventFilterChipText} numberOfLines={1}>
                      Organizer: {selectedOrganizerFilterLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {eventsError ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.errorText}>Error loading events</Text>
                <Text style={styles.errorSubtext}>{eventsError.message || "Could not load events."}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => refetchEvents()}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : eventsLoading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Loading events...</Text>
              </View>
            ) : displayedAdminEvents.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Calendar size={64} color="#d1d5db" />
                <Text style={styles.emptyText}>No {eventApprovalTab} events</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                  <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                    <View style={[styles.adminDataCell, { width: 240 }]}><Text style={styles.adminDataHeaderText}>Event</Text></View>
                    <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataHeaderText}>Date</Text></View>
                    <View style={[styles.adminDataCell, { width: 150 }]}><Text style={styles.adminDataHeaderText}>Organizer</Text></View>
                    <View style={[styles.adminDataCell, { width: 110 }]}><Text style={styles.adminDataHeaderText}>Type</Text></View>
                    <View style={[styles.adminDataCell, { width: 110 }]}><Text style={styles.adminDataHeaderText}>Medal</Text></View>
                    <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataHeaderText}>Status</Text></View>
                    <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataHeaderText}>Magazine</Text></View>
                    <View style={[styles.adminDataCell, { width: 105 }]}><Text style={styles.adminDataHeaderText}>Preview</Text></View>
                  </View>
                  {displayedAdminEvents.map((event: any) => {
                    const approvalStatus = event.approval_status || "approved";
                    const magazineStatus = event.magazine_submission_status || "missing";
                    return (
                      <View key={event.event_id || event.eventId} style={styles.adminDataRow}>
                        <View style={[styles.adminDataCell, { width: 240 }]}>
                          <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{event.event_name || event.eventName}</Text>
                          <Text style={styles.adminDataCellMuted} numberOfLines={1}>{formatCountryName(event.country) || event.country || "No country"}</Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataCellText}>{formatDate(event.starts_at || event.startsAt)}</Text></View>
                        <View style={[styles.adminDataCell, { width: 150 }]}><Text style={styles.adminDataCellText} numberOfLines={2}>{getEventOrganizerLabel(event)}</Text></View>
                        <View style={[styles.adminDataCell, { width: 110 }]}><Text style={styles.adminDataCellText}>{event.event_type || event.eventType || "same_day"}</Text></View>
                        <View style={[styles.adminDataCell, { width: 110 }]}><Text style={styles.adminDataCellText}>{event.has_medal ?? event.hasMedal ? "Yes" : "No"}</Text></View>
                        <View style={[styles.adminDataCell, { width: 120 }]}><Text style={[styles.adminDataCellText, approvalStatus === "approved" ? styles.adminDataCellSuccess : approvalStatus === "rejected" ? styles.adminDataCellDanger : styles.adminDataCellWarning]}>{getEventApprovalLabel(approvalStatus)}</Text></View>
                        <View style={[styles.adminDataCell, { width: 120 }]}><Text style={[styles.adminDataCellText, magazineStatus === "accepted" ? styles.adminDataCellSuccess : styles.adminDataCellWarning]}>{magazineStatus === "missing" ? "Missing" : getStatusLabel(magazineStatus)}</Text></View>
                        <View style={[styles.adminDataCell, styles.adminDataActions, { width: 105 }]}>
                          <TouchableOpacity style={[styles.adminDataActionButton, styles.adminDataActionNeutral]} onPress={() => setSelectedEventPreview(event)}>
                            <Text style={styles.adminDataActionText}>Preview</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </ScrollView>
        </View>
      ) : activeTab === "enrollments" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {enrollmentsError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading participant approvals</Text>
              <Text style={styles.errorSubtext}>
                {enrollmentsError.message || "Could not load participant approvals."}
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
              <Text style={styles.emptyText}>Loading participant approvals...</Text>
            </View>
          ) : !enrollments || enrollments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Calendar size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No participant approvals yet</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 210 }]}>
                    <Text style={styles.adminDataHeaderText}>Event</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 180 }]}>
                    <Text style={styles.adminDataHeaderText}>User</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 210 }]}>
                    <Text style={styles.adminDataHeaderText}>Email</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Date</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 130 }]}>
                    <Text style={styles.adminDataHeaderText}>Status</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 130 }]}>
                    <Text style={styles.adminDataHeaderText}>Actions</Text>
                  </View>
                </View>
                {enrollments.map((enrollment: any) => {
                  const event = events?.find((e: any) => (e.event_id || e.eventId) === enrollment.event_id);
                  return (
                    <View key={enrollment.event_enrollment_id} style={styles.adminDataRow}>
                      <View style={[styles.adminDataCell, { width: 210 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>
                          {event?.event_name || event?.eventName || enrollment.event_id}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 180 }]}>
                        <Text style={styles.adminDataCellText} numberOfLines={2}>
                          {enrollment.first_name} {enrollment.other_names}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 210 }]}>
                        <Text style={styles.adminDataCellMuted} numberOfLines={2}>{enrollment.email}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 120 }]}>
                        <Text style={styles.adminDataCellText}>{formatDate(enrollment.enrolled_at)}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 130 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellWarning]}>
                          {getEnrollmentStatusLabel(enrollment.status)}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, styles.adminDataActions, { width: 130 }]}>
                        {enrollment.status === "awaiting_payment" ? (
                          <TouchableOpacity
                            style={[styles.adminDataActionButton, styles.adminDataActionApprove]}
                            onPress={() =>
                              markEnrollmentPaidMutation.mutate({
                                enrollmentId: enrollment.event_enrollment_id,
                              })
                            }
                            disabled={markEnrollmentPaidMutation.isPending}
                          >
                            <Text style={styles.adminDataActionText}>
                              {markEnrollmentPaidMutation.isPending ? "Saving" : "Mark Paid"}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.adminDataActionButton, styles.adminDataActionApprove]}
                            onPress={() =>
                              approveEnrollmentMutation.mutate({
                                enrollmentId: enrollment.event_enrollment_id,
                              })
                            }
                            disabled={approveEnrollmentMutation.isPending}
                          >
                            <Text style={styles.adminDataActionText}>
                              {approveEnrollmentMutation.isPending ? "Saving" : "Approve"}
                            </Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.adminDataActionButton, styles.adminDataActionReject]}
                          onPress={() =>
                            rejectEnrollmentMutation.mutate({
                              enrollmentId: enrollment.event_enrollment_id,
                            })
                          }
                          disabled={rejectEnrollmentMutation.isPending}
                        >
                          <Text style={styles.adminDataActionText}>
                            {rejectEnrollmentMutation.isPending ? "Saving" : "Reject"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={styles.adminDataTable}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 210 }]}>
                    <Text style={styles.adminDataHeaderText}>File</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 170 }]}>
                    <Text style={styles.adminDataHeaderText}>User</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 210 }]}>
                    <Text style={styles.adminDataHeaderText}>Email</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 150 }]}>
                    <Text style={styles.adminDataHeaderText}>Uploaded</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 130 }]}>
                    <Text style={styles.adminDataHeaderText}>Actions</Text>
                  </View>
                </View>
                {activityUploads.map((upload: any) => (
                  <View key={upload.id} style={styles.adminDataRow}>
                    <View style={[styles.adminDataCell, { width: 210 }]}>
                      <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{upload.fileName}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 170 }]}>
                      <Text style={styles.adminDataCellText} numberOfLines={2}>{upload.userName}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 210 }]}>
                      <Text style={styles.adminDataCellMuted} numberOfLines={2}>{upload.email}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 150 }]}>
                      <Text style={styles.adminDataCellText}>
                        {new Date(upload.uploadedAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 130 }]}>
                      <TouchableOpacity
                        style={[styles.adminDataActionButton, styles.adminDataActionPrimary]}
                        onPress={() => handleFileDownload(upload)}
                      >
                        <Download size={13} color="#fff" />
                        <Text style={styles.adminDataActionText}>Download</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
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

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                <View style={styles.adminDataTable}>
                  <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                    <View style={[styles.adminDataCell, { width: 160 }]}>
                      <Text style={styles.adminDataHeaderText}>User</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 90 }]}>
                      <Text style={styles.adminDataHeaderText}>Rating</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 120 }]}>
                      <Text style={styles.adminDataHeaderText}>Date</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 360 }]}>
                      <Text style={styles.adminDataHeaderText}>Feedback</Text>
                    </View>
                  </View>
                  {appRatings.map((rating) => (
                    <View key={rating.rating_id} style={styles.adminDataRow}>
                      <View style={[styles.adminDataCell, { width: 160 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{rating.registration_id}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 90 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellWarning]}>{rating.rating}/5</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 120 }]}>
                        <Text style={styles.adminDataCellText}>{formatDate(rating.created_at)}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 360 }]}>
                        <Text style={styles.adminDataCellText} numberOfLines={3}>{rating.feedback || "-"}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={styles.adminDataTable}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Date</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 150 }]}>
                    <Text style={styles.adminDataHeaderText}>Country</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 190 }]}>
                    <Text style={styles.adminDataHeaderText}>Name</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 460 }]}>
                    <Text style={styles.adminDataHeaderText}>Suggestion</Text>
                  </View>
                </View>
                {suggestions.map((item) => (
                  <View key={item.suggestion_id} style={styles.adminDataRow}>
                    <View style={[styles.adminDataCell, { width: 120 }]}>
                      <Text style={styles.adminDataCellText}>{formatDate(item.created_at)}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 150 }]}>
                      <Text style={styles.adminDataCellText} numberOfLines={2}>{formatCountryName(item.country) || item.country || "-"}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 190 }]}>
                      <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{item.name || item.registration_id}</Text>
                      <Text style={styles.adminDataCellMuted} numberOfLines={1}>{item.registration_id}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 460 }]}>
                      <Text style={styles.adminDataCellText} numberOfLines={4}>{item.suggestion}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </ScrollView>
      ) : activeTab === "myArticles" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.auditFilterCard}>
            <View style={styles.auditFilterHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditFilterTitle}>My Articles</Text>
                <Text style={styles.auditFilterSubtitle}>
                  Historical fitness-column article submissions linked to your account.
                </Text>
              </View>
            </View>
          </View>

          {myMagazineArticlesLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading your articles...</Text>
            </View>
          ) : sortedMyMagazineArticles.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FileText size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No articles submitted yet</Text>
              <Text style={styles.emptySubtext}>Your submitted fitness-column articles will appear here.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataHeaderText}>Submitted</Text></View>
                  <View style={[styles.adminDataCell, { width: 260 }]}><Text style={styles.adminDataHeaderText}>Title</Text></View>
                  <View style={[styles.adminDataCell, { width: 150 }]}><Text style={styles.adminDataHeaderText}>Category</Text></View>
                  <View style={[styles.adminDataCell, { width: 280 }]}><Text style={styles.adminDataHeaderText}>Preview</Text></View>
                  <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataHeaderText}>Status</Text></View>
                  <View style={[styles.adminDataCell, { width: 140 }]}><Text style={styles.adminDataHeaderText}>Action</Text></View>
                </View>
                {sortedMyMagazineArticles.map((item: any) => (
                  <View key={item.submission_id} style={styles.adminDataRow}>
                    <View style={[styles.adminDataCell, { width: 130 }]}>
                      <Text style={styles.adminDataCellText}>{formatDate(item.created_at)}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 260 }]}>
                      <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{item.title || "Untitled article"}</Text>
                      <Text style={styles.adminDataCellMuted} numberOfLines={1}>{item.article_writer_name || item.author_name || "Fitness Coach"}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 150 }]}>
                      <Text style={styles.adminDataCellText} numberOfLines={2}>{item.category || "Columns"}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 280 }]}>
                      <Text style={styles.adminDataCellText} numberOfLines={3}>{item.pitch || item.body || "No preview text available."}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 120 }]}>
                      <Text style={[styles.adminDataCellText, item.status === "accepted" ? styles.adminDataCellSuccess : item.status === "rejected" ? styles.adminDataCellDanger : styles.adminDataCellWarning]}>
                        {item.status || "submitted"}
                      </Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 140 }]}>
                      <TouchableOpacity
                        style={[styles.adminDataActionButton, styles.adminDataActionPrimary]}
                        onPress={() => setSelectedMagazinePreview({ type: "article", ...item })}
                      >
                        <Text style={styles.adminDataActionText}>Preview</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </ScrollView>
      ) : activeTab === "magazine" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {(isSuperAdmin || isMagazineEditor) ? (
            <View style={styles.roleAccessTabs}>
              {[
                { key: "create" as const, label: "Create" },
                { key: "edit" as const, label: "Edit" },
              ].map((mode) => (
                <TouchableOpacity
                  key={mode.key}
                  style={[styles.roleAccessTabButton, magazineMode === mode.key && styles.roleAccessTabButtonActive]}
                  onPress={() => setMagazineMode(mode.key)}
                >
                  <Text style={[styles.roleAccessTabText, magazineMode === mode.key && styles.roleAccessTabTextActive]}>
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {(isSuperAdmin || isMagazineEditor || isMagazineColumnist) && (isMagazineColumnist || magazineMode === "create") ? (
            <View style={styles.auditFilterCard}>
              <Text style={styles.auditFilterTitle}>{isMagazineColumnist ? "Submit Column Article" : "Create News Article"}</Text>
              <Text style={styles.auditFilterSubtitle}>
                {isSuperAdmin
                  ? "Global Admin articles publish directly to the selected Running Post page."
                  : isMagazineColumnist
                  ? "Columnist articles are submitted to the Magazine Editor and Global Admin approval workflow before publication."
                  : "Magazine Editor news articles are submitted for Global Admin approval before publication."}
              </Text>
              {isSuperAdmin ? (
                <>
                  <Text style={styles.label}>Magazine Page</Text>
                  <View style={styles.segmentRow}>
                    {MAGAZINE_CREATE_PAGES.map((page) => (
                      <TouchableOpacity
                        key={page}
                        style={[styles.segmentChip, newsPage === page && styles.segmentChipActive]}
                        onPress={() => setNewsPage(page)}
                      >
                        <Text style={[styles.segmentChipText, newsPage === page && styles.segmentChipTextActive]}>
                          {page}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={newsTitle}
                onChangeText={setNewsTitle}
                placeholder={isMagazineColumnist ? "Column article title" : "News article title"}
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.label}>Author</Text>
              <TextInput
                style={styles.input}
                value={newsAuthor}
                onChangeText={setNewsAuthor}
                placeholder="Author name"
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.label}>External Link (optional)</Text>
              <TextInput
                style={styles.input}
                value={newsExternalLink}
                onChangeText={setNewsExternalLink}
                placeholder="https://..."
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
              />
              <Text style={styles.label}>Article Photo (optional)</Text>
              <TouchableOpacity style={styles.posterPickerButton} onPress={handlePickNewsPhoto}>
                <Camera size={20} color="#2563eb" />
                <Text style={styles.posterPickerButtonText}>
                  {newsPhotoPreview ? "Change Article Photo" : "Add Article Photo"}
                </Text>
              </TouchableOpacity>
              {newsPhotoPreview ? (
                <Image source={{ uri: newsPhotoPreview }} style={styles.eventPosterPreview} />
              ) : null}
              {newsPhotoPreview ? (
                <TouchableOpacity style={styles.posterRemoveButton} onPress={handleRemoveNewsPhoto}>
                  <Trash2 size={18} color="#dc2626" />
                  <Text style={styles.posterRemoveButtonText}>Remove Article Photo</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.label}>Article Body</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={newsBody}
                onChangeText={setNewsBody}
                placeholder={isMagazineColumnist ? "Write the full column article..." : "Write the full news article..."}
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.approveButton, createMagazineNewsMutation.isPending && styles.disabledButton]}
                disabled={createMagazineNewsMutation.isPending}
                onPress={handleCreateNewsArticle}
              >
                <CheckCircle size={18} color="#fff" />
                <Text style={styles.actionButtonText}>
                  {createMagazineNewsMutation.isPending ? "Submitting..." : isMagazineColumnist ? "Submit Article" : "Publish News"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : magazineSubmissionsLoading || magazinePictorialsLoading ? (
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
              <View style={styles.roleAccessTabs}>
                {MAGAZINE_REVIEW_STATUS_TABS.map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.roleAccessTabButton, magazineReviewStatusFilter === tab.key && styles.roleAccessTabButtonActive]}
                    onPress={() => setMagazineReviewStatusFilter(tab.key)}
                  >
                    <Text style={[styles.roleAccessTabText, magazineReviewStatusFilter === tab.key && styles.roleAccessTabTextActive]}>
                      {tab.label} ({magazineReviewStatusCounts[tab.key]})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {visibleMagazineReviewRows.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <BookOpen size={48} color="#d1d5db" />
                  <Text style={styles.emptyText}>No {magazineReviewStatusFilter} magazine entries</Text>
                  <Text style={styles.emptySubtext}>Switch tabs to view the other review queues.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
                  <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                    <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                      <View style={[styles.adminDataCell, { width: 90 }]}>
                        <Text style={styles.adminDataHeaderText}>Destination</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 170 }]}>
                        <Text style={styles.adminDataHeaderText}>Submitter</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 220 }]}>
                        <Text style={styles.adminDataHeaderText}>Title/Event</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 250 }]}>
                        <Text style={styles.adminDataHeaderText}>Pitch/Caption</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 120 }]}>
                        <Text style={styles.adminDataHeaderText}>Status</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 120 }]}>
                        <Text style={styles.adminDataHeaderText}>Date</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 160 }]}>
                        <Text style={styles.adminDataHeaderText}>Preview</Text>
                      </View>
                  </View>
                    {visibleMagazineReviewRows.map((item: any) => {
                      const isPictorial = item.type === "pictorial";
                      return (
                        <View key={isPictorial ? item.pictorial_id : item.submission_id} style={styles.adminDataRow}>
                          <View style={[styles.adminDataCell, { width: 90 }]}>
                            <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]}>
                              {isPictorial ? "Gallery" : item.category || "Columns"}
                            </Text>
                          </View>
                          <View style={[styles.adminDataCell, { width: 170 }]}>
                            <Text style={styles.adminDataCellText} numberOfLines={2}>
                              {isPictorial ? item.submitter_name : item.article_writer_name || item.author_name}
                            </Text>
                            <Text style={styles.adminDataCellMuted} numberOfLines={1}>
                              {isPictorial ? formatCountryName(item.country) || item.country : item.email}
                            </Text>
                          </View>
                          <View style={[styles.adminDataCell, { width: 220 }]}>
                            <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>
                              {isPictorial ? item.event_name : item.title}
                            </Text>
                            <Text style={styles.adminDataCellMuted} numberOfLines={1}>
                              {isPictorial
                                ? [item.club, item.event_date].filter(Boolean).join(" / ")
                                : [item.category, item.event_id ? `Event: ${item.event_id}` : null].filter(Boolean).join(" / ")}
                            </Text>
                          </View>
                          <View style={[styles.adminDataCell, { width: 250 }]}>
                            <Text style={styles.adminDataCellText} numberOfLines={4}>{isPictorial ? item.caption : item.pitch}</Text>
                            {!isPictorial && item.attachment_name ? <Text style={styles.adminDataCellMuted} numberOfLines={1}>Attachment: {item.attachment_name}</Text> : null}
                          </View>
                          <View style={[styles.adminDataCell, { width: 120 }]}>
                            <Text style={[styles.adminDataCellText, item.status === "accepted" ? styles.adminDataCellSuccess : item.status === "rejected" ? styles.adminDataCellDanger : styles.adminDataCellWarning]}>
                              {item.status}{isPictorial && item.is_picture_of_week ? " / POW" : ""}
                            </Text>
                          </View>
                          <View style={[styles.adminDataCell, { width: 120 }]}>
                            <Text style={styles.adminDataCellText}>{formatDate(item.created_at)}</Text>
                          </View>
                          <View style={[styles.adminDataCell, { width: 160 }]}>
                            <TouchableOpacity
                              style={[styles.adminDataActionButton, styles.adminDataActionPrimary]}
                              onPress={() => setSelectedMagazinePreview({ ...item })}
                            >
                              <Text style={styles.adminDataActionText}>Preview</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </>
          )}
        </ScrollView>
      ) : activeTab === "myTeam" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.auditFilterCard}>
            <View style={styles.auditFilterHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditFilterTitle}>My Team</Text>
                <Text style={styles.auditFilterSubtitle}>People whose work is connected to your admin role, including their role application links where available.</Text>
              </View>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetchMyTeam()}>
                <Text style={styles.retryButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          {myTeamLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading team...</Text>
            </View>
          ) : myTeamError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Could not load team</Text>
              <Text style={styles.errorSubtext}>{myTeamError.message}</Text>
            </View>
          ) : myTeamMembers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Users size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No team members yet</Text>
              <Text style={styles.emptySubtext}>Approved roles connected to your scope will appear here.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 180 }]}><Text style={styles.adminDataHeaderText}>Person</Text></View>
                  <View style={[styles.adminDataCell, { width: 150 }]}><Text style={styles.adminDataHeaderText}>Country</Text></View>
                  <View style={[styles.adminDataCell, { width: 220 }]}><Text style={styles.adminDataHeaderText}>Role</Text></View>
                  <View style={[styles.adminDataCell, { width: 260 }]}><Text style={styles.adminDataHeaderText}>Name</Text></View>
                  <View style={[styles.adminDataCell, { width: 230 }]}><Text style={styles.adminDataHeaderText}>Links</Text></View>
                  <View style={[styles.adminDataCell, { width: 190 }]}><Text style={styles.adminDataHeaderText}>Contact</Text></View>
                </View>
                {myTeamMembers.map((member) => {
                  const links = [
                    { label: "Website", url: member.websiteUrl },
                    { label: "LinkedIn", url: member.linkedinUrl },
                    { label: "Social", url: member.socialUrl },
                  ].filter((link): link is { label: string; url: string } => Boolean(link.url));
                  const memberFlag = getCountryFlag(member.userCountryCode);
                  const memberCountryLabel = member.userCountryName || formatCountryName(member.userCountryCode) || member.userCountryCode || null;

                  return (
                    <View key={`${member.assignmentId}-${member.userId}`} style={styles.adminDataRow}>
                      <View style={[styles.adminDataCell, { width: 180 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{member.name}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 150 }]}>
                        <View style={styles.myTeamPersonRow}>
                          {memberFlag ? (
                            <Text style={styles.myTeamFlagText} accessibilityLabel={memberCountryLabel || "Country flag"}>
                              {memberFlag}
                            </Text>
                          ) : null}
                          <Text style={[styles.adminDataCellText, styles.myTeamPersonName]} numberOfLines={2}>
                            {memberCountryLabel || "Not set"}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.adminDataCell, { width: 220 }]}>
                        <Text style={styles.adminDataCellText} numberOfLines={2}>{getRoleDisplayName(member.roleName as ManageableRoleName)}</Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 260 }]}>
                        <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={3}>
                          {member.clubName || member.organizerName || "-"}
                        </Text>
                      </View>
                      <View style={[styles.adminDataCell, { width: 230 }]}>
                        {links.length ? links.map((link) => (
                          <TouchableOpacity key={link.label} style={styles.pendingRoleLinkButton} onPress={() => Linking.openURL(link.url)}>
                            <Text style={styles.pendingRoleLinkText}>{link.label}</Text>
                          </TouchableOpacity>
                        )) : <Text style={styles.adminDataCellMuted}>No links</Text>}
                      </View>
                      <View style={[styles.adminDataCell, { width: 190 }]}>
                        <Text style={styles.adminDataCellText} numberOfLines={2}>{member.contactConsent ? "Contact allowed" : "No contact consent"}</Text>
                        {member.contactInstructions ? <Text style={styles.adminDataCellMuted} numberOfLines={2}>{member.contactInstructions}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </ScrollView>
      ) : activeTab === "moderation" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.auditFilterCard}>
            <View style={styles.auditFilterHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditFilterTitle}>Chat Reports</Text>
                <Text style={styles.auditFilterSubtitle}>Review complaints without exposing backend post IDs to normal users.</Text>
              </View>
            </View>
          </View>
          {chatReportsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading chat reports...</Text>
            </View>
          ) : (chatReports as ChatModerationReport[]).length === 0 ? (
            <View style={styles.emptyContainer}>
              <ShieldAlert size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No chat reports</Text>
              <Text style={styles.emptySubtext}>Reports for abusive or unsafe chat content will appear here.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Date</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Reason</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 160 }]}>
                    <Text style={styles.adminDataHeaderText}>Reported</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 160 }]}>
                    <Text style={styles.adminDataHeaderText}>Reporter</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 260 }]}>
                    <Text style={styles.adminDataHeaderText}>Description</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 110 }]}>
                    <Text style={styles.adminDataHeaderText}>Status</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 160 }]}>
                    <Text style={styles.adminDataHeaderText}>Actions</Text>
                  </View>
                </View>
                {(chatReports as ChatModerationReport[]).map((report) => (
                  <View key={report.reportId} style={styles.adminDataRow}>
                    <View style={[styles.adminDataCell, { width: 120 }]}>
                      <Text style={styles.adminDataCellText}>{formatDate(report.createdAt)}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 120 }]}>
                      <Text style={[styles.adminDataCellText, styles.adminDataCellWarning]} numberOfLines={2}>{report.reasonCategory}</Text>
                      {report.screenshotUrl ? (
                        <TouchableOpacity onPress={() => Linking.openURL(report.screenshotUrl!)}>
                          <Text style={[styles.adminDataCellMuted, { color: "#2563eb" }]}>Open screenshot</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <View style={[styles.adminDataCell, { width: 160 }]}>
                      <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>
                        {report.reportedName || report.reportedUsername || report.reportedRegistrationId || "Unknown user"}
                      </Text>
                      <Text style={styles.adminDataCellMuted} numberOfLines={1}>
                        {[report.postId ? `Post: ${report.postId}` : null, report.commentId ? `Comment: ${report.commentId}` : null].filter(Boolean).join(" / ")}
                      </Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 160 }]}>
                      <Text style={styles.adminDataCellText} numberOfLines={2}>{report.reporterName || report.reporterRegistrationId}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 260 }]}>
                      <Text style={styles.adminDataCellText} numberOfLines={4}>{report.description}</Text>
                      {report.offenderFlags ? (
                        <Text style={styles.adminDataCellMuted} numberOfLines={2}>
                          Flags: {report.offenderFlags.confirmed_flags} confirmed / {report.offenderFlags.dismissed_reports} dismissed
                          {report.offenderFlags.is_banned ? " / BANNED" : ""}
                          {report.offenderFlags.suspension_status === "pending" ? " / SUSPENSION PENDING" : ""}
                          {report.offenderFlags.suspended_until ? ` / Until ${formatDate(report.offenderFlags.suspended_until)}` : ""}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.adminDataCell, { width: 110 }]}>
                      <Text style={[styles.adminDataCellText, report.status === "pending" ? styles.adminDataCellWarning : styles.adminDataCellSuccess]}>
                        {report.status}
                      </Text>
                    </View>
                    <View style={[styles.adminDataCell, styles.adminDataActions, { width: 160 }]}>
                      {report.status === "pending" ? (
                        <>
                          <TouchableOpacity
                            style={[styles.adminDataActionButton, styles.adminDataActionApprove]}
                            onPress={() => reviewChatReportMutation.mutate({ reportId: report.reportId, action: "remove_content", adminNotes: "Content removed after moderation review." })}
                          >
                            <Text style={styles.adminDataActionText}>Remove</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.adminDataActionButton, styles.adminDataActionReject]}
                            onPress={() => reviewChatReportMutation.mutate({ reportId: report.reportId, action: "dismiss", adminNotes: "Report dismissed after review." })}
                          >
                            <Text style={styles.adminDataActionText}>Dismiss</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.adminDataActionButton, styles.adminDataActionNeutral]}
                            onPress={() => handleRequestChatSuspension(report)}
                          >
                            <Text style={styles.adminDataActionText}>{isSuperAdmin ? "Suspend" : "Req. Suspend"}</Text>
                          </TouchableOpacity>
                        </>
                      ) : report.offenderFlags?.suspension_status === "pending" && isSuperAdmin ? (
                        <TouchableOpacity
                          style={[styles.adminDataActionButton, styles.adminDataActionNeutral]}
                          onPress={() => handleRequestChatSuspension(report)}
                        >
                          <Text style={styles.adminDataActionText}>Approve Suspension</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.adminDataCellMuted}>Reviewed</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          <View style={styles.auditFilterCard}>
            <View style={styles.auditFilterHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditFilterTitle}>Deleted Chat Log</Text>
                <Text style={styles.auditFilterSubtitle}>Posts and comments deleted by Global Admin or Chat Room Admin.</Text>
              </View>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetchDeletedChatLogs()}>
                <Text style={styles.retryButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          {deletedChatLogsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading deleted chat log...</Text>
            </View>
          ) : (deletedChatLogs as DeletedChatLog[]).length === 0 ? (
            <View style={styles.emptyContainer}>
              <Trash2 size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No deleted chat log yet</Text>
              <Text style={styles.emptySubtext}>Admin deletions will appear here.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataHeaderText}>Date</Text></View>
                  <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataHeaderText}>Type</Text></View>
                  <View style={[styles.adminDataCell, { width: 190 }]}><Text style={styles.adminDataHeaderText}>Deleted By</Text></View>
                  <View style={[styles.adminDataCell, { width: 180 }]}><Text style={styles.adminDataHeaderText}>Owner</Text></View>
                  <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataHeaderText}>Source</Text></View>
                  <View style={[styles.adminDataCell, { width: 320 }]}><Text style={styles.adminDataHeaderText}>Deleted Content</Text></View>
                </View>
                {(deletedChatLogs as DeletedChatLog[]).map((log) => (
                  <View key={String(log.logId)} style={styles.adminDataRow}>
                    <View style={[styles.adminDataCell, { width: 120 }]}><Text style={styles.adminDataCellText}>{formatDate(log.createdAt)}</Text></View>
                    <View style={[styles.adminDataCell, { width: 100 }]}><Text style={styles.adminDataCellText}>{log.contentType}</Text></View>
                    <View style={[styles.adminDataCell, { width: 190 }]}>
                      <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{log.deletedByName}</Text>
                      <Text style={styles.adminDataCellMuted} numberOfLines={1}>{log.deletedByRole}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 180 }]}>
                      <Text style={styles.adminDataCellText} numberOfLines={2}>{log.ownerName || log.ownerUsername || "Unknown user"}</Text>
                      {log.ownerUsername ? <Text style={styles.adminDataCellMuted} numberOfLines={1}>@{log.ownerUsername}</Text> : null}
                    </View>
                    <View style={[styles.adminDataCell, { width: 130 }]}><Text style={styles.adminDataCellText} numberOfLines={2}>{log.deletionSource}</Text></View>
                    <View style={[styles.adminDataCell, { width: 320 }]}>
                      <Text style={styles.adminDataCellText} numberOfLines={4}>{log.contentPreview || (log.hadPhoto ? "Photo post" : "No preview captured")}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </ScrollView>
      ) : activeTab === "archive" ? (
        <View style={{ flex: 1 }}>
          <View style={styles.archiveHeaderBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.archiveHeaderTitle}>Inactive Users</Text>
              <Text style={styles.archiveHeaderSubtitle}>
                Trial expired and not renewed after 15 days
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
                  No archived expired-trial accounts were found
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
                  const isSelected = selectedArchiveIds.includes(user.registrationId);
                  return (
                    <TouchableOpacity
                      key={user.registrationId}
                      style={[styles.archiveUserCard, isSelected && styles.archiveUserCardSelected]}
                      onPress={() => toggleArchiveSelection(user.registrationId)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.archiveCheckbox, isSelected && styles.archiveCheckboxSelected]}>
                        {isSelected && <CheckCircle size={18} color="#fff" />}
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.archiveUserName}>
                          {user.displayName || user.username || 'Unknown'}
                        </Text>
                        <Text style={styles.archiveRegId}>
                          {user.registrationId}{user.country ? ` | ${user.country}` : ""}
                        </Text>
                        <View style={styles.archiveMetaRow}>
                          <View style={styles.archiveMetaItem}>
                            <Text style={styles.archiveMetaLabel}>Trial ended</Text>
                            <Text style={styles.archiveMetaValue}>
                              {user.trialEndedAt ? formatDate(user.trialEndedAt) : "-"}
                            </Text>
                          </View>
                          <View style={styles.archiveMetaItem}>
                            <Text style={styles.archiveMetaLabel}>Archived</Text>
                            <Text style={styles.archiveMetaValue}>
                              {formatDate(user.archivedAt)}
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
                    ? 'Deleting...'
                    : `Delete ${selectedArchiveIds.length} Account${selectedArchiveIds.length !== 1 ? 's' : ''}`}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={[styles.adminDataTable, styles.adminDataTableWide]}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Date</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 160 }]}>
                    <Text style={styles.adminDataHeaderText}>User</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 140 }]}>
                    <Text style={styles.adminDataHeaderText}>Source</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 180 }]}>
                    <Text style={styles.adminDataHeaderText}>Event</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 160 }]}>
                    <Text style={styles.adminDataHeaderText}>Location</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Exercise</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 110 }]}>
                    <Text style={styles.adminDataHeaderText}>Distance</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 110 }]}>
                    <Text style={styles.adminDataHeaderText}>Duration</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Evidence</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 140 }]}>
                    <Text style={styles.adminDataHeaderText}>Actions</Text>
                  </View>
                </View>
                {externalSubmissions.flatMap((dateGroup: any, index: number) =>
                  dateGroup.users.flatMap((user: any, userIndex: number) =>
                    (user.submissions || []).map((submission: any) => (
                      <View key={`${dateGroup.activityDate}-${index}-${user.registrationId}-${userIndex}-${submission.submissionId}`} style={styles.adminDataRow}>
                        <View style={[styles.adminDataCell, { width: 120 }]}>
                          <Text style={styles.adminDataCellText}>{formatDate(dateGroup.activityDate)}</Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 160 }]}>
                          <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{user.userName}</Text>
                          <Text style={styles.adminDataCellMuted} numberOfLines={1}>{user.registrationId}</Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 140 }]}>
                          <Text style={styles.adminDataCellText} numberOfLines={2}>
                            {submission.sourceLabel || (submission.sourceType === "smart_watch" ? "Smart Watch" : submission.sourceType === "medal_claim" ? "External Medal" : "Sports App")}
                          </Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 180 }]}>
                          <Text style={styles.adminDataCellText} numberOfLines={2}>
                            {submission.externalEventName || "-"}
                          </Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 160 }]}>
                          <Text style={styles.adminDataCellText} numberOfLines={2}>
                            {submission.externalEventLocation || "-"}
                          </Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 120 }]}>
                          <Text style={styles.adminDataCellText}>{submission.exerciseType}</Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 110 }]}>
                          <Text style={styles.adminDataCellText}>{Number(submission.distanceKm || 0).toFixed(2)} km</Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 110 }]}>
                          <Text style={styles.adminDataCellText}>{submission.duration}</Text>
                        </View>
                        <View style={[styles.adminDataCell, { width: 120 }]}>
                          {submission.evidenceUrl ? (
                            <TouchableOpacity onPress={() => Linking.openURL(submission.evidenceUrl)}>
                              <Text style={[styles.adminDataCellText, { color: "#2563eb", fontWeight: "800" as const }]}>Open</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.adminDataCellMuted}>No evidence</Text>
                          )}
                        </View>
                        <View style={[styles.adminDataCell, styles.adminDataActions, { width: 140 }]}>
                          <TouchableOpacity
                            style={[styles.adminDataActionButton, styles.adminDataActionApprove]}
                            onPress={() => approveExternalSubmissionMutation.mutate({ submissionId: submission.submissionId })}
                            disabled={approveExternalSubmissionMutation.isPending || rejectExternalSubmissionMutation.isPending}
                          >
                            <Text style={styles.adminDataActionText}>Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.adminDataActionButton, styles.adminDataActionReject]}
                            onPress={() => rejectExternalSubmissionMutation.mutate({ submissionId: submission.submissionId })}
                            disabled={approveExternalSubmissionMutation.isPending || rejectExternalSubmissionMutation.isPending}
                          >
                            <Text style={styles.adminDataActionText}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )
                )}
              </View>
            </ScrollView>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminDataTableScroll}>
              <View style={styles.adminDataTable}>
                <View style={[styles.adminDataRow, styles.adminDataHeader]}>
                  <View style={[styles.adminDataCell, { width: 160 }]}>
                    <Text style={styles.adminDataHeaderText}>Exercise</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 170 }]}>
                    <Text style={styles.adminDataHeaderText}>User</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 150 }]}>
                    <Text style={styles.adminDataHeaderText}>T.Club Member</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Date</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Distance</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 120 }]}>
                    <Text style={styles.adminDataHeaderText}>Time</Text>
                  </View>
                  <View style={[styles.adminDataCell, { width: 110 }]}>
                    <Text style={styles.adminDataHeaderText}>Actions</Text>
                  </View>
                </View>
                {pendingActivities.map((activity) => (
                  <View key={activity.pending_activity_id} style={styles.adminDataRow}>
                    <View style={[styles.adminDataCell, { width: 160 }]}>
                      <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={2}>{activity.exercise_type}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 170 }]}>
                      <Text style={[styles.adminDataCellText, styles.adminDataCellStrong]} numberOfLines={1}>
                        {activity.runnerName || activity.registration_id}
                      </Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 150 }]}>
                      <Text style={[
                        styles.adminDataCellText,
                        activity.isTreadmillClubMember ? styles.adminDataCellSuccess : styles.adminDataCellWarning,
                      ]}>
                        {activity.treadmillClubMember || (activity.isTreadmillClubMember ? "Y" : "N")}
                      </Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 120 }]}>
                      <Text style={styles.adminDataCellText}>{formatDate(activity.created_at)}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 120 }]}>
                      <Text style={styles.adminDataCellText}>
                        {activity.distance_entered.toFixed(2)} {activity.distance_unit}
                      </Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 120 }]}>
                      <Text style={styles.adminDataCellText}>{formatTimeInterval(activity.time_entered)}</Text>
                    </View>
                    <View style={[styles.adminDataCell, { width: 110 }]}>
                      <TouchableOpacity
                        style={[styles.adminDataActionButton, styles.adminDataActionPrimary]}
                        onPress={() => {
                          setSelectedActivity(activity);
                          setShowActivityModal(true);
                        }}
                      >
                        <Text style={styles.adminDataActionText}>Review</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
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
                      <Text style={styles.detailLabel}>User</Text>
                      <Text style={styles.detailValue}>{selectedActivity.runnerName || selectedActivity.registration_id}</Text>
                    </View>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Member of Treadmill Club</Text>
                      <Text style={styles.detailValue}>{selectedActivity.treadmillClubMember || (selectedActivity.isTreadmillClubMember ? "Y" : "N")}</Text>
                    </View>
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
                    style={[
                      styles.approveBtn,
                      (
                        approveMutation.isPending ||
                        (!selectedActivity.isTreadmillClubMember && !(isSuperAdmin || isCountryCoordinator)) ||
                        (selectedActivity.isTreadmillClubMember && !(isSuperAdmin || isCountryCoordinator || isTreadmillCoordinator))
                      ) && styles.disabledButton,
                    ]}
                    onPress={() => approveMutation.mutate({ pendingActivityId: selectedActivity.pending_activity_id })}
                    disabled={
                      approveMutation.isPending ||
                      (!selectedActivity.isTreadmillClubMember && !(isSuperAdmin || isCountryCoordinator)) ||
                      (selectedActivity.isTreadmillClubMember && !(isSuperAdmin || isCountryCoordinator || isTreadmillCoordinator))
                    }
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
                  <Text style={styles.inputLabel}>Invite Country</Text>
                  {!editingRoleAssignment ? (
                    <>
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
                    </>
                  ) : null}
                  <Text style={styles.eventPosterHint}>
                    An organizer profile will be created automatically for the user after approval. New requests need a country so country-scoped admins can review them.
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
              <Text style={styles.modalTitle}>Confirm Account Deletion</Text>
              <TouchableOpacity onPress={() => setArchiveConfirmVisible(false)}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.archiveConfirmBody}>
              <AlertTriangle size={40} color="#f59e0b" />
              <Text style={styles.archiveConfirmText}>
                Permanently delete {selectedArchiveIds.length} archived account{selectedArchiveIds.length !== 1 ? 's' : ''} and its retained data?
              </Text>
              <Text style={styles.archiveConfirmWarning}>
                This cannot be undone. Only accounts already moved out of live tables can be deleted here.
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
                  {archiveMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEventOrganizerFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEventOrganizerFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.activityModalContent, styles.magazinePreviewModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Organizer</Text>
              <TouchableOpacity onPress={() => setShowEventOrganizerFilterModal(false)}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.activityModalBody}>
              {[
                { id: "all", label: `All (${organizerEventCounts.total})`, muted: false },
                { id: "clubs", label: `Clubs (${organizerEventCounts.clubOwnedCount})`, muted: organizerEventCounts.clubOwnedCount === 0 },
                ...(eventOrganizers as EventOrganizerRecord[]).map((organizer) => {
                  const count = organizerEventCounts.organizerCounts.get(organizer.organizer_id) ?? 0;
                  return {
                    id: organizer.organizer_id,
                    label: `${organizer.organizer_name} (${count})`,
                    muted: count === 0,
                  };
                }),
              ].map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.eventFilterChip,
                    { marginBottom: 8, alignSelf: "stretch" },
                    option.muted && styles.eventFilterChipMuted,
                    selectedOrganizerFilter === option.id && styles.eventFilterChipActive,
                  ]}
                  onPress={() => {
                    setSelectedOrganizerFilter(option.id);
                    setShowEventOrganizerFilterModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.eventFilterChipText,
                      option.muted && styles.eventFilterChipTextMuted,
                      selectedOrganizerFilter === option.id && styles.eventFilterChipTextActive,
                    ]}
                    numberOfLines={2}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedEventPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEventPreview(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.activityModalContent, styles.magazinePreviewModalContent]}>
            {selectedEventPreview ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Event Preview</Text>
                  <TouchableOpacity onPress={() => setSelectedEventPreview(null)}>
                    <X size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 520 }}>
                  {selectedEventPreview.poster_link || selectedEventPreview.posterLink ? (
                    <Image
                      source={{ uri: selectedEventPreview.poster_link || selectedEventPreview.posterLink }}
                      style={styles.magazinePreviewImage}
                      resizeMode="contain"
                    />
                  ) : null}
                  <Text style={styles.magazinePreviewTitle}>
                    {selectedEventPreview.event_name || selectedEventPreview.eventName || "Untitled event"}
                  </Text>
                  <Text style={styles.magazinePreviewMeta}>
                    {[
                      selectedEventPreview.event_type || selectedEventPreview.eventType || "same_day",
                      getEventOrganizerLabel(selectedEventPreview),
                      getEventApprovalLabel(selectedEventPreview.approval_status || "pending"),
                    ].filter(Boolean).join(" / ")}
                  </Text>
                  <Text style={styles.magazinePreviewBody}>
                    {[
                      `Start: ${formatDate(selectedEventPreview.starts_at || selectedEventPreview.startsAt)}`,
                      `End: ${formatDate(selectedEventPreview.ends_at || selectedEventPreview.endsAt)}`,
                      `Registration closes: ${formatDate(selectedEventPreview.registration_closes_at || selectedEventPreview.registrationClosesAt)}`,
                      `Entry: ${getEventEntryLabel(selectedEventPreview.entry || selectedEventPreview.entryType)}`,
                      `Location: ${selectedEventPreview.event_location || selectedEventPreview.eventLocation || (selectedEventPreview.is_virtual ? "Virtual" : "-")}`,
                      `Magazine: ${selectedEventPreview.magazine_submission_status || "missing"}`,
                    ].join("\n")}
                  </Text>
                  <View style={styles.eventApprovalActions}>
                    <TouchableOpacity
                      style={[styles.downloadButton, styles.adminDataActionPrimary]}
                      onPress={() => {
                        const event = selectedEventPreview;
                        setSelectedEventPreview(null);
                        handleEditEvent(event);
                      }}
                    >
                      <Edit size={16} color="#fff" />
                      <Text style={styles.downloadButtonText}>Edit Event</Text>
                    </TouchableOpacity>
                    {(selectedEventPreview.poster_link || selectedEventPreview.posterLink) ? (
                      <TouchableOpacity
                        style={[styles.downloadButton, styles.adminDataActionNeutral]}
                        onPress={() =>
                          setSelectedPosterPreview({
                            url: selectedEventPreview.poster_link || selectedEventPreview.posterLink,
                            title: selectedEventPreview.event_name || selectedEventPreview.eventName || "Event poster",
                          })
                        }
                      >
                        <Camera size={16} color="#fff" />
                        <Text style={styles.downloadButtonText}>Preview Poster</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {(() => {
                    const event = selectedEventPreview;
                    const approvalStatus = event.approval_status || "approved";
                    const magazineStatus = event.magazine_submission_status || "missing";
                    const isOrganizerOwned = Boolean(event.organizer);
                    const canReviewOrganizerEvent =
                      isOrganizerOwned &&
                      (isSuperAdmin ||
                        (isCountryAdmin && (!event.country_code || roleSession.countryAdminScopes.includes(event.country_code))) ||
                        (isCountryCoordinator && (!event.country_code || roleSession.countryCoordinatorScopes.includes(event.country_code))));
                    const canDeleteRejectedEvent =
                      approvalStatus === "rejected" &&
                      isOrganizerOwned &&
                      (canReviewOrganizerEvent ||
                        (isEventOrganizer && roleSession.eventOrganizerScopes.includes(event.organizer)));

                    return (
                      <>
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
                              disabled={updateEventApprovalMutation.isPending || magazineStatus !== "accepted"}
                            >
                              <CheckCircle size={16} color="#fff" />
                              <Text style={styles.downloadButtonText}>
                                {updateEventApprovalMutation.isPending
                                  ? "Saving..."
                                  : magazineStatus !== "accepted"
                                  ? "Approve Magazine First"
                                  : "Approve Event"}
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
                        {canDeleteRejectedEvent ? (
                          <TouchableOpacity
                            style={[styles.archiveActionBtn, { marginTop: 10 }]}
                            onPress={() => handleDeleteRejectedEvent(event)}
                            disabled={deleteEventMutation.isPending}
                          >
                            <Trash2 size={18} color="#fff" />
                            <Text style={styles.archiveActionBtnText}>
                              {deleteEventMutation.isPending ? "Deleting..." : "Delete Rejected Event"}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </>
                    );
                  })()}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedPosterPreview}
        animationType="fade"
        onRequestClose={() => setSelectedPosterPreview(null)}
      >
        <View style={styles.posterFullscreen}>
          <View style={styles.posterFullscreenHeader}>
            <Text style={styles.posterFullscreenTitle} numberOfLines={1}>
              {selectedPosterPreview?.title || "Event poster"}
            </Text>
            <TouchableOpacity
              style={styles.posterFullscreenClose}
              onPress={() => setSelectedPosterPreview(null)}
            >
              <X size={26} color="#fff" />
            </TouchableOpacity>
          </View>
          {selectedPosterPreview?.url ? (
            <Image
              source={{ uri: selectedPosterPreview.url }}
              style={styles.posterFullscreenImage}
              resizeMode="contain"
            />
          ) : null}
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
                <Text style={styles.label}>{eventTypeMode === "recurring" ? "Date" : "Start Date"}</Text>
                <TextInput
                  style={styles.input}
                  value={startsAt}
                  onChangeText={(value) => {
                    const formatted = formatDisplayDateInput(value);
                    setStartsAt(formatted);
                    if (eventTypeMode !== "multiday") {
                      setEndsAt(formatted);
                    }
                  }}
                  placeholder="DD-MM-YYYY"
                  keyboardType="number-pad"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Registration Close Date</Text>
                <TextInput
                  style={styles.input}
                  value={registrationClosesAt}
                  onChangeText={(value) => setRegistrationClosesAt(formatDisplayDateInput(value))}
                  placeholder="DD-MM-YYYY"
                  keyboardType="number-pad"
                  placeholderTextColor="#9ca3af"
                />
                <Text style={styles.eventPosterHint}>
                  After this date, users will see the Participate button greyed out.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Event Type</Text>
                <View style={styles.segmentRow}>
                  {([
                    ["same_day", "One Day"],
                    ["recurring", "Recurring"],
                    ["multiday", "Multiday"],
                  ] as Array<[EventTypeMode, string]>).map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      style={[styles.segmentChip, eventTypeMode === value && styles.segmentChipActive]}
                      onPress={() => {
                        setEventTypeMode(value);
                        if (value !== "multiday") {
                          setEndsAt(startsAt);
                        }
                      }}
                    >
                      <Text
                        style={[styles.segmentChipText, eventTypeMode === value && styles.segmentChipTextActive]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {eventTypeMode === "same_day" ? (
                <Text style={[styles.eventPosterHint, styles.formGroup]}>
                  Same day events use the start date as the event end date.
                </Text>
              ) : eventTypeMode === "recurring" ? (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Repeats</Text>
                  <View style={styles.segmentRow}>
                    {([
                      ["weekly", "Weekly"],
                      ["monthly", "Monthly"],
                    ] as Array<[EventRecurrenceFrequency, string]>).map(([value, label]) => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.segmentChip, eventRecurrenceFrequency === value && styles.segmentChipActive]}
                        onPress={() => setEventRecurrenceFrequency(value)}
                      >
                        <Text
                          style={[
                            styles.segmentChipText,
                            eventRecurrenceFrequency === value && styles.segmentChipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {eventRecurrenceFrequency === "weekly" ? (
                    <>
                      <Text style={[styles.label, styles.recurringSubLabel]}>Run days</Text>
                      <View style={styles.compactChipRow}>
                        {RUN_DAY_OPTIONS.map((day) => {
                          const selected = eventRecurrenceWeekdays.includes(day.value);
                          return (
                            <TouchableOpacity
                              key={day.value}
                              style={[styles.compactChip, selected && styles.roleChipActive]}
                              onPress={() => {
                                setEventRecurrenceWeekdays((current) => {
                                  const next = selected
                                    ? current.filter((value) => value !== day.value)
                                    : [...current, day.value];
                                  return next.length ? next : [day.value];
                                });
                                setEventRecurrenceWeekday(day.value);
                              }}
                            >
                              <Text style={[styles.compactChipText, selected && styles.roleChipTextActive]}>
                                {day.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={[styles.segmentRow, styles.recurringSubSection]}>
                        {([
                          ["day_of_month", "Day of month"],
                          ["weekend", "Weekend"],
                        ] as Array<[EventMonthlyMode, string]>).map(([value, label]) => (
                          <TouchableOpacity
                            key={value}
                            style={[styles.segmentChip, eventMonthlyMode === value && styles.segmentChipActive]}
                            onPress={() => setEventMonthlyMode(value)}
                          >
                            <Text
                              style={[
                                styles.segmentChipText,
                                eventMonthlyMode === value && styles.segmentChipTextActive,
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalPickerContent}
                      >
                        {(eventMonthlyMode === "day_of_month" ? MONTH_DAY_OPTIONS : MONTH_WEEKEND_OPTIONS).map((option) => {
                          const selected =
                            eventMonthlyMode === "day_of_month"
                              ? eventRecurrenceMonthDay === option.value
                              : eventRecurrenceWeekOfMonth === option.value;
                          return (
                            <TouchableOpacity
                              key={option.value}
                              style={[styles.pickerChip, selected && styles.roleChipActive]}
                              onPress={() => {
                                if (eventMonthlyMode === "day_of_month") {
                                  setEventRecurrenceMonthDay(option.value);
                                } else {
                                  setEventRecurrenceWeekOfMonth(option.value);
                                }
                              }}
                            >
                              <Text style={[styles.pickerChipText, selected && styles.roleChipTextActive]}>
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </>
                  )}

                  <Text style={styles.eventPosterHint}>
                    Recurring events use one event upload. No date range is needed.
                  </Text>
                </View>
              ) : (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>End Date</Text>
                  <TextInput
                    style={styles.input}
                    value={endsAt}
                    onChangeText={(value) => setEndsAt(formatDisplayDateInput(value))}
                    placeholder="DD-MM-YYYY"
                    keyboardType="number-pad"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Event Organizer</Text>
                <View style={styles.segmentRow}>
                  {([
                    ["self", "Self"],
                    ["other", "Other"],
                  ] as Array<[EventOrganizerMode, string]>).map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      style={[styles.segmentChip, eventOrganizerMode === value && styles.segmentChipActive]}
                      onPress={() => setEventOrganizerMode(value)}
                    >
                      <Text style={[styles.segmentChipText, eventOrganizerMode === value && styles.segmentChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {eventOrganizerMode === "self" ? (
                  <View style={styles.readOnlyField}>
                    <Text style={styles.readOnlyFieldText}>{selfEventOwner.label}</Text>
                  </View>
                ) : (
                  <TextInput
                    style={styles.input}
                    value={eventExternalOrganizerName}
                    onChangeText={setEventExternalOrganizerName}
                    placeholder="External organizer name"
                    placeholderTextColor="#9ca3af"
                  />
                )}
                <Text style={styles.eventPosterHint}>
                  Self uses your club/organizer profile, or RunNation when no profile is attached. Other is for external third-party organizers.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Event Country</Text>
                <TextInput
                  style={styles.input}
                  value={eventCountry}
                  onChangeText={setEventCountry}
                  placeholder={adminProfile?.country || selectedEventOrganizer?.country || "Uganda"}
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Registration Link</Text>
                <TextInput
                  style={styles.input}
                  value={eventRegistrationLink}
                  onChangeText={setEventRegistrationLink}
                  placeholder="https://organizer.com/register"
                  placeholderTextColor="#9ca3af"
                  keyboardType="url"
                  autoCapitalize="none"
                />
                <Text style={styles.eventPosterHint}>
                  Optional. Use this when participants register through an external website.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Payment Link</Text>
                <TextInput
                  style={styles.input}
                  value={eventOrganizerPaymentLink}
                  onChangeText={setEventOrganizerPaymentLink}
                  placeholder="https://payment-provider.com/event"
                  placeholderTextColor="#9ca3af"
                  keyboardType="url"
                  autoCapitalize="none"
                />
                <Text style={styles.eventPosterHint}>
                  Optional. Use this when the organizer or club already has a payment platform.
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

              {!eventIsVirtual && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Start / Finish Location</Text>
                  <TextInput
                    style={styles.input}
                    value={eventLocation}
                    onChangeText={setEventLocation}
                    placeholder="e.g., Kyambogo University Sports Ground"
                    placeholderTextColor="#9ca3af"
                  />
                  <Text style={styles.eventPosterHint}>
                    This is the specific race place shown in Events list view.
                  </Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Entry Type</Text>
                <View style={styles.segmentRow}>
                  {([
                    ["free", "Free"],
                    ["club_approved", "Approved"],
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
                          {resolvedEventCurrencyCode || "From organizer country"}
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
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>RunNation Payment Link</Text>
                    <TouchableOpacity
                      style={[styles.statusOption, eventRunNationPaymentLinkEnabled && styles.statusOptionSelected]}
                      onPress={() => setEventRunNationPaymentLinkEnabled((prev) => !prev)}
                    >
                      <Text
                        style={[
                          styles.statusOptionText,
                          eventRunNationPaymentLinkEnabled && styles.statusOptionTextSelected,
                        ]}
                      >
                        {eventRunNationPaymentLinkEnabled
                          ? "RunNation Collection: Coming Soon"
                          : "RunNation Collection: Off"}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.eventPosterHint}>
                      Coming soon: RunNation can collect on behalf of organizers without their own payment platform.
                    </Text>
                  </View>
                </>
              ) : null}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Number of Participants</Text>
                <View style={styles.segmentRow}>
                  {([
                    [false, "Unlimited"],
                    [true, "Limited"],
                  ] as Array<[boolean, string]>).map(([value, label]) => (
                    <TouchableOpacity
                      key={label}
                      style={[styles.segmentChip, eventParticipantLimitEnabled === value && styles.segmentChipActive]}
                      onPress={() => setEventParticipantLimitEnabled(value)}
                    >
                      <Text
                        style={[
                          styles.segmentChipText,
                          eventParticipantLimitEnabled === value && styles.segmentChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {eventParticipantLimitEnabled ? (
                  <TextInput
                    style={styles.input}
                    value={eventParticipantLimit}
                    onChangeText={setEventParticipantLimit}
                    placeholder="e.g., 100"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                  />
                ) : null}
                <Text style={styles.eventPosterHint}>
                  Limited events disable the Participate button once the target number is reached.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Medal</Text>
                <View style={styles.segmentRow}>
                  {([
                    [false, "No Medal"],
                    [true, "Medal Event"],
                  ] as Array<[boolean, string]>).map(([value, label]) => (
                    <TouchableOpacity
                      key={label}
                      style={[styles.segmentChip, eventHasMedal === value && styles.segmentChipActive]}
                      onPress={() => {
                        setEventHasMedal(value);
                        if (!value) {
                          setEventMinimumDistanceEnabled(false);
                          setEventMedalDistances([]);
                          setEventCustomMedalDistance("");
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.segmentChipText,
                          eventHasMedal === value && styles.segmentChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {eventHasMedal ? (
                  <>
                    <Text style={[styles.label, styles.recurringSubLabel]}>Available Distances</Text>
                    <View style={styles.compactChipRow}>
                      {MEDAL_DISTANCE_OPTIONS_KM.map((distance) => {
                        const selected = eventMedalDistances.some((value) => Math.abs(value - distance) < 0.001);
                        return (
                          <TouchableOpacity
                            key={distance}
                            style={[styles.compactChip, selected && styles.roleChipActive]}
                            onPress={() => toggleEventMedalDistance(distance)}
                          >
                            <Text style={[styles.compactChipText, selected && styles.roleChipTextActive]}>
                              {distance}K
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={styles.formRow}>
                      <View style={styles.formGroupHalf}>
                        <TextInput
                          style={styles.input}
                          value={eventCustomMedalDistance}
                          onChangeText={setEventCustomMedalDistance}
                          placeholder="Other km"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                        />
                      </View>
                      <TouchableOpacity style={[styles.confirmButton, styles.formGroupHalf]} onPress={addCustomEventMedalDistance}>
                        <Text style={styles.confirmButtonText}>Add Distance</Text>
                      </TouchableOpacity>
                    </View>
                    {eventMedalDistances.length ? (
                      <Text style={styles.eventPosterHint}>
                        Categories: {eventMedalDistances.map((distance) => `${distance}K`).join(", ")}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                <Text style={styles.eventPosterHint}>
                  Distance categories define the event medal categories. Awarding still depends on the approved runner distance.
                </Text>
              </View>

              {eventHasMedal ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Minimum Distance Rule</Text>
                <TouchableOpacity
                  style={[styles.statusOption, eventMinimumDistanceEnabled && styles.statusOptionSelected]}
                  onPress={() => setEventMinimumDistanceEnabled((prev) => !prev)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      eventMinimumDistanceEnabled && styles.statusOptionTextSelected,
                    ]}
                  >
                    {eventMinimumDistanceEnabled ? "Minimum Distance: On" : "Minimum Distance: Off"}
                  </Text>
                </TouchableOpacity>
                {eventMinimumDistanceEnabled ? (
                  <View style={styles.formRow}>
                    <View style={styles.formGroupHalf}>
                      <Text style={styles.label}>
                        {eventTypeMode === "multiday" ? "Min Daily Distance (km)" : "Min Distance (km)"}
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={medalMinDailyDistance}
                        onChangeText={setMedalMinDailyDistance}
                        placeholder="5"
                        placeholderTextColor="#9ca3af"
                        keyboardType="numeric"
                      />
                    </View>
                    {eventTypeMode === "multiday" ? (
                      <View style={styles.formGroupHalf}>
                        <Text style={styles.label}>Min Total Distance (km)</Text>
                        <TextInput
                          style={styles.input}
                          value={medalMinCumulativeDistance}
                          onChangeText={setMedalMinCumulativeDistance}
                          placeholder="100"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <Text style={styles.eventPosterHint}>
                  When on, only runners who meet the distance requirement appear under Finishers.
                </Text>
              </View>
              ) : null}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Event Poster</Text>
                <TouchableOpacity style={styles.posterPickerButton} onPress={handlePickEventPoster}>
                  <Camera size={18} color="#10b981" />
                  <Text style={styles.posterPickerButtonText}>
                    {eventPosterPreview ? "Change Event Poster" : "Add Event Poster"}
                  </Text>
                </TouchableOpacity>
                {eventPosterPreview ? (
                  <Image source={{ uri: eventPosterPreview }} style={styles.eventPosterPreview} />
                ) : (
                  <View style={styles.posterPlaceholder}>
                    <Text style={styles.posterPlaceholderText}>No event poster selected</Text>
                  </View>
                )}
                <Text style={styles.eventPosterHint}>
                  This poster appears on the event listing and event details.
                </Text>
                {eventPosterMarkedForRemoval ? (
                  <Text style={styles.posterPendingHint}>
                    Event photo removal pending. Save changes to clear it from this event.
                  </Text>
                ) : null}
                {!eventPosterAsset && eventPosterPreview?.startsWith("http") && !isStandardPosterStoragePath(extractPosterStoragePath(eventPosterPreview)) ? (
                  <Text style={styles.posterPendingHint}>
                    Saving this event will rename the current event poster to the standard event poster file name.
                  </Text>
                ) : null}
                {eventPosterPreview ? (
                  <TouchableOpacity style={styles.posterLinkButton} onPress={() => handleOpenPosterUrl(eventPosterPreview)}>
                    <FileText size={14} color="#0369a1" />
                    <Text style={styles.posterLinkButtonText}>Open Event Poster URL</Text>
                  </TouchableOpacity>
                ) : null}
                {(eventPosterPreview || eventPosterMarkedForRemoval) && (
                  <TouchableOpacity style={styles.posterRemoveButton} onPress={handleRemoveEventPoster}>
                    <Trash2 size={16} color="#b91c1c" />
                    <Text style={styles.posterRemoveButtonText}>
                      {eventPosterMarkedForRemoval ? "Event poster will be removed on save" : "Remove Event Poster"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.sectionDivider}>
                <Text style={styles.sectionTitle}>Magazine Event Story</Text>
              </View>

              <Text style={styles.eventPosterHint}>
                Every event needs a short article and picture so RunNation Magazine readers can understand the event and be inspired to join.
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Magazine Photo</Text>
                <TouchableOpacity style={styles.posterPickerButton} onPress={handlePickMagazinePhoto}>
                  <Camera size={18} color="#10b981" />
                  <Text style={styles.posterPickerButtonText}>
                    {eventMagazinePhotoPreview ? "Change Magazine Photo" : "Add Magazine Photo"}
                  </Text>
                </TouchableOpacity>
                {eventMagazinePhotoPreview ? (
                  <Image source={{ uri: eventMagazinePhotoPreview }} style={styles.eventPosterPreview} />
                ) : (
                  <View style={styles.posterPlaceholder}>
                    <Text style={styles.posterPlaceholderText}>No magazine photo selected</Text>
                  </View>
                )}
                <Text style={styles.eventPosterHint}>
                  This photo is attached to the magazine article so the story is image rich.
                </Text>
                {eventMagazinePhotoPreview ? (
                  <TouchableOpacity style={styles.posterLinkButton} onPress={() => handleOpenPosterUrl(eventMagazinePhotoPreview)}>
                    <FileText size={14} color="#0369a1" />
                    <Text style={styles.posterLinkButtonText}>Open Magazine Photo URL</Text>
                  </TouchableOpacity>
                ) : null}
                {eventMagazinePhotoPreview ? (
                  <TouchableOpacity style={styles.posterRemoveButton} onPress={handleRemoveMagazinePhoto}>
                    <Trash2 size={16} color="#b91c1c" />
                    <Text style={styles.posterRemoveButtonText}>Remove Magazine Photo</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Article Title</Text>
                <TextInput
                  style={styles.input}
                  value={eventMagazineArticleTitle}
                  onChangeText={setEventMagazineArticleTitle}
                  placeholder="e.g., Why runners should join the Kampala Sunrise Run"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Writer Name</Text>
                <TextInput
                  style={styles.input}
                  value={eventMagazineWriterName}
                  onChangeText={setEventMagazineWriterName}
                  placeholder="Name of the article writer"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Article Body File</Text>
                <TouchableOpacity style={styles.posterPickerButton} onPress={handlePickMagazineArticleFile}>
                  <Upload size={18} color="#10b981" />
                  <Text style={styles.posterPickerButtonText}>
                    {eventMagazineArticleFileName ? "Change Text File" : "Upload Text File"}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.eventPosterHint}>
                  {eventMagazineArticleFileName
                    ? `${eventMagazineArticleFileName} / ${countWords(eventMagazineArticleBody)} words`
                    : "Write 200-300 words. Save or export the article as plain text first, then upload TXT, MD, CSV, LOG, or RTF. The app saves the extracted text only."}
                </Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={eventMagazineArticleBody}
                  editable={false}
                  placeholder="Uploaded article text preview will appear here."
                  placeholderTextColor="#9ca3af"
                  multiline
                />
              </View>

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
        visible={!!selectedMagazineEditTarget}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSelectedMagazineEditTarget(null);
          setIsPreparingMagazineEditPhoto(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.activityModalContent, styles.magazinePreviewModalContent]}>
            {selectedMagazineEditTarget ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Magazine Entry</Text>
                  <TouchableOpacity onPress={() => {
                    setSelectedMagazineEditTarget(null);
                    setIsPreparingMagazineEditPhoto(false);
                  }}>
                    <X size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.activityModalBody}>
                  <Text style={styles.label}>{selectedMagazineEditTarget.type === "pictorial" ? "Event/Gallery Title" : "Title"}</Text>
                  <TextInput style={styles.input} value={magazineEditTitle} onChangeText={setMagazineEditTitle} />
                  {selectedMagazineEditTarget.type === "article" ? (
                    <>
                      <Text style={styles.label}>Author</Text>
                      <TextInput style={styles.input} value={magazineEditAuthor} onChangeText={setMagazineEditAuthor} />
                      <Text style={styles.label}>Category/Page</Text>
                      <TextInput style={styles.input} value={magazineEditCategory} onChangeText={setMagazineEditCategory} />
                      <Text style={styles.label}>Pitch</Text>
                      <TextInput style={[styles.input, styles.inputMultiline]} value={magazineEditPitch} onChangeText={setMagazineEditPitch} multiline textAlignVertical="top" />
                      <Text style={styles.label}>External Link</Text>
                      <TextInput style={styles.input} value={magazineEditExternalLink} onChangeText={setMagazineEditExternalLink} autoCapitalize="none" />
                    </>
                  ) : (
                    <>
                      <Text style={styles.label}>Event Date</Text>
                      <TextInput style={styles.input} value={magazineEditEventDate} onChangeText={setMagazineEditEventDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
                    </>
                  )}
                  <Text style={styles.label}>Picture</Text>
                  <TouchableOpacity style={styles.posterPickerButton} onPress={handlePickMagazineEditPhoto}>
                    <Camera size={20} color="#2563eb" />
                    <Text style={styles.posterPickerButtonText}>
                      {magazineEditPhotoPreview ? "Change Picture" : "Add Picture"}
                    </Text>
                  </TouchableOpacity>
                  {magazineEditPhotoPreview ? (
                    <Image source={{ uri: magazineEditPhotoPreview }} style={styles.eventPosterPreview} />
                  ) : null}
                  {magazineEditPhotoPreview && !magazineEditPhotoAsset ? (
                    <TouchableOpacity style={styles.posterLinkButton} onPress={() => handleOpenPosterUrl(magazineEditPhotoPreview)}>
                      <Download size={16} color="#0369a1" />
                      <Text style={styles.posterLinkButtonText}>Open Current Picture</Text>
                    </TouchableOpacity>
                  ) : null}
                  <Text style={styles.label}>{selectedMagazineEditTarget.type === "pictorial" ? "Caption" : "Body"}</Text>
                  <TextInput style={[styles.input, styles.inputMultiline]} value={magazineEditBody} onChangeText={setMagazineEditBody} multiline textAlignVertical="top" />
                  <TouchableOpacity
                    style={[styles.approveButton, (updateMagazineEntryMutation.isPending || isPreparingMagazineEditPhoto) && styles.disabledButton]}
                    disabled={updateMagazineEntryMutation.isPending || isPreparingMagazineEditPhoto}
                    onPress={handleSaveMagazineEdit}
                  >
                    <Save size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>{updateMagazineEntryMutation.isPending || isPreparingMagazineEditPhoto ? "Saving..." : "Save Changes"}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedMagazinePreview}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMagazinePreview(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.activityModalContent, styles.magazinePreviewModalContent]}>
            {selectedMagazinePreview ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Magazine Preview</Text>
                  <TouchableOpacity onPress={() => setSelectedMagazinePreview(null)}>
                    <X size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.activityModalBody}>
                  {selectedMagazinePreview.type === "pictorial" ? (
                    <>
                      {getMagazineImageUrl(selectedMagazinePreview.photo_url, selectedMagazinePreview.photo_webp_url, selectedMagazinePreview.photo_avif_url) ? (
                        <Image
                          source={{ uri: getMagazineImageUrl(selectedMagazinePreview.photo_url, selectedMagazinePreview.photo_webp_url, selectedMagazinePreview.photo_avif_url) as string }}
                          style={styles.magazinePreviewImage}
                          resizeMode="cover"
                        />
                      ) : null}
                      <Text style={styles.magazinePreviewMeta}>
                        {[selectedMagazinePreview.submitter_name, selectedMagazinePreview.club, formatCountryName(selectedMagazinePreview.country) || selectedMagazinePreview.country]
                          .filter(Boolean)
                          .join(" / ")}
                      </Text>
                      <Text style={styles.magazinePreviewTitle}>
                        {selectedMagazinePreview.event_name || "Gallery submission"}
                      </Text>
                      <Text style={styles.magazinePreviewBody}>
                        {selectedMagazinePreview.caption || "No caption submitted."}
                      </Text>
                      <Text style={styles.magazinePreviewMeta}>
                        {[selectedMagazinePreview.event_date, `Status: ${selectedMagazinePreview.status}`].filter(Boolean).join(" / ")}
                      </Text>
                    </>
                  ) : (
                    <>
                      {getMagazineImageUrl(selectedMagazinePreview.magazine_photo_url, selectedMagazinePreview.attachment_url) ? (
                        <Image
                          source={{ uri: getMagazineImageUrl(selectedMagazinePreview.magazine_photo_url, selectedMagazinePreview.attachment_url) as string }}
                          style={styles.magazinePreviewImage}
                          resizeMode="cover"
                        />
                      ) : null}
                      <Text style={styles.magazinePreviewMeta}>
                        {[selectedMagazinePreview.article_writer_name || selectedMagazinePreview.author_name, selectedMagazinePreview.category, formatDate(selectedMagazinePreview.created_at)]
                          .filter(Boolean)
                          .join(" / ")}
                      </Text>
                      <Text style={styles.magazinePreviewTitle}>
                        {selectedMagazinePreview.title || "Untitled submission"}
                      </Text>
                      {selectedMagazinePreview.pitch ? (
                        <Text style={styles.magazinePreviewPitch}>{selectedMagazinePreview.pitch}</Text>
                      ) : null}
                      <Text style={styles.magazinePreviewBody}>
                        {selectedMagazinePreview.body || selectedMagazinePreview.pitch || "No article body submitted."}
                      </Text>
                      <Text style={styles.magazinePreviewMeta}>
                        {[
                          selectedMagazinePreview.event_id ? `Linked event: ${selectedMagazinePreview.event_id}` : null,
                          selectedMagazinePreview.external_link ? `External link: ${selectedMagazinePreview.external_link}` : null,
                          `Status: ${selectedMagazinePreview.status}`,
                          selectedMagazinePreview.email,
                        ].filter(Boolean).join(" / ")}
                      </Text>
                    </>
                  )}
                  <View style={styles.magazineActionMenu}>
                    <TouchableOpacity style={[styles.magazineActionMenuButton, styles.adminDataActionNeutral]} onPress={() => handleMagazineAction(selectedMagazinePreview, "edit")}>
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.magazineActionMenuButton, styles.adminDataActionApprove]} onPress={() => handleMagazineAction(selectedMagazinePreview, "accept")}>
                      <Text style={styles.actionButtonText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.magazineActionMenuButton, styles.adminDataActionReject]} onPress={() => handleMagazineAction(selectedMagazinePreview, "reject")}>
                      <Text style={styles.actionButtonText}>Reject</Text>
                    </TouchableOpacity>
                    {selectedMagazinePreview.type === "pictorial" && (isSuperAdmin || isCountryAdmin || isMagazineEditor) ? (
                      <TouchableOpacity style={[styles.magazineActionMenuButton, styles.adminDataActionNeutral]} onPress={() => handleMagazineAction(selectedMagazinePreview, "feature")}>
                        <Text style={styles.actionButtonText}>Feature</Text>
                      </TouchableOpacity>
                    ) : null}
                    {(isSuperAdmin || isMagazineEditor) ? (
                      <TouchableOpacity style={[styles.magazineActionMenuButton, styles.adminDataActionReject]} onPress={() => handleMagazineAction(selectedMagazinePreview, "delete")}>
                        <Text style={styles.actionButtonText}>Delete</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </ScrollView>
              </>
            ) : null}
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
  adminDataTableScroll: {
    flexGrow: 0,
  },
  adminDataTableScrollContent: {
    flexGrow: 0,
  },
  registrationGrowthTable: {
    minWidth: 530,
  },
  mobileTableSwipeHint: {
    marginBottom: 6,
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "700" as const,
  },
  adminDataTable: {
    minWidth: 760,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    overflow: "hidden",
  },
  adminDataTableWide: {
    minWidth: 980,
  },
  adminDataRow: {
    flexDirection: "row",
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  adminDataHeader: {
    minHeight: 34,
    backgroundColor: "#f3f4f6",
  },
  adminDataCell: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#f3f4f6",
  },
  adminDataHeaderText: {
    fontSize: 9,
    fontWeight: "800" as const,
    color: "#4b5563",
    textTransform: "uppercase" as const,
  },
  adminDataCellText: {
    fontSize: 11,
    lineHeight: 15,
    color: "#111827",
  },
  adminDataCellStrong: {
    fontWeight: "800" as const,
  },
  adminDataCellMuted: {
    fontSize: 10,
    lineHeight: 14,
    color: "#6b7280",
  },
  myTeamPersonRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 5,
  },
  myTeamFlagText: {
    fontSize: 14,
    lineHeight: 16,
  },
  myTeamPersonName: {
    flex: 1,
  },
  adminDataCellSuccess: {
    color: "#059669",
    fontWeight: "800" as const,
  },
  adminDataCellWarning: {
    color: "#d97706",
    fontWeight: "800" as const,
  },
  adminDataCellDanger: {
    color: "#dc2626",
    fontWeight: "800" as const,
  },
  adminDataActions: {
    gap: 5,
  },
  adminDataActionButton: {
    minHeight: 28,
    borderRadius: 6,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  adminDataActionPrimary: {
    backgroundColor: "#2563eb",
  },
  adminDataActionApprove: {
    backgroundColor: "#16a34a",
  },
  adminDataActionReject: {
    backgroundColor: "#dc2626",
  },
  adminDataActionNeutral: {
    backgroundColor: "#4b5563",
  },
  adminDataActionText: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: "#fff",
  },
  magazineActionMenu: {
    gap: 10,
  },
  magazineActionMenuButton: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
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
  recurringSubLabel: {
    marginTop: 14,
    marginBottom: 8,
  },
  recurringSubSection: {
    marginTop: 12,
    marginBottom: 8,
  },
  compactChipRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  compactChip: {
    minWidth: 42,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  compactChipText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#4b5563",
  },
  horizontalPickerContent: {
    gap: 8,
    paddingVertical: 4,
    paddingRight: 12,
  },
  pickerChip: {
    minWidth: 54,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  pickerChipText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#4b5563",
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
  posterButtonRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    alignItems: "center" as const,
  },
  posterFullscreen: {
    flex: 1,
    backgroundColor: "#000",
  },
  posterFullscreenHeader: {
    minHeight: 64,
    paddingTop: 16,
    paddingHorizontal: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    backgroundColor: "#000",
  },
  posterFullscreenTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "800" as const,
  },
  posterFullscreenClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#111827",
  },
  posterFullscreenImage: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000",
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
  secondaryButton: {
    flex: 1,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: "#1d4ed8",
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
  eventFilterChips: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
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
  milestoneCompletionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d1fae5",
    gap: 10,
  },
  milestoneCompletionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  milestoneCompletionLabel: {
    fontSize: 13,
    fontWeight: "800" as const,
    color: "#064e3b",
    textTransform: "uppercase" as const,
  },
  milestoneCompletionMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#047857",
  },
  milestoneCompletionPercent: {
    fontSize: 28,
    fontWeight: "900" as const,
    color: "#059669",
  },
  milestoneProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#ecfdf5",
    overflow: "hidden" as const,
  },
  milestoneProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#10b981",
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
  auditTable: {
    minWidth: 640,
    width: "100%" as const,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden" as const,
  },
  auditTableRow: {
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    minHeight: 44,
  },
  auditTableHeader: {
    backgroundColor: "#f9fafb",
    minHeight: 30,
    borderTopWidth: 0,
  },
  auditTableHeaderText: {
    fontSize: 9,
    fontWeight: "900" as const,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    paddingHorizontal: 5,
    paddingVertical: 7,
  },
  auditTableCellText: {
    fontSize: 10,
    lineHeight: 13,
    color: "#111827",
    paddingHorizontal: 5,
    paddingVertical: 7,
  },
  auditTableCellStrong: {
    fontWeight: "900" as const,
  },
  auditTableCellMuted: {
    fontSize: 9,
    lineHeight: 12,
    color: "#6b7280",
    paddingHorizontal: 5,
    paddingVertical: 7,
  },
  auditTypeCellText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900" as const,
    color: "#047857",
    paddingHorizontal: 5,
    paddingVertical: 7,
  },
  auditColDate: {
    width: 86,
    justifyContent: "center" as const,
  },
  auditColAdmin: {
    width: 132,
    justifyContent: "center" as const,
  },
  auditColType: {
    width: 104,
    justifyContent: "center" as const,
  },
  auditColAction: {
    width: 134,
    justifyContent: "center" as const,
  },
  auditColDetails: {
    width: 184,
    justifyContent: "center" as const,
  },
  roleAccessPanel: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden" as const,
    marginBottom: 12,
  },
  roleAccessTabs: {
    flexDirection: "row" as const,
    backgroundColor: "#f3f4f6",
    padding: 4,
    gap: 4,
  },
  roleAccessTabButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: "center" as const,
  },
  roleAccessTabButtonActive: {
    backgroundColor: "#111827",
  },
  roleAccessTabText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#6b7280",
  },
  roleAccessTabTextActive: {
    color: "#fff",
  },
  roleTable: {
    width: "100%" as const,
  },
  pendingRoleList: {
    padding: 8,
    gap: 10,
  },
  pendingRoleCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 10,
    gap: 8,
  },
  pendingRoleTopRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  pendingRoleIdentity: {
    flex: 1.15,
    minWidth: 0,
  },
  pendingRoleScopeBlock: {
    flex: 1,
    minWidth: 0,
  },
  pendingRoleEmail: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900" as const,
    color: "#111827",
  },
  pendingRoleMetaText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700" as const,
    color: "#6b7280",
    marginTop: 3,
  },
  pendingRoleLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900" as const,
    color: "#6b7280",
    textTransform: "uppercase" as const,
  },
  pendingRoleValue: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800" as const,
    color: "#111827",
    marginBottom: 3,
  },
  pendingRoleTextBox: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 7,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 9,
    paddingVertical: 8,
    minHeight: 76,
  },
  pendingRoleBodyText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#111827",
    marginTop: 4,
  },
  pendingRoleMutedText: {
    fontSize: 11,
    lineHeight: 15,
    color: "#6b7280",
    marginTop: 4,
  },
  pendingRoleContactText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800" as const,
    color: "#047857",
    marginTop: 6,
  },
  pendingRoleLinks: {
    gap: 6,
    marginTop: 8,
  },
  pendingRoleLinkRow: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 6,
    gap: 5,
  },
  pendingRoleLinkText: {
    fontSize: 11,
    lineHeight: 15,
    color: "#374151",
  },
  pendingRoleLinkActions: {
    flexDirection: "row" as const,
    gap: 6,
  },
  pendingRoleLinkButton: {
    minHeight: 26,
    borderRadius: 6,
    paddingHorizontal: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#e0f2fe",
  },
  pendingRoleLinkButtonText: {
    fontSize: 11,
    fontWeight: "900" as const,
    color: "#0369a1",
  },
  pendingRoleActions: {
    flexDirection: "row" as const,
    gap: 8,
  },
  pendingRoleButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 7,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 5,
  },
  roleTableRow: {
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    minHeight: 44,
  },
  roleTableHeader: {
    backgroundColor: "#f9fafb",
    minHeight: 30,
    borderTopWidth: 0,
  },
  roleTableHeaderText: {
    fontSize: 9,
    fontWeight: "900" as const,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  roleCellText: {
    fontSize: 10,
    lineHeight: 13,
    color: "#111827",
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  roleCellMuted: {
    fontSize: 9,
    lineHeight: 12,
    color: "#6b7280",
    paddingHorizontal: 4,
  },
  roleCellStrong: {
    fontWeight: "800" as const,
  },
  roleColUser: {
    flex: 1.25,
    justifyContent: "center" as const,
  },
  roleColRole: {
    flex: 1.55,
    justifyContent: "center" as const,
  },
  roleColScope: {
    flex: 1,
    justifyContent: "center" as const,
  },
  roleColClubCompany: {
    flex: 0.95,
    justifyContent: "center" as const,
  },
  roleColJurisdiction: {
    flex: 0.85,
    justifyContent: "center" as const,
  },
  roleColDate: {
    flex: 0.52,
    justifyContent: "center" as const,
  },
  roleColTerms: {
    flex: 0.52,
    justifyContent: "center" as const,
    paddingHorizontal: 3,
  },
  roleColMeta: {
    flex: 1,
    justifyContent: "center" as const,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  roleColActions: {
    flex: 0.75,
    justifyContent: "center" as const,
  },
  roleTermsBadge: {
    fontSize: 8,
    lineHeight: 12,
    fontWeight: "900" as const,
    textAlign: "center" as const,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 3,
    overflow: "hidden" as const,
  },
  roleTermsAccepted: {
    color: "#047857",
    backgroundColor: "#d1fae5",
  },
  roleTermsPending: {
    color: "#92400e",
    backgroundColor: "#fef3c7",
  },
  roleActionCell: {
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  roleMiniButton: {
    minHeight: 22,
    borderRadius: 5,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 2,
    paddingHorizontal: 3,
  },
  roleMiniApprove: {
    backgroundColor: "#16a34a",
  },
  roleMiniReject: {
    backgroundColor: "#dc2626",
  },
  roleMiniEdit: {
    backgroundColor: "#2563eb",
  },
  roleMiniRemove: {
    backgroundColor: "#991b1b",
  },
  roleMiniButtonText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800" as const,
  },
  roleAccessEmpty: {
    alignItems: "center" as const,
    paddingVertical: 18,
    paddingHorizontal: 8,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  roleAccessEmptyTitle: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#111827",
  },
  roleAccessEmptyText: {
    fontSize: 10,
    color: "#6b7280",
    textAlign: "center" as const,
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
  externalUserCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
  externalSubmissionCard: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 8,
  },
  externalSubmissionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  externalSubmissionTitle: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "700" as const,
  },
  externalSubmissionMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  externalEvidenceButton: {
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  externalEvidenceButtonText: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "700" as const,
  },
  externalNoEvidenceText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "700" as const,
  },
  externalEvidenceThumb: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },
  externalActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  externalActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  externalApproveButton: {
    backgroundColor: "#10b981",
  },
  externalRejectButton: {
    backgroundColor: "#ef4444",
  },
  externalActionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700" as const,
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
  adminTableInput: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: "#111827",
    backgroundColor: "#fff",
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
  paymentSummaryGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 12,
  },
  paymentSummaryCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: "#ecfdf5",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  paymentSummaryLabel: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#047857",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  paymentSummaryNumber: {
    fontSize: 19,
    fontWeight: "800" as const,
    color: "#064e3b",
  },
  paymentPanel: {
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
  paymentPanelHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  paymentPanelTitle: {
    fontSize: 17,
    fontWeight: "800" as const,
    color: "#111827",
  },
  paymentPanelHint: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 19,
    marginTop: 2,
  },
  paymentFormGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
  },
  paymentInput: {
    flex: 1,
    minWidth: 160,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fff",
  },
  paymentTextArea: {
    minHeight: 78,
    textAlignVertical: "top" as const,
  },
  paymentSegment: {
    flex: 1,
    minWidth: 190,
    flexDirection: "row" as const,
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 4,
  },
  paymentSegmentButton: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 10,
    borderRadius: 8,
  },
  paymentSegmentButtonActive: {
    backgroundColor: "#fff",
  },
  paymentSegmentText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#6b7280",
  },
  paymentSegmentTextActive: {
    color: "#10b981",
  },
  paymentDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 21,
  },
  paymentStatsRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  paymentStat: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#047857",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  paymentStatusRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    alignItems: "center" as const,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    paddingTop: 12,
  },
  paymentStatusName: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: "#111827",
  },
  paymentStatusMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  paymentActionGroup: {
    flexDirection: "row" as const,
    gap: 8,
  },
  paymentMiniButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  paymentMiniButtonActive: {
    backgroundColor: "#10b981",
  },
  paymentMiniButtonMuted: {
    backgroundColor: "#fee2e2",
  },
  paymentMiniButtonText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#374151",
  },
  paymentMiniButtonTextActive: {
    color: "#fff",
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
  magazinePreviewButton: {
    backgroundColor: "#2563eb",
    marginTop: 8,
  },
  magazinePreviewModalContent: {
    maxHeight: "88%",
  },
  magazinePreviewImage: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    marginBottom: 14,
    backgroundColor: "#e5e7eb",
  },
  magazinePreviewMeta: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600" as const,
    marginBottom: 8,
  },
  magazinePreviewTitle: {
    fontSize: 20,
    color: "#111827",
    fontWeight: "800" as const,
    lineHeight: 26,
    marginBottom: 10,
  },
  magazinePreviewPitch: {
    fontSize: 14,
    color: "#4b5563",
    fontWeight: "700" as const,
    lineHeight: 20,
    marginBottom: 12,
  },
  magazinePreviewBody: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 23,
    marginBottom: 16,
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
