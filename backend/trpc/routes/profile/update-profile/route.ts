import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      registration: z.object({
        first_name: z.string().nullable().optional(),
        other_names: z.string().nullable().optional(),
        username: z.string().nullable().optional(),
        sex: z.string().nullable().optional(),
        dob: z.string().nullable().optional(),
        city_town_district: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
      }),
      contact: z.object({
        email: z.string().nullable().optional(),
        country_code: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
      }),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { error: regError } = await ctx.supabase
      .from("registrations")
      .update(input.registration)
      .eq("registration_id", input.registrationId);

    if (regError) {
      throw new Error(regError.message || "Failed to update profile");
    }

    const fullPhone = input.contact.phone?.trim() || null;
    const digits = fullPhone ? fullPhone.replace(/\D/g, "") : "";
    const phoneValue = digits ? parseInt(digits, 10) : null;

    const { data: existingContact } = await ctx.supabase
      .from("contacts")
      .select("contact_id")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (existingContact) {
      const { error } = await ctx.supabase
        .from("contacts")
        .update({
          email: input.contact.email ?? null,
          country_code: input.contact.country_code ?? null,
          phone: phoneValue,
          full_phone: fullPhone,
        })
        .eq("registration_id", input.registrationId);

      if (error) {
        throw new Error(error.message || "Failed to update contacts");
      }
    } else {
      const { error } = await ctx.supabase.from("contacts").insert({
        registration_id: input.registrationId,
        email: input.contact.email ?? null,
        country_code: input.contact.country_code ?? null,
        phone: phoneValue,
        full_phone: fullPhone,
      });

      if (error) {
        throw new Error(error.message || "Failed to create contacts");
      }
    }

    return { success: true };
  });
