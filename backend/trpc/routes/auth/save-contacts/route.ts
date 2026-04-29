import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      countryCode: z.string().nullable().optional(),
      phone: z.string().min(1),
      email: z.string().email(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const fullPhone = input.phone.trim();
    const digits = fullPhone.replace(/\D/g, "");
    const phoneNumber = digits ? parseInt(digits, 10) : null;

    const { data: existingContact, error: lookupError } = await ctx.supabase
      .from("contacts")
      .select("contact_id")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (lookupError) {
      throw new Error(lookupError.message || "Failed to check contact information");
    }

    const payload = {
      registration_id: input.registrationId,
      country_code: input.countryCode?.trim() || null,
      phone: phoneNumber,
      full_phone: fullPhone,
      email: input.email.trim(),
    };

    if (existingContact?.contact_id) {
      const { error } = await ctx.supabase
        .from("contacts")
        .update({
          country_code: payload.country_code,
          phone: payload.phone,
          full_phone: payload.full_phone,
          email: payload.email,
        })
        .eq("registration_id", input.registrationId);

      if (error) {
        throw new Error(error.message || "Failed to update contact information");
      }
    } else {
      const { error } = await ctx.supabase.from("contacts").insert(payload);

      if (error) {
        throw new Error(error.message || "Failed to save contact information");
      }
    }

    return { success: true };
  });
