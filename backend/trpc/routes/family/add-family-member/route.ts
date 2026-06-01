import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

function normalizeFamilyCode(value: string) {
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("RN") ? `RN-${cleaned.slice(2)}` : `RN-${cleaned}`;
}

function isMissingFamilyCodeColumn(error: any) {
  const message = String(error?.message || "");
  return error?.code === "42703" || error?.code === "PGRST204" || message.includes("family_code");
}

async function resolveRegistrationId(ctx: any, registrationId: string) {
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("registration_id")
    .eq("profile_id", registrationId)
    .maybeSingle();
  return profile?.registration_id ?? registrationId;
}

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      familyCode: z.string().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    const ownerRegistrationId = await resolveRegistrationId(ctx, input.registrationId);

    const familyCode = normalizeFamilyCode(input.familyCode);
    if (!familyCode || familyCode.length < 5) {
      throw new Error("Enter the RunNation Family Code for this Family slot.");
    }

    const { count, error: countError } = await ctx.supabase
      .from("family_members")
      .select("family_member_id", { count: "exact", head: true })
      .eq("owner_registration_id", ownerRegistrationId);

    if (countError) {
      throw new Error(countError.message || "Could not check family size.");
    }

    if ((count ?? 0) >= 5) {
      throw new Error("You can add up to 5 family members.");
    }

    const { data: registrationByFamilyCode, error: registrationError } = await ctx.supabase
      .from("registrations")
      .select("registration_id, username")
      .eq("family_code", familyCode)
      .maybeSingle();

    if (registrationError) {
      if (isMissingFamilyCodeColumn(registrationError)) {
        throw new Error("Family Code is not ready yet. Please ask an admin to apply the Family Code database migration.");
      }
      throw new Error(registrationError.message || "Could not verify this Family Code.");
    }

    const memberRegistrationId = registrationByFamilyCode?.registration_id ?? null;

    if (!memberRegistrationId) {
      throw new Error("No registered RunNation user was found with that Family Code.");
    }

    if (memberRegistrationId === ownerRegistrationId) {
      throw new Error("You are already included in your Family group.");
    }

    const { data, error } = await ctx.supabase
      .from("family_members")
      .insert({
        owner_registration_id: ownerRegistrationId,
        member_registration_id: memberRegistrationId,
        member_username: registrationByFamilyCode?.username ?? null,
        member_email: null,
      })
      .select("family_member_id")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("This person is already in your Family group.");
      }
      throw new Error(error.message || "Could not add this family member.");
    }

    return { success: true, familyMemberId: data.family_member_id };
  });
