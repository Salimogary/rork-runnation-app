import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

export default publicProcedure.query(async ({ ctx }) => {
  await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
  });

  const { data, error } = await ctx.supabase
    .from("orders_to_deliver")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching delivery orders:", error);
    throw new Error(error.message || "Failed to fetch delivery orders");
  }

  const orders = data || [];
  const userIds = Array.from(
    new Set(orders.map((order: any) => order.user_id).filter(Boolean))
  );

  if (userIds.length === 0) {
    return orders;
  }

  const { data: profiles, error: profilesError } = await ctx.supabase
    .from("profiles")
    .select("profile_id, registration_id, display_name, username")
    .in("profile_id", userIds);

  if (profilesError) {
    console.warn("[Admin] Could not enrich delivery orders with profiles:", profilesError.message);
    return orders;
  }

  const registrationIds = Array.from(
    new Set((profiles || []).map((profile: any) => profile.registration_id).filter(Boolean))
  );
  const { data: registrations, error: registrationsError } = registrationIds.length > 0
    ? await ctx.supabase
        .from("registrations")
        .select("registration_id, first_name, other_names, username")
        .in("registration_id", registrationIds)
    : { data: [], error: null };

  if (registrationsError) {
    console.warn("[Admin] Could not enrich delivery orders with registrations:", registrationsError.message);
  }

  const profileByUserId = new Map((profiles || []).map((profile: any) => [profile.profile_id, profile]));
  const registrationById = new Map((registrations || []).map((registration: any) => [registration.registration_id, registration]));

  return orders.map((order: any) => {
    const profile = profileByUserId.get(order.user_id);
    const registration = profile?.registration_id ? registrationById.get(profile.registration_id) : null;
    const registrationName = registration
      ? [registration.first_name, registration.other_names].filter(Boolean).join(" ").trim()
      : "";
    return {
      ...order,
      customer_name:
        registrationName ||
        profile?.display_name ||
        registration?.username ||
        profile?.username ||
        "Unknown customer",
    };
  });
});

