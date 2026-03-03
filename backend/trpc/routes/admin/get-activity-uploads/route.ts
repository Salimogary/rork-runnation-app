import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  try {
    console.log("[Admin] Fetching activity uploads...");

    const { data, error } = await ctx.supabase
      .from("activity_uploads_admin_log")
      .select(`
        id,
        RegistrationID,
        file_name,
        file_content,
        mime_type,
        uploaded_at,
        registrations!activity_uploads_admin_log_RegistrationID_fkey (
          "First Name",
          "Other Names",
          Email
        )
      `)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("[Admin] Error fetching activity uploads:", error);
      throw new Error(`Failed to fetch activity uploads: ${error.message}`);
    }

    console.log("[Admin] Activity uploads fetched:", data?.length || 0);

    const formattedData = data?.map((upload: any) => ({
      id: upload.id,
      registrationId: upload.RegistrationID,
      fileName: upload.file_name,
      fileContent: upload.file_content,
      mimeType: upload.mime_type,
      uploadedAt: upload.uploaded_at,
      userName: upload["registrations"]
        ? `${upload["registrations"]["First Name"] || ""} ${upload["registrations"]["Other Names"] || ""}`.trim()
        : "Unknown",
      email: upload["registrations"]?.Email || "N/A",
    })) || [];

    return formattedData;
  } catch (error: any) {
    console.error("[Admin] Unexpected error:", error);
    throw new Error(error.message || "Failed to fetch activity uploads");
  }
});
