import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  ArrowLeft, Plus, FileText, Youtube, Globe, Upload, Loader2, Check, X,
  Headphones, Mic, Clock, Sparkles,
} from "lucide-react";

type Highlight = { time: number; label: string };

type Source = {
  id: string;
  type: string;
  title: string | null;
  url: string | null;
  processing_status: string;
  created_at: string;
  metadata: { highlights?: Highlight[] } | null;
};

type Topic = {
  id: string;
  title: string;
  description: string | null;
  mastery_percentage: number;
};

type Takeaway = {
  id: string;
  title: string | null;
  content: { explanation: string; importance: string };
};

export default function TopicDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [topic, setTopic] = useState<Topic | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [takeaways, setTakeaways] = useState<Takeaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSource, setShowAddSource] = useState(false);
  const [sourceType, setSourceType] = useState<"youtube" | "url" | "pdf">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [ytPlayerUrl, setYtPlayerUrl] = useState<string | null>(null);

  const fetchTakeaways = useCallback(async () => {
    if (!id || !user) return;
    const { data } = await supabase
      .from("generated_content")
      .select("id, title, content")
      .eq("topic_id", id)
      .eq("user_id", user.id)
      .eq("type", "takeaway");
    if (data) setTakeaways(data as Takeaway[]);
  }, [id, user]);

  useEffect(() => {
    if (!id || !user) return;

    Promise.all([
      supabase.from("topics").select("*").eq("id", id).eq("user_id", user.id).single(),
      supabase.from("sources").select("*").eq("topic_id", id).order("created_at", { ascending: false }),
    ]).then(([topicRes, sourcesRes]) => {
      if (topicRes.data) setTopic(topicRes.data);
      if (sourcesRes.data) setSources(sourcesRes.data as Source[]);
      setLoading(false);
    });

    fetchTakeaways();
  }, [id, user, fetchTakeaways]);

  // Realtime subscription for source status updates
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`sources-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sources", filter: `topic_id=eq.${id}` },
        (payload) => {
          const updated = payload.new as Source;
          setSources((prev) =>
            prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const processSource = async (sourceId: string) => {
    const { data, error } = await supabase.functions.invoke("process-source", {
      body: { source_id: sourceId, topic_id: id },
    });

    if (error) {
      console.error("Process source error:", error);
      toast({ title: "Processing failed", description: error.message, variant: "destructive" });
      return false;
    }
    return data?.success === true;
  };

  const analyzeTopic = async () => {
    setAnalyzing(true);
    const { data, error } = await supabase.functions.invoke("analyze-topic", {
      body: { topic_id: id },
    });

    setAnalyzing(false);
    if (error) {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
      return;
    }

    if (data?.success) {
      toast({ title: "Analysis complete", description: `${data.takeaways_count} takeaways generated` });
      // Refresh topic mastery and takeaways
      if (data.mastery_percentage !== undefined && topic) {
        setTopic({ ...topic, mastery_percentage: data.mastery_percentage });
      }
      fetchTakeaways();
    }
  };

  const addUrlSource = async () => {
    if (!user || !id || !sourceUrl.trim()) return;
    setAdding(true);

    const isYoutube = sourceUrl.includes("youtube.com") || sourceUrl.includes("youtu.be");
    const type = isYoutube ? "youtube" : "url";

    const { data, error } = await supabase
      .from("sources")
      .insert({
        topic_id: id,
        user_id: user.id,
        type,
        url: sourceUrl,
        title: sourceUrl,
        processing_status: "pending",
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setAdding(false);
      return;
    }

    if (data) {
      setSources((prev) => [data as Source, ...prev]);
      setSourceUrl("");
      setShowAddSource(false);
      toast({ title: "Source added", description: "Processing started..." });

      // Trigger processing
      const success = await processSource(data.id);
      if (success) {
        analyzeTopic();
      }
    }
    setAdding(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;

    setAdding(true);
    const filePath = `${user.id}/${id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("source-files").upload(filePath, file);

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setAdding(false);
      return;
    }

    const { data, error } = await supabase
      .from("sources")
      .insert({
        topic_id: id,
        user_id: user.id,
        type: "pdf",
        title: file.name,
        file_path: filePath,
        processing_status: "pending",
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setAdding(false);
      return;
    }

    if (data) {
      setSources((prev) => [data as Source, ...prev]);
      toast({ title: "File uploaded", description: "Processing started..." });

      const success = await processSource(data.id);
      if (success) {
        analyzeTopic();
      }
    }
    setAdding(false);
  };

  const sourceIcon = (type: string) => {
    switch (type) {
      case "youtube": return <Youtube className="h-5 w-5 text-primary" />;
      case "pdf": return <FileText className="h-5 w-5 text-primary" />;
      default: return <Globe className="h-5 w-5 text-primary" />;
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <Check className="h-4 w-4 text-primary" />;
      case "processing": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "failed": return <X className="h-4 w-4 text-destructive" />;
      default: return <Loader2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getYoutubeEmbedUrl = (url: string, startSeconds?: number) => {
    let videoId = "";
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        videoId = u.pathname.slice(1);
      } else {
        videoId = u.searchParams.get("v") || "";
      }
    } catch { return null; }
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}${startSeconds ? `?start=${startSeconds}&autoplay=1` : ""}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="px-4 py-6 text-center">
        <p>Topic not found</p>
        <Button variant="link" onClick={() => navigate("/knowledge")}>Go back</Button>
      </div>
    );
  }

  const ytSources = sources.filter(
    (s) => s.type === "youtube" && (s.metadata as any)?.highlights?.length > 0
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl">
        <button onClick={() => navigate("/knowledge")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Knowledge Bank
        </button>

        {/* Topic header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{topic.title}</h1>
          {topic.description && <p className="mt-1 text-muted-foreground">{topic.description}</p>}
          <div className="mt-3 flex items-center gap-3">
            <Progress value={topic.mastery_percentage} className="h-2 flex-1 rounded-full" />
            <span className="text-sm font-medium text-primary">{topic.mastery_percentage}%</span>
          </div>
        </div>

        {/* Add source */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Sources</h2>
            <Button size="sm" className="rounded-2xl" onClick={() => setShowAddSource(!showAddSource)}>
              <Plus className="mr-1 h-4 w-4" /> Add Source
            </Button>
          </div>

          {showAddSource && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-4 overflow-hidden">
              <div className="glass-card rounded-3xl p-4 space-y-3">
                <div className="flex gap-2">
                  {(["url", "youtube", "pdf"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSourceType(t)}
                      className={`flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm transition-colors ${
                        sourceType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {t === "url" && <Globe className="h-3.5 w-3.5" />}
                      {t === "youtube" && <Youtube className="h-3.5 w-3.5" />}
                      {t === "pdf" && <FileText className="h-3.5 w-3.5" />}
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>

                {sourceType === "pdf" ? (
                  <div>
                    <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                    <Button variant="outline" className="w-full rounded-2xl" onClick={() => fileInputRef.current?.click()} disabled={adding}>
                      <Upload className="mr-2 h-4 w-4" />
                      {adding ? "Uploading..." : "Choose PDF file"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder={sourceType === "youtube" ? "https://youtube.com/watch?v=..." : "https://example.com/article"}
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      className="rounded-2xl"
                    />
                    <Button className="rounded-2xl" onClick={addUrlSource} disabled={adding || !sourceUrl.trim()}>
                      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Sources list */}
        {sources.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border py-12 text-center">
            <p className="text-muted-foreground">No sources yet. Add PDFs, URLs, or YouTube videos.</p>
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {sources.map((source) => (
              <div key={source.id} className="glass-card flex items-center gap-3 rounded-2xl p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  {sourceIcon(source.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{source.title || source.url || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground capitalize">{source.type} • {source.processing_status}</p>
                </div>
                {statusIcon(source.processing_status)}
              </div>
            ))}
          </div>
        )}

        {/* YouTube Highlights */}
        {ytSources.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">🎬 Key Moments</h2>

            {ytPlayerUrl && (
              <div className="mb-4 aspect-video overflow-hidden rounded-2xl">
                <iframe
                  src={ytPlayerUrl}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}

            <div className="space-y-2">
              {ytSources.map((source) =>
                ((source.metadata as any)?.highlights as Highlight[])?.map((h, idx) => (
                  <button
                    key={`${source.id}-${idx}`}
                    onClick={() => {
                      const embedUrl = source.url ? getYoutubeEmbedUrl(source.url, h.time) : null;
                      if (embedUrl) setYtPlayerUrl(embedUrl);
                    }}
                    className="glass-card flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-shadow hover:shadow-md"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{h.label}</p>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{formatTime(h.time)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Key Takeaways */}
        {takeaways.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Key Takeaways</h2>
            </div>
            <div className="space-y-2">
              {takeaways.map((t) => (
                <div key={t.id} className="glass-card rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t.title}</h3>
                    <Badge variant={t.content.importance === "high" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                      {t.content.importance}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t.content.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analyzing indicator */}
        {analyzing && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl bg-primary/5 p-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <p className="text-sm font-medium">Analyzing content with AI...</p>
          </div>
        )}

        {/* Coming Soon sections */}
        <div className="space-y-3">
          <div className="glass-card relative rounded-3xl p-5 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Headphones className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">AI Podcast</h3>
                  <p className="text-xs text-muted-foreground">Listen to an AI-generated summary</p>
                </div>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>

          <div className="glass-card relative rounded-3xl p-5 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Mic className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Voice Agent</h3>
                  <p className="text-xs text-muted-foreground">Have a conversation with your content</p>
                </div>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
