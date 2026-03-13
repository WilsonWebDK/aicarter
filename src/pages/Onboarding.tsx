import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, Headphones, MessageCircle, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";

const steps = ["learning_style", "time", "knowledge", "mastery"] as const;

type SelectionCardProps = {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
};

function SelectionCard({ icon, label, description, selected, onClick }: SelectionCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition-all ${
        selected
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
        {icon}
      </div>
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [learningStyle, setLearningStyle] = useState<string>("");
  const [minutesPerDay, setMinutesPerDay] = useState(30);
  const [knowledgeLevel, setKnowledgeLevel] = useState<string>("");
  const [masteryDepth, setMasteryDepth] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const progress = ((step + 1) / steps.length) * 100;

  const canProceed = () => {
    switch (steps[step]) {
      case "learning_style": return !!learningStyle;
      case "time": return true;
      case "knowledge": return !!knowledgeLevel;
      case "mastery": return !!masteryDepth;
    }
  };

  const handleFinish = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from("user_preferences")
      .update({
        learning_style: learningStyle,
        minutes_per_day: minutesPerDay,
        knowledge_level: knowledgeLevel,
        mastery_depth: masteryDepth,
        onboarding_completed: true,
      })
      .eq("user_id", user.id);

    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      navigate("/");
    }
  };

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else handleFinish();
  };

  const knowledgeLevels = [
    { value: "beginner", label: "Beginner", desc: "Just getting started" },
    { value: "intermediate", label: "Intermediate", desc: "Some experience" },
    { value: "advanced", label: "Advanced", desc: "Strong foundation" },
    { value: "expert", label: "Expert", desc: "Deep expertise" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 pb-8 pt-12">
      <div className="mx-auto w-full max-w-md">
        <Progress value={progress} className="mb-8 h-2 rounded-full" />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
          >
            {steps[step] === "learning_style" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">How do you learn best?</h1>
                  <p className="mt-1 text-muted-foreground">Pick your preferred learning style</p>
                </div>
                <div className="space-y-3">
                  <SelectionCard
                    icon={<Eye className="h-5 w-5" />}
                    label="Visual"
                    description="Diagrams, slides, and visual summaries"
                    selected={learningStyle === "visual"}
                    onClick={() => setLearningStyle("visual")}
                  />
                  <SelectionCard
                    icon={<Headphones className="h-5 w-5" />}
                    label="Auditory"
                    description="Podcasts, audio summaries, and discussions"
                    selected={learningStyle === "auditory"}
                    onClick={() => setLearningStyle("auditory")}
                  />
                  <SelectionCard
                    icon={<MessageCircle className="h-5 w-5" />}
                    label="Conversational"
                    description="Q&A, mentorship, and interactive dialogue"
                    selected={learningStyle === "conversational"}
                    onClick={() => setLearningStyle("conversational")}
                  />
                </div>
              </div>
            )}

            {steps[step] === "time" && (
              <div className="space-y-8">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">How much time per day?</h1>
                  <p className="mt-1 text-muted-foreground">We'll tailor module lengths to your schedule</p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Minutes per day</span>
                    <span className="text-2xl font-bold text-primary">{minutesPerDay}</span>
                  </div>
                  <Slider
                    value={[minutesPerDay]}
                    onValueChange={([v]) => setMinutesPerDay(v)}
                    min={5}
                    max={120}
                    step={5}
                    className="py-4"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>5 min</span>
                    <span>120 min</span>
                  </div>
                </div>
              </div>
            )}

            {steps[step] === "knowledge" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Your current level?</h1>
                  <p className="mt-1 text-muted-foreground">So we know where to start</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {knowledgeLevels.map((kl) => (
                    <button
                      key={kl.value}
                      onClick={() => setKnowledgeLevel(kl.value)}
                      className={`flex flex-col items-center gap-1 rounded-3xl border-2 p-5 transition-all ${
                        knowledgeLevel === kl.value
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-border bg-card hover:border-primary/30"
                      }`}
                    >
                      <span className="font-semibold">{kl.label}</span>
                      <span className="text-xs text-muted-foreground">{kl.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {steps[step] === "mastery" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Your mastery goal?</h1>
                  <p className="mt-1 text-muted-foreground">How deep do you want to go?</p>
                </div>
                <div className="space-y-3">
                  <SelectionCard
                    icon={<MessageCircle className="h-5 w-5" />}
                    label="Conversational"
                    description="Enough to discuss confidently"
                    selected={masteryDepth === "conversational"}
                    onClick={() => setMasteryDepth("conversational")}
                  />
                  <SelectionCard
                    icon={<Sparkles className="h-5 w-5" />}
                    label="Professional"
                    description="Apply it in your work"
                    selected={masteryDepth === "professional"}
                    onClick={() => setMasteryDepth("professional")}
                  />
                  <SelectionCard
                    icon={<Eye className="h-5 w-5" />}
                    label="Expert"
                    description="Deep, research-level understanding"
                    selected={masteryDepth === "expert"}
                    onClick={() => setMasteryDepth("expert")}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="rounded-2xl">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          )}
          <Button
            onClick={next}
            disabled={!canProceed() || loading}
            className="flex-1 rounded-2xl"
          >
            {step === steps.length - 1 ? (loading ? "Saving..." : "Get started") : "Continue"}
            {step < steps.length - 1 && <ArrowRight className="ml-1 h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
