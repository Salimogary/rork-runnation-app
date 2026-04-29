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
import updateEventRoute from "./routes/admin/update-event/route";
import updateEventApprovalRoute from "./routes/admin/update-event-approval/route";
import getParticipantsRoute from "./routes/admin/get-participants/route";
import enrollEventRoute from "./routes/admin/enroll-event/route";
import getEnrollmentsRoute from "./routes/admin/get-enrollments/route";
import approveEnrollmentRoute from "./routes/admin/approve-enrollment/route";
import rejectEnrollmentRoute from "./routes/admin/reject-enrollment/route";
import markEnrollmentPaidRoute from "./routes/admin/mark-enrollment-paid/route";
import getActivityUploadsRoute from "./routes/admin/get-activity-uploads/route";
import getPendingActivitiesRoute from "./routes/admin/get-pending-activities/route";
import approvePendingActivityRoute from "./routes/admin/approve-pending-activity/route";
import rejectPendingActivityRoute from "./routes/admin/reject-pending-activity/route";
import uploadActivityFileRoute from "./routes/admin/upload-activity-file/route";
import emailActivityFileRoute from "./routes/admin/email-activity-file/route";
import getMedalListRoute from "./routes/admin/get-medal-list/route";
import submitExternalActivityRoute from "./routes/activities/submit-external-activity/route";
import submitTreadmillActivityRoute from "./routes/activities/submit-treadmill-activity/route";
import getExternalSubmissionsRoute from "./routes/activities/get-external-submissions/route";
import approveExternalSubmissionRoute from "./routes/activities/approve-external-submission/route";
import rejectExternalSubmissionRoute from "./routes/activities/reject-external-submission/route";
import completeEventRunRoute from "./routes/activities/complete-event-run/route";
import getDeliveryOrdersRoute from "./routes/admin/get-delivery-orders/route";
import updateDeliveryOrderStatusRoute from "./routes/admin/update-delivery-order-status/route";
import getMagazineSubmissionsRoute from "./routes/admin/get-magazine-submissions/route";
import updateMagazineSubmissionStatusRoute from "./routes/admin/update-magazine-submission-status/route";
import deleteMagazineSubmissionRoute from "./routes/admin/delete-magazine-submission/route";
import getMagazinePictorialsRoute from "./routes/admin/get-magazine-pictorials/route";
import updateMagazinePictorialStatusRoute from "./routes/admin/update-magazine-pictorial-status/route";
import setPictureOfWeekRoute from "./routes/admin/set-picture-of-week/route";
import deleteMagazinePictorialRoute from "./routes/admin/delete-magazine-pictorial/route";
import getClubMembershipRequestsRoute from "./routes/admin/get-club-membership-requests/route";
import updateClubMembershipRequestRoute from "./routes/admin/update-club-membership-request/route";
import getAuditLogsRoute from "./routes/admin/get-audit-logs/route";
import getAccountLinkHealthRoute from "./routes/admin/get-account-link-health/route";
import repairAccountLinkRoute from "./routes/admin/repair-account-link/route";
import getRoleManagementRoute from "./routes/admin/get-role-management/route";
import getEventOrganizersRoute from "./routes/admin/get-event-organizers/route";
import updateEventOrganizerRoute from "./routes/admin/update-event-organizer/route";
import deactivateEventOrganizerRoute from "./routes/admin/deactivate-event-organizer/route";
import getAdminTermsStatusRoute from "./routes/admin/get-admin-terms-status/route";
import acceptAdminTermsRoute from "./routes/admin/accept-admin-terms/route";
import createRoleRequestRoute from "./routes/admin/create-role-request/route";
import approveRoleRequestRoute from "./routes/admin/approve-role-request/route";
import rejectRoleRequestRoute from "./routes/admin/reject-role-request/route";
import updateRoleAssignmentRoute from "./routes/admin/update-role-assignment/route";
import deleteRoleAssignmentRoute from "./routes/admin/delete-role-assignment/route";
import requestAdminPasswordResetRoute from "./routes/admin/request-password-reset/route";
import resetAdminPasswordRoute from "./routes/admin/reset-password/route";
import registerRoute from "./routes/auth/register/route";
import saveContactsRoute from "./routes/auth/save-contacts/route";
import saveGoalsRoute from "./routes/auth/save-goals/route";
import saveClubMembershipRoute from "./routes/auth/save-club-membership/route";
import getCountriesRoute from "./routes/auth/get-countries/route";
import getGoalsRoute from "./routes/auth/get-goals/route";
import getClubsRoute from "./routes/auth/get-clubs/route";
import createAuthUserRoute from "./routes/auth/create-auth-user/route";
import ensureOauthRegistrationRoute from "./routes/auth/ensure-oauth-registration/route";
import syncSocialContactEmailRoute from "./routes/auth/sync-social-contact-email/route";
import submitSuggestionRoute from "./routes/feedback/submit-suggestion/route";
import submitRatingRoute from "./routes/feedback/submit-rating/route";
import createSocialPostRoute from "./routes/social/create-post/route";
import getSocialPostsRoute from "./routes/social/get-posts/route";
import toggleSocialLikeRoute from "./routes/social/toggle-like/route";
import deleteSocialPostRoute from "./routes/social/delete-post/route";
import getCurrentActivityRoute from "./routes/social/get-current-activity/route";
import getCommentsRoute from "./routes/social/get-comments/route";
import addCommentRoute from "./routes/social/add-comment/route";
import deleteCommentRoute from "./routes/social/delete-comment/route";
import votePollRoute from "./routes/social/vote-poll/route";
import getMentionCountRoute from "./routes/social/get-mention-count/route";
import markMentionsReadRoute from "./routes/social/mark-mentions-read/route";
import togglePostReactionRoute from "./routes/social/toggle-post-reaction/route";
import toggleCommentReactionRoute from "./routes/social/toggle-comment-reaction/route";
import getProfileBundleRoute from "./routes/profile/get-bundle/route";
import updateProfileRoute from "./routes/profile/update-profile/route";
import saveProfileGoalsRoute from "./routes/profile/save-goals/route";
import saveProfileClubMembershipRoute from "./routes/profile/save-club-membership/route";
import uploadProfilePhotoRoute from "./routes/profile/upload-photo/route";
import sendEmailVerificationRoute from "./routes/profile/send-email-verification/route";
import verifyEmailCodeRoute from "./routes/profile/verify-email-code/route";
import getRoleSessionRoute from "./routes/session/get-role-session/route";
import getPublicEventsRoute from "./routes/events/get-events/route";
import getRegisteredEventsRoute from "./routes/events/get-registered-events/route";
import submitMagazineArticleRoute from "./routes/magazine/submit-article/route";
import submitMagazinePictorialRoute from "./routes/magazine/submit-pictorial/route";
import getMagazinePictorialsPublicRoute from "./routes/magazine/get-pictorials/route";
import getAdminContactsRoute from "./routes/support/get-admin-contacts/route";
import getFaqEntriesRoute from "./routes/support/get-faq-entries/route";

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
    updateEvent: updateEventRoute,
    updateEventApproval: updateEventApprovalRoute,
    getParticipants: getParticipantsRoute,
    enrollEvent: enrollEventRoute,
    getEnrollments: getEnrollmentsRoute,
    approveEnrollment: approveEnrollmentRoute,
    rejectEnrollment: rejectEnrollmentRoute,
    markEnrollmentPaid: markEnrollmentPaidRoute,
    getActivityUploads: getActivityUploadsRoute,
    getPendingActivities: getPendingActivitiesRoute,
    approvePendingActivity: approvePendingActivityRoute,
    rejectPendingActivity: rejectPendingActivityRoute,
    uploadActivityFile: uploadActivityFileRoute,
    emailActivityFile: emailActivityFileRoute,
    getMedalList: getMedalListRoute,
    getDeliveryOrders: getDeliveryOrdersRoute,
    updateDeliveryOrderStatus: updateDeliveryOrderStatusRoute,
    getMagazineSubmissions: getMagazineSubmissionsRoute,
    updateMagazineSubmissionStatus: updateMagazineSubmissionStatusRoute,
    deleteMagazineSubmission: deleteMagazineSubmissionRoute,
    getMagazinePictorials: getMagazinePictorialsRoute,
    updateMagazinePictorialStatus: updateMagazinePictorialStatusRoute,
    setPictureOfWeek: setPictureOfWeekRoute,
    deleteMagazinePictorial: deleteMagazinePictorialRoute,
    getClubMembershipRequests: getClubMembershipRequestsRoute,
    updateClubMembershipRequest: updateClubMembershipRequestRoute,
    getAuditLogs: getAuditLogsRoute,
    getAccountLinkHealth: getAccountLinkHealthRoute,
    repairAccountLink: repairAccountLinkRoute,
    getRoleManagement: getRoleManagementRoute,
    getEventOrganizers: getEventOrganizersRoute,
    updateEventOrganizer: updateEventOrganizerRoute,
    deactivateEventOrganizer: deactivateEventOrganizerRoute,
    getAdminTermsStatus: getAdminTermsStatusRoute,
    acceptAdminTerms: acceptAdminTermsRoute,
    createRoleRequest: createRoleRequestRoute,
    approveRoleRequest: approveRoleRequestRoute,
    rejectRoleRequest: rejectRoleRequestRoute,
    updateRoleAssignment: updateRoleAssignmentRoute,
    deleteRoleAssignment: deleteRoleAssignmentRoute,
    requestPasswordReset: requestAdminPasswordResetRoute,
    resetPassword: resetAdminPasswordRoute,
  }),
  activities: createTRPCRouter({
    submitTreadmillActivity: submitTreadmillActivityRoute,
    submitExternalActivity: submitExternalActivityRoute,
    getExternalSubmissions: getExternalSubmissionsRoute,
    approveExternalSubmission: approveExternalSubmissionRoute,
    rejectExternalSubmission: rejectExternalSubmissionRoute,
    completeEventRun: completeEventRunRoute,
  }),
  auth: createTRPCRouter({
    register: registerRoute,
    saveContacts: saveContactsRoute,
    saveGoals: saveGoalsRoute,
    saveClubMembership: saveClubMembershipRoute,
    getCountries: getCountriesRoute,
    getGoals: getGoalsRoute,
    getClubs: getClubsRoute,
    createAuthUser: createAuthUserRoute,
    ensureOauthRegistration: ensureOauthRegistrationRoute,
    syncSocialContactEmail: syncSocialContactEmailRoute,
  }),
  feedback: createTRPCRouter({
    submitSuggestion: submitSuggestionRoute,
    submitRating: submitRatingRoute,
  }),
  social: createTRPCRouter({
    createPost: createSocialPostRoute,
    getPosts: getSocialPostsRoute,
    getComments: getCommentsRoute,
    addComment: addCommentRoute,
    deleteComment: deleteCommentRoute,
    toggleLike: toggleSocialLikeRoute,
    votePoll: votePollRoute,
    getMentionCount: getMentionCountRoute,
    markMentionsRead: markMentionsReadRoute,
    togglePostReaction: togglePostReactionRoute,
    toggleCommentReaction: toggleCommentReactionRoute,
    deletePost: deleteSocialPostRoute,
    getCurrentActivity: getCurrentActivityRoute,
  }),
  profile: createTRPCRouter({
    getBundle: getProfileBundleRoute,
    updateProfile: updateProfileRoute,
    saveGoals: saveProfileGoalsRoute,
    saveClubMembership: saveProfileClubMembershipRoute,
    uploadPhoto: uploadProfilePhotoRoute,
    sendEmailVerification: sendEmailVerificationRoute,
    verifyEmailCode: verifyEmailCodeRoute,
  }),
  session: createTRPCRouter({
    getRoleSession: getRoleSessionRoute,
  }),
  events: createTRPCRouter({
    getEvents: getPublicEventsRoute,
    getRegisteredEvents: getRegisteredEventsRoute,
  }),
  magazine: createTRPCRouter({
    submitArticle: submitMagazineArticleRoute,
    submitPictorial: submitMagazinePictorialRoute,
    getPictorials: getMagazinePictorialsPublicRoute,
  }),
  support: createTRPCRouter({
    getAdminContacts: getAdminContactsRoute,
    getFaqEntries: getFaqEntriesRoute,
  }),
});

export type AppRouter = typeof appRouter;
