import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, BookOpen, Sparkles, Clock, ArrowLeft, ArrowRight,
  Check, X, Loader2, Play, RotateCcw,
} from "lucide-react";

type Topic = { id: string; title: string; description: string | null };
type Highlight = { time: number; label: string };
type Source = {
  id: string; type: string; url: string | null;
  metadata: { highlights?: Highlight[] } | null;
};
type Takeaway = {
  id: string; title: string | null;
  content: { explanation: string; importance: string };
};
type QuizQuestion = {
  question: string; options: string[]; correct_index: number;
  explanation: string; practical_example: string;
};

type QuizState = "idle" | "loading" | "active" | "feedback" | "results";

export default function Learn() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const topicId = searchParams.get("topic");

  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [takeaways, setTakeaways] = useState<Takeaway[]>([]);
  const [loading, setLoading] = useState(true);

  // Quiz state
  const [quizState, setQuizState] = useState<QuizState>("idle");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  // YouTube player
  const [ytPlayerUrl, setYtPlayerUrl] = useState<string | null>(null);

  // Load topics list
  useEffect(() => {
    if (!user) return;
    supabase
      .from("topics")
      .select("id, title, description")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (data) setTopics(data);
        setLoading(false);
      });
  }, [user]);

  // Load topic data when topicId changes
  useEffect(() => {
    if (!topicId || !user) {
      setSelectedTopic(null);
      return;
    }

    const loadTopicData = async () => {
      setLoading(true);
      const [topicRes, sourcesRes, takeawaysRes] = await Promise.all([
        supabase.from("topics").select("id, title, description").eq("id", topicId).eq("user_id", user.id).single(),
        supabase.from("sources").select("id, type, url, metadata").eq("topic_id", topicId).eq("processing_status", "completed"),
        supabase.from("generated_content").select("id, title, content").eq("topic_id", topicId).eq("user_id", user.id).eq("type", "takeaway"),
      ]);

      if (topicRes.data) setSelectedTopic(topicRes.data);
      if (sourcesRes.data) setSources(sourcesRes.data as Source[]);
      if (takeawaysRes.data) setTakeaways(takeawaysRes.data as Takeaway[]);
      setLoading(false);
    };

    loadTopicData();
  }, [topicId, user]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getYoutubeEmbedUrl = (url: string, startSeconds?: number) => {
    let videoId = "";
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) videoId = u.pathname.slice(1);
      else videoId = u.searchParams.get("v") || "";
    } catch { return null; }
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}${startSeconds ? `?start=${startSeconds}&autoplay=1` : ""}`;
  };

  const startQuiz = async (focusAreas?: string[]) => {
    if (!topicId) return;
    setQuizState("loading");
    setQuestions([]);
    setCurrentQ(0);
    setSelectedAnswer(null);
    setAnswers([]);

    const { data, error } = await supabase.functions.invoke("generate-quiz", {
      body: { topic_id: topicId, focus_areas: focusAreas },
    });

    if (error || !data?.success) {
      toast({
        title: "Quiz generation failed",
        description: error?.message || data?.error || "Please try again",
        variant: "destructive",
      });
      setQuizState("idle");
      return;
    }

    setQuestions(data.quiz.questions);
    setAnswers(new Array(data.quiz.questions.length).fill(null));
    setQuizState("active");
  };

  const selectAnswer = (index: number) => {
    if (quizState !== "active") return;
    setSelectedAnswer(index);
    setAnswers((prev) => {
      const next = [...prev];
      next[currentQ] = index;
      return next;
    });
    setQuizState("feedback");
  };

  const nextQuestion = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ((p) => p + 1);
      setSelectedAnswer(null);
      setQuizState("active");
    } else {
      setQuizState("results");
    }
  };

  const score = answers.filter((a, i) => a === questions[i]?.correct_index).length;
  const weakAreas = questions
    .filter((q, i) => answers[i] !== q.correct_index)
    .map((q) => q.question.substring(0, 60));

  const ytSources = sources.filter(
    (s) => s.type === "youtube" && (s.metadata as any)?.highlights?.length > 0
  );

  // Topic selector
  if (!topicId) {
    return (
      <div className="px-4 py-6 md:px-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Learn</h1>
            <p className="text-muted-foreground">Choose a topic to study</p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-3xl bg-secondary" />
              ))}
            </div>
          ) : topics.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-16 text-center">
              <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground" />
              <h3 className="mb-1 text-lg font-semibold">No topics yet</h3>
              <p className="mb-4 text-sm text-muted-foreground">Create a topic and add sources to start learning</p>
              <Button className="rounded-2xl" onClick={() => navigate("/knowledge/new")}>
                Create Topic
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
                  onClick={() => navigate(`/learn?topic=${topic.id}`)}
                  className="glass-card flex w-full items-center gap-4 rounded-3xl p-5 text-left transition-shadow hover:shadow-lg"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <GraduationCap className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{topic.title}</h3>
                    {topic.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{topic.description}</p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // Fullscreen Quiz overlay
  if (quizState !== "idle") {
    const q = questions[currentQ];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {quizState === "loading" && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-20 text-center">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
                <h2 className="text-xl font-bold">Generating your quiz...</h2>
                <p className="mt-2 text-muted-foreground">AI is crafting questions from your sources</p>
              </motion.div>
            )}

            {(quizState === "active" || quizState === "feedback") && q && (
              <motion.div key={`q-${currentQ}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
                {/* Progress */}
                <div className="mb-6 flex items-center justify-between">
                  <button onClick={() => setQuizState("idle")} className="text-sm text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                  <span className="text-sm font-medium text-muted-foreground">
                    {currentQ + 1} / {questions.length}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
                  />
                </div>

                {/* Question */}
                <h2 className="mb-8 text-xl font-bold leading-snug">{q.question}</h2>

                {/* Options */}
                <div className="space-y-3">
                  {q.options.map((option, idx) => {
                    let optionClass = "glass-card rounded-2xl p-4 text-left transition-all w-full";
                    if (quizState === "feedback") {
                      if (idx === q.correct_index) {
                        optionClass += " ring-2 ring-success bg-success/10";
                      } else if (idx === selectedAnswer && idx !== q.correct_index) {
                        optionClass += " ring-2 ring-destructive bg-destructive/10";
                      } else {
                        optionClass += " opacity-50";
                      }
                    } else {
                      optionClass += " hover:shadow-md cursor-pointer";
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => quizState === "active" && selectAnswer(idx)}
                        disabled={quizState === "feedback"}
                        className={optionClass}
                      >
                        <span className="text-sm font-medium">{option}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Feedback */}
                {quizState === "feedback" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                    {selectedAnswer === q.correct_index ? (
                      <div className="rounded-2xl bg-success/10 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Check className="h-5 w-5 text-success" />
                          <span className="font-semibold text-success">Correct!</span>
                        </div>
                        <p className="text-sm text-muted-foreground">You have a solid grasp of this concept.</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-destructive/10 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <X className="h-5 w-5 text-destructive" />
                          <span className="font-semibold text-destructive">Not quite</span>
                        </div>
                        <p className="text-sm mb-2">
                          Actually, it's <strong>"{q.options[q.correct_index]}"</strong> because {q.explanation}
                        </p>
                        <p className="text-sm text-muted-foreground italic">
                          Practical example: {q.practical_example}
                        </p>
                      </div>
                    )}

                    <Button className="mt-4 w-full rounded-2xl" onClick={nextQuestion}>
                      {currentQ < questions.length - 1 ? "Next Question" : "See Results"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            )}

            {quizState === "results" && (
              <motion.div key="results" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                <div className="mb-6">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-3xl font-bold text-primary">{score}/{questions.length}</span>
                  </div>
                  <h2 className="text-2xl font-bold">Quiz Complete!</h2>
                  <p className="mt-1 text-muted-foreground">
                    {score === questions.length
                      ? "Perfect score! You've mastered this content."
                      : score >= questions.length * 0.7
                      ? "Great job! You're getting there."
                      : "Keep studying — you'll improve!"}
                  </p>
                </div>

                {/* Question breakdown */}
                <div className="mb-6 space-y-2 text-left">
                  {questions.map((q, i) => (
                    <div key={i} className="glass-card flex items-start gap-3 rounded-2xl p-3">
                      {answers[i] === q.correct_index ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <p className="text-sm line-clamp-2">{q.question}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  {weakAreas.length > 0 && (
                    <Button className="w-full rounded-2xl" onClick={() => startQuiz(weakAreas)}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Challenge Weak Areas
                    </Button>
                  )}
                  <Button variant="outline" className="w-full rounded-2xl" onClick={() => startQuiz()}>
                    Generate New Quiz
                  </Button>
                  <Button variant="ghost" className="w-full rounded-2xl" onClick={() => setQuizState("idle")}>
                    Back to Learn
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // Main Learn view for selected topic
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl">
        <button onClick={() => navigate("/learn")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All Topics
        </button>

        {/* Topic header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{selectedTopic?.title}</h1>
          {selectedTopic?.description && (
            <p className="mt-1 text-muted-foreground">{selectedTopic.description}</p>
          )}
        </div>

        {/* Start Quiz CTA */}
        <div className="mb-8">
          <button
            onClick={() => startQuiz()}
            className="glass-card flex w-full items-center gap-4 rounded-3xl p-6 text-left transition-shadow hover:shadow-lg"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Play className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold">Start Quiz</h3>
              <p className="text-sm text-muted-foreground">
                Test your knowledge with AI-generated questions
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Key Takeaways */}
        {takeaways.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Key Takeaways</h2>
            </div>
            <div className="space-y-2">
              {takeaways.map((t) => (
                <div key={t.id} className="glass-card rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t.title}</h3>
                    <Badge
                      variant={t.content.importance === "high" ? "default" : "secondary"}
                      className="shrink-0 text-[10px]"
                    >
                      {t.content.importance}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t.content.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* YouTube Key Moments */}
        {ytSources.length > 0 && (
          <div className="mb-8">
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

        {takeaways.length === 0 && ytSources.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-16 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="mb-1 text-lg font-semibold">No content yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Add sources to your topic in the Knowledge Bank first
            </p>
            <Button className="rounded-2xl" onClick={() => navigate(`/knowledge/${topicId}`)}>
              Go to Knowledge Bank
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
