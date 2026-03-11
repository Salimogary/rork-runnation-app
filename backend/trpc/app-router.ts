import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import cartRoute from "./routes/shop/cart/route";
import getCartRoute from "./routes/shop/get-cart/route";
import updateCartItemRoute from "./routes/shop/update-cart-item/route";
import removeCartItemRoute from "./routes/shop/remove-cart-item/route";
import clearCartRoute from "./routes/shop/clear-cart/route";
import checkoutRoute from "./routes/shop/checkout/route";
import getOrdersRoute from "./routes/shop/get-orders/route";
import getOrderDetailsRoute from "./routes/shop/get-order-details/route";
import buyNowRoute from "./routes/shop/buy-now/route";
import getAllOrdersRoute from "./routes/admin/get-all-orders/route";
import updateOrderStatusRoute from "./routes/admin/update-order-status/route";
import updateStockRoute from "./routes/admin/update-stock/route";
import getEventsRoute from "./routes/admin/get-events/route";
import addEventRoute from "./routes/admin/add-event/route";
import getParticipantsRoute from "./routes/admin/get-participants/route";
import enrollEventRoute from "./routes/admin/enroll-event/route";
import getEnrollmentsRoute from "./routes/admin/get-enrollments/route";
import { getSnapshotParticipants } from "./routes/admin/get-snapshot-participants";
import getActivityUploadsRoute from "./routes/admin/get-activity-uploads/route";
import uploadActivityFileRoute from "./routes/admin/upload-activity-file/route";
import emailActivityFileRoute from "./routes/admin/email-activity-file/route";
import getMedalListRoute from "./routes/admin/get-medal-list/route";
import submitExternalActivityRoute from "./routes/activities/submit-external-activity/route";
import getExternalSubmissionsRoute from "./routes/activities/get-external-submissions/route";
import approveExternalSubmissionRoute from "./routes/activities/approve-external-submission/route";
import rejectExternalSubmissionRoute from "./routes/activities/reject-external-submission/route";
import getDeliveryOrdersRoute from "./routes/admin/get-delivery-orders/route";
import updateDeliveryOrderStatusRoute from "./routes/admin/update-delivery-order-status/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  shop: createTRPCRouter({
    addToCart: cartRoute,
    getCart: getCartRoute,
    updateCartItem: updateCartItemRoute,
    removeCartItem: removeCartItemRoute,
    clearCart: clearCartRoute,
    checkout: checkoutRoute,
    getOrders: getOrdersRoute,
    getOrderDetails: getOrderDetailsRoute,
    buyNow: buyNowRoute,
  }),
  admin: createTRPCRouter({
    getAllOrders: getAllOrdersRoute,
    updateOrderStatus: updateOrderStatusRoute,
    updateStock: updateStockRoute,
    getEvents: getEventsRoute,
    addEvent: addEventRoute,
    getParticipants: getParticipantsRoute,
    enrollEvent: enrollEventRoute,
    getEnrollments: getEnrollmentsRoute,
    getSnapshotParticipants: getSnapshotParticipants,
    getActivityUploads: getActivityUploadsRoute,
    uploadActivityFile: uploadActivityFileRoute,
    emailActivityFile: emailActivityFileRoute,
    getMedalList: getMedalListRoute,
    getDeliveryOrders: getDeliveryOrdersRoute,
    updateDeliveryOrderStatus: updateDeliveryOrderStatusRoute,
  }),
  activities: createTRPCRouter({
    submitExternalActivity: submitExternalActivityRoute,
    getExternalSubmissions: getExternalSubmissionsRoute,
    approveExternalSubmission: approveExternalSubmissionRoute,
    rejectExternalSubmission: rejectExternalSubmissionRoute,
  }),
});

export type AppRouter = typeof appRouter;
