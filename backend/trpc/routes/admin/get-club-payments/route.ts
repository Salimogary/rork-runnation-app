import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

function normalizeClubName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("does not exist") || message.includes("schema cache") || message.includes("relation");
}

function memberName(registration: any): string {
  return [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim() || registration?.username || "Unknown member";
}

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
  });

  const coordinatorClubIds = actor.roles
    .filter((role) => role.roleName === "club_coordinator" && role.clubId)
    .map((role) => role.clubId as string);
  const countryCodes = actor.roles
    .filter((role) => (role.roleName === "country_admin" || role.roleName === "country_coordinator") && role.countryCode)
    .map((role) => role.countryCode as string);

  let clubsQuery = ctx.supabase
    .from("clubs")
    .select("club_id, club_name, country, coordinator_id")
    .order("club_name", { ascending: true });

  if (!actor.isSuperAdmin) {
    if (coordinatorClubIds.length > 0) {
      clubsQuery = clubsQuery.in("club_id", coordinatorClubIds);
    } else if (countryCodes.length > 0) {
      clubsQuery = clubsQuery.in("country", countryCodes);
    } else {
      return { clubs: [], paymentItems: [], withdrawals: [], summary: { collected: 0, requested: 0, available: 0 } };
    }
  }

  const { data: clubs, error: clubsError } = await clubsQuery;

  if (clubsError) {
    throw new Error(clubsError.message || "Could not load clubs.");
  }

  const visibleClubs = clubs ?? [];
  const clubIds = visibleClubs.map((club: any) => club.club_id).filter(Boolean);
  const coordinatorIds = visibleClubs.map((club: any) => club.coordinator_id).filter(Boolean);
  const clubById = new Map(visibleClubs.map((club: any) => [club.club_id, club]));
  const clubByName = new Map(visibleClubs.map((club: any) => [normalizeClubName(club.club_name), club]));
  const membersByClubId = new Map<string, Set<string>>();

  for (const clubId of clubIds) {
    membersByClubId.set(clubId, new Set());
  }

  if (coordinatorIds.length > 0) {
    const { data: memberRows, error: memberError } = await ctx.supabase
      .from("club_members")
      .select("registration_id, coordinator_id")
      .in("coordinator_id", coordinatorIds);

    if (memberError && !isMissingSchemaError(memberError)) {
      throw new Error(memberError.message || "Could not load club members.");
    }

    for (const row of memberRows ?? []) {
      const club = visibleClubs.find((item: any) => item.coordinator_id === row.coordinator_id);
      if (club?.club_id && row.registration_id) {
        membersByClubId.get(club.club_id)?.add(row.registration_id);
      }
    }
  }

  const { data: approvedRequests } = await ctx.supabase
    .from("club_membership_request")
    .select("registration_id, club_id, club, status")
    .eq("status", "approved");

  for (const request of approvedRequests ?? []) {
    const club = request.club_id ? clubById.get(request.club_id) : clubByName.get(normalizeClubName(request.club));
    if (club?.club_id && request.registration_id) {
      membersByClubId.get(club.club_id)?.add(request.registration_id);
    }
  }

  const allRegistrationIds = [...new Set([...membersByClubId.values()].flatMap((set) => [...set]))];
  const { data: registrations, error: registrationsError } = allRegistrationIds.length > 0
    ? await ctx.supabase
        .from("registrations")
        .select("registration_id, first_name, other_names, username, sex, country")
        .in("registration_id", allRegistrationIds)
    : { data: [], error: null };

  if (registrationsError) {
    throw new Error(registrationsError.message || "Could not load member profiles.");
  }

  const registrationMap = new Map((registrations ?? []).map((registration: any) => [registration.registration_id, registration]));

  const { data: paymentRows, error: paymentsError } = clubIds.length > 0
    ? await ctx.supabase
        .from("club_payment_items")
        .select("*")
        .in("club_id", clubIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (paymentsError) {
    if (isMissingSchemaError(paymentsError)) {
      return {
        clubs: visibleClubs.map((club: any) => ({ clubId: club.club_id, clubName: club.club_name, country: club.country ?? null })),
        paymentItems: [],
        withdrawals: [],
        summary: { collected: 0, requested: 0, available: 0 },
      };
    }
    throw new Error(paymentsError.message || "Could not load club payments.");
  }

  const paymentIds = (paymentRows ?? []).map((payment: any) => payment.payment_id);
  const { data: recordRows, error: recordsError } = paymentIds.length > 0
    ? await ctx.supabase
        .from("club_payment_records")
        .select("*")
        .in("payment_id", paymentIds)
    : { data: [], error: null };

  if (recordsError) {
    throw new Error(recordsError.message || "Could not load payment records.");
  }

  const recordsByPaymentId = new Map<string, any[]>();
  for (const record of recordRows ?? []) {
    const list = recordsByPaymentId.get(record.payment_id) ?? [];
    list.push(record);
    recordsByPaymentId.set(record.payment_id, list);
  }

  const { data: withdrawalRows, error: withdrawalsError } = clubIds.length > 0
    ? await ctx.supabase
        .from("club_collection_withdrawal_requests")
        .select("*")
        .in("club_id", clubIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (withdrawalsError) {
    throw new Error(withdrawalsError.message || "Could not load withdrawal requests.");
  }

  let collected = 0;

  const paymentItems = (paymentRows ?? []).map((payment: any) => {
    const memberIds = [...(membersByClubId.get(payment.club_id) ?? new Set<string>())];
    const paymentRecords = recordsByPaymentId.get(payment.payment_id) ?? [];
    const recordMap = new Map(paymentRecords.map((record: any) => [record.registration_id, record]));
    const rowRegistrationIds = [...new Set([...memberIds, ...paymentRecords.map((record: any) => record.registration_id)])];
    const memberRows = rowRegistrationIds.map((registrationId) => {
      const record = recordMap.get(registrationId);
      const registration = registrationMap.get(registrationId);
      const amountPaid = Number(record?.amount_paid ?? 0);
      if (record?.status === "paid") collected += amountPaid;
      return {
        registrationId,
        name: memberName(registration),
        username: registration?.username ?? null,
        sex: registration?.sex ?? null,
        status: record?.status ?? "unpaid",
        amountPaid,
        paidAt: record?.paid_at ?? null,
        notes: record?.notes ?? null,
      };
    });

    const paidCount = memberRows.filter((member) => member.status === "paid").length;
    const unpaidCount = memberRows.filter((member) => member.status === "unpaid").length;
    const pendingCount = memberRows.filter((member) => member.status === "pending").length;
    const waivedCount = memberRows.filter((member) => member.status === "waived").length;

    return {
      paymentId: payment.payment_id,
      clubId: payment.club_id,
      clubName: clubById.get(payment.club_id)?.club_name ?? "Club",
      title: payment.title,
      description: payment.description ?? null,
      amount: Number(payment.amount ?? 0),
      currency: payment.currency ?? "UGX",
      dueDate: payment.due_date ?? null,
      isActive: payment.is_active !== false,
      createdAt: payment.created_at,
      members: memberRows,
      totals: {
        members: memberRows.length,
        paid: paidCount,
        unpaid: unpaidCount,
        pending: pendingCount,
        waived: waivedCount,
        collected: memberRows.reduce((sum, member) => sum + (member.status === "paid" ? Number(member.amountPaid || 0) : 0), 0),
      },
    };
  });

  const requested = (withdrawalRows ?? [])
    .filter((request: any) => request.status !== "rejected")
    .reduce((sum: number, request: any) => sum + Number(request.amount ?? 0), 0);

  return {
    clubs: visibleClubs.map((club: any) => ({
      clubId: club.club_id,
      clubName: club.club_name,
      country: club.country ?? null,
    })),
    paymentItems,
    withdrawals: (withdrawalRows ?? []).map((request: any) => ({
      requestId: request.request_id,
      clubId: request.club_id,
      clubName: clubById.get(request.club_id)?.club_name ?? "Club",
      amount: Number(request.amount ?? 0),
      currency: request.currency ?? "UGX",
      destinationType: request.destination_type,
      destinationDetails: request.destination_details,
      status: request.status,
      createdAt: request.created_at,
    })),
    summary: {
      collected,
      requested,
      available: Math.max(collected - requested, 0),
    },
  };
});

