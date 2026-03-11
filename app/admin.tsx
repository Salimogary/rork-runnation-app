import { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Image,
  Platform,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { Package, ChevronRight, Edit, X, ClipboardCheck, LogOut, CheckCircle, XCircle, Calendar, Plus, Users, Download, ShoppingBag, Dumbbell, UserPlus, Upload, Activity, Star, Printer, Truck, MessageSquare } from "lucide-react-native";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

interface PendingActivity {
  PendingActivityID: string;
  RegistrationID: string;
  Exercise_Type: string;
  Distance_Entered: number;
  Distance_Unit: string;
  Time_Entered: string;
  Photo_Path: string;
  Status: string;
  Admin_Notes: string | null;
  Created_At: string;
  Reviewed_At: string | null;
  Reviewed_By: string | null;
}

export default function AdminScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"orders" | "stock" | "approvals" | "events" | "enrollments" | "activityUploads" | "externalActivities" | "ratings" | "suggestions">("orders");
  const [eventsSubTab, setEventsSubTab] = useState<"calendar" | "participants">("calendar");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
  const [showStockModal, setShowStockModal] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [newStock, setNewStock] = useState<string>("");
  const [selectedActivity, setSelectedActivity] = useState<PendingActivity | null>(null);
  const [showActivityModal, setShowActivityModal] = useState<boolean>(false);
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [eventName, setEventName] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");
  const [medalMinDailyDistance, setMedalMinDailyDistance] = useState<string>("");
  const [medalMinCumulativeDistance, setMedalMinCumulativeDistance] = useState<string>("");
  const [medalDateStart, setMedalDateStart] = useState<string>("");
  const [medalDateEnd, setMedalDateEnd] = useState<string>("");

  const queryClient = useQueryClient();
  const hasCheckedAuth = useRef(false);

  const { data: stockProducts, isLoading: stockLoading, error: stockError } = useQuery<any[]>({
    queryKey: ["catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogue")
        .select("*")
        .order("Catalogue_Item", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: isAuthenticated && activeTab === "stock",
  });

  useEffect(() => {
    if (hasCheckedAuth.current) return;
    hasCheckedAuth.current = true;

    const checkAuth = async () => {
      try {
        const isLoggedIn = await AsyncStorage.getItem("admin_logged_in");
        if (isLoggedIn === "true") {
          setIsAuthenticated(true);
        } else {
          router.replace("/admin-login" as any);
        }
      } catch (error) {
        console.error("Auth check error:", error);
        router.replace("/admin-login" as any);
      } finally {
        setIsChecking(false);
      }
    };

    void checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    const confirmLogout = async () => {
      await AsyncStorage.removeItem("admin_logged_in");
      await AsyncStorage.removeItem("admin_login_time");
      router.replace("/admin-login" as any);
    };

    if (Platform.OS !== 'web') {
      Alert.alert(
        "Logout",
        "Are you sure you want to logout?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Logout", style: "destructive", onPress: confirmLogout }
        ]
      );
    } else {
      if (confirm("Are you sure you want to logout?")) {
        void confirmLogout();
      }
    }
  };

  const { data: deliveryOrders, isLoading: deliveryOrdersLoading, error: deliveryOrdersError, refetch: refetchDeliveryOrders } = trpc.admin.getDeliveryOrders.useQuery(
    undefined,
    { enabled: isAuthenticated && activeTab === "orders", retry: 1, refetchOnMount: true }
  );

  const { data: events, isLoading: eventsLoading, error: eventsError, refetch: refetchEvents } = trpc.admin.getEvents.useQuery(
    undefined,
    { 
      enabled: isAuthenticated,
      retry: 1,
      refetchOnMount: true,
    }
  );

  const { data: enrollments, isLoading: enrollmentsLoading, error: enrollmentsError, refetch: refetchEnrollments } = trpc.admin.getEnrollments.useQuery(
    { eventId: undefined },
    { 
      enabled: isAuthenticated && activeTab === "enrollments",
      refetchOnMount: true,
    }
  );

  const { data: participants, isLoading: participantsLoading, error: participantsError, refetch: refetchParticipants } = trpc.admin.getParticipants.useQuery(
    { eventId: selectedEventId },
    { 
      enabled: isAuthenticated && activeTab === "events" && eventsSubTab === "participants" && !!selectedEventId,
      refetchOnMount: true,
    }
  );

  const { data: activityUploads, isLoading: activityUploadsLoading, error: activityUploadsError, refetch: refetchActivityUploads } = trpc.admin.getActivityUploads.useQuery(
    undefined,
    { 
      enabled: isAuthenticated && activeTab === "activityUploads",
      refetchOnMount: true,
    }
  );

  interface AppRating {
    rating_id: number;
    registration_id: string;
    rating: number;
    feedback: string | null;
    created_at: string;
  }

  const { data: appRatings = [], isLoading: ratingsLoading } = useQuery<AppRating[]>({
    queryKey: ['adminAppRatings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_ratings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching app ratings:', error);
        throw error;
      }
      return data || [];
    },
    enabled: isAuthenticated && activeTab === 'ratings',
  });

  interface Suggestion {
    suggestion_id: number;
    registration_id: string;
    suggestion: string;
    created_at: string;
  }

  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery<Suggestion[]>({
    queryKey: ['adminSuggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suggestions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching suggestions:', error);
        throw error;
      }
      return data || [];
    },
    enabled: isAuthenticated && activeTab === 'suggestions',
  });

  const averageRating = appRatings.length > 0
    ? appRatings.reduce((sum, r) => sum + r.rating, 0) / appRatings.length
    : 0;

  const ratingBreakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: appRatings.filter((r) => r.rating === star).length,
    percentage: appRatings.length > 0
      ? (appRatings.filter((r) => r.rating === star).length / appRatings.length) * 100
      : 0,
  }));

  const { data: externalSubmissions, isLoading: externalSubmissionsLoading } = trpc.activities.getExternalSubmissions.useQuery(
    undefined,
    { 
      enabled: isAuthenticated && activeTab === "externalActivities",
      refetchOnMount: true,
    }
  );



  useEffect(() => {
    if (eventsError) {
      console.error("[AdminScreen] Error fetching events:", eventsError);
      console.error("[AdminScreen] Error message:", eventsError.message);
      console.error("[AdminScreen] Error data:", eventsError.data);
      console.error("[AdminScreen] Error code:", eventsError.data?.code);
      console.error("[AdminScreen] Full error:", JSON.stringify({
        message: eventsError.message,
        data: eventsError.data,
        shape: eventsError.shape,
      }, null, 2));
    }
  }, [eventsError]);

  useEffect(() => {
    if (events) {
      console.log("[AdminScreen] Events loaded successfully:", events);
    }
  }, [events]);

