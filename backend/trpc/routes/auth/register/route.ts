import { z } from "zod";
import { publicProcedure } from "../../../create-context";

function resolveDob(value: string): string | null {
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
      firstName: z.string().min(1),
      otherNames: z.string().min(1),
      username: z.string().min(1),
      sex: z.string().min(1),
      dob: z.string().trim().min(1),
      residence: z.string().min(1),
      country: z.string().trim().min(1),
      hasDisability: z.boolean().optional().default(false),
      paraUsesEquipment: z.boolean().optional().default(false),
      paraEquipmentType: z.enum(["wheelchair", "handcycle", "prosthetic_blades", "other"]).nullable().optional(),
      paraEquipmentOther: z.string().trim().max(120).nullable().optional(),
      doesIndoorWorkouts: z.boolean().optional().default(false),
      hasSmartWatch: z.boolean().optional().default(false),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const cleanUsername = input.username.trim().toLowerCase();

    const { data: existingUser } = await ctx.supabase
      .from("registrations")
      .select("username")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (existingUser) {
      throw new Error("Username already exists");
    }

    const formattedDob = resolveDob(input.dob);

    if (!formattedDob || !isAtLeastEightYearsOld(formattedDob)) {
      throw new Error("RunNation registration is available for users aged 8 years and above.");
    }

    if (input.hasDisability && input.paraUsesEquipment && !input.paraEquipmentType) {
      throw new Error("Please choose the para equipment you use.");
    }

    const { data, error } = await ctx.supabase
      .from("registrations")
      .insert({
        first_name: input.firstName,
        other_names: input.otherNames,
        username: cleanUsername,
        sex: input.sex,
        dob: formattedDob,
        city_town_district: input.residence,
        country: input.country,
        has_disability: input.hasDisability,
        para_uses_equipment: input.hasDisability && input.paraUsesEquipment,
        para_equipment_type: input.hasDisability && input.paraUsesEquipment ? input.paraEquipmentType ?? null : null,
        para_equipment_other:
          input.hasDisability && input.paraUsesEquipment && input.paraEquipmentType === "other"
            ? input.paraEquipmentOther?.trim() || null
            : null,
        does_indoor_workouts: input.doesIndoorWorkouts,
        has_smart_watch: input.hasSmartWatch,
      })
      .select("registration_id, username, created_at")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        throw new Error("Username already exists");
      }
      throw new Error(error?.message || "Failed to create account");
    }

    return {
      id: data.registration_id,
      username: data.username,
      createdAt: data.created_at || new Date().toISOString(),
    };
  });
