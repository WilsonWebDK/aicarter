import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, BookOpen, Sparkles, Clock, ArrowLeft, ArrowRight,
  Check, X, Loader2, Play, RotateCcw, Lock, ChevronDown, ChevronUp,
} from "lucide-react";

type Topic = { id: string; title: string; description: string | null };
type Highlight = { time: number; label: string };
type Source = {
  id: string; type: string; url: string | null;
  metadata: { highlights?: Highlight[] } | null;
};
type Takeaway = {
  id: string; title: string | null;
  content: { explanation: string; importance: string; actionable_tip?: string };
};
type LearningStep = {
  title: string;
  explanation: string;
  actionable_insight: string;
  source_citation: string;
  check_question: string;
  check_options: string[];
  check_correct_index: number;
  check_explanation: string;
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

  // Learning path state
  const [learningSteps, setLearningSteps] = useState<LearningStep[]>([]);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [activeStep, setActiveStep] = useState(0);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [checkAnswer, setCheckAnswer] = useState<number | null>(null);
  const [checkFeedback, setCheckFeedback] = useState<"correct" | "wrong" | null>(null);
  const [generatingPath, setGeneratingPath] = useState(false);

  // Quiz state
  const [quizState, setQuizState] = useState<QuizState>("idle");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  // YouTube player
  const [ytPlayerUrl, setYtPlayerUrl] = useState<string | null>(null);

  // Load topics
  useEffect(() => {
    if (!user) return;
    supabase.from("topics").select("id, title, description").eq("user_id", user.id).order("updated_at", { ascending: false })
      .then(({ data }) => { if (data) setTopics(data); setLoading(false); });
  }, [user]);

  // Load topic data
  useEffect(() => {
    if (!topicId || !user) { setSelectedTopic(null); return; }
    const load = async () => {
      setLoading(true);
      const [topicRes, sourcesRes, takeawaysRes, pathRes] = await Promise.all([
        supabase.from("topics").select("id, title, description").eq("id", topicId).eq("user_id", user.id).single(),
        supabase.from("sources").select("id, type, url, metadata").eq("topic_id", topicId).eq("processing_status", "completed"),
        supabase.from("generated_content").select("id, title, content").eq("topic_id", topicId).eq("user_id", user.id).eq("type", "takeaway"),
        supabase.from("generated_content").select("content").eq("topic_id", topicId).eq("user_id", user.id).eq("type", "learning_path").order("created_at", { ascending: false }).limit(1),
      ]);
      if (topicRes.data) setSelectedTopic(topicRes.data);
      if (sourcesRes.data) setSources(sourcesRes.data as Source[]);
      if (takeawaysRes.data) setTakeaways(takeawaysRes.data as Takeaway[]);
      if (pathRes.data?.[0]) {
        const content = pathRes.data[0].content as any;
        if (content?.steps) setLearningSteps(content.steps);
      }
      setLoading(false);
    };
    load();
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

  const generateLearningPath = async () => {
    if (!topicId) return;
    setGeneratingPath(true);
    const { data, error } = await supabase.functions.invoke("generate-learning-path", {
      body: { topic_id: topicId },
    });
    if (error || !data?.success) {
      toast({ title: "Failed to generate learning path", description: error?.message || data?.error, variant: "destructive" });
    } else if (data.learning_path?.steps) {
      setLearningSteps(data.learning_path.steps);
      setCompletedSteps(new Set());
      setActiveStep(0);
    }
    setGeneratingPath(false);
  };

  const handleCheckAnswer = (stepIndex: number, answerIndex: number) => {
    const step = learningSteps[stepIndex];
    setCheckAnswer(answerIndex);
    if (answerIndex === step.check_correct_index) {
      setCheckFeedback("correct");
      setTimeout(() => {
        setCompletedSteps((prev) => new Set([...prev, stepIndex]));
        setActiveStep(Math.min(stepIndex + 1, learningSteps.length - 1));
        setExpandedStep(null);
        setCheckAnswer(null);
        setCheckFeedback(null);
      }, 1500);
    } else {
      setCheckFeedback("wrong");
    }
  };

  const retryCheck = () => {
    setCheckAnswer(null);
    setCheckFeedback(null);
  };

  const isStepUnlocked = (index: number) => index === 0 || completedSteps.has(index - 1);

  // Quiz functions
  const startQuiz = async (focusAreas?: string[]) => {
    if (!topicId) return;
    setQuizState("loading");
    setQuestions([]); setCurrentQ(0); setSelectedAnswer(null); setAnswers([]);
    const { data, error } = await supabase.functions.invoke("generate-quiz", {
      body: { topic_id: topicId, focus_areas: focusAreas },
    });
    if (error || !data?.success) {
      toast({ title: "Quiz generation failed", description: error?.message || data?.error, variant: "destructive" });
      setQuizState("idle"); return;
    }
    setQuestions(data.quiz.questions);
    setAnswers(new Array(data.quiz.questions.length).fill(null));
    setQuizState("active");
  };

  const selectAnswer = (index: number) => {
    if (quizState !== "active") return;
    setSelectedAnswer(index);
    setAnswers((prev) => { const next = [...prev]; next[currentQ] = index; return next; });
    setQuizState("feedback");
  };

  const nextQuestion = () => {
    if (currentQ < questions.length - 1) { setCurrentQ((p) => p + 1); setSelectedAnswer(null); setQuizState("active"); }
    else setQuizState("results");
  };

  const score = answers.filter((a, i) => a === questions[i]?.correct_index).length;
  const weakAreas = questions.filter((q, i) => answers[i] !== q.correct_index).map((q) => q.question.substring(0, 60));
  const ytSources = sources.filter((s) => s.type === "youtube" && (s.metadata as any)?.highlights?.length > 0);

  // Topic selector
  if (!topicId) {
    return (
      <div className="px-4 py-6 md:px-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Learn</h1>
            <p className="text-muted-foreground">Choose a topic to study</p>
          </div>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-3xl bg-secondary" />)}</div>
          ) : topics.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-16 text-center">
              <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground" />
              <h3 className="mb-1 text-lg font-semibold">No topics yet</h3>
              <p className="mb-4 text-sm text-muted-foreground">Create a topic and add sources to start learning</p>
              <Button className="rounded-2xl" onClick={() => navigate("/knowledge/new")}>Create Topic</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {topics.map((topic, i) => (
                <motion.button key={topic.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  onClick={() => navigate(`/learn?topic=${topic.id}`)}
                  className="glass-card flex w-full items-center gap-4 rounded-3xl p-5 text-left transition-shadow hover:shadow-lg"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <GraduationCap className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{topic.title}</h3>
                    {topic.description && <p className="text-xs text-muted-foreground line-clamp-1">{topic.description}</p>}
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

  // Fullscreen Quiz
  if (quizState !== "idle") {
    const q = questions[currentQ];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4 overflow-y-auto">
        <div className="w-full max-w-lg my-auto">
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
                <div className="mb-6 flex items-center justify-between">
                  <button onClick={() => setQuizState("idle")} className="text-sm text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                  <span className="text-sm font-medium text-muted-foreground">{currentQ + 1} / {questions.length}</span>
                </div>
                <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
                </div>
                <h2 className="mb-8 text-xl font-bold leading-snug">{q.question}</h2>
                <div className="space-y-3">
                  {q.options.map((option, idx) => {
                    let cls = "glass-card rounded-2xl p-4 text-left transition-all w-full";
                    if (quizState === "feedback") {
                      if (idx === q.correct_index) cls += " ring-2 ring-success bg-success/10";
                      else if (idx === selectedAnswer) cls += " ring-2 ring-destructive bg-destructive/10";
                      else cls += " opacity-50";
                    } else cls += " hover:shadow-md cursor-pointer";
                    return <button key={idx} onClick={() => quizState === "active" && selectAnswer(idx)} disabled={quizState === "feedback"} className={cls}><span className="text-sm font-medium">{option}</span></button>;
                  })}
                </div>
                {quizState === "feedback" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                    {selectedAnswer === q.correct_index ? (
                      <div className="rounded-2xl bg-success/10 p-4">
                        <div className="flex items-center gap-2 mb-2"><Check className="h-5 w-5 text-success" /><span className="font-semibold text-success">Correct!</span></div>
                        <p className="text-sm text-muted-foreground">You have a solid grasp of this concept.</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-destructive/10 p-4">
                        <div className="flex items-center gap-2 mb-2"><X className="h-5 w-5 text-destructive" /><span className="font-semibold text-destructive">Not quite</span></div>
                        <p className="text-sm mb-2">Actually, it's <strong>"{q.options[q.correct_index]}"</strong> because {q.explanation}</p>
                        <p className="text-sm text-muted-foreground italic">Practical example: {q.practical_example}</p>
                      </div>
                    )}
                    <Button className="mt-4 w-full rounded-2xl" onClick={nextQuestion}>
                      {currentQ < questions.length - 1 ? "Next Question" : "See Results"} <ArrowRight className="ml-2 h-4 w-4" />
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
                    {score === questions.length ? "Perfect score! You've mastered this content." : score >= questions.length * 0.7 ? "Great job! You're getting there." : "Keep studying — you'll improve!"}
                  </p>
                </div>
                <div className="mb-6 space-y-2 text-left">
                  {questions.map((q, i) => (
                    <div key={i} className="glass-card flex items-start gap-3 rounded-2xl p-3">
                      {answers[i] === q.correct_index ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                      <p className="text-sm line-clamp-2">{q.question}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3">
                  {weakAreas.length > 0 && <Button className="w-full rounded-2xl" onClick={() => startQuiz(weakAreas)}><RotateCcw className="mr-2 h-4 w-4" /> Challenge Weak Areas</Button>}
                  <Button variant="outline" className="w-full rounded-2xl" onClick={() => startQuiz()}>Generate New Quiz</Button>
                  <Button variant="ghost" className="w-full rounded-2xl" onClick={() => setQuizState("idle")}>Back to Learn</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  // Main Learn view
  return (
    <div className="px-4 py-6 md:px-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-2xl">
        <button onClick={() => navigate("/learn")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All Topics
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{selectedTopic?.title}</h1>
          {selectedTopic?.description && <p className="mt-1 text-muted-foreground">{selectedTopic.description}</p>}
        </div>

        {/* Milestone Map */}
        {learningSteps.length > 0 && (
          <div className="mb-6 glass-card rounded-3xl p-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">
                Step {Math.min(completedSteps.size + 1, learningSteps.length)} of {learningSteps.length}: {learningSteps[Math.min(completedSteps.size, learningSteps.length - 1)]?.title}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(completedSteps.size / learningSteps.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Learning Path */}
        {learningSteps.length > 0 ? (
          <div className="mb-8 relative">
            {/* Vertical connector line */}
            <div className="absolute left-5 top-6 bottom-6 w-px border-l-2 border-dashed border-border" />

            <div className="space-y-4">
              {learningSteps.map((step, i) => {
                const unlocked = isStepUnlocked(i);
                const completed = completedSteps.has(i);
                const isExpanded = expandedStep === i;

                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`relative pl-12 ${!unlocked ? "opacity-50" : ""}`}
                  >
                    {/* Step indicator */}
                    <div className={`absolute left-2.5 top-4 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      completed ? "bg-success text-success-foreground" : unlocked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {completed ? <Check className="h-3.5 w-3.5" /> : unlocked ? i + 1 : <Lock className="h-3 w-3" />}
                    </div>

                    <button
                      onClick={() => unlocked && setExpandedStep(isExpanded ? null : i)}
                      disabled={!unlocked}
                      className={`glass-card w-full rounded-2xl p-4 text-left transition-all ${unlocked ? "hover:shadow-md" : "cursor-not-allowed"}`}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm">{step.title}</h3>
                        {unlocked && (isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />)}
                      </div>
                    </button>

                    {/* Expanded content */}
                    <AnimatePresence>
                      {isExpanded && unlocked && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="mt-2 glass-card rounded-2xl p-5 space-y-4">
                            {/* Explanation */}
                            <div>
                              <p className="text-sm leading-relaxed">{step.explanation}</p>
                            </div>

                            {/* Actionable insight */}
                            <div className="rounded-xl bg-primary/5 p-3">
                              <p className="text-sm font-medium text-primary">💡 {step.actionable_insight}</p>
                            </div>

                            {/* Source citation */}
                            <Badge variant="secondary" className="text-xs">{step.source_citation}</Badge>

                            {/* Socratic check */}
                            {!completed && (
                              <div className="border-t border-border pt-4">
                                <p className="text-sm font-semibold mb-3">🧠 Quick check:</p>
                                <p className="text-sm mb-3">{step.check_question}</p>
                                <div className="space-y-2">
                                  {step.check_options.map((opt, oi) => {
                                    let cls = "w-full rounded-xl p-3 text-left text-sm transition-all border";
                                    if (checkFeedback && expandedStep === i) {
                                      if (oi === step.check_correct_index) cls += " border-success bg-success/10";
                                      else if (oi === checkAnswer) cls += " border-destructive bg-destructive/10";
                                      else cls += " border-border opacity-50";
                                    } else {
                                      cls += " border-border hover:border-primary cursor-pointer";
                                    }
                                    return (
                                      <button key={oi} onClick={() => !checkFeedback && handleCheckAnswer(i, oi)} disabled={!!checkFeedback} className={cls}>
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                                {checkFeedback === "correct" && expandedStep === i && (
                                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-sm text-success font-medium">
                                    ✅ Correct! Moving to the next step...
                                  </motion.p>
                                )}
                                {checkFeedback === "wrong" && expandedStep === i && (
                                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3">
                                    <p className="text-sm text-destructive font-medium mb-1">Not quite — {step.check_explanation}</p>
                                    <Button size="sm" variant="outline" className="rounded-xl mt-2" onClick={retryCheck}>Try Again</Button>
                                  </motion.div>
                                )}
                              </div>
                            )}

                            {completed && (
                              <div className="flex items-center gap-2 text-success text-sm font-medium">
                                <Check className="h-4 w-4" /> Step completed
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mb-8">
            <button onClick={generateLearningPath} disabled={generatingPath}
              className="glass-card flex w-full items-center gap-4 rounded-3xl p-6 text-left transition-shadow hover:shadow-lg"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                {generatingPath ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6" />}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold">{generatingPath ? "Building Your Path..." : "Generate Learning Path"}</h3>
                <p className="text-sm text-muted-foreground">AI will create a step-by-step roadmap from your sources</p>
              </div>
            </button>
          </div>
        )}

        {/* Take Full Quiz CTA */}
        {learningSteps.length > 0 && (
          <div className="mb-8">
            <button onClick={() => startQuiz()}
              className="glass-card flex w-full items-center gap-4 rounded-3xl p-5 text-left transition-shadow hover:shadow-lg"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Play className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold">Take Full Quiz</h3>
                <p className="text-xs text-muted-foreground">Test all your knowledge at once</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}

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
                  <div className="flex items-start gap-2">
                    <Badge variant={
                      (t.content as any)?.importance === "high" ? "default" :
                      (t.content as any)?.importance === "medium" ? "secondary" : "outline"
                    } className="mt-0.5 shrink-0 text-xs">
                      {(t.content as any)?.importance}
                    </Badge>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold">{t.title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{(t.content as any)?.explanation}</p>
                      {(t.content as any)?.actionable_tip && (
                        <p className="mt-2 text-xs font-medium text-primary">💡 {(t.content as any)?.actionable_tip}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Moments (YouTube) */}
        {ytSources.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Key Moments</h2>
            </div>
            {ytPlayerUrl && (
              <div className="mb-4 w-full overflow-hidden rounded-2xl">
                <iframe src={ytPlayerUrl} className="aspect-video w-full" allowFullScreen allow="autoplay" />
              </div>
            )}
            <div className="space-y-2">
              {ytSources.map((source) =>
                ((source.metadata as any)?.highlights || []).map((h: Highlight, hi: number) => (
                  <button key={`${source.id}-${hi}`}
                    onClick={() => { const url = getYoutubeEmbedUrl(source.url!, h.time); if (url) setYtPlayerUrl(url); }}
                    className="glass-card flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:shadow-md transition-shadow"
                  >
                    <Badge variant="outline" className="shrink-0 font-mono text-xs">{formatTime(h.time)}</Badge>
                    <span className="text-sm line-clamp-1">{h.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
