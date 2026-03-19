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
} from "react-native";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Camera, Heart, MessageCircle, User as UserIcon, Trash2, Activity, Smile } from "lucide-react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import SubscriptionGate from "@/components/SubscriptionGate";

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
    pace_km_h: number;
  } | null;
  created_at: string;
  likes_count: number;
  user_liked: boolean;
  user?: {
    first_name?: string;
    username?: string;
  };
}

interface ActivityStats {
  activity_date: string;
  exercise_type: string;
  distance_km: number;
  Time: string;
  pace_km_h: number;
}

export default function ChatScreen() {
  const { user, registrationId } = useAuth();
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  
  const emojis = ["😀", "😂", "❤️", "🔥", "👍", "👏", "💪", "🏃", "⚡", "🎉", "😎", "🤩", "😍", "🥳", "💯"];

  const { data: posts, isLoading, refetch } = useQuery<Post[]>({
    queryKey: ["posts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_posts")
        .select(`
          social_post_id,
          registration_id,
          photo_url,
          caption,
          activity_data,
          created_at,
          post_likes!left (user_id)
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching posts:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(error.message || "Failed to fetch posts");
      }

      const userIds = [...new Set((data || []).map((p: any) => p.registration_id))];
      const { data: userData } = await supabase
        .from("registrations")
        .select("registration_id, first_name, username")
        .in("registration_id", userIds);

      const userMap = new Map(
        (userData || []).map(u => [u.registration_id, { first_name: u.first_name, username: u.username }])
      );

      const postsWithLikes = (data || []).map((post: any) => {
        const likes = post.post_likes || [];
        return {
          social_post_id: post.social_post_id,
          registration_id: post.registration_id,
          photo_url: post.photo_url,
          caption: post.caption,
          activity_data: post.activity_data,
          created_at: post.created_at,
          likes_count: likes.length,
          user_liked: likes.some((like: any) => like.user_id === registrationId),
          user: userMap.get(post.registration_id),
        };
      });

      return postsWithLikes;
    },
    enabled: !!user && !!registrationId,
  });

  const { data: currentActivity } = useQuery<ActivityStats | null>({
    queryKey: ["currentActivity", registrationId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from("activities")
        .select("activity_date, exercise_type, distance_km, start_time, end_time, pace_km_h")
        .eq("registration_id", registrationId)
        .eq("activity_date", today)
        .order("end_time", { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) return null;

      const activity = data[0];
      const startTime = new Date(`1970-01-01T${activity.start_time}`);
      const endTime = new Date(`1970-01-01T${activity.end_time}`);
      const durationMs = endTime.getTime() - startTime.getTime();
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);

      return {
        activity_date: activity.activity_date,
        exercise_type: activity.exercise_type,
        distance_km: activity.distance_km,
        Time: `${minutes}:${seconds.toString().padStart(2, '0')}`,
        pace_km_h: activity.pace_km_h,
      };
    },
    enabled: showActivity,
  });

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const createPostMutation = useMutation({
    mutationFn: async ({ 
      photoUri, 
      postCaption, 
      activityData 
    }: { 
      photoUri: string | null; 
      postCaption: string;
      activityData: ActivityStats | null;
    }) => {
      if (!registrationId) throw new Error("Not authenticated");

      console.log("Creating post...");
      const { data, error } = await supabase
        .from("social_posts")
        .insert({
          registration_id: registrationId,
          photo_url: photoUri || null,
          caption: postCaption || null,
          activity_data: activityData || null,
        })
        .select();

      if (error) {
        console.error("Error creating post:", error);
        throw new Error(error.message || "Failed to create post");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setCaption("");
      setSelectedImage(null);
      setShowActivity(false);
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

  const toggleLikeMutation = useMutation({
    mutationFn: async ({ postId, isLiked }: { postId: string; isLiked: boolean }) => {
      if (!registrationId) throw new Error("Not authenticated");

      if (isLiked) {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("social_post_id", postId)
          .eq("user_id", registrationId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("post_likes")
          .insert({
            social_post_id: postId,
            user_id: registrationId,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("social_posts")
        .delete()
        .eq("social_post_id", postId);

      if (error) throw error;
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
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handlePost = () => {
    if (!caption.trim() && !selectedImage && !showActivity) {
      if (Platform.OS !== 'web') {
        Alert.alert("Error", "Please add text, image, or activity");
      }
      return;
    }
    createPostMutation.mutate({ 
      photoUri: selectedImage, 
      postCaption: caption,
      activityData: showActivity && currentActivity ? currentActivity : null,
    });
  };

  const handleLike = (postId: string, isLiked: boolean) => {
    toggleLikeMutation.mutate({ postId, isLiked });
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
        {selectedImage && (
          <View style={styles.selectedImageContainer}>
            <Image
              source={{ uri: selectedImage }}
              style={styles.selectedImage}
              contentFit="cover"
            />
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => setSelectedImage(null)}
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
          >
            <Camera size={22} color="#10b981" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowEmojis(!showEmojis)}
          >
            <Smile size={22} color="#10b981" />
          </TouchableOpacity>
          
          <View style={{ flex: 1 }} />
          
          <TouchableOpacity
            style={styles.postButton}
            onPress={handlePost}
            disabled={createPostMutation.isPending || (!caption.trim() && !selectedImage && !showActivity)}
          >
            <Text style={styles.postButtonText}>
              {createPostMutation.isPending ? "Posting..." : "Post"}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.activityToggleContainer}>
          <TouchableOpacity
            style={styles.activityToggle}
            onPress={() => setShowActivity(!showActivity)}
          >
            <View style={[styles.radioButton, showActivity && styles.radioButtonSelected]}>
              {showActivity && <View style={styles.radioButtonInner} />}
            </View>
            <Text style={styles.activityToggleText}>Show Activity</Text>
          </TouchableOpacity>
        </View>

        {showActivity && currentActivity && (
          <View style={styles.activityCard}>
            <View style={styles.activityHeader}>
              <Activity size={20} color="#10b981" />
              <Text style={styles.activityTitle}>Today&apos;s Activity</Text>
            </View>
            <View style={styles.activityStats}>
              <View style={styles.activityStat}>
                <Text style={styles.activityLabel}>Date</Text>
                <Text style={styles.activityValue}>
                  {new Date(currentActivity.activity_date).toLocaleDateString('en-US', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  })}
                </Text>
              </View>
              <View style={styles.activityStat}>
                <Text style={styles.activityLabel}>Type</Text>
                <Text style={styles.activityValue}>{currentActivity.exercise_type}</Text>
              </View>
              <View style={styles.activityStat}>
                <Text style={styles.activityLabel}>Distance</Text>
                <Text style={styles.activityValue}>
                  {currentActivity.distance_km != null ? currentActivity.distance_km.toFixed(2) : '0.00'} km
                </Text>
              </View>
              <View style={styles.activityStat}>
                <Text style={styles.activityLabel}>Time</Text>
                <Text style={styles.activityValue}>{currentActivity.Time}</Text>
              </View>
              <View style={styles.activityStat}>
                <Text style={styles.activityLabel}>Pace</Text>
                <Text style={styles.activityValue}>
                  {currentActivity.pace_km_h != null && currentActivity.pace_km_h > 0 
                    ? (60 / currentActivity.pace_km_h).toFixed(2) + ' min/km'
                    : 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {showActivity && !currentActivity && (
          <View style={styles.noActivityCard}>
            <Text style={styles.noActivityText}>No activity recorded for today</Text>
          </View>
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
                      <UserIcon size={18} color="#fff" />
                    </View>
                    <View>
                      <Text style={[styles.userName, { color: themeColors.text }]}>
                        {post.user?.first_name || "Unknown User"}
                      </Text>
                      <Text style={styles.userUsername}>
                        {post.user?.username ? `@${post.user.username}` : new Date(post.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  </View>
                  {registrationId === post.registration_id && (
                    <TouchableOpacity onPress={() => handleDeletePost(post.social_post_id)}>
                      <Trash2 size={20} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>

                {post.caption && (
                  <View style={styles.captionContainer}>
                    <Text style={[styles.captionText, { color: themeColors.text }]}>{post.caption}</Text>
                  </View>
                )}

                {post.photo_url && (
                  <Image
                    source={{ uri: post.photo_url }}
                    style={styles.photoImage}
                    contentFit="cover"
                  />
                )}

                {post.activity_data && (
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
                          {post.activity_data.pace_km_h != null && post.activity_data.pace_km_h > 0 
                            ? (60 / post.activity_data.pace_km_h).toFixed(2)
                            : 'N/A'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                <View style={styles.photoActions}>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={() => handleLike(post.social_post_id, post.user_liked)}
                    >
                      <Heart 
                        size={24} 
                        color={post.user_liked ? "#ef4444" : "#666"}
                        fill={post.user_liked ? "#ef4444" : "transparent"}
                      />
                      <Text style={[styles.actionText, post.user_liked && styles.likedText]}>
                        {post.likes_count}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <MessageCircle size={24} color="#666" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
    padding: 16,
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
    gap: 12,
    marginTop: 12,
    alignItems: "center",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0fdf4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  postButton: {
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  postButtonText: {
    color: "#fff",
    fontSize: 15,
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
    padding: 16,
    gap: 16,
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
    alignItems: "center",
    padding: 12,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#000",
  },
  userUsername: {
    fontSize: 12,
    color: "#666",
  },
  photoImage: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#f0f0f0",
  },
  captionContainer: {
    padding: 12,
  },
  captionText: {
    fontSize: 15,
    color: "#000",
    lineHeight: 20,
  },
  photoActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500" as const,
  },
  likedText: {
    color: "#ef4444",
  },
  activityToggleContainer: {
    marginTop: 12,
  },
  activityToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  radioButtonSelected: {
    borderColor: "#10b981",
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#10b981",
  },
  activityToggleText: {
    fontSize: 15,
    color: "#000",
    fontWeight: "500" as const,
  },
  activityCard: {
    marginTop: 12,
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#10b981",
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#10b981",
  },
  activityStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  activityStat: {
    minWidth: "30%",
  },
  activityLabel: {
    fontSize: 11,
    color: "#059669",
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    marginBottom: 2,
  },
  activityValue: {
    fontSize: 14,
    color: "#000",
    fontWeight: "500" as const,
  },
  noActivityCard: {
    marginTop: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  noActivityText: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic" as const,
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
  postActivityCard: {
    marginHorizontal: 12,
    marginVertical: 8,
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#10b981",
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
