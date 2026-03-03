import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  try {
    const { data: uploads, error } = await ctx.supabase
      .from("activity_uploads_admin_log")
      .select(`
        RegistrationID,
        file_name,
        file_path,
        file_size,
        mime_type,
        uploaded_at
      `)
      .order("uploaded_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Failed to fetch activity uploads");
    }

    const { data: registrations, error: regError } = await ctx.supabase
      .from("registrations")
      .select('RegistrationID, "First Name", "Other Names", Email, Username');

    if (regError) {
      throw new Error(regError.message || "Failed to fetch user data");
    }

    const regMap = new Map(
      registrations?.map((r) => [
        r.RegistrationID,
        {
          firstName: r["First Name"] || "",
          otherNames: r["Other Names"] || "",
          email: r.Email || "",
          username: r.Username || "",
        },
      ])
    );

    const result = uploads?.map((upload) => {
      const user = regMap.get(upload.RegistrationID);
      return {
        registrationId: upload.RegistrationID,
        fileName: upload.file_name,
        filePath: upload.file_path,
        fileSize: upload.file_size,
        mimeType: upload.mime_type,
        uploadedAt: upload.uploaded_at,
        userName: user
          ? `${user.firstName} ${user.otherNames}`.trim() || user.username
          : "Unknown User",
        email: user?.email || "N/A",
      };
    });

    return result || [];
  } catch (error: any) {
    console.error("[Get Activity Uploads] Error:", error);
    throw new Error(error.message || "Failed to fetch activity uploads");
  }
});
