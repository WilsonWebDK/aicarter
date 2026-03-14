import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Flame, BookOpen, GraduationCap, Headphones, Mic, ArrowRight, Trash2, Loader2 } from "lucide-react";

type Topic = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
};

type Profile = {
  display_name: string | null;
  is_premium: boolean;
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    supabase.from("user_preferences").select("onboarding_completed").eq("user_id", user.id).single()
      .then(({ data }) => { if (data && !data.onboarding_completed) navigate("/onboarding"); });

    supabase.from("profiles").select("display_name, is_premium").eq("user_id", user.id).single()
      .then(({ data }) => { if (data) setProfile(data); });

    supabase.from("topics").select("id, title, description, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setTopics(data); setLoading(false); });
  }, [user, navigate]);

  const canCreateTopic = profile?.is_premium || topics.length < 1;

  const deleteTopic = async (topicId: string) => {
    setDeletingId(topicId);
    // Get sources to clean up files
    const { data: sources } = await supabase.from("sources").select("file_path").eq("topic_id", topicId);
    const filePaths = (sources || []).filter((s) => s.file_path).map((s) => s.file_path!);
    if (filePaths.length > 0) {
      await supabase.storage.from("source-files").remove(filePaths);
    }
    const { error } = await supabase.from("topics").delete().eq("id", topicId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setTopics((prev) => prev.filter((t) => t.id !== topicId));
      toast({ title: "Topic deleted" });
    }
    setDeletingId(null);
  };

  return (
    <div className="px-4 py-6 md:px-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Hey, {profile?.display_name || "there"} 👋
            </h1>
            <p className="text-muted-foreground">Keep the momentum going</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary md:hidden">
            <Flame className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="glass-card rounded-3xl p-4">
            <BookOpen className="mb-2 h-5 w-5 text-primary" />
            <p className="text-2xl font-bold">{topics.length}</p>
            <p className="text-xs text-muted-foreground">Topics</p>
          </div>
          <div className="glass-card rounded-3xl p-4">
            <GraduationCap className="mb-2 h-5 w-5 text-primary" />
            <p className="text-2xl font-bold">Learn</p>
            <p className="text-xs text-muted-foreground">Ready to go</p>
          </div>
        </div>

        {/* Start Learning CTA */}
        {topics.length > 0 && (
          <button
            onClick={() => navigate("/learn")}
            className="glass-card mb-6 flex w-full items-center gap-4 rounded-3xl p-5 text-left transition-shadow hover:shadow-lg"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold">Start Learning</h3>
              <p className="text-xs text-muted-foreground">Take quizzes and follow your learning path</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </button>
        )}

        {/* Topics */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Topics</h2>
          {canCreateTopic && (
            <Button size="sm" className="rounded-2xl" onClick={() => navigate("/knowledge/new")}>
              <Plus className="mr-1 h-4 w-4" /> New Topic
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-3xl bg-secondary" />
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-16 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="mb-1 text-lg font-semibold">No topics yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">Create your first topic to start learning</p>
            <Button className="rounded-2xl" onClick={() => navigate("/knowledge/new")}>
              <Plus className="mr-1 h-4 w-4" /> Create Topic
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {topics.map((topic, i) => (
              <motion.div
                key={topic.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card flex w-full items-center gap-3 rounded-3xl p-5 transition-shadow hover:shadow-lg"
              >
                <button
                  onClick={() => navigate(`/knowledge/${topic.id}`)}
                  className="flex flex-1 items-center gap-3 text-left min-w-0"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{topic.title}</h3>
                    {topic.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{topic.description}</p>
                    )}
                  </div>
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="shrink-0 p-2 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{topic.title}"?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently remove the topic, all sources, and learning data.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteTopic(topic.id)} disabled={deletingId === topic.id} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {deletingId === topic.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </motion.div>
            ))}
          </div>
        )}

        {!canCreateTopic && (
          <div className="mt-4 rounded-3xl bg-primary/5 p-4 text-center">
            <p className="text-sm font-medium">🔒 Premium required for more topics</p>
            <p className="text-xs text-muted-foreground">Contact your admin to upgrade</p>
          </div>
        )}

        {/* Coming Soon */}
        <div className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Coming Soon</h2>
          <div className="glass-card relative rounded-3xl p-5 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Headphones className="h-5 w-5 text-primary" /></div>
              <div className="flex-1"><h3 className="font-semibold">AI Podcast</h3><p className="text-xs text-muted-foreground">Auto-generated audio summaries of your topics</p></div>
              <Badge variant="secondary">Phase 2</Badge>
            </div>
          </div>
          <div className="glass-card relative rounded-3xl p-5 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Mic className="h-5 w-5 text-primary" /></div>
              <div className="flex-1"><h3 className="font-semibold">Voice Agent</h3><p className="text-xs text-muted-foreground">Have a voice conversation with your content</p></div>
              <Badge variant="secondary">Phase 2</Badge>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
