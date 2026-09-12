import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const internalBids = sqliteTable("internal_bids", {
  id: text("id").primaryKey(),
  internalBidNumber: text("internal_bid_number").notNull().unique(),
  dealNumber: text("deal_number").notNull(),
  company: text("company").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  customerNotes: text("customer_notes").notNull().default(""),
  lineItemsJson: text("line_items_json").notNull(),
  lineCount: integer("line_count").notNull(),
  totalQuantity: integer("total_quantity").notNull(),
  totalBid: real("total_bid").notNull(),
  offerType: text("offer_type").notNull().default("line_item"),
  status: text("status").notNull().default("submitted"),
  submittedAt: text("submitted_at").notNull(),
});

export const internalBidCustomers = sqliteTable("internal_bid_customers", {
  bidId: text("bid_id").primaryKey(),
  customerUserId: text("customer_user_id"),
  address1: text("address1").notNull().default(""),
  address2: text("address2").notNull().default(""),
  city: text("city").notNull().default(""),
  region: text("region").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  country: text("country").notNull().default(""),
});

export const dealBoxAwards = sqliteTable("deal_box_awards", {
  id: text("id").primaryKey(),
  dealNumber: text("deal_number").notNull(),
  boxNumber: text("box_number").notNull(),
  controlNumber: text("control_number").notNull().default(""),
  quantity: integer("quantity").notNull(),
  internalBidNumber: text("internal_bid_number").notNull(),
  company: text("company").notNull(),
  awardAmount: real("award_amount").notNull(),
  lineNumbersJson: text("line_numbers_json").notNull().default("[]"),
  awardedBy: text("awarded_by").notNull(),
  awardedAt: text("awarded_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("deal_box_awards_deal_box_unique").on(table.dealNumber, table.boxNumber),
]);

export const customerProfiles = sqliteTable("customer_profiles", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  company: text("company").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address1: text("address1").notNull().default(""),
  address2: text("address2").notNull().default(""),
  city: text("city").notNull().default(""),
  region: text("region").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  country: text("country").notNull().default("United States"),
  updatedAt: text("updated_at").notNull(),
});

export const bidNotificationLog = sqliteTable("bid_notification_log", {
  id: text("id").primaryKey(),
  bidNumber: text("bid_number").notNull(),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const dealComments = sqliteTable("deal_comments", {
  id: text("id").primaryKey(),
  dealId: text("deal_id").notNull(),
  dealNumber: text("deal_number").notNull(),
  authorUserId: text("author_user_id").notNull(),
  authorEmail: text("author_email").notNull(),
  authorName: text("author_name").notNull(),
  authorInitials: text("author_initials").notNull(),
  comment: text("comment").notNull(),
  createdAt: text("created_at").notNull(),
  editedAt: text("edited_at"),
});

export const dealSummaryEstimates = sqliteTable("deal_summary_estimates", {
  dealId: text("deal_id").primaryKey(),
  dealNumber: text("deal_number").notNull(),
  proposedAmount: real("proposed_amount").notNull().default(0),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const marketingConversions = sqliteTable("marketing_conversions", {
  id: text("id").primaryKey(),
  eventName: text("event_name").notNull(),
  label: text("label").notNull().default(""),
  path: text("path").notNull().default(""),
  referrer: text("referrer").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const dealPhotos = sqliteTable("deal_photos", {
  id: text("id").primaryKey(),
  dealNumber: text("deal_number").notNull(),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const businessRecordAttachments = sqliteTable("business_record_attachments", {
  id: text("id").primaryKey(),
  recordType: text("record_type").notNull(),
  recordId: text("record_id").notNull(),
  recordName: text("record_name").notNull().default(""),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("business_record_attachments_record_file_unique").on(table.recordType, table.recordId, table.objectKey),
]);

export const businessRecordStatuses = sqliteTable("business_record_statuses", {
  id: text("id").primaryKey(),
  recordType: text("record_type").notNull(),
  recordId: text("record_id").notNull(),
  status: text("status").notNull().default("new"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const businessRecordComments = sqliteTable("business_record_comments", {
  id: text("id").primaryKey(),
  recordType: text("record_type").notNull(),
  recordId: text("record_id").notNull(),
  comments: text("comments").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});
