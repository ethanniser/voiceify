import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  articles: defineTable({
    url: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    audioFileId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),
  }),
});
