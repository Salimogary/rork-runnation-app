import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Camera, MessageCircle, User as UserIcon, Trash2, Activity, Smile, BarChart3, Plus } from "lucide-react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import SubscriptionGate from "@/components/SubscriptionGate";
import { getServerClient } from "@/lib/server-client";
import { formatCountryName } from "@/constants/country-utils";

const MAX_UPLOAD_BYTES = 1.5 * 1024 * 1024;
const MAX_WEB_DIMENSION = 1600;
const MIN_WEB_COMPRESSION_QUALITY = 0.45;
const REACTION_EMOJIS = ["\u2764\uFE0F", "\uD83D\uDD25", "\uD83D\uDC4F", "\uD83D\uDE02", "\uD83D\uDCAA", "\uD83C\uDF89"];
interface Post {
  social_post_id: string;
  registration_id: string;
  photo_url?: string | null;
  caption?: string | null;
  activity_data?: {
    activity_date: string;
    exercise_type: string;
    distance_km: number;
    Time: string;
    pace_min_per_km: number;
  } | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  user_liked: boolean;
  poll?: {
    question: string;
    options: {
      label: string;
      votes: number;
    }[];
    total_votes: number;
    user_vote: number | null;
  } | null;
  reactions?: {
    emoji: string;
    count: number;
  }[];
  user_reaction?: string | null;
  user?: {
    first_name?: string;
    username?: string;
    country?: string | null;
    club_name?: string | null;
  } | null;
}

interface Comment {
  comment_id: string;
  social_post_id: string;
  registration_id: string;
  body: string;
  created_at: string;
  reactions?: {
    emoji: string;
    count: number;
  }[];
  user_reaction?: string | null;
  user?: {
    first_name?: string;
    username?: string;
  } | null;
}

type CommentReaction = {
  emoji: string;
  count: number;
};

interface ActivityStats {
  activity_date: string;
  exercise_type: string;
  distance_km: number;
  Time: string;
  pace_min_per_km: number;
}

