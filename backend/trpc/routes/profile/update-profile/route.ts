import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

function normalizeDob(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function isAtLeastEightYearsOld(value: string): boolean {
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return false;
  const minimumDate = new Date();
  minimumDate.setFullYear(minimumDate.getFullYear() - 8);
  return dob <= minimumDate;
}

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
        travel_country: z.string().nullable().optional(),
        travel_country_code: z.string().nullable().optional(),
        travel_start_date: z.string().nullable().optional(),
        travel_end_date: z.string().nullable().optional(),
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

    const registration = { ...input.registration };
    if (Object.keys(registration).length === 0 && Object.keys(input.contact).length === 0) {
      return { success: true };
    }

    if (registration.dob !== undefined && !String(registration.dob || "").trim()) {
      throw new Error("Date of birth is required.");
    }
    if (registration.dob) {
      registration.dob = normalizeDob(registration.dob);
      if (!isAtLeastEightYearsOld(registration.dob)) {
        throw new Error("RunNation registration is available for users aged 8 years and above.");
      }
    }
    if (registration.country !== undefined && !String(registration.country || "").trim()) {
      throw new Error("Nationality is required.");
    }

    if (registration.travel_start_date || registration.travel_end_date) {
      const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (
        !registration.travel_start_date ||
        !registration.travel_end_date ||
        !isoDatePattern.test(registration.travel_start_date) ||
        !isoDatePattern.test(registration.travel_end_date)
      ) {
        throw new Error("Travel dates must be in YYYY-MM-DD format.");
      }
      if (registration.travel_end_date < registration.travel_start_date) {
        throw new Error("Travel end date cannot be before travel start date.");
      }
    }

    if (Object.keys(registration).length > 0) {
      const { error: regError } = await ctx.supabase
        .from("registrations")
        .update(registration)
        .eq("registration_id", input.registrationId);

      if (regError) {
        throw new Error(regError.message || "Failed to update profile");
      }
    }

    if (Object.keys(input.contact).length === 0) {
      return { success: true };
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
