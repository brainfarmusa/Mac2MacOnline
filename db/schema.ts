import {integer,real,sqliteTable,text} from "drizzle-orm/sqlite-core";

export const internalBids=sqliteTable("internal_bids",{
  id:text("id").primaryKey(),
  internalBidNumber:text("internal_bid_number").notNull().unique(),
  dealNumber:text("deal_number").notNull(),
  company:text("company").notNull(),
  contactName:text("contact_name").notNull(),
  email:text("email").notNull(),
  phone:text("phone").notNull(),
  customerNotes:text("customer_notes").notNull().default(""),
  lineItemsJson:text("line_items_json").notNull(),
  lineCount:integer("line_count").notNull(),
  totalQuantity:integer("total_quantity").notNull(),
  totalBid:real("total_bid").notNull(),
  status:text("status").notNull().default("submitted"),
  submittedAt:text("submitted_at").notNull(),
});

export const internalBidCustomers=sqliteTable("internal_bid_customers",{
  bidId:text("bid_id").primaryKey(),
  customerUserId:text("customer_user_id"),
  address1:text("address1").notNull().default(""),
  address2:text("address2").notNull().default(""),
  city:text("city").notNull().default(""),
  region:text("region").notNull().default(""),
  postalCode:text("postal_code").notNull().default(""),
  country:text("country").notNull().default(""),
});

export const customerProfiles=sqliteTable("customer_profiles",{
  userId:text("user_id").primaryKey(),
  email:text("email").notNull(),
  company:text("company").notNull().default(""),
  contactName:text("contact_name").notNull().default(""),
  phone:text("phone").notNull().default(""),
  address1:text("address1").notNull().default(""),
  address2:text("address2").notNull().default(""),
  city:text("city").notNull().default(""),
  region:text("region").notNull().default(""),
  postalCode:text("postal_code").notNull().default(""),
  country:text("country").notNull().default("United States"),
  updatedAt:text("updated_at").notNull(),
});

export const bidNotificationLog=sqliteTable("bid_notification_log",{
  id:text("id").primaryKey(),
  bidNumber:text("bid_number").notNull(),
  channel:text("channel").notNull(),
  status:text("status").notNull(),
  error:text("error").notNull().default(""),
  createdAt:text("created_at").notNull(),
});

export const dealComments=sqliteTable("deal_comments",{
  id:text("id").primaryKey(),dealId:text("deal_id").notNull(),dealNumber:text("deal_number").notNull(),authorUserId:text("author_user_id").notNull(),authorEmail:text("author_email").notNull(),authorName:text("author_name").notNull(),authorInitials:text("author_initials").notNull(),comment:text("comment").notNull(),createdAt:text("created_at").notNull(),editedAt:text("edited_at"),
});

export const marketingConversions=sqliteTable("marketing_conversions",{
  id:text("id").primaryKey(),eventName:text("event_name").notNull(),label:text("label").notNull().default(""),path:text("path").notNull().default(""),referrer:text("referrer").notNull().default(""),createdAt:text("created_at").notNull(),
});