const { data: pendingActivities = [], error: pendingActivitiesError, isLoading: pendingActivitiesLoading } = useQuery<PendingActivity[]>({
    queryKey: ["pendingActivities"],
    queryFn: async () => {
      console.log("Fetching pending activities...");
      const { data, error } = await supabase
        .from("pending_activities")
        .select("*")
        .eq("Status", "pending")
        .order("Created_At", { ascending: false });

      if (error) {
        const errorMessage = `Failed to fetch pending activities: ${error.message || 'Unknown error'}`;
        console.error("Error fetching pending activities:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(errorMessage);
      }

      console.log("Pending activities fetched:", data?.length || 0);
      return data || [];
    },
    enabled: isAuthenticated,
  });

  const approveMutation = useMutation({
    mutationFn: async (activity: PendingActivity) => {
      const timeParts = activity.Time_Entered.split(':');
      const hours = parseInt(timeParts[0] || '0', 10);
      const minutes = parseInt(timeParts[1] || '0', 10);
      const totalMinutes = hours * 60 + minutes;
      
      let distanceKm = activity.Distance_Entered;
      if (activity.Distance_Unit === 'mi') {
        distanceKm = activity.Distance_Entered * 1.60934;
      }

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - totalMinutes * 60 * 1000);
      const calculatedPace = totalMinutes > 0 ? (distanceKm / (totalMinutes / 60)) : 0;

      const { data, error } = await supabase
        .from("activities")
        .insert({
          RegistrationID: activity.RegistrationID,
          Activity_Date: new Date().toISOString().split('T')[0],
          Exercise_Type: activity.Exercise_Type,
          Distance_km: distanceKm,
          Start_Time: startTime.toISOString().split('T')[1].split('.')[0],
          End_Time: endTime.toISOString().split('T')[1].split('.')[0],
          Pace_km_h: calculatedPace,
        })
        .select();

      if (error) throw error;

      const { error: deleteError } = await supabase
        .from("pending_activities")
        .delete()
        .eq("PendingActivityID", activity.PendingActivityID);

      if (deleteError) throw deleteError;

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pendingActivities"] });
      setSelectedActivity(null);
      setShowActivityModal(false);
      Alert.alert("Success", "Activity approved and added to records");
    },
    onError: (error) => {
      console.error("Error approving activity:", error);
      Alert.alert("Error", "Failed to approve activity");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (activityId: string) => {
      const { error } = await supabase
        .from("pending_activities")
        .delete()
        .eq("PendingActivityID", activityId);

      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pendingActivities"] });
      setSelectedActivity(null);
      setShowActivityModal(false);
      Alert.alert("Success", "Activity rejected");
    },
    onError: (error) => {
      console.error("Error rejecting activity:", error);
      Alert.alert("Error", "Failed to reject activity");
    },
  });

  const updateDeliveryStatusMutation = trpc.admin.updateDeliveryOrderStatus.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getDeliveryOrders"]] });
      setShowStatusModal(false);
      Alert.alert("Success", "Order status updated");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update order status");
    },
  });

  const updateStockMutation = trpc.admin.updateStock.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["catalogue"]] });
      setShowStockModal(false);
      Alert.alert("Success", "Stock updated successfully");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update stock");
    },
  });

  const addEventMutation = trpc.admin.addEvent.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [["admin", "getEvents"]] });
      setShowEventModal(false);
      setEventName("");
      setStartsAt("");
      setEndsAt("");
      Alert.alert("Success", "Event added successfully");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to add event");
    },
  });

