import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import OpenAI from "openai";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("articles").order("desc").collect();

    return Promise.all(
      articles.map(async (article) => ({
        ...article,
        audioUrl: article.audioFileId
          ? await ctx.storage.getUrl(article.audioFileId)
          : null,
      }))
    );
  },
});

export const create = mutation({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("articles")
      .filter((q) => q.eq(q.field("url"), args.url))
      .first();

    if (existing) {
      throw new Error("Article already exists");
    }

    const articleId = await ctx.db.insert("articles", {
      url: args.url,
      status: "processing",
    });

    // Schedule processing
    await ctx.scheduler.runAfter(0, internal.articles.processArticle, {
      articleId,
    });

    return articleId;
  },
});

export const retry = mutation({
  args: { articleId: v.id("articles") },
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new Error("Article not found");
    }

    // Reset article to processing state
    await ctx.db.patch(args.articleId, {
      status: "processing",
      errorMessage: undefined,
      title: undefined,
      content: undefined,
      audioFileId: undefined,
    });

    // Schedule processing
    await ctx.scheduler.runAfter(0, internal.articles.processArticle, {
      articleId: args.articleId,
    });

    return args.articleId;
  },
});

export const processArticle = internalAction({
  args: { articleId: v.id("articles") },
  handler: async (ctx, args) => {
    try {
      // Get article
      const article = await ctx.runQuery(internal.articles.getArticle, {
        articleId: args.articleId,
      });

      if (!article) {
        throw new Error("Article not found");
      }

      // Fetch and extract content
      const response = await fetch(article.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch article: ${response.statusText}`);
      }

      const html = await response.text();

      // Use AI to extract title and content
      const extractedData = await extractArticleContent(html, article.url);

      // Update article with extracted data
      await ctx.runMutation(internal.articles.updateArticle, {
        articleId: args.articleId,
        title: extractedData.title,
        content: extractedData.content,
      });

      // Generate audio using ElevenLabs
      const audioBuffer = await ctx.runAction(internal.audio.generateAudio, {
        text: extractedData.content,
      });

      // Store audio file
      const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
      const audioFileId = await ctx.storage.store(audioBlob);

      // Mark as completed
      await ctx.runMutation(internal.articles.completeArticle, {
        articleId: args.articleId,
        audioFileId,
      });
    } catch (error) {
      console.error("Error processing article:", error);
      await ctx.runMutation(internal.articles.markError, {
        articleId: args.articleId,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

export const getArticle = internalQuery({
  args: { articleId: v.id("articles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.articleId);
  },
});

export const updateArticle = internalMutation({
  args: {
    articleId: v.id("articles"),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.articleId, {
      title: args.title,
      content: args.content,
    });
  },
});

export const completeArticle = internalMutation({
  args: {
    articleId: v.id("articles"),
    audioFileId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.articleId, {
      status: "completed",
      audioFileId: args.audioFileId,
    });
  },
});

export const markError = internalMutation({
  args: {
    articleId: v.id("articles"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.articleId, {
      status: "error",
      errorMessage: args.errorMessage,
    });
  },
});

async function extractArticleContent(html: string, url: string) {
  // First try traditional extraction
  const traditionalExtraction = extractWithTraditionalMethods(html);

  // If traditional methods don't work well, use AI
  if (
    !traditionalExtraction.title ||
    traditionalExtraction.content.length < 200
  ) {
    return await extractWithAI(html, url);
  }

  return traditionalExtraction;
}

function extractWithTraditionalMethods(html: string) {
  // Remove script and style tags
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Extract title
  const titleMatch = cleanHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  let title = titleMatch ? titleMatch[1].trim() : "";

  // Try meta title if no title tag
  if (!title) {
    const metaTitleMatch = cleanHtml.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
    );
    title = metaTitleMatch ? metaTitleMatch[1].trim() : "Untitled Article";
  }

  // Extract content from common article selectors
  const contentSelectors = [
    "article",
    '[role="main"]',
    ".post-content",
    ".entry-content",
    ".article-content",
    ".content",
    "main",
  ];

  let content = "";
  for (const selector of contentSelectors) {
    const regex = new RegExp(
      `<[^>]*class=["'][^"']*${selector.replace(".", "")}[^"']*["'][^>]*>([\\s\\S]*?)<\/[^>]+>`,
      "i"
    );
    const match = cleanHtml.match(regex);
    if (match) {
      content = match[1];
      break;
    }
  }

  // If no content found, try to extract from body
  if (!content) {
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    content = bodyMatch ? bodyMatch[1] : cleanHtml;
  }

  // Clean up content
  content = content
    .replace(/<[^>]+>/g, " ") // Remove HTML tags
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  return { title, content };
}

async function extractWithAI(html: string, url: string) {
  const openai = new OpenAI({
    baseURL: process.env.CONVEX_OPENAI_BASE_URL,
    apiKey: process.env.CONVEX_OPENAI_API_KEY,
  });

  // Clean HTML for AI processing
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 8000); // Limit for AI processing

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert at extracting article content. Extract the main title and the core article text from the provided HTML content. Return a JSON object with 'title' and 'content' fields. The content should be the main article text, cleaned of navigation, ads, and other non-article content.",
      },
      {
        role: "user",
        content: `Extract the title and main content from this webpage content from URL: ${url}\n\nContent: ${cleanHtml}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return {
    title: result.title || "Untitled Article",
    content: result.content || "No content extracted",
  };
}
