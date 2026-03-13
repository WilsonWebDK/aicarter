import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Plus, BookOpen } from "lucide-react";

type Topic = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
};

export default function KnowledgeBank() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("topics")
      .select("id, title, description, created_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (data) setTopics(data);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="px-4 py-6 md:px-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Knowledge Bank</h1>
            <p className="text-muted-foreground">All your topics and sources</p>
          </div>
          <Button className="rounded-2xl" onClick={() => navigate("/knowledge/new")}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-3xl bg-secondary" />
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="mb-1 text-lg font-semibold">No topics yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">Drop files, paste URLs, or add YouTube videos</p>
            <Button className="rounded-2xl" onClick={() => navigate("/knowledge/new")}>
              <Plus className="mr-1 h-4 w-4" /> Create your first topic
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {topics.map((topic, i) => (
              <motion.button
                key={topic.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => navigate(`/knowledge/${topic.id}`)}
                className="glass-card flex w-full items-center gap-4 rounded-3xl p-4 text-left transition-shadow hover:shadow-lg"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{topic.title}</h3>
                  {topic.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{topic.description}</p>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
