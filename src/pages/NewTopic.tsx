import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export default function NewTopic() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("topics")
      .insert({ title, description: description || null, user_id: user.id })
      .select()
      .single();

    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      navigate(`/knowledge/${data.id}`);
    }
  };

  return (
    <div className="px-4 py-6 md:px-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-lg">
        <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-6 text-2xl font-bold tracking-tight">New Topic</h1>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label>Topic name</Label>
            <Input
              placeholder="e.g. Machine Learning Fundamentals"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="What do you want to learn?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px] rounded-2xl"
            />
          </div>
          <Button type="submit" className="w-full rounded-2xl" disabled={loading || !title.trim()}>
            {loading ? "Creating..." : "Create Topic"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
