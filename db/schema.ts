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
