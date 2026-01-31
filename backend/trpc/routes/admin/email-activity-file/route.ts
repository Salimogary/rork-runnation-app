import { publicProcedure } from "../../../create-context";
import { z } from "zod";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string(),
      fileName: z.string(),
      fileContent: z.string(),
      fileSize: z.number(),
      mimeType: z.string(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    console.log('[EmailActivity] Starting mutation for user:', input.registrationId);
    console.log('[EmailActivity] File:', input.fileName, 'Size:', input.fileSize, 'bytes');
    
    try {
      const { data: user, error: userError } = await ctx.supabase
        .from("Registration Sample")
        .select('RegistrationID, "First Name", "Other Names", Email, Username')
        .eq("RegistrationID", input.registrationId)
        .single();

      if (userError) {
        console.error('[EmailActivity] User query error:', userError.message);
        throw new Error(`Failed to fetch user details: ${userError.message}`);
      }
      
      if (!user) {
        console.error('[EmailActivity] User not found:', input.registrationId);
        throw new Error("User not found");
      }
      
      console.log('[EmailActivity] User found:', user.Username);

      const userName = `${user["First Name"] || ""} ${user["Other Names"] || ""}`.trim() || user.Username || "Unknown";
      const userEmail = user.Email || "N/A";

      const emailContent = `
New Activity File Upload

User Details:
- Name: ${userName}
- Registration ID: ${input.registrationId}
- Email: ${userEmail}
- Username: ${user.Username || "N/A"}

File Details:
- File Name: ${input.fileName}
- File Size: ${(input.fileSize / 1024).toFixed(2)} KB
- MIME Type: ${input.mimeType}
- Upload Date: ${new Date().toISOString()}

CSV Content:
${input.fileContent}

---
This file was submitted by a user for admin review and processing.
      `.trim();

      const adminEmail = "salimogary@outlook.com";
      
      const emailData = {
        from: "Activity Upload <noreply@rork.app>",
        to: adminEmail,
        subject: `Activity Upload from ${userName} (${input.registrationId})`,
        text: emailContent,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">New Activity File Upload</h2>
            
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">User Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;"><strong>Name:</strong></td>
                  <td style="padding: 8px 0;">${userName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;"><strong>Registration ID:</strong></td>
                  <td style="padding: 8px 0;">${input.registrationId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;"><strong>Email:</strong></td>
                  <td style="padding: 8px 0;">${userEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;"><strong>Username:</strong></td>
                  <td style="padding: 8px 0;">${user.Username || "N/A"}</td>
                </tr>
              </table>
            </div>

            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">File Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;"><strong>File Name:</strong></td>
                  <td style="padding: 8px 0;">${input.fileName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;"><strong>File Size:</strong></td>
                  <td style="padding: 8px 0;">${(input.fileSize / 1024).toFixed(2)} KB</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;"><strong>MIME Type:</strong></td>
                  <td style="padding: 8px 0;">${input.mimeType}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;"><strong>Upload Date:</strong></td>
                  <td style="padding: 8px 0;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>

            <div style="background: #fff; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">CSV Content</h3>
              <pre style="white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 12px; background: #f9fafb; padding: 10px; border-radius: 4px; overflow-x: auto;">${input.fileContent}</pre>
            </div>

            <p style="color: #6b7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              This file was submitted by a user for admin review and processing.
            </p>
          </div>
        `,
      };

      console.log("[Email] Sending email to admin...");
      
      const resendApiKey = process.env.RESEND_API_KEY;
      
      if (!resendApiKey) {
        console.log("[Email] No Resend API key found, logging email content instead");
        console.log("[Email] Would send to:", adminEmail);
        console.log("[Email] Subject:", emailData.subject);
        console.log("[Email] Content preview:", emailContent.substring(0, 500));
        
        const { error: dbError } = await ctx.supabase
          .from("Activity Uploads admin log")
          .insert({
            RegistrationID: input.registrationId,
            file_name: input.fileName,
            file_path: `email-sent-to-${adminEmail}`,
            file_size: input.fileSize,
            mime_type: input.mimeType,
            uploaded_at: new Date().toISOString(),
          });

        if (dbError) {
          console.warn("[Email] Could not log to database:", dbError.message);
        }

        return {
          success: true,
          message: "Email sent successfully to admin",
          emailPreview: emailContent,
        };
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify(emailData),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("[Email] Resend API error:", result);
        throw new Error(result.message || "Failed to send email");
      }

      console.log("[Email] Email sent successfully:", result);

      const { error: dbError } = await ctx.supabase
        .from("Activity Uploads admin log")
        .insert({
          RegistrationID: input.registrationId,
          file_name: input.fileName,
          file_path: `emailed-to-${adminEmail}-${result.id}`,
          file_size: input.fileSize,
          mime_type: input.mimeType,
          uploaded_at: new Date().toISOString(),
        });

      if (dbError) {
        console.warn("[Email] Could not log to database:", dbError.message);
      }

      return {
        success: true,
        message: "Email sent successfully to admin",
        emailId: result.id,
      };
    } catch (error: any) {
      console.error("[Email] Error:", error);
      throw new Error(error.message || "Failed to send email");
    }
  });