const handleUpdateOrderStatus = (orderId: string, status: string) => {
    setSelectedOrderId(orderId);
    setSelectedStatus(status);
    setShowStatusModal(true);
  };

  const confirmStatusUpdate = () => {
    if (!selectedOrderId || !selectedStatus) return;

    updateDeliveryStatusMutation.mutate({
      orderId: selectedOrderId,
      status: selectedStatus as any,
    });
  };

  const handlePrintSticker = (order: any) => {
    const items = order.items || [];
    const itemLines = items.map((item: any) => `${item.name}${item.size ? ` (${item.size})` : ''} x${item.qty}`).join('\n');
    const stickerContent = [
      '================================',
      '       DELIVERY STICKER',
      '================================',
      '',
      `Order #: ${(order.order_id || '').substring(0, 8)}`,
      `Date: ${new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      '',
      '--- DELIVER TO ---',
      `Phone: ${order.phone_number || 'N/A'}`,
      `Address: ${order.delivery_address || 'N/A'}`,
      '',
      '--- DELIVERY TIME ---',
      order.delivery_time_slots || 'N/A',
      '',
      '--- ITEMS ---',
      itemLines || 'No items',
      '',
      `TOTAL: ugx.${(order.total_amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      '',
      '================================',
    ].join('\n');

    if (Platform.OS === 'web') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const itemsHtml = items.map((item: any) =>
          `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${item.name}${item.size ? ` (${item.size})` : ''}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;">x${item.qty}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">ugx.${(item.subtotal || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td></tr>`
        ).join('');
        printWindow.document.write(`
          <html><head><title>Delivery Sticker</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
            .sticker { border: 2px dashed #333; padding: 20px; border-radius: 8px; }
            .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .section-title { font-weight: bold; font-size: 13px; color: #666; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 1px; }
            .field { margin: 4px 0; font-size: 15px; }
            .field-label { color: #666; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin: 8px 0; }
            .total { font-size: 20px; font-weight: bold; text-align: right; margin-top: 12px; padding-top: 10px; border-top: 2px solid #333; }
            .order-id { font-size: 12px; color: #888; text-align: center; margin-bottom: 8px; }
            @media print { body { padding: 0; } }
          </style></head><body>
          <div class="sticker">
            <div class="header">DELIVERY STICKER</div>
            <div class="order-id">Order #${(order.order_id || '').substring(0, 8)} &bull; ${new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div class="section-title">Deliver To</div>
            <div class="field"><span class="field-label">Phone:</span> ${order.phone_number || 'N/A'}</div>
            <div class="field"><span class="field-label">Address:</span> ${order.delivery_address || 'N/A'}</div>
            <div class="section-title">Delivery Time</div>
            <div class="field">${order.delivery_time_slots || 'N/A'}</div>
            <div class="section-title">Items</div>
            <table>${itemsHtml}</table>
            <div class="total">TOTAL: ugx.${(order.total_amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
          </div>
          <script>window.onload = function() { window.print(); }</script>
          </body></html>
        `);
        printWindow.document.close();
      }
    } else {
      Alert.alert(
        'Delivery Sticker',
        stickerContent,
        [{ text: 'OK' }]
      );
    }
  };

  const handleUpdateStock = (product: any) => {
    setSelectedProduct(product);
    setNewStock(String(product.Quanity || 0));
    setShowStockModal(true);
  };

  const confirmStockUpdate = () => {
    if (!selectedProduct) return;
    const stockValue = parseInt(newStock, 10);

    if (isNaN(stockValue) || stockValue < 0) {
      Alert.alert("Invalid Stock", "Please enter a valid stock quantity");
      return;
    }

    updateStockMutation.mutate({
      catalogueId: selectedProduct.CatalogueID,
      quantity: stockValue,
    });
  };

  const handleAddEvent = () => {
    if (!eventName.trim() || !startsAt.trim() || !endsAt.trim()) {
      Alert.alert("Validation Error", "Please fill required fields (name, start date, end date)");
      return;
    }

    addEventMutation.mutate({
      eventName: eventName.trim(),
      startsAt,
      endsAt,
      medalMinDailyDistance: medalMinDailyDistance ? parseFloat(medalMinDailyDistance) : undefined,
      medalMinCumulativeDistance: medalMinCumulativeDistance ? parseFloat(medalMinCumulativeDistance) : undefined,
      medalDateStart: medalDateStart || undefined,
      medalDateEnd: medalDateEnd || undefined,
    });
  };

  const handleFileDownload = (upload: any) => {
    try {
      console.log("[Download] Starting download for:", upload.fileName);
      console.log("[Download] File path:", upload.filePath);
      
      if (!upload.filePath) {
        Alert.alert("Error", "File URL not available");
        return;
      }

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = upload.filePath;
        link.download = upload.fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        Alert.alert("Success", "File download started");
      } else {
        Alert.alert(
          "Download File",
          `File: ${upload.fileName}\nUser: ${upload.userName}\nEmail: ${upload.email}\n\nURL: ${upload.filePath}\n\nCopy the URL above to download the file on your device.`,
          [{ text: "OK" }]
        );
      }
    } catch (error: any) {
      console.error("[Download] Error:", error);
      Alert.alert("Error", error.message || "Failed to download file");
    }
  };

