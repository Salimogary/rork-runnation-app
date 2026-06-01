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

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      familyMemberId: z.string().uuid(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    const ownerRegistrationId = await resolveRegistrationId(ctx, input.registrationId);

    const { error } = await ctx.supabase
      .from("family_members")
      .delete()
      .eq("family_member_id", input.familyMemberId)
      .eq("owner_registration_id", ownerRegistrationId);

    if (error) {
      throw new Error(error.message || "Could not remove this family member.");
    }

    return { success: true };
  });