export default function ChatScreen() {
  const { user, registrationId, roleSession } = useAuth();
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [activePostReactionId, setActivePostReactionId] = useState<string | null>(null);
  const [activeCommentReactionId, setActiveCommentReactionId] = useState<string | null>(null);
  const canModerateChat = roleSession.isSuperAdmin || roleSession.isChatRoomAdministrator;
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionA, setPollOptionA] = useState("");
  const [pollOptionB, setPollOptionB] = useState("");

  const formatPaceMinPerKm = (paceMinPerKm?: number | null) => {
    if (!paceMinPerKm || paceMinPerKm <= 0) return "N/A";
    const totalSecondsPerKm = Math.round(paceMinPerKm * 60);
    const minutes = Math.floor(totalSecondsPerKm / 60);
    const seconds = totalSecondsPerKm % 60;
    return `${minutes}'${seconds.toString().padStart(2, "0")}" /km`;
  };
  
  const emojis = ["ð", "ð", "â¤ï¸", "ð¥", "ð", "ð", "ðª", "ð", "â¡", "ð", "ð", "ð¤©", "ð", "ð¥³", "ð¯"];

  const { data: posts, isLoading, refetch } = useQuery<Post[]>({
    queryKey: ["posts", user?.id],
    queryFn: async () =>
      getServerClient().social.getPosts.query({ registrationId }),
    enabled: !!user && !!registrationId,
  });

  const { data: currentActivity } = useQuery<ActivityStats | null>({
    queryKey: ["currentActivity", registrationId],
    queryFn: async () =>
      getServerClient().social.getCurrentActivity.query({ registrationId }),
    enabled: showActivity && !!registrationId,
  });

  const { data: commentsData, isLoading: commentsLoading, refetch: refetchComments } = useQuery<Comment[]>({
    queryKey: ["comments", commentPost?.social_post_id],
    queryFn: async (): Promise<Comment[]> =>
      (await getServerClient().social.getComments.query({
        postId: commentPost?.social_post_id || "",
        registrationId: registrationId || "00000000-0000-0000-0000-000000000000",
      })) as Comment[],
    enabled: !!commentPost?.social_post_id && !!registrationId,
  });
  const comments = commentsData ?? [];

  useFocusEffect(
    useCallback(() => {
      if (!registrationId) {
        return;
      }

      void getServerClient().social.markMentionsRead
        .mutate({ registrationId })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["mentionCount", registrationId] });
        })
        .catch(() => undefined);
    }, [queryClient, registrationId])
  );

  const [pickedImage, setPickedImage] = useState<{
    uri: string;
    mimeType?: string | null;
    fileSize?: number | null;
  } | null>(null);

  const estimateBase64Bytes = (base64: string) => Math.floor((base64.length * 3) / 4);

  const compressImageForWeb = async (
    uri: string,
    mimeType?: string | null
  ): Promise<{ base64: string; mimeType: string }> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image for compression"));
        img.src = imageUrl;
      });

      const scale = Math.min(1, MAX_WEB_DIMENSION / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Failed to prepare image compression");
      }

      context.drawImage(image, 0, 0, width, height);

      const outputMimeType = mimeType?.includes("png") ? "image/png" : "image/jpeg";
      let quality = outputMimeType === "image/png" ? 0.92 : 0.82;
      let dataUrl = canvas.toDataURL(outputMimeType, quality);
      let base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;

      while (
        outputMimeType === "image/jpeg" &&
        estimateBase64Bytes(base64) > MAX_UPLOAD_BYTES &&
        quality > MIN_WEB_COMPRESSION_QUALITY
      ) {
        quality = Math.max(MIN_WEB_COMPRESSION_QUALITY, quality - 0.08);
        dataUrl = canvas.toDataURL(outputMimeType, quality);
        base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      }

      return {
        base64,
        mimeType: outputMimeType,
      };
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const encodeImageForUpload = async (
    uri: string,
    mimeType?: string | null
  ): Promise<{ base64: string; mimeType: string }> => {
    const ownerId = registrationId || user?.id;
    if (!ownerId) {
      throw new Error("Not authenticated");
    }

    const resolvedMime =
      mimeType ||
      (uri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg");

    if (Platform.OS === 'web') {
      return compressImageForWeb(uri, resolvedMime);
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    return { base64, mimeType: resolvedMime };
  };

  const createPostMutation = useMutation({
    mutationFn: async ({ 
      photoUri,
      imageMimeType,
      postCaption, 
      activityData,
      poll,
    }: { 
      photoUri: string | null;
      imageMimeType?: string | null;
      postCaption: string;
      activityData: ActivityStats | null;
      poll: { question: string; options: string[] } | null;
    }) => {
      if (!registrationId) throw new Error("Not authenticated");

      let imageBase64: string | null = null;
      let resolvedMimeType: string | null = imageMimeType ?? null;
      if (photoUri) {
        console.log("Encoding image for backend upload...");
        const payload = await encodeImageForUpload(photoUri, imageMimeType);
        imageBase64 = payload.base64;
        resolvedMimeType = payload.mimeType;
      }

      console.log("Creating post via backend...");
      return await getServerClient().social.createPost.mutate({
        registrationId,
        caption: postCaption || null,
        activityData: activityData || null,
        imageBase64,
        mimeType: resolvedMimeType,
        poll,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setCaption("");
      setPickedImage(null);
      setShowActivity(false);
      setShowPollComposer(false);
      setPollQuestion("");
      setPollOptionA("");
      setPollOptionB("");
      if (Platform.OS !== 'web') {
        Alert.alert("Success", "Post created successfully!");
      }
    },
    onError: (error: any) => {
      console.error("Upload error:", error);
      const errorMessage = error?.message || error?.error_description || "Failed to create post";
      if (Platform.OS !== 'web') {
        Alert.alert("Error", errorMessage);
      } else {
        alert("Error creating post: " + errorMessage);
      }
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
      if (!registrationId) throw new Error("Not authenticated");
      await getServerClient().social.addComment.mutate({
        registrationId,
        postId,
        body,
      });
    },
    onSuccess: async () => {
      setCommentDraft("");
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      await refetchComments();
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!registrationId) throw new Error("Not authenticated");
      await getServerClient().social.deleteComment.mutate({
        registrationId,
        commentId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      await refetchComments();
    },
  });

  const votePollMutation = useMutation({
    mutationFn: async ({ postId, optionIndex }: { postId: string; optionIndex: number }) => {
      if (!registrationId) throw new Error("Not authenticated");
      await getServerClient().social.votePoll.mutate({
        registrationId,
        postId,
        optionIndex,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const reactToPostMutation = useMutation({
    mutationFn: async ({ postId, emoji }: { postId: string; emoji: string }) => {
      if (!registrationId) throw new Error("Not authenticated");
      await getServerClient().social.togglePostReaction.mutate({
        registrationId,
        postId,
        emoji,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const reactToCommentMutation = useMutation({
    mutationFn: async ({ commentId, emoji }: { commentId: string; emoji: string }) => {
      if (!registrationId) throw new Error("Not authenticated");
      await getServerClient().social.toggleCommentReaction.mutate({
        registrationId,
        commentId,
        emoji,
      });
    },
    onSuccess: async () => {
      await refetchComments();
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!registrationId) throw new Error("Not authenticated");
      await getServerClient().social.deletePost.mutate({
        registrationId,
        postId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      if (Platform.OS !== 'web') {
        Alert.alert("Success", "Post deleted!");
      }
    },
  });

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      if (Platform.OS !== 'web') {
        Alert.alert("Permission Required", "Permission to access camera roll is required!");
      }
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPickedImage({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize ?? null,
      });
    }
  };

  const handlePost = () => {
    const trimmedPollQuestion = pollQuestion.trim();
    const pollOptions = [pollOptionA.trim(), pollOptionB.trim()].filter(Boolean);

    if (!caption.trim() && !pickedImage && !showActivity && !trimmedPollQuestion) {
      if (Platform.OS !== 'web') {
        Alert.alert("Error", "Please add text, image, activity, or a poll");
      }
      return;
    }

    if (showPollComposer && (!trimmedPollQuestion || pollOptions.length < 2)) {
      if (Platform.OS !== "web") {
        Alert.alert("Error", "Please add a poll question and two options");
      }
      return;
    }

    createPostMutation.mutate({ 
      photoUri: pickedImage?.uri ?? null,
      imageMimeType: pickedImage?.mimeType,
      postCaption: caption,
      activityData: showActivity && currentActivity ? currentActivity : null,
      poll: showPollComposer ? { question: trimmedPollQuestion, options: pollOptions } : null,
    });
  };

  const handleDeletePost = (postId: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert(
        "Delete Post",
        "Are you sure you want to delete this post?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deletePostMutation.mutate(postId) },
        ]
      );
    } else {
      if (confirm("Are you sure you want to delete this post?")) {
        deletePostMutation.mutate(postId);
      }
    }
  };

  const addEmoji = (emoji: string) => {
    setCaption(caption + emoji);
  };

  const handleCommentPress = (post: Post) => {
    setCommentPost(post);
    setCommentDraft("");
  };

  const handleAddComment = () => {
    if (!commentPost || !commentDraft.trim()) return;
    addCommentMutation.mutate({
      postId: commentPost.social_post_id,
      body: commentDraft.trim(),
    });
  };

  const handleVotePoll = (postId: string, optionIndex: number) => {
    votePollMutation.mutate({ postId, optionIndex });
  };

  const handlePostReaction = (postId: string, emoji: string) => {
    reactToPostMutation.mutate({ postId, emoji });
    setActivePostReactionId(null);
  };

  const handleCommentReaction = (commentId: string, emoji: string) => {
    reactToCommentMutation.mutate({ commentId, emoji });
    setActiveCommentReactionId(null);
  };

  const handleReplyToComment = (comment: Comment) => {
    const name = comment.user?.username || comment.user?.first_name;
    if (name) {
      setCommentDraft((current) => current || `@${name} `);
    }
  };

  const formatPostTimestamp = (value: string) =>
    new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  if (!isSubscribed) {
    return (
      <SubscriptionGate featureName="Chat">
        <></>
      </SubscriptionGate>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.uploadSection, { backgroundColor: themeColors.cardBackground }]}>
        {pickedImage && (
          <View style={styles.selectedImageContainer}>
            <Image
              source={{ uri: pickedImage.uri }}
              style={styles.selectedImage}
              contentFit="cover"
            />
            {showActivity && currentActivity ? (
              <View style={styles.activityImageOverlay}>
                <View style={styles.activityOverlayStat}>
                  <Text style={styles.activityOverlayLabel}>TYPE</Text>
                  <Text style={styles.activityOverlayValue} numberOfLines={1}>
                    {currentActivity.exercise_type}
                  </Text>
                </View>
                <View style={styles.activityOverlayStat}>
                  <Text style={styles.activityOverlayLabel}>DISTANCE</Text>
                  <Text style={styles.activityOverlayValue}>
                    {currentActivity.distance_km != null ? currentActivity.distance_km.toFixed(2) : "0.00"} km
                  </Text>
                </View>
                <View style={styles.activityOverlayStat}>
                  <Text style={styles.activityOverlayLabel}>TIME</Text>
                  <Text style={styles.activityOverlayValue}>{currentActivity.Time}</Text>
                </View>
                <View style={styles.activityOverlayStat}>
                  <Text style={styles.activityOverlayLabel}>PACE</Text>
                  <Text style={styles.activityOverlayValue} numberOfLines={1}>
                    {formatPaceMinPerKm(currentActivity.pace_min_per_km)}
                  </Text>
                </View>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => setPickedImage(null)}
            >
              <Trash2 size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        
        <View style={styles.uploadHeader}>
          <TextInput
            style={[styles.captionInput, { color: themeColors.text, borderBottomColor: themeColors.border }]}
            placeholder="What's on your mind?"
            placeholderTextColor={themeColors.textLight}
            value={caption}
            onChangeText={setCaption}
            multiline
          />
        </View>
        
        {showEmojis && (
          <View style={styles.emojiContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.emojiList}>
                {emojis.map((emoji, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.emojiButton}
                    onPress={() => addEmoji(emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
        
        <View style={styles.actionButtons2}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={pickImage}
            disabled={createPostMutation.isPending}
            accessibilityLabel="Add picture"
          >
            <Camera size={17} color="#10b981" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowEmojis(!showEmojis)}
            accessibilityLabel="Add emoji"
          >
            <Smile size={17} color="#10b981" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, showPollComposer && styles.iconButtonActive]}
            onPress={() => setShowPollComposer((value) => !value)}
            accessibilityLabel="Add poll"
          >
            <BarChart3 size={16} color="#10b981" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.activityCompactButton, showActivity && styles.activityCompactButtonActive]}
            onPress={() => setShowActivity(!showActivity)}
            accessibilityLabel="Show activity"
          >
            <Activity size={15} color={showActivity ? "#fff" : "#10b981"} />
            <Text style={[styles.activityCompactButtonText, showActivity && styles.activityCompactButtonTextActive]}>
              Activity
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.postButton}
            onPress={handlePost}
            disabled={createPostMutation.isPending || (!caption.trim() && !pickedImage && !showActivity && !pollQuestion.trim())}
          >
            <Text style={styles.postButtonText}>
              {createPostMutation.isPending ? "Posting..." : "Post"}
            </Text>
          </TouchableOpacity>
        </View>

        {showPollComposer && (
          <View style={styles.pollComposer}>
            <Text style={styles.pollComposerTitle}>Create a quick poll</Text>
            <TextInput
              style={styles.pollInput}
              placeholder="Poll question"
              value={pollQuestion}
              onChangeText={setPollQuestion}
            />
            <TextInput
              style={styles.pollInput}
              placeholder="Option 1"
              value={pollOptionA}
              onChangeText={setPollOptionA}
            />
            <TextInput
              style={styles.pollInput}
              placeholder="Option 2"
              value={pollOptionB}
              onChangeText={setPollOptionB}
            />
          </View>
        )}

        {showActivity && currentActivity && (
          <Text style={styles.activitySelectionStatus} numberOfLines={1}>
            {currentActivity.exercise_type} · {currentActivity.distance_km != null ? currentActivity.distance_km.toFixed(2) : "0.00"} km · {currentActivity.Time} · {formatPaceMinPerKm(currentActivity.pace_min_per_km)}
          </Text>
        )}

        {showActivity && !currentActivity && (
          <Text style={styles.activitySelectionStatus}>No activity recorded for today</Text>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
      >
        {isLoading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading feed...</Text>
          </View>
        ) : !posts || posts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MessageCircle size={48} color="#ccc" />
            <Text style={styles.emptyText}>No posts yet</Text>
            <Text style={styles.emptySubtext}>Be the first to share something!</Text>
          </View>
        ) : (
          <View style={styles.photoList}>
            {posts.map((post) => (
              <View key={post.social_post_id} style={[styles.photoCard, { backgroundColor: themeColors.cardBackground }]}>
                <View style={styles.photoHeader}>
                  <View style={styles.userInfo}>
                    <View style={styles.avatarPlaceholder}>
                      <UserIcon size={15} color="#fff" />
                    </View>
                    <View style={styles.userTextBlock}>
                      <Text style={[styles.userName, { color: themeColors.text }]} numberOfLines={1}>
                        {post.user?.first_name || "Unknown User"}
                      </Text>
                      <Text style={styles.userUsername} numberOfLines={1}>
                        {post.user?.username ? `@${post.user.username}` : "RunNation User"}
                      </Text>
                      {formatCountryName(post.user?.country) || post.user?.club_name ? (
                        <Text style={styles.userMeta} numberOfLines={1}>
                          {[formatCountryName(post.user?.country), post.user?.club_name].filter(Boolean).join("  ")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.postHeaderRight}>
                    <Text style={styles.postTimestamp}>{formatPostTimestamp(post.created_at)}</Text>
                    {(registrationId === post.registration_id || canModerateChat) && (
                      <TouchableOpacity onPress={() => handleDeletePost(post.social_post_id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Trash2 size={17} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {post.caption && (
                  <View style={styles.captionContainer}>
                    <Text style={[styles.captionText, { color: themeColors.text }]}>{post.caption}</Text>
                  </View>
                )}

                {post.photo_url && (
                  <View style={styles.postImageContainer}>
                    <Image
                      source={{ uri: post.photo_url }}
                      style={styles.photoImage}
                      contentFit="cover"
                    />
                    {post.activity_data ? (
                      <View style={styles.activityImageOverlay}>
                        <View style={styles.activityOverlayStat}>
                          <Text style={styles.activityOverlayLabel}>TYPE</Text>
                          <Text style={styles.activityOverlayValue} numberOfLines={1}>
                            {post.activity_data.exercise_type}
                          </Text>
                        </View>
                        <View style={styles.activityOverlayStat}>
                          <Text style={styles.activityOverlayLabel}>DISTANCE</Text>
                          <Text style={styles.activityOverlayValue}>
                            {post.activity_data.distance_km != null ? post.activity_data.distance_km.toFixed(2) : "0.00"} km
                          </Text>
                        </View>
                        <View style={styles.activityOverlayStat}>
                          <Text style={styles.activityOverlayLabel}>TIME</Text>
                          <Text style={styles.activityOverlayValue}>{post.activity_data.Time}</Text>
                        </View>
                        <View style={styles.activityOverlayStat}>
                          <Text style={styles.activityOverlayLabel}>PACE</Text>
                          <Text style={styles.activityOverlayValue} numberOfLines={1}>
                            {formatPaceMinPerKm(post.activity_data.pace_min_per_km)}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )}

                {post.activity_data && !post.photo_url && (
                  <View style={[styles.postActivityCard, { backgroundColor: themeColors.inputBackground }]}>
                    <View style={styles.compactActivityStats}>
                      <View style={styles.compactActivityStat}>
                        <Text style={styles.compactActivityLabel}>TYPE</Text>
                        <Text style={styles.compactActivityLabel}>DIST</Text>
                        <Text style={styles.compactActivityLabel}>PACE</Text>
                      </View>
                      <View style={styles.compactActivityStat}>
                        <Text style={styles.compactActivityValue}>{post.activity_data.exercise_type}</Text>
                        <Text style={styles.compactActivityValue}>
                          {post.activity_data.distance_km != null ? post.activity_data.distance_km.toFixed(2) : '0.00'} km
                        </Text>
                        <Text style={styles.compactActivityValue}>
                          {formatPaceMinPerKm(post.activity_data.pace_min_per_km)}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {post.poll && (
                  <View style={[styles.pollCard, { backgroundColor: themeColors.inputBackground }]}>
                    <Text style={[styles.pollQuestion, { color: themeColors.text }]}>
                      {post.poll.question}
                    </Text>
                    <View style={styles.pollOptions}>
                      {post.poll.options.map((option, index) => {
                        const percentage = post.poll && post.poll.total_votes > 0
                          ? Math.round((option.votes / post.poll.total_votes) * 100)
                          : 0;

                        return (
                          <TouchableOpacity
                            key={`${post.social_post_id}-${index}`}
                            style={[
                              styles.pollOptionButton,
                              post.poll?.user_vote === index && styles.pollOptionButtonSelected,
                            ]}
                            onPress={() => handleVotePoll(post.social_post_id, index)}
                          >
                            <View style={styles.pollOptionRow}>
                              <Text style={styles.pollOptionLabel}>{option.label}</Text>
                              <Text style={styles.pollOptionVotes}>{`${option.votes} â¢ ${percentage}%`}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View style={styles.photoActions}>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() =>
                        setActivePostReactionId((current) =>
                          current === post.social_post_id ? null : post.social_post_id
                        )
                      }
                    >
                      {post.user_reaction ? (
                        <Text style={styles.actionEmoji}>{post.user_reaction}</Text>
                      ) : (
                        <View style={styles.addEmojiIconWrap}>
                          <Smile size={18} color="#666" />
                          <View style={styles.addEmojiPlusBadge}>
                            <Plus size={7} color="#fff" strokeWidth={3} />
                          </View>
                        </View>
                      )}
                      {(post.reactions?.reduce((total, reaction) => total + reaction.count, 0) || 0) > 0 ? (
                        <Text style={styles.actionText}>
                          {post.reactions?.reduce((total, reaction) => total + reaction.count, 0)}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleCommentPress(post)}
                    >
                      <MessageCircle size={18} color="#666" />
                      <Text style={styles.actionText}>{post.comments_count}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {activePostReactionId === post.social_post_id ? (
                  <View style={styles.reactionRow}>
                    {REACTION_EMOJIS.map((emoji) => {
                      const count = post.reactions?.find((reaction) => reaction.emoji === emoji)?.count || 0;
                      const isSelected = post.user_reaction === emoji;

                      return (
                        <TouchableOpacity
                          key={`${post.social_post_id}-${emoji}`}
                          style={[styles.reactionChip, isSelected && styles.reactionChipSelected]}
                          onPress={() => handlePostReaction(post.social_post_id, emoji)}
                        >
                          <Text style={styles.reactionChipEmoji}>{emoji}</Text>
                          {count > 0 ? <Text style={styles.reactionChipCount}>{count}</Text> : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!commentPost}
        transparent
        animationType="slide"
        onRequestClose={() => setCommentPost(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.commentModal, { backgroundColor: themeColors.cardBackground }]}>
            <Text style={[styles.commentModalTitle, { color: themeColors.text }]}>Comments</Text>
            {commentPost?.caption ? (
              <Text style={[styles.commentModalCaption, { color: themeColors.text }]}>
                {commentPost.caption}
              </Text>
            ) : null}
            <Text style={[styles.commentModalText, { color: themeColors.textLight }]}>
              Join the conversation on this post.
            </Text>
            <ScrollView style={styles.commentList} contentContainerStyle={styles.commentListContent}>
              {commentsLoading ? (
                <Text style={[styles.commentEmptyText, { color: themeColors.textLight }]}>
                  Loading comments...
                </Text>
              ) : comments.length === 0 ? (
                <Text style={[styles.commentEmptyText, { color: themeColors.textLight }]}>
                  No comments yet. Be the first.
                </Text>
              ) : (
                comments.map((comment: Comment) => (
                  <View key={comment.comment_id} style={styles.commentBubble}>
                    <View style={styles.commentHeader}>
                      <Text style={[styles.commentAuthor, { color: themeColors.text }]}>
                        {comment.user?.first_name || comment.user?.username || "RunNation User"}
                      </Text>
                      {comment.registration_id === registrationId || canModerateChat ? (
                        <TouchableOpacity onPress={() => deleteCommentMutation.mutate(comment.comment_id)}>
                          <Trash2 size={16} color="#ef4444" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={[styles.commentBody, { color: themeColors.text }]}>{comment.body}</Text>
                    <View style={styles.commentQuickActions}>
                      <TouchableOpacity
                        style={styles.commentQuickAction}
                        onPress={() =>
                          setActiveCommentReactionId((current) =>
                            current === comment.comment_id ? null : comment.comment_id
                          )
                        }
                      >
                        {comment.user_reaction ? (
                          <Text style={styles.commentQuickEmoji}>{comment.user_reaction}</Text>
                        ) : (
                          <View style={styles.commentAddEmojiIconWrap}>
                            <Smile size={17} color="#666" />
                            <View style={styles.commentAddEmojiPlusBadge}>
                              <Plus size={7} color="#fff" strokeWidth={3} />
                            </View>
                          </View>
                        )}
                        {(comment.reactions?.reduce((total: number, reaction: CommentReaction) => total + reaction.count, 0) || 0) > 0 ? (
                          <Text style={styles.commentQuickText}>
                            {comment.reactions?.reduce((total: number, reaction: CommentReaction) => total + reaction.count, 0)}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.commentQuickAction}
                        onPress={() => handleReplyToComment(comment)}
                      >
                        <MessageCircle size={17} color="#666" />
                        <Text style={styles.commentQuickText}>Comment</Text>
                      </TouchableOpacity>
                    </View>
                    {activeCommentReactionId === comment.comment_id ? (
                      <View style={styles.commentReactionRow}>
                        {REACTION_EMOJIS.map((emoji) => {
                          const count = comment.reactions?.find((reaction: CommentReaction) => reaction.emoji === emoji)?.count || 0;
                          const isSelected = comment.user_reaction === emoji;

                          return (
                            <TouchableOpacity
                              key={`${comment.comment_id}-${emoji}`}
                              style={[styles.commentReactionChip, isSelected && styles.reactionChipSelected]}
                              onPress={() => handleCommentReaction(comment.comment_id, emoji)}
                            >
                              <Text style={styles.reactionChipEmoji}>{emoji}</Text>
                              {count > 0 ? <Text style={styles.reactionChipCount}>{count}</Text> : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.commentComposer}>
              <TextInput
                style={[styles.commentInput, { color: themeColors.text, borderColor: themeColors.border }]}
                placeholder="Write a comment..."
                placeholderTextColor={themeColors.textLight}
                value={commentDraft}
                onChangeText={setCommentDraft}
                multiline
              />
              <TouchableOpacity
                style={styles.commentSendButton}
                onPress={handleAddComment}
                disabled={addCommentMutation.isPending || !commentDraft.trim()}
              >
                <Text style={styles.commentSendButtonText}>
                  {addCommentMutation.isPending ? "..." : "Send"}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.commentModalButton}
              onPress={() => setCommentPost(null)}
            >
              <Text style={styles.commentModalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  uploadSection: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  uploadHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-end",
  },
  captionInput: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    maxHeight: 80,
  },
  selectedImageContainer: {
    position: "relative",
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  selectedImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#f0f0f0",
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtons2: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    alignItems: "center",
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0fdf4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  iconButtonActive: {
    backgroundColor: "#d1fae5",
  },
  activityCompactButton: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  activityCompactButtonActive: {
    backgroundColor: "#10b981",
  },
  activityCompactButtonText: {
    color: "#059669",
    fontSize: 11,
    fontWeight: "600" as const,
  },
  activityCompactButtonTextActive: {
    color: "#fff",
  },
  postButton: {
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginLeft: "auto",
  },
  postButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  scrollView: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: "#666",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
  photoList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  photoCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  photoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  userTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  postHeaderRight: {
    alignItems: "flex-end",
    gap: 4,
    maxWidth: 92,
  },
  postTimestamp: {
    fontSize: 10,
    lineHeight: 13,
    color: "#9ca3af",
    fontWeight: "500" as const,
    textAlign: "right" as const,
  },
  userName: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700" as const,
    color: "#000",
  },
  userUsername: {
    fontSize: 11,
    lineHeight: 14,
    color: "#777",
  },
  userMeta: {
    fontSize: 10,
    lineHeight: 13,
    color: "#10b981",
  },
  photoImage: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#f0f0f0",
  },
  postImageContainer: {
    position: "relative",
    width: "100%",
  },
  activityImageOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: "rgba(0, 0, 0, 0.68)",
  },
  activityOverlayStat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 2,
  },
  activityOverlayLabel: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700" as const,
  },
  activityOverlayValue: {
    color: "#fff",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700" as const,
    textAlign: "center",
  },
  captionContainer: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 8,
  },
  captionText: {
    fontSize: 14,
    color: "#000",
    lineHeight: 19,
  },
  photoActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500" as const,
  },
  actionEmoji: {
    fontSize: 17,
    lineHeight: 20,
  },
  addEmojiIconWrap: {
    position: "relative",
    width: 22,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  addEmojiPlusBadge: {
    position: "absolute",
    top: -2,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fff",
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f5f5f5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reactionChipSelected: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  reactionChipEmoji: {
    fontSize: 14,
  },
  reactionChipCount: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "600" as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  commentModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    minHeight: 220,
  },
  commentModalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    marginBottom: 12,
  },
  commentModalCaption: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  commentModalText: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  commentList: {
    maxHeight: 260,
    marginBottom: 14,
  },
  commentListContent: {
    gap: 10,
    paddingBottom: 4,
  },
  commentBubble: {
    backgroundColor: "#f5f5f5",
    borderRadius: 14,
    padding: 12,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: "700" as const,
  },
  commentBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  commentReactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  commentQuickActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 10,
  },
  commentQuickAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  commentQuickText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600" as const,
  },
  commentQuickEmoji: {
    fontSize: 16,
    lineHeight: 18,
  },
  commentAddEmojiIconWrap: {
    position: "relative",
    width: 21,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAddEmojiPlusBadge: {
    position: "absolute",
    top: -3,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fff",
  },
  commentReactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  commentEmptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 12,
  },
  commentComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: 14,
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 88,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  commentSendButton: {
    backgroundColor: "#10b981",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentSendButtonText: {
    color: "#fff",
    fontWeight: "600" as const,
  },
  commentModalButton: {
    backgroundColor: "#10b981",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  commentModalButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  likedText: {
    color: "#ef4444",
  },
  activitySelectionStatus: {
    marginTop: 6,
    color: "#059669",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500" as const,
  },
  emojiContainer: {
    marginTop: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 8,
  },
  emojiList: {
    flexDirection: "row",
    gap: 8,
  },
  emojiButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  emojiText: {
    fontSize: 24,
  },
  pollComposer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#10b981",
    gap: 10,
  },
  pollComposerTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#047857",
  },
  pollInput: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  postActivityCard: {
    marginHorizontal: 12,
    marginVertical: 8,
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#10b981",
  },
  pollCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    padding: 12,
  },
  pollQuestion: {
    fontSize: 15,
    fontWeight: "700" as const,
    marginBottom: 10,
  },
  pollOptions: {
    gap: 8,
  },
  pollOptionButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pollOptionButtonSelected: {
    borderColor: "#10b981",
    backgroundColor: "#ecfdf5",
  },
  pollOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  pollOptionLabel: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    fontWeight: "600" as const,
  },
  pollOptionVotes: {
    fontSize: 12,
    color: "#6b7280",
  },
  compactActivityStats: {
    gap: 4,
  },
  compactActivityStat: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  compactActivityLabel: {
    fontSize: 10,
    color: "#059669",
    fontWeight: "600" as const,
    flex: 1,
  },
  compactActivityValue: {
    fontSize: 12,
    color: "#000",
    fontWeight: "500" as const,
    flex: 1,
  },
});