const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "#f59e0b";
      case "processing":
        return "#3b82f6";
      case "shipped":
        return "#8b5cf6";
      case "delivered":
        return "#10b981";
      case "cancelled":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const formatTimeInterval = (interval: string): string => {
    const parts = interval.split(':');
    const hours = parseInt(parts[0] || '0', 10);
    const minutes = parseInt(parts[1] || '0', 10);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (isChecking) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: "Admin Dashboard",
          headerRight: () => (
            <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
              <LogOut size={22} color="#ef4444" />
            </TouchableOpacity>
          ),
        }} 
      />

      <View style={styles.menuGrid}>
        <TouchableOpacity
          style={[styles.menuButton, activeTab === "orders" && styles.menuButtonActive]}
          onPress={() => setActiveTab("orders")}
        >
          <View style={[styles.iconCircle, activeTab === "orders" && styles.iconCircleActive]}>
            <ShoppingBag size={24} color={activeTab === "orders" ? "#fff" : "#10b981"} />
          </View>
          <Text style={[styles.menuButtonText, activeTab === "orders" && styles.menuButtonTextActive]}>Orders</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuButton, activeTab === "stock" && styles.menuButtonActive]}
          onPress={() => { console.log('[Admin] Stock tile pressed'); setActiveTab("stock"); }}
        >
          <View style={[styles.iconCircle, activeTab === "stock" && styles.iconCircleActive]}>
            <Package size={24} color={activeTab === "stock" ? "#fff" : "#10b981"} />
          </View>
          <Text style={[styles.menuButtonText, activeTab === "stock" && styles.menuButtonTextActive]}>Stock</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuButton, activeTab === "approvals" && styles.menuButtonActive]}
          onPress={() => setActiveTab("approvals")}
        >
          <View style={[styles.iconCircle, activeTab === "approvals" && styles.iconCircleActive]}>
            <Dumbbell size={24} color={activeTab === "approvals" ? "#fff" : "#10b981"} />
          </View>
          <Text style={[styles.menuButtonText, activeTab === "approvals" && styles.menuButtonTextActive]}>Treadmill</Text>
          {pendingActivities.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingActivities.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuButton, activeTab === "events" && styles.menuButtonActive]}
          onPress={() => setActiveTab("events")}
        >
          <View style={[styles.iconCircle, activeTab === "events" && styles.iconCircleActive]}>
            <Calendar size={24} color={activeTab === "events" ? "#fff" : "#10b981"} />
          </View>
          <Text style={[styles.menuButtonText, activeTab === "events" && styles.menuButtonTextActive]}>Events</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuButton, activeTab === "enrollments" && styles.menuButtonActive]}
          onPress={() => setActiveTab("enrollments")}
        >
          <View style={[styles.iconCircle, activeTab === "enrollments" && styles.iconCircleActive]}>
            <UserPlus size={24} color={activeTab === "enrollments" ? "#fff" : "#10b981"} />
          </View>
          <Text style={[styles.menuButtonText, activeTab === "enrollments" && styles.menuButtonTextActive]}>Enrollments</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuButton, activeTab === "activityUploads" && styles.menuButtonActive]}
          onPress={() => setActiveTab("activityUploads")}
        >
          <View style={[styles.iconCircle, activeTab === "activityUploads" && styles.iconCircleActive]}>
            <Upload size={24} color={activeTab === "activityUploads" ? "#fff" : "#10b981"} />
          </View>
          <Text style={[styles.menuButtonText, activeTab === "activityUploads" && styles.menuButtonTextActive]}>Uploads</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuButton, activeTab === "externalActivities" && styles.menuButtonActive]}
          onPress={() => setActiveTab("externalActivities")}
        >
          <View style={[styles.iconCircle, activeTab === "externalActivities" && styles.iconCircleActive]}>
            <Activity size={24} color={activeTab === "externalActivities" ? "#fff" : "#10b981"} />
          </View>
          <Text style={[styles.menuButtonText, activeTab === "externalActivities" && styles.menuButtonTextActive]}>External</Text>
          {(externalSubmissions?.length || 0) > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{externalSubmissions?.length || 0}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuButton, activeTab === "ratings" && styles.menuButtonActive]}
          onPress={() => setActiveTab("ratings")}
        >
          <View style={[styles.iconCircle, activeTab === "ratings" && styles.iconCircleActive]}>
            <Star size={24} color={activeTab === "ratings" ? "#fff" : "#10b981"} />
          </View>
          <Text style={[styles.menuButtonText, activeTab === "ratings" && styles.menuButtonTextActive]}>Ratings</Text>
          {appRatings.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{appRatings.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuButton, activeTab === "suggestions" && styles.menuButtonActive]}
          onPress={() => setActiveTab("suggestions")}
        >
          <View style={[styles.iconCircle, activeTab === "suggestions" && styles.iconCircleActive]}>
            <MessageSquare size={24} color={activeTab === "suggestions" ? "#fff" : "#10b981"} />
          </View>
          <Text style={[styles.menuButtonText, activeTab === "suggestions" && styles.menuButtonTextActive]}>Suggestions</Text>
          {suggestions.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{suggestions.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeTab === "orders" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {deliveryOrdersLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading delivery orders...</Text>
            </View>
          ) : deliveryOrdersError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading orders</Text>
              <Text style={styles.errorSubtext}>{deliveryOrdersError.message || "Failed to fetch orders"}</Text>
              <Text style={styles.errorHint}>Please ensure the &quot;orders_to_deliver&quot; table exists in Supabase.</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => refetchDeliveryOrders()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !deliveryOrders || deliveryOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Truck size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No delivery orders yet</Text>
              <Text style={styles.emptySubtext}>Orders placed by users will appear here</Text>
            </View>
          ) : (
            deliveryOrders.map((order: any) => {
              const items = order.items || [];
              return (
                <View key={order.order_id} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderId}>#{(order.order_id || '').substring(0, 8)}</Text>
                    <TouchableOpacity
                      style={[styles.statusBadge, { backgroundColor: `${getStatusColor(order.status)}20` }]}
                      onPress={() => handleUpdateOrderStatus(order.order_id, order.status)}
                    >
                      <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                        {getStatusLabel(order.status)}
                      </Text>
                      <ChevronRight size={14} color={getStatusColor(order.status)} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Phone:</Text>
                    <Text style={styles.orderValue}>{order.phone_number}</Text>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Address:</Text>
                    <Text style={styles.orderValue} numberOfLines={2}>
                      {order.delivery_address}
                    </Text>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Time Slots:</Text>
                    <Text style={styles.orderValue} numberOfLines={2}>
                      {order.delivery_time_slots || 'N/A'}
                    </Text>
                  </View>

                  {items.length > 0 && (
                    <View style={styles.orderItemsList}>
                      <Text style={styles.orderItemsTitle}>Items:</Text>
                      {items.map((item: any, idx: number) => (
                        <View key={idx} style={styles.orderItemRow}>
                          <Text style={styles.orderItemName} numberOfLines={1}>
                            {item.name}{item.size ? ` (${item.size})` : ''}
                          </Text>
                          <Text style={styles.orderItemQty}>x{item.qty}</Text>
                          <Text style={styles.orderItemPrice}>
                            ugx.{(item.subtotal || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Total:</Text>
                    <Text style={styles.orderTotal}>
                      ugx.{(order.total_amount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </Text>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.orderLabel}>Date:</Text>
                    <Text style={styles.orderValue}>
                      {new Date(order.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.printStickerBtn}
                    onPress={() => handlePrintSticker(order)}
                    activeOpacity={0.8}
                  >
                    <Printer size={18} color="#fff" />
                    <Text style={styles.printStickerText}>Print Delivery Sticker</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : activeTab === "stock" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {stockLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading stock...</Text>
            </View>
          ) : stockError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading stock</Text>
              <Text style={styles.errorSubtext}>{stockError instanceof Error ? stockError.message : "Failed to fetch catalogue"}</Text>
            </View>
          ) : !stockProducts || stockProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Package size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No products in catalogue</Text>
            </View>
          ) : (
            stockProducts.map((product: any) => (
              <View key={product.CatalogueID} style={styles.stockCard}>
                <View style={styles.stockInfo}>
                  <Text style={styles.stockName}>{product.Catalogue_Item}</Text>
                  {product.Size && <Text style={styles.stockSize}>Size: {product.Size}</Text>}
                  <View style={styles.stockRow}>
                    <Text style={styles.stockLabel}>Stock:</Text>
                    <Text
                      style={[
                        styles.stockValue,
                        (product.Quantity || 0) <= 5 && styles.stockValueLow,
                        (product.Quantity || 0) === 0 && styles.stockValueOut,
                      ]}
                    >
                      {product.Quantity || 0} units
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleUpdateStock(product)}
                >
                  <Edit size={20} color="#10b981" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === "events" ? (
        <View style={{ flex: 1 }}>
          <View style={styles.eventsSubTabBar}>
            <TouchableOpacity
              style={[styles.eventsSubTab, eventsSubTab === "calendar" && styles.eventsSubTabActive]}
              onPress={() => setEventsSubTab("calendar")}
            >
              <Calendar size={18} color={eventsSubTab === "calendar" ? "#10b981" : "#6b7280"} />
              <Text style={[styles.eventsSubTabText, eventsSubTab === "calendar" && styles.eventsSubTabTextActive]}>
                Calendar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.eventsSubTab, eventsSubTab === "participants" && styles.eventsSubTabActive]}
              onPress={() => setEventsSubTab("participants")}
            >
              <Users size={18} color={eventsSubTab === "participants" ? "#10b981" : "#6b7280"} />
              <Text style={[styles.eventsSubTabText, eventsSubTab === "participants" && styles.eventsSubTabTextActive]}>
                Participants
              </Text>
            </TouchableOpacity>
          </View>

          {eventsSubTab === "calendar" ? (
            <View style={{ flex: 1 }}>
              <View style={styles.addEventContainer}>
                <TouchableOpacity
                  style={styles.addEventButton}
                  onPress={() => setShowEventModal(true)}
                >
                  <Plus size={20} color="#fff" />
                  <Text style={styles.addEventButtonText}>Add New Event</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {eventsError ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.errorText}>Error loading events</Text>
                    <Text style={styles.errorSubtext}>
                      {eventsError.message || "Failed to fetch events from database"}
                    </Text>
                    {eventsError.data && (
                      <Text style={styles.errorDetails}>
                        {JSON.stringify(eventsError.data)}
                      </Text>
                    )}
                    <Text style={styles.errorHint}>Please ensure the &quot;events&quot; table exists in Supabase.</Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => refetchEvents()}
                    >
                      <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : eventsLoading ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Loading events...</Text>
                  </View>
                ) : !events || events.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Calendar size={64} color="#d1d5db" />
                    <Text style={styles.emptyText}>No events yet</Text>
                  </View>
                ) : (
                  events.map((event: any) => (
                    <View key={event.eventId} style={styles.eventCard}>
                      <View style={styles.eventInfo}>
                        <Text style={styles.eventName}>{event.eventName}</Text>
                        <View style={styles.eventDates}>
                          <View style={styles.eventDateRow}>
                            <Text style={styles.eventDateLabel}>Start:</Text>
                            <Text style={styles.eventDateValue}>
                              {new Date(event.startsAt).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                          </View>
                          <View style={styles.eventDateRow}>
                            <Text style={styles.eventDateLabel}>End:</Text>
                            <Text style={styles.eventDateValue}>
                              {new Date(event.endsAt).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={styles.eventFilterContainer}>
                <Text style={styles.eventFilterLabel}>Filter by Event:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventFilterScroll}>
                  {events && events.map((event: any) => (
                    <TouchableOpacity
                      key={event.eventId}
                      style={[
                        styles.eventFilterChip,
                        selectedEventId === event.eventId && styles.eventFilterChipActive
                      ]}
                      onPress={() => setSelectedEventId(event.eventId)}
                    >
                      <Text style={[
                        styles.eventFilterChipText,
                        selectedEventId === event.eventId && styles.eventFilterChipTextActive
                      ]}>
                        {event.eventName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {!selectedEventId ? (
                  <View style={styles.emptyContainer}>
                    <Users size={64} color="#d1d5db" />
                    <Text style={styles.emptyText}>Select an event to view participants</Text>
                  </View>
                ) : participantsError ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.errorText}>Error loading participants</Text>
                    <Text style={styles.errorSubtext}>
                      {participantsError.message || "Failed to fetch participants"}
                    </Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => refetchParticipants()}
                    >
                      <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : participantsLoading ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Loading participants...</Text>
                  </View>
                ) : !participants || participants.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Users size={64} color="#d1d5db" />
                    <Text style={styles.emptyText}>No participants yet</Text>
                    <Text style={styles.emptySubtext}>No one has registered for this event</Text>
                  </View>
                ) : (
                  participants.map((participant: any) => (
                    <View key={participant.id} style={styles.participantCard}>
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName}>
                          {`${participant.firstName} ${participant.otherNames || ""}`.trim() || "Unknown User"}
                        </Text>
                        <View style={styles.participantDetails}>
                          <View style={styles.participantDetailRow}>
                            <Text style={styles.participantDetailLabel}>Event:</Text>
                            <Text style={styles.participantDetailValue}>{participant.eventName}</Text>
                          </View>
                          {participant.sex && (
                            <View style={styles.participantDetailRow}>
                              <Text style={styles.participantDetailLabel}>Sex:</Text>
                              <Text style={styles.participantDetailValue}>{participant.sex}</Text>
                            </View>
                          )}
                          {participant.residence && (
                            <View style={styles.participantDetailRow}>
                              <Text style={styles.participantDetailLabel}>Residence:</Text>
                              <Text style={styles.participantDetailValue}>{participant.residence}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}
        </View>
      ) : activeTab === "enrollments" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {enrollmentsError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading enrollments</Text>
              <Text style={styles.errorSubtext}>
                {enrollmentsError.message || "Failed to fetch enrollments"}
              </Text>
              <Text style={styles.errorHint}>Please ensure the &quot;event_enrollments&quot; table exists in Supabase.</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => refetchEnrollments()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : enrollmentsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading enrollments...</Text>
            </View>
          ) : !enrollments || enrollments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Calendar size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No enrollments yet</Text>
            </View>
          ) : (
            enrollments.map((enrollment: any) => {
              const event = events?.find(e => e.eventId === enrollment.EventID);
              return (
                <View key={enrollment.EnrollmentID} style={styles.enrollmentCard}>
                  <View style={styles.enrollmentHeader}>
                    <Text style={styles.enrollmentEvent}>{event?.eventName || enrollment.EventID}</Text>
                    <Text style={styles.enrollmentDate}>{formatDate(enrollment.Enrolled_At)}</Text>
                  </View>
                  <View style={styles.enrollmentDetails}>
                    <View style={styles.enrollmentRow}>
                      <Text style={styles.enrollmentLabel}>Name:</Text>
                      <Text style={styles.enrollmentValue}>
                        {enrollment.First_Name} {enrollment.Other_Names}
                      </Text>
                    </View>
                    <View style={styles.enrollmentRow}>
                      <Text style={styles.enrollmentLabel}>Email:</Text>
                      <Text style={styles.enrollmentValue} numberOfLines={1}>
                        {enrollment.Email}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : activeTab === "activityUploads" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {activityUploadsError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading activity uploads</Text>
              <Text style={styles.errorSubtext}>
                {activityUploadsError.message || "Failed to fetch activity uploads"}
              </Text>
              <Text style={styles.errorHint}>Please ensure the &quot;activity_uploads_admin_log&quot; table exists in Supabase.</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => refetchActivityUploads()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : activityUploadsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading activity uploads...</Text>
            </View>
          ) : !activityUploads || activityUploads.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ClipboardCheck size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No activity uploads yet</Text>
            </View>
          ) : (
            activityUploads.map((upload: any, index: number) => (
              <View key={`${upload.registrationId}-${index}`} style={styles.uploadCard}>
                <View style={styles.uploadInfo}>
                  <Text style={styles.uploadFileName}>{upload.fileName}</Text>
                  <View style={styles.uploadDetails}>
                    <View style={styles.uploadDetailRow}>
                      <Text style={styles.uploadDetailLabel}>User:</Text>
                      <Text style={styles.uploadDetailValue}>{upload.userName}</Text>
                    </View>
                    <View style={styles.uploadDetailRow}>
                      <Text style={styles.uploadDetailLabel}>Email:</Text>
                      <Text style={styles.uploadDetailValue} numberOfLines={1}>{upload.email}</Text>
                    </View>
                    <View style={styles.uploadDetailRow}>
                      <Text style={styles.uploadDetailLabel}>Uploaded:</Text>
                      <Text style={styles.uploadDetailValue}>
                        {new Date(upload.uploadedAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={() => handleFileDownload(upload)}
                  >
                    <Download size={18} color="#fff" />
                    <Text style={styles.downloadButtonText}>Download File</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === "ratings" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {ratingsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading ratings...</Text>
            </View>
          ) : appRatings.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Star size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No ratings yet</Text>
              <Text style={styles.emptySubtext}>User ratings will appear here</Text>
            </View>
          ) : (
            <>
              <View style={styles.ratingSummaryCard}>
                <View style={styles.ratingSummaryLeft}>
                  <Text style={styles.ratingSummaryScore}>{averageRating.toFixed(1)}</Text>
                  <View style={styles.ratingSummaryStars}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={16}
                        color={s <= Math.round(averageRating) ? '#f59e0b' : '#d1d5db'}
                        fill={s <= Math.round(averageRating) ? '#f59e0b' : 'transparent'}
                      />
                    ))}
                  </View>
                  <Text style={styles.ratingSummaryCount}>{appRatings.length} {appRatings.length === 1 ? 'rating' : 'ratings'}</Text>
                </View>
                <View style={styles.ratingSummaryRight}>
                  {ratingBreakdown.map((item) => (
                    <View key={item.star} style={styles.ratingBarRow}>
                      <Text style={styles.ratingBarLabel}>{item.star}</Text>
                      <Star size={12} color="#f59e0b" fill="#f59e0b" />
                      <View style={styles.ratingBarTrack}>
                        <View style={[styles.ratingBarFill, { width: `${item.percentage}%` }]} />
                      </View>
                      <Text style={styles.ratingBarCount}>{item.count}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {appRatings.map((rating) => (
                <View key={rating.rating_id} style={styles.ratingCard}>
                  <View style={styles.ratingCardHeader}>
                    <View style={styles.ratingCardStars}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={14}
                          color={s <= rating.rating ? '#f59e0b' : '#d1d5db'}
                          fill={s <= rating.rating ? '#f59e0b' : 'transparent'}
                        />
                      ))}
                    </View>
                    <Text style={styles.ratingCardDate}>{formatDate(rating.created_at)}</Text>
                  </View>
                  <Text style={styles.ratingCardUser}>{rating.registration_id}</Text>
                  {rating.feedback && (
                    <Text style={styles.ratingCardFeedback}>{rating.feedback}</Text>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      ) : activeTab === "suggestions" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {suggestionsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading suggestions...</Text>
            </View>
          ) : suggestions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MessageSquare size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No suggestions yet</Text>
              <Text style={styles.emptySubtext}>User suggestions will appear here</Text>
            </View>
          ) : (
            suggestions.map((item) => (
              <View key={item.suggestion_id} style={styles.suggestionCard}>
                <View style={styles.suggestionHeader}>
                  <Text style={styles.suggestionUser} numberOfLines={1}>{item.registration_id}</Text>
                  <Text style={styles.suggestionDate}>{formatDate(item.created_at)}</Text>
                </View>
                <Text style={styles.suggestionText}>{item.suggestion}</Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : activeTab === "externalActivities" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {externalSubmissionsLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading submissions...</Text>
            </View>
          ) : !externalSubmissions || externalSubmissions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ClipboardCheck size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No external activity submissions</Text>
              <Text style={styles.emptySubtext}>Users can submit historical activities via the Activity tab</Text>
            </View>
          ) : (
            externalSubmissions.map((dateGroup: any, index: number) => (
              <View key={`${dateGroup.activityDate}-${index}`} style={styles.dateGroupCard}>
                <View style={styles.dateGroupHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dateGroupDate}>{formatDate(dateGroup.activityDate)}</Text>
                    <Text style={styles.dateGroupSubtext}>{dateGroup.users.length} {dateGroup.users.length === 1 ? 'user' : 'users'}</Text>
                  </View>
                  <View style={styles.totalEntriesBadge}>
                    <Text style={styles.totalEntriesText}>{dateGroup.totalEntries}</Text>
                    <Text style={styles.totalEntriesLabel}>entries</Text>
                  </View>
                </View>
                
                <View style={styles.usersList}>
                  {dateGroup.users.map((user: any, userIndex: number) => (
                    <View key={`${user.registrationId}-${userIndex}`} style={styles.userRow}>
                      <View style={styles.userInfo}>
                        <Text style={styles.userRowId}>{user.registrationId}</Text>
                        <Text style={styles.userRowName}>{user.userName}</Text>
                      </View>
                      <View style={styles.userCountBadge}>
                        <Text style={styles.userCountText}>{user.activityCount}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {pendingActivitiesError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.errorText}>Error loading activities</Text>
              <Text style={styles.errorSubtext}>
                {pendingActivitiesError instanceof Error 
                  ? pendingActivitiesError.message 
                  : "Failed to fetch pending activities. The table may not exist."}
              </Text>
              <Text style={styles.errorHint}>Please ensure the &quot;pending_activities&quot; table is created in Supabase.</Text>
            </View>
          ) : pendingActivitiesLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading pending activities...</Text>
            </View>
          ) : !pendingActivitiesError && pendingActivities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ClipboardCheck size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No pending approvals</Text>
            </View>
          ) : (
            pendingActivities.map((activity) => (
              <TouchableOpacity
                key={activity.PendingActivityID}
                style={styles.activityCard}
                onPress={() => {
                  setSelectedActivity(activity);
                  setShowActivityModal(true);
                }}
              >
                <View style={styles.activityInfo}>
                  <Text style={styles.activityType}>{activity.Exercise_Type}</Text>
                  <Text style={styles.activityDate}>{formatDate(activity.Created_At)}</Text>
                  <View style={styles.activityStats}>
                    <Text style={styles.activityStat}>
                      {activity.Distance_Entered.toFixed(2)} {activity.Distance_Unit}
                    </Text>
                    <Text style={styles.activityStat}>
                      {formatTimeInterval(activity.Time_Entered)}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#6b7280" />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={showStatusModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Order Status</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.statusOptions}>
              {["pending", "processing", "shipped", "delivered", "cancelled"].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusOption,
                    selectedStatus === status && styles.statusOptionSelected,
                  ]}
                  onPress={() => setSelectedStatus(status)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      selectedStatus === status && styles.statusOptionTextSelected,
                    ]}
                  >
                    {getStatusLabel(status)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={confirmStatusUpdate}
              disabled={updateDeliveryStatusMutation.isPending}
            >
              <Text style={styles.confirmButtonText}>
                {updateDeliveryStatusMutation.isPending ? "Updating..." : "Update Status"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showStockModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Stock</Text>
              <TouchableOpacity onPress={() => setShowStockModal(false)}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {selectedProduct && (
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{selectedProduct.Catalogue_Item}</Text>
                <Text style={styles.productCurrentStock}>
                  Current Stock: {selectedProduct.Quanity || 0}
                </Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>New Stock Quantity</Text>
              <TextInput
                style={styles.input}
                value={newStock}
                onChangeText={setNewStock}
                placeholder="Enter stock quantity"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
              />
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={confirmStockUpdate}
              disabled={updateStockMutation.isPending}
            >
              <Text style={styles.confirmButtonText}>
                {updateStockMutation.isPending ? "Updating..." : "Update Stock"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

<Modal visible={showActivityModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.activityModalContent}>
            {selectedActivity && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Review Activity</Text>
                  <TouchableOpacity onPress={() => setShowActivityModal(false)}>
                    <X size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.activityModalBody}>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Type</Text>
                    <Text style={styles.detailValue}>{selectedActivity.Exercise_Type}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Submitted At</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedActivity.Created_At)}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Distance</Text>
                      <Text style={styles.detailValue}>{selectedActivity.Distance_Entered.toFixed(2)} {selectedActivity.Distance_Unit}</Text>
                    </View>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Time</Text>
                      <Text style={styles.detailValue}>
                        {formatTimeInterval(selectedActivity.Time_Entered)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Treadmill Photo</Text>
                    <Image
                      source={{ uri: selectedActivity.Photo_Path }}
                      style={styles.activityImage}
                      resizeMode="contain"
                    />
                  </View>
                </ScrollView>

                <View style={styles.activityActions}>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => rejectMutation.mutate(selectedActivity.PendingActivityID)}
                    disabled={rejectMutation.isPending}
                  >
                    <XCircle size={22} color="#fff" />
                    <Text style={styles.actionBtnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => approveMutation.mutate(selectedActivity)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle size={22} color="#fff" />
                    <Text style={styles.actionBtnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showEventModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Event</Text>
              <TouchableOpacity onPress={() => setShowEventModal(false)}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Event Name</Text>
              <TextInput
                style={styles.input}
                value={eventName}
                onChangeText={setEventName}
                placeholder="Enter event name"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Start Date</Text>
              <TextInput
                style={styles.input}
                value={startsAt}
                onChangeText={setStartsAt}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>End Date</Text>
              <TextInput
                style={styles.input}
                value={endsAt}
                onChangeText={setEndsAt}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.sectionDivider}>
              <Text style={styles.sectionTitle}>Medal Criteria (Optional)</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Min Daily Distance (km)</Text>
              <TextInput
                style={styles.input}
                value={medalMinDailyDistance}
                onChangeText={setMedalMinDailyDistance}
                placeholder="e.g., 5"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Min Cumulative Distance (km)</Text>
              <TextInput
                style={styles.input}
                value={medalMinCumulativeDistance}
                onChangeText={setMedalMinCumulativeDistance}
                placeholder="e.g., 100"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Medal Tracking Start Date</Text>
              <TextInput
                style={styles.input}
                value={medalDateStart}
                onChangeText={setMedalDateStart}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Medal Tracking End Date</Text>
              <TextInput
                style={styles.input}
                value={medalDateEnd}
                onChangeText={setMedalDateEnd}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleAddEvent}
              disabled={addEventMutation.isPending}
            >
              <Text style={styles.confirmButtonText}>
                {addEventMutation.isPending ? "Adding..." : "Add Event"}
              </Text>
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
    backgroundColor: "#f9fafb",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  menuGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 12,
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  menuButton: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 110,
    width: "31%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 2,
    borderColor: "transparent",
  },
  menuButtonActive: {
    backgroundColor: "#10b98108",
    borderColor: "#10b981",
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#10b98115",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: "#10b981",
  },
  menuButtonText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#374151",
    textAlign: "center",
  },
  menuButtonTextActive: {
    color: "#10b981",
  },
  badge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#ef4444",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 16,
    marginTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#374151",
  },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  orderId: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  orderDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  orderLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500" as const,
  },
  orderValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600" as const,
    flex: 1,
    textAlign: "right",
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#10b981",
  },
  stockCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stockInfo: {
    flex: 1,
    gap: 4,
  },
  stockName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
  },
  stockSize: {
    fontSize: 13,
    color: "#6b7280",
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  stockLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  stockValue: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#10b981",
  },
  stockValueLow: {
    color: "#f59e0b",
  },
  stockValueOut: {
    color: "#ef4444",
  },
  editButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    gap: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#111827",
  },
  statusOptions: {
    gap: 10,
  },
  statusOption: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  statusOptionSelected: {
    backgroundColor: "#10b98110",
    borderColor: "#10b981",
  },
  statusOptionText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#374151",
    textAlign: "center",
  },
  statusOptionTextSelected: {
    color: "#10b981",
  },
  confirmButton: {
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  productInfo: {
    backgroundColor: "#f9fafb",
    padding: 16,
    borderRadius: 12,
    gap: 4,
  },
  productName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
  },
  productCurrentStock: {
    fontSize: 14,
    color: "#6b7280",
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#374151",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  activityCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  activityInfo: {
    flex: 1,
    gap: 4,
  },
  activityType: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
  },
  activityDate: {
    fontSize: 14,
    color: "#6b7280",
  },
  activityStats: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  activityStat: {
    fontSize: 13,
    color: "#10b981",
    fontWeight: "600" as const,
  },
  activityModalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "90%",
    maxWidth: 500,
    maxHeight: "85%",
  },
  activityModalBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    gap: 20,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#6b7280",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: "#111827",
  },
  activityImage: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  activityActions: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ef4444",
    padding: 16,
    borderRadius: 12,
  },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    padding: 16,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#fff",
  },

  errorText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 8,
  },
  errorHint: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    fontStyle: "italic" as const,
  },
  addEventContainer: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  addEventButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  addEventButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
  },
  eventCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  eventInfo: {
    gap: 12,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
  },
  eventDates: {
    gap: 8,
  },
  eventDateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventDateLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
  },
  eventDateValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
  },
  errorDetails: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center" as const,
    marginTop: 8,
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 16,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  enrollmentCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  enrollmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  enrollmentEvent: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#10b981",
    flex: 1,
  },
  enrollmentDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  enrollmentDetails: {
    gap: 8,
  },
  enrollmentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  enrollmentLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
    width: 80,
  },
  enrollmentValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
    flex: 1,
  },
  eventsSubTabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  eventsSubTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  eventsSubTabActive: {
    borderBottomColor: "#10b981",
  },
  eventsSubTabText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#6b7280",
  },
  eventsSubTabTextActive: {
    color: "#10b981",
  },
  eventFilterContainer: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  eventFilterLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#374151",
    marginBottom: 12,
  },
  eventFilterScroll: {
    flexGrow: 0,
  },
  eventFilterChip: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  eventFilterChipActive: {
    backgroundColor: "#10b98110",
    borderColor: "#10b981",
  },
  eventFilterChipText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#6b7280",
  },
  eventFilterChipTextActive: {
    color: "#10b981",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 4,
  },
  participantCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  participantInfo: {
    gap: 12,
  },
  participantName: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
  },
  participantDetails: {
    gap: 8,
  },
  participantDetailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  participantDetailLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
    width: 140,
  },
  participantDetailValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
    flex: 1,
  },
  participantStatus: {
    textTransform: "capitalize" as const,
  },
  participantDaysCompleted: {
    color: "#10b981",
    fontWeight: "700" as const,
  },
  uploadCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  uploadInfo: {
    gap: 12,
  },
  uploadFileName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
  },
  uploadDetails: {
    gap: 8,
  },
  uploadDetailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  uploadDetailLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
    width: 100,
  },
  uploadDetailValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
    flex: 1,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#fff",
  },
  submissionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  submissionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  submissionUser: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111827",
    flex: 1,
  },
  submissionDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  submissionDetails: {
    gap: 8,
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 12,
  },
  submissionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  submissionLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6b7280",
    width: 100,
  },
  submissionValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
    flex: 1,
  },
  submissionActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  submissionRegId: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  activityCountBadge: {
    backgroundColor: "#10b981",
    borderRadius: 20,
    minWidth: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  activityCountText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
  },
  dateGroupCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  dateGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  dateGroupDate: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: "#111827",
  },
  dateGroupSubtext: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  totalEntriesBadge: {
    backgroundColor: "#10b98115",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#10b98130",
  },
  totalEntriesText: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#10b981",
    lineHeight: 20,
  },
  totalEntriesLabel: {
    fontSize: 10,
    color: "#10b981",
    fontWeight: "600" as const,
  },
  usersList: {
    gap: 8,
  },
  userRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userRowId: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "500" as const,
  },
  userRowName: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600" as const,
  },
  userCountBadge: {
    backgroundColor: "#10b981",
    borderRadius: 8,
    minWidth: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  userCountText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#fff",
  },
  sectionDivider: {
    paddingTop: 8,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#6b7280",
    paddingTop: 8,
  },
  ratingSummaryCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row" as const,
    gap: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 8,
  },
  ratingSummaryLeft: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    minWidth: 80,
  },
  ratingSummaryScore: {
    fontSize: 40,
    fontWeight: "800" as const,
    color: "#111827",
    lineHeight: 44,
  },
  ratingSummaryStars: {
    flexDirection: "row" as const,
    gap: 2,
  },
  ratingSummaryCount: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  ratingSummaryRight: {
    flex: 1,
    gap: 6,
    justifyContent: "center" as const,
  },
  ratingBarRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  ratingBarLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#374151",
    width: 14,
    textAlign: "right" as const,
  },
  ratingBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
    overflow: "hidden" as const,
  },
  ratingBarFill: {
    height: 8,
    backgroundColor: "#f59e0b",
    borderRadius: 4,
  },
  ratingBarCount: {
    fontSize: 12,
    color: "#6b7280",
    width: 24,
    textAlign: "right" as const,
  },
  ratingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  ratingCardHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  ratingCardStars: {
    flexDirection: "row" as const,
    gap: 2,
  },
  ratingCardDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  ratingCardUser: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500" as const,
  },
  ratingCardFeedback: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
    marginTop: 2,
  },
  orderItemsList: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 4,
  },
  orderItemsTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#6b7280",
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  orderItemRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 4,
  },
  orderItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#111827",
  },
  orderItemQty: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#6b7280",
    minWidth: 30,
    textAlign: "center" as const,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#10b981",
    minWidth: 80,
    textAlign: "right" as const,
  },
  printStickerBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  printStickerText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#fff",
  },
  suggestionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 10,
  },
  suggestionHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  suggestionUser: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500" as const,
    flex: 1,
    marginRight: 8,
  },
  suggestionDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  suggestionText: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
  },
});
