import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

async function resolveRegistrationId(ctx: any, registrationId: string) {
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("registration_id")
    .eq("profile_id", registrationId)
    .maybeSingle();
  return profile?.registration_id ?? registrationId;
}

function isMissingFamilyCodeColumn(error: any) {
  const message = String(error?.message || "");
  return error?.code === "42703" || error?.code === "PGRST204" || message.includes("family_code");
}

export default publicProcedure
  .input(z.object({ registrationId: z.string().min(1) }))
  .query(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    const ownerRegistrationId = await resolveRegistrationId(ctx, input.registrationId);

    const { data: owner, error: ownerError } = await ctx.supabase
      .from("registrations")
      .select("family_code")
      .eq("registration_id", ownerRegistrationId)
      .maybeSingle();

    const familyCodeColumnReady = !ownerError;
    if (ownerError && !isMissingFamilyCodeColumn(ownerError)) {
      throw new Error(ownerError.message || "Could not load your Family Code.");
    }

    const { data: memberships, error } = await ctx.supabase
      .from("family_members")
      .select("family_member_id, member_registration_id, member_username, member_email, created_at")
      .eq("owner_registration_id", ownerRegistrationId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "Could not load family members.");
    }

    const memberIds = (memberships || []).map((row: any) => row.member_registration_id).filter(Boolean);
    const registrationSelect = familyCodeColumnReady
      ? "registration_id, first_name, other_names, username, family_code, country, sex"
      : "registration_id, first_name, other_names, username, country, sex";
    const { data: registrations, error: registrationError } = memberIds.length
      ? await ctx.supabase
          .from("registrations")
          .select(registrationSelect)
          .in("registration_id", memberIds)
      : { data: [], error: null };

    if (registrationError) {
      throw new Error(registrationError.message || "Could not load family profiles.");
    }

    const profileMap = new Map((registrations || []).map((row: any) => [row.registration_id, row]));

    const members = (memberships || []).map((row: any) => {
      const profile = profileMap.get(row.member_registration_id) || {};
      return {
        familyMemberId: row.family_member_id,
        registrationId: row.member_registration_id,
        username: row.member_username || profile.username || "",
        familyCode: profile.family_code || "",
        name: [profile.first_name, profile.other_names].filter(Boolean).join(" ").trim() || profile.username || row.member_username || "Family member",
        country: profile.country || "-",
        sex: profile.sex || "-",
        createdAt: row.created_at,
      };
    });

    return {
      familyCode: owner?.family_code ?? null,
      familyCodeReady: familyCodeColumnReady,
      members,
    };
  });
