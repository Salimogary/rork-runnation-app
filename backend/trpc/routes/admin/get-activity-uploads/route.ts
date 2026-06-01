import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { resolvePrivateActivityUploadUrl } from "../../../storage";

function getUploadRegistrationId(upload: any): string | null {
  return upload.registration_id || upload.RegistrationID || upload.registrationId || null;
}

export default publicProcedure.query(async ({ ctx }) => {
  try {
    await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
            allowCountryCoordinator: true,
      allowClubCoordinator: true,
    });

    const { data, error } = await ctx.supabase
      .from("activity_uploads_admin_log")
      .select("*")
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("[Admin] Error fetching activity uploads:", error);
      throw new Error(`Failed to fetch activity uploads: ${error.message}`);
    }

    const registrationIds = Array.from(
      new Set((data || []).map(getUploadRegistrationId).filter(Boolean))
    );
    const { data: registrations, error: registrationsError } = registrationIds.length > 0
      ? await ctx.supabase
          .from("registrations")
          .select("registration_id, first_name, other_names, username")
          .in("registration_id", registrationIds)
      : { data: [], error: null };

    if (registrationsError) {
      console.warn("[Admin] Could not enrich activity uploads with registrations:", registrationsError.message);
    }

    const registrationById = new Map((registrations || []).map((registration: any) => [registration.registration_id, registration]));

    const formattedData = await Promise.all(
      (data || []).map(async (upload: any) => {
        const registrationId = getUploadRegistrationId(upload);
        const registration = registrationId ? registrationById.get(registrationId) : null;
        const filePath = upload.file_path || upload.storage_path || upload.path || null;
        return {
          id: upload.upload_id || `${registrationId || "upload"}-${upload.uploaded_at || upload.file_name}`,
          registrationId,
          fileName: upload.file_name || upload.fileName || "Activity upload",
          filePath,
          downloadUrl: await resolvePrivateActivityUploadUrl(ctx.supabase, filePath),
        uploadedAt: upload.uploaded_at,
          userName: registration
            ? `${registration.first_name || ""} ${registration.other_names || ""}`.trim() ||
              registration.username ||
              registrationId
            : registrationId || "Unknown",
          email: registration?.username || registrationId || "N/A",
        };
      })
    );

    return formattedData;
  } catch (error: any) {
    console.error("[Admin] Unexpected error:", error);
    throw new Error(error.message || "Failed to fetch activity uploads");
  }
});


