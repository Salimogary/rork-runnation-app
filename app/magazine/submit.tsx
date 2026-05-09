import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { FileText, Link as LinkIcon, Paperclip, Send, X } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getServerClient } from "@/lib/server-client";

const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

export default function MagazineSubmitScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { registrationId, user } = useAuth();
  const [authorName, setAuthorName] = useState(user?.username ?? "");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Community");
  const [pitch, setPitch] = useState("");
  const [body, setBody] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [attachment, setAttachment] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const bodyWordCount = useMemo(() => countWords(body), [body]);
  const bodyWordTarget = category === "Columns" ? { min: 250, max: 300 } : { min: 150, max: 250 };
  const isBodyWordCountValid = bodyWordCount >= bodyWordTarget.min && bodyWordCount <= bodyWordTarget.max;

  const canSubmit = useMemo(
    () =>
      registrationId &&
      authorName.trim().length >= 2 &&
      email.includes("@") &&
      title.trim().length >= 6 &&
      pitch.trim().length >= 20 &&
      isBodyWordCountValid,
    [authorName, email, isBodyWordCountValid, pitch, registrationId, title]
  );

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert(
        "Almost there",
        category === "Columns"
          ? "Please complete all fields. Column body should be between 250 and 300 words."
          : "Please complete all fields. Article body should be between 150 and 250 words."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const attachmentBase64 = attachment
        ? await FileSystem.readAsStringAsync(attachment.uri, { encoding: "base64" })
        : null;

      await getServerClient().magazine.submitArticle.mutate({
        registrationId,
        authorName,
        email,
        title,
        category,
        pitch,
        body,
        externalLink: externalLink.trim() || null,
        attachmentBase64,
        attachmentName: attachment?.name ?? null,
        attachmentType: attachment?.mimeType ?? null,
      });

      Alert.alert(
        "Story Submitted",
        "Thank you. Your article has been sent to the RunNation admin portal for review.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert("Submission Failed", error instanceof Error ? error.message : "Could not submit your article right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const pickAttachment = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/plain"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (!result.canceled && result.assets[0]) {
      setAttachment(result.assets[0]);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Submit Story" }} />
      <Text style={[styles.title, { color: colors.text }]}>Submit to RunNation Magazine</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Share a club story, runner spotlight, wellness lesson, route note, or event idea. Admins review submissions before publishing.
      </Text>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Author name</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.cardBackground, color: colors.text, borderColor: colors.border }]} value={authorName} onChangeText={setAuthorName} placeholder="Your name" placeholderTextColor={colors.textLight} />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Email</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.cardBackground, color: colors.text, borderColor: colors.border }]} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.textLight} autoCapitalize="none" keyboardType="email-address" />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Story title</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.cardBackground, color: colors.text, borderColor: colors.border }]} value={title} onChangeText={setTitle} placeholder="A clear, inviting headline" placeholderTextColor={colors.textLight} />
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Magazine page</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {["Community", "Columns"].map((item) => {
          const active = category === item;
          return (
            <TouchableOpacity
              key={item}
              style={[styles.categoryChip, { backgroundColor: active ? colors.primary : colors.cardBackground, borderColor: active ? colors.primary : colors.border }]}
              onPress={() => setCategory(item)}
            >
              <Text style={[styles.categoryChipText, { color: active ? "#fff" : colors.text }]}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Short pitch</Text>
        <TextInput
          style={[styles.input, styles.textAreaSmall, { backgroundColor: colors.cardBackground, color: colors.text, borderColor: colors.border }]}
          value={pitch}
          onChangeText={setPitch}
          placeholder="What is the story about and why should the community read it?"
          placeholderTextColor={colors.textLight}
          multiline
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Article draft</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: colors.cardBackground, color: colors.text, borderColor: colors.border }]}
          value={body}
          onChangeText={setBody}
          placeholder="Write the story in short paragraphs. You can include headings or bullet ideas."
          placeholderTextColor={colors.textLight}
          multiline
          textAlignVertical="top"
        />
        <Text style={[styles.helperText, { color: isBodyWordCountValid ? colors.success : colors.textSecondary }]}>
          {bodyWordCount}/{bodyWordTarget.max} words. {category === "Columns" ? "Column body should be 250-300 words." : "Article body should be 150-250 words."}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>External link</Text>
        <View style={[styles.linkInputWrap, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <LinkIcon size={18} color={colors.primary} />
          <TextInput
            style={[styles.linkInput, { color: colors.text }]}
            value={externalLink}
            onChangeText={setExternalLink}
            placeholder="Writer website or social link, optional"
            placeholderTextColor={colors.textLight}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Optional plain text file</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          Save your notes as a plain text .txt file before upload. PDF, DOC, DOCX, Pages, and images are not accepted here.
        </Text>
        {attachment ? (
          <View style={[styles.attachmentCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <FileText size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.attachmentName, { color: colors.text }]} numberOfLines={1}>{attachment.name}</Text>
              <Text style={[styles.attachmentHint, { color: colors.textSecondary }]}>
                Plain text file uploaded privately for admin review
              </Text>
            </View>
            <TouchableOpacity onPress={() => setAttachment(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.attachButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={pickAttachment}>
            <Paperclip size={18} color={colors.primary} />
            <Text style={[styles.attachButtonText, { color: colors.text }]}>Add plain text .txt file</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, { backgroundColor: canSubmit ? colors.primary : colors.textLight }]}
        disabled={!canSubmit || isSubmitting}
        onPress={handleSubmit}
        activeOpacity={0.82}
      >
        <Send size={18} color="#fff" />
        <Text style={styles.submitText}>{isSubmitting ? "Submitting..." : "Submit for Review"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 22,
    paddingBottom: 42,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  field: {
    gap: 8,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
  },
  linkInputWrap: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 15,
  },
  linkInput: {
    flex: 1,
    fontSize: 15,
    minHeight: 48,
  },
  textAreaSmall: {
    minHeight: 94,
    lineHeight: 21,
  },
  textArea: {
    minHeight: 210,
    lineHeight: 22,
  },
  attachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  attachButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  attachmentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  attachmentName: {
    fontSize: 14,
    fontWeight: "800",
  },
  attachmentHint: {
    fontSize: 12,
    marginTop: 2,
  },
  categoryRow: {
    gap: 8,
    paddingVertical: 10,
    marginBottom: 10,
  },
  categoryChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 8,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
});
