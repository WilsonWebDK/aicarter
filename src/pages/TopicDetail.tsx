import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Plus, FileText, Youtube, Globe, Upload, Loader2, Check, X,
  Headphones, Mic, GraduationCap, Sparkles, Trash2,
} from "lucide-react";

type Source = {
  id: string;
  type: string;
  title: string | null;
  url: string | null;
  file_path: string | null;
  processing_status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type Topic = {
  id: string;
  title: string;
  description: string | null;
};

const PROCESSING_MESSAGES = [
  "Extracting Golden Moments",
  "Linking PDF Insights",
  "Building your roadmap",
  "Finalizing Synthesis",
];

export default function TopicDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [topic, setTopic] = useState<Topic | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSource, setShowAddSource] = useState(false);
  const [sourceType, setSourceType] = useState<"youtube" | "url" | "pdf">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [processingMsgIdx, setProcessingMsgIdx] = useState(0);
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [synthesisData, setSynthesisData] = useState<{ videos: number; docs: number; themes: number } | null>(null);
  const [deletingTopic, setDeletingTopic] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);

  const hasProcessing = sources.some((s) => s.processing_status === "processing" || s.processing_status === "pending");

  useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(() => {
      setProcessingMsgIdx((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [hasProcessing]);

  // Show synthesis card when all done
  useEffect(() => {
    if (sources.length > 0 && !hasProcessing && sources.every((s) => s.processing_status === "completed") && !loading) {
      const videos = sources.filter((s) => s.type === "youtube").length;
      const docs = sources.filter((s) => s.type !== "youtube").length;
      setSynthesisData({ videos, docs, themes: 0 });
      setShowSynthesis(true);
    }
  }, [sources, hasProcessing, loading]);

  useEffect(() => {
    if (!id || !user) return;
    Promise.all([
      supabase.from("topics").select("id, title, description").eq("id", id).eq("user_id", user.id).single(),
      supabase.from("sources").select("*").eq("topic_id", id).order("created_at", { ascending: false }),
    ]).then(([topicRes, sourcesRes]) => {
      if (topicRes.data) setTopic(topicRes.data);
      if (sourcesRes.data) setSources(sourcesRes.data as Source[]);
      setLoading(false);
    });
  }, [id, user]);

  // Realtime
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`sources-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sources", filter: `topic_id=eq.${id}` }, (payload) => {
        const updated = payload.new as Source;
        setSources((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const processSource = async (sourceId: string) => {
    const { data, error } = await supabase.functions.invoke("process-source", {
      body: { source_id: sourceId, topic_id: id },
    });
    if (error) {
      toast({ title: "Processing failed", description: error.message, variant: "destructive" });
      return false;
    }
    return data?.success === true;
  };

  const triggerAnalysis = async () => {
    const { data } = await supabase.functions.invoke("analyze-topic", { body: { topic_id: id } });
    if (data?.theme_count) {
      setSynthesisData((prev) => prev ? { ...prev, themes: data.theme_count } : null);
    }
  };

  const addUrlSource = async () => {
    if (!user || !id || !sourceUrl.trim()) return;
    setAdding(true);
    setShowSynthesis(false);
    const isYoutube = sourceUrl.includes("youtube.com") || sourceUrl.includes("youtu.be");
    const type = isYoutube ? "youtube" : "url";
    const { data, error } = await supabase.from("sources").insert({
      topic_id: id, user_id: user.id, type, url: sourceUrl, title: sourceUrl, processing_status: "pending",
    }).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setAdding(false); return; }
    if (data) {
      setSources((prev) => [data as Source, ...prev]);
      setSourceUrl(""); setShowAddSource(false);
      toast({ title: "Source added", description: "Processing started..." });
      const success = await processSource(data.id);
      if (success) triggerAnalysis();
    }
    setAdding(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;
    setAdding(true); setShowSynthesis(false);
    const filePath = `${user.id}/${id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("source-files").upload(filePath, file);
    if (uploadError) { toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" }); setAdding(false); return; }
    const { data, error } = await supabase.from("sources").insert({
      topic_id: id, user_id: user.id, type: "pdf", title: file.name, file_path: filePath, processing_status: "pending",
    }).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setAdding(false); return; }
    if (data) {
      setSources((prev) => [data as Source, ...prev]);
      toast({ title: "File uploaded", description: "Processing started..." });
      const success = await processSource(data.id);
      if (success) triggerAnalysis();
    }
    setAdding(false);
  };

  const deleteTopic = async () => {
    if (!id) return;
    setDeletingTopic(true);
    // Delete storage files for all sources
    const filePaths = sources.filter((s) => s.file_path).map((s) => s.file_path!);
    if (filePaths.length > 0) {
      await supabase.storage.from("source-files").remove(filePaths);
    }
    // Cascade delete handles sources + generated_content
    const { error } = await supabase.from("topics").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      setDeletingTopic(false);
      return;
    }
    toast({ title: "Topic deleted" });
    navigate("/knowledge");
  };

  const deleteSource = async (source: Source) => {
    setDeletingSourceId(source.id);
    if (source.file_path) {
      await supabase.storage.from("source-files").remove([source.file_path]);
    }
    const { error } = await supabase.from("sources").delete().eq("id", source.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setSources((prev) => prev.filter((s) => s.id !== source.id));
      toast({ title: "Source removed" });
    }
    setDeletingSourceId(null);
  };

  const sourceIcon = (type: string) => {
    switch (type) {
      case "youtube": return <Youtube className="h-5 w-5 text-primary" />;
      case "pdf": return <FileText className="h-5 w-5 text-primary" />;
      default: return <Globe className="h-5 w-5 text-primary" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Check className="h-4 w-4 text-success" />;
      case "failed": return <X className="h-4 w-4 text-destructive" />;
      default: return null;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!topic) {
    return (
      <div className="px-4 py-6 text-center">
        <p>Topic not found</p>
        <Button variant="link" onClick={() => navigate("/knowledge")}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-2xl">
        <button onClick={() => navigate("/knowledge")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Knowledge Bank
        </button>

        {/* Topic header */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{topic.title}</h1>
            {topic.description && <p className="mt-1 text-muted-foreground">{topic.description}</p>}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{topic.title}"?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently remove the topic, all sources, takeaways, and quiz data. This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteTopic} disabled={deletingTopic} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deletingTopic ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Processing bar */}
        {hasProcessing && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 glass-card rounded-3xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <motion.span key={processingMsgIdx} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-medium">
                {PROCESSING_MESSAGES[processingMsgIdx]}
              </motion.span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <motion.div className="h-full rounded-full bg-primary" initial={{ width: "10%" }} animate={{ width: "85%" }} transition={{ duration: 15, ease: "easeOut" }} />
            </div>
          </motion.div>
        )}

        {/* Synthesis card */}
        {showSynthesis && !hasProcessing && synthesisData && sources.length > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-6 glass-card rounded-3xl p-6 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
            <h3 className="text-lg font-bold mb-1">Synthesis Complete!</h3>
            <p className="text-sm text-muted-foreground mb-4">
              I've analyzed {synthesisData.videos > 0 ? `${synthesisData.videos} video${synthesisData.videos > 1 ? "s" : ""}` : ""}
              {synthesisData.videos > 0 && synthesisData.docs > 0 ? " and " : ""}
              {synthesisData.docs > 0 ? `${synthesisData.docs} document${synthesisData.docs > 1 ? "s" : ""}` : ""}.
              {synthesisData.themes > 0 ? ` I found ${synthesisData.themes} key themes.` : ""}
              {" "}Ready to master them?
            </p>
            <Button className="rounded-2xl" onClick={() => navigate(`/learn?topic=${id}`)}>
              <GraduationCap className="mr-2 h-4 w-4" /> Start Learning
            </Button>
          </motion.div>
        )}

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
                <div className="flex flex-wrap gap-2">
                  {(["url", "youtube", "pdf"] as const).map((t) => (
                    <button key={t} onClick={() => setSourceType(t)} className={`flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm transition-colors ${sourceType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
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
                      <Upload className="mr-2 h-4 w-4" /> {adding ? "Uploading..." : "Choose PDF file"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input placeholder={sourceType === "youtube" ? "https://youtube.com/watch?v=..." : "https://example.com/article"} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className="rounded-2xl" />
                    <Button className="rounded-2xl shrink-0" onClick={addUrlSource} disabled={adding || !sourceUrl.trim()}>
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
            {sources.map((source) => {
              const isProcessing = source.processing_status === "processing" || source.processing_status === "pending";
              return (
                <div key={source.id} className="glass-card flex items-center gap-3 rounded-2xl p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    {sourceIcon(source.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{source.title || source.url || "Untitled"}</p>
                    {isProcessing ? (
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <motion.div className="h-full rounded-full bg-primary" initial={{ width: "5%" }} animate={{ width: "75%" }} transition={{ duration: 12, ease: "easeOut" }} />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground capitalize">{source.type} • {source.processing_status}</p>
                    )}
                  </div>
                  {!isProcessing && statusBadge(source.processing_status)}
                  {!isProcessing && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove source?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently delete this source and its extracted content.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteSource(source)} disabled={deletingSourceId === source.id} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {deletingSourceId === source.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Coming Soon */}
        <div className="space-y-3">
          <div className="glass-card relative rounded-3xl p-5 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Headphones className="h-5 w-5 text-primary" /></div>
                <div><h3 className="font-semibold">AI Podcast</h3><p className="text-xs text-muted-foreground">Listen to an AI-generated summary</p></div>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
          <div className="glass-card relative rounded-3xl p-5 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Mic className="h-5 w-5 text-primary" /></div>
                <div><h3 className="font-semibold">Voice Agent</h3><p className="text-xs text-muted-foreground">Have a conversation with your content</p></div>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
