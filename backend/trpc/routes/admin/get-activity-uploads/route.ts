import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  try {
    console.log("[Admin] Fetching activity uploads...");

    const { data, error } = await ctx.supabase
      .from("activity_uploads_admin_log")
      .select(`
        upload_id,
        registration_id,
        file_name,
        uploaded_at,
        registrations!activity_uploads_admin_log_registration_id_fkey (
          first_name,
          other_names,
          email
        )
      `)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("[Admin] Error fetching activity uploads:", error);
      throw new Error(`Failed to fetch activity uploads: ${error.message}`);
    }

    console.log("[Admin] Activity uploads fetched:", data?.length || 0);

    const formattedData = data?.map((upload: any) => ({
      id: upload.upload_id,
      registrationId: upload.registration_id,
      fileName: upload.file_name,
      uploadedAt: upload.uploaded_at,
      userName: upload["registrations"]
        ? `${upload["registrations"].first_name || ""} ${upload["registrations"].other_names || ""}`.trim()
        : "Unknown",
      email: upload["registrations"]?.email || "N/A",
    })) || [];

    return formattedData;
  } catch (error: any) {
    console.error("[Admin] Unexpected error:", error);
    throw new Error(error.message || "Failed to fetch activity uploads");
  }
});
