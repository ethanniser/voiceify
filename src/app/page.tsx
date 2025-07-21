"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { toast } from "sonner";
import { useState } from "react";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <h2 className="text-xl font-semibold text-primary">Voiceify</h2>
      </header>
      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <Content />
        </div>
      </main>
    </div>
  );
}

function Content() {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">Voiceify</h1>
        <p className="text-xl text-secondary mb-8">
          Turn articles into audio with AI
        </p>
      </div>

      <VoiceifyApp />
    </div>
  );
}

function VoiceifyApp() {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const articles = useQuery(api.articles.list) || [];
  const createArticle = useMutation(api.articles.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsSubmitting(true);
    try {
      await createArticle({ url: url.trim() });
      setUrl("");
      toast.success("Article added for processing!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add article"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Input Form */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="url"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Article URL
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !url.trim()}
            className="w-full px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Adding..." : "Voiceify"}
          </button>
        </form>
      </div>

      {/* Articles List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-900">Your Articles</h2>
        {articles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No articles yet. Add your first article above!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {articles.map((article) => (
              <ArticleCard key={article._id} article={article} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleCard({ article }: { article: any }) {
  const [isRetrying, setIsRetrying] = useState(false);
  const retryArticle = useMutation(api.articles.retry);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processing":
        return "text-yellow-600 bg-yellow-50";
      case "completed":
        return "text-green-600 bg-green-50";
      case "error":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "processing":
        return "Processing...";
      case "completed":
        return "Ready";
      case "error":
        return "Error";
      default:
        return "Unknown";
    }
  };

  const handleDownload = async () => {
    if (article.audioUrl) {
      const response = await fetch(article.audioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${article.title || "article"}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retryArticle({ articleId: article._id });
      toast.success("Article retry started!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to retry article"
      );
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {article.title || "Processing..."}
          </h3>
          <p className="text-sm text-gray-500 break-all mb-3">{article.url}</p>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(article.status)}`}
          >
            {getStatusText(article.status)}
          </span>
        </div>
      </div>

      {article.status === "error" && article.errorMessage && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 mb-3">{article.errorMessage}</p>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRetrying ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-b border-white mr-2"></div>
                Retrying...
              </>
            ) : (
              <>
                <svg
                  className="w-3 h-3 mr-1.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Retry
              </>
            )}
          </button>
        </div>
      )}

      {article.status === "completed" && article.audioUrl && (
        <div className="mt-4 space-y-3">
          <audio controls className="w-full">
            <source src={article.audioUrl} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
          <button
            onClick={handleDownload}
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download
          </button>
        </div>
      )}

      {article.status === "processing" && (
        <div className="mt-4 flex items-center text-sm text-gray-500">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
          Extracting content and generating audio...
        </div>
      )}
    </div>
  );
}
