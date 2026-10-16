import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MessageSquareText,
  Search,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { api, getErrorMessage } from "@/api/client";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/LoadingStates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import type {
  AnswerSubmit,
  FeedbackResponse,
  Form,
  PublicFormSummary,
  Question,
} from "@/types";
import { formatQuestionType, getQuestionOptions } from "@/utils/answers";

type AnswerState = Record<number, string | string[] | boolean | undefined>;
type ValidationErrors = Record<number, string>;

async function fetchPublicForms() {
  const response = await api.get<PublicFormSummary[]>("/api/forms/assigned");
  return response.data;
}

async function fetchPublicForm(formId: number) {
  const response = await api.get<Form>(`/api/forms/${formId}/public`);
  return response.data;
}

function chunkQuestions(questions: Question[]) {
  if (questions.length <= 4) {
    return [questions];
  }

  const chunks: Question[][] = [];
  for (let index = 0; index < questions.length; index += 4) {
    chunks.push(questions.slice(index, index + 4));
  }
  return chunks;
}

function hasAnswer(question: Question, value: AnswerState[number]) {
  if (!question.required) {
    return true;
  }
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return Boolean(value.trim());
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === "boolean";
}

function answerCount(questions: Question[], answers: AnswerState) {
  return questions.filter((question) => hasAnswer({ ...question, required: true }, answers[question.id])).length;
}

export function ClientSubmitFeedback() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [submittedResponse, setSubmittedResponse] = useState<FeedbackResponse | null>(null);

  const publicFormsQuery = useQuery({
    queryKey: ["public-forms"],
    queryFn: fetchPublicForms,
  });
  const formQuery = useQuery({
    queryKey: ["public-form", selectedFormId],
    queryFn: () => fetchPublicForm(selectedFormId!),
    enabled: Boolean(selectedFormId),
  });

  const groupedForms = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const groups = new Map<string, PublicFormSummary[]>();

    (publicFormsQuery.data ?? [])
      .filter((form) => {
        if (!needle) {
          return true;
        }
        return [form.company_name, form.title, form.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .forEach((form) => {
        const current = groups.get(form.company_name) ?? [];
        current.push(form);
        groups.set(form.company_name, current);
      });

    return Array.from(groups.entries()).map(([companyName, forms]) => ({
      companyName,
      forms,
    }));
  }, [publicFormsQuery.data, search]);

  const orderedQuestions = useMemo(
    () => formQuery.data?.questions.slice().sort((a, b) => a.order - b.order) ?? [],
    [formQuery.data?.questions],
  );
  const questionSteps = useMemo(() => chunkQuestions(orderedQuestions), [orderedQuestions]);
  const currentQuestions = questionSteps[step] ?? [];
  const progress = questionSteps.length ? ((step + 1) / questionSteps.length) * 100 : 0;
  const completedAnswers = answerCount(orderedQuestions, answers);

  useEffect(() => {
    const formId = Number(searchParams.get("form"));
    if (!Number.isInteger(formId) || formId <= 0 || selectedFormId === formId) {
      return;
    }

    setSelectedFormId(formId);
    setAnswers({});
    setValidationErrors({});
    setSubmittedResponse(null);
    setStep(0);
  }, [searchParams, selectedFormId]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!formQuery.data) {
        throw new Error("Select a form before submitting.");
      }
      validateQuestions(orderedQuestions, answers);
      const payload = {
        answers: orderedQuestions.map((question) =>
          buildAnswerPayload(question, answers[question.id]),
        ),
      };
      const response = await api.post<FeedbackResponse>(
        `/api/forms/${formQuery.data.id}/responses`,
        payload,
      );
      return response.data;
    },
    onSuccess: async (response) => {
      setSubmittedResponse(response);
      toast({
        title: "Feedback submitted",
        description: "Thank you for sharing your experience.",
        variant: "success",
      });
      setAnswers({});
      setValidationErrors({});
      setStep(0);
      await queryClient.invalidateQueries({ queryKey: ["my-responses"] });
    },
    onError: (error) => {
      toast({
        title: "Submission failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  function selectForm(formId: number) {
    setSelectedFormId(formId);
    setAnswers({});
    setValidationErrors({});
    setSubmittedResponse(null);
    setStep(0);
  }

  function updateAnswer(question: Question, value: AnswerState[number]) {
    setAnswers((current) => ({ ...current, [question.id]: value }));
    setValidationErrors((current) => {
      const next = { ...current };
      delete next[question.id];
      return next;
    });
  }

  function validateStep() {
    const nextErrors: ValidationErrors = {};
    currentQuestions.forEach((question) => {
      if (!hasAnswer(question, answers[question.id])) {
        nextErrors[question.id] = "This question is required.";
      }
    });

    setValidationErrors((current) => ({ ...current, ...nextErrors }));

    if (Object.keys(nextErrors).length) {
      toast({
        title: "Some answers are missing",
        description: "Complete required questions before continuing.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  }

  function goNext() {
    if (validateStep()) {
      setStep((current) => Math.min(current + 1, questionSteps.length - 1));
    }
  }

  function submitCurrentForm() {
    if (!validateStep()) {
      return;
    }

    try {
      validateQuestions(orderedQuestions, answers);
      submitMutation.mutate();
    } catch (error) {
      const nextErrors: ValidationErrors = {};
      orderedQuestions.forEach((question) => {
        if (!hasAnswer(question, answers[question.id])) {
          nextErrors[question.id] = "This question is required.";
        }
      });
      setValidationErrors(nextErrors);
      toast({
        title: "Required answers missing",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  if (publicFormsQuery.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="page-shell">
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,hsl(var(--primary)/0.14),transparent_30%),radial-gradient(circle_at_90%_10%,hsl(var(--accent)/0.13),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Client feedback portal
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal md:text-4xl">
              Submit feedback
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              Open forms sent by companies, answer guided questions, and share
              structured feedback in a few focused steps.
            </p>
          </div>
          <div className="rounded-xl border bg-background/70 px-4 py-3 text-sm text-muted-foreground shadow-sm">
            {publicFormsQuery.data?.length ?? 0} assigned forms available
          </div>
        </div>
      </div>

      {publicFormsQuery.isError ? (
        <EmptyState
          title="Forms could not be loaded"
          description={getErrorMessage(publicFormsQuery.error)}
          actionLabel="Try again"
          onAction={() => void publicFormsQuery.refetch()}
        />
      ) : publicFormsQuery.data?.length ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)]">
          <div className="grid gap-4 self-start">
            <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Forms sent to you
                </CardTitle>
                <CardDescription>
                  Search assigned forms by company, form title, or description.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex items-center gap-2 rounded-xl border bg-background/70 px-3 py-2 text-sm text-muted-foreground shadow-sm">
                  <Search className="h-4 w-4 shrink-0" />
                  <input
                    aria-label="Search assigned forms"
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search forms..."
                    type="search"
                    value={search}
                  />
                </div>

                {groupedForms.length ? (
                  <div className="grid gap-4">
                    {groupedForms.map((group) => (
                      <div className="grid gap-2" key={group.companyName}>
                        <div className="flex items-center justify-between gap-3 px-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <p className="truncate text-sm font-semibold">{group.companyName}</p>
                          </div>
                          <Badge variant="secondary">{group.forms.length}</Badge>
                        </div>
                        <div className="grid gap-2">
                          {group.forms.map((form) => (
                            <button
                              className={cn(
                                "rounded-xl border bg-background/55 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/5 hover:shadow-sm",
                                selectedFormId === form.id &&
                                  "border-primary bg-primary/10 shadow-sm",
                              )}
                              key={form.id}
                              onClick={() => selectForm(form.id)}
                              type="button"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{form.title}</p>
                                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                    {form.description || "No description"}
                                  </p>
                                </div>
                                <span className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                                  {form.question_count} questions
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No matching forms"
                    description="Adjust your search to find an active feedback form."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <ClientFormPanel
            answers={answers}
            completedAnswers={completedAnswers}
            currentQuestions={currentQuestions}
            form={formQuery.data}
            isLoading={formQuery.isLoading}
            progress={progress}
            questionCount={orderedQuestions.length}
            questionSteps={questionSteps}
            selectedFormId={selectedFormId}
            step={step}
            submittedResponse={submittedResponse}
            submitMutationPending={submitMutation.isPending}
            updateAnswer={updateAnswer}
            validationErrors={validationErrors}
            onBack={() => setStep((current) => Math.max(current - 1, 0))}
            onNext={goNext}
            onSubmit={submitCurrentForm}
            onSubmitAnother={() => {
              setSubmittedResponse(null);
              setAnswers({});
              setValidationErrors({});
              setStep(0);
            }}
          />
        </div>
      ) : (
        <EmptyState
          title="No forms sent to you"
          description="When a company sends you a feedback form, it will appear in this space."
        />
      )}
    </section>
  );
}

function ClientFormPanel({
  form,
  isLoading,
  selectedFormId,
  submittedResponse,
  questionSteps,
  currentQuestions,
  step,
  progress,
  questionCount,
  completedAnswers,
  answers,
  validationErrors,
  submitMutationPending,
  updateAnswer,
  onBack,
  onNext,
  onSubmit,
  onSubmitAnother,
}: {
  form: Form | undefined;
  isLoading: boolean;
  selectedFormId: number | null;
  submittedResponse: FeedbackResponse | null;
  questionSteps: Question[][];
  currentQuestions: Question[];
  step: number;
  progress: number;
  questionCount: number;
  completedAnswers: number;
  answers: AnswerState;
  validationErrors: ValidationErrors;
  submitMutationPending: boolean;
  updateAnswer: (question: Question, value: AnswerState[number]) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onSubmitAnother: () => void;
}) {
  if (isLoading) {
    return (
      <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
        <CardContent className="p-6">
          <PageSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (submittedResponse && form) {
    return (
      <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
        <CardContent className="p-0">
          <div className="bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_20rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.34))] p-6">
            <div className="mx-auto max-w-xl rounded-2xl border bg-card/90 p-6 text-center shadow-sm">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-normal">
                Feedback submitted
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Thank you for completing {form.title}. Your response has been saved
                and is available in your submission history.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <Button asChild>
                  <Link to={`/responses/${submittedResponse.id}`}>View response</Link>
                </Button>
                <Button onClick={onSubmitAnother} type="button" variant="outline">
                  Submit another
                </Button>
              </div>
              <Button asChild className="mt-2 w-full" variant="ghost">
                <Link to="/responses">Go to My Responses</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!selectedFormId || !form) {
    return (
      <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
        <CardContent className="p-6">
          <EmptyState
            icon={MessageSquareText}
            title="Select a form"
            description="Choose an active feedback form from the company list to begin."
          />
        </CardContent>
      </Card>
    );
  }

  const isLastStep = step + 1 >= questionSteps.length;

  return (
    <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
      <CardHeader className="border-b bg-background/45">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Active</Badge>
              <span className="text-xs text-muted-foreground">
                {completedAnswers} of {questionCount} answered
              </span>
            </div>
            <CardTitle className="mt-3 text-2xl">{form.title}</CardTitle>
            <CardDescription className="mt-2">{form.description}</CardDescription>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Step {step + 1} of {questionSteps.length}
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-5 md:p-6">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {currentQuestions.map((question) => (
            <QuestionBlock
              answers={answers}
              error={validationErrors[question.id]}
              key={question.id}
              question={question}
              updateAnswer={updateAnswer}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <Button disabled={step === 0} onClick={onBack} type="button" variant="outline">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            {isLastStep ? (
              <Button disabled={submitMutationPending} type="submit">
                {submitMutationPending ? (
                  <Send className="h-4 w-4 animate-pulse" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Submit feedback
              </Button>
            ) : (
              <Button onClick={onNext} type="button">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function QuestionBlock({
  question,
  answers,
  error,
  updateAnswer,
}: {
  question: Question;
  answers: AnswerState;
  error?: string;
  updateAnswer: (question: Question, value: AnswerState[number]) => void;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 rounded-2xl border bg-background/55 p-4 transition",
        error && "border-destructive/60 bg-destructive/5",
      )}
    >
      <div>
        <p className="font-medium">
          {question.label}
          {question.required ? <span className="text-destructive"> *</span> : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatQuestionType(question.type)}
        </p>
      </div>
      {renderQuestionInput(question, answers, updateAnswer)}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function renderQuestionInput(
  question: Question,
  answers: AnswerState,
  updateAnswer: (question: Question, value: AnswerState[number]) => void,
) {
  const value = answers[question.id];
  const options = getQuestionOptions(question.options);

  if (question.type === "text") {
    return (
      <Input
        value={typeof value === "string" ? value : ""}
        onChange={(event) => updateAnswer(question, event.target.value)}
        placeholder="Short answer"
      />
    );
  }

  if (question.type === "long_text") {
    return (
      <Textarea
        rows={5}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => updateAnswer(question, event.target.value)}
        placeholder="Detailed answer"
      />
    );
  }

  if (question.type === "rating_5") {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => {
          const rating = String(index + 1);
          const selected = Number(value) >= index + 1;
          return (
            <button
              aria-label={`${rating} stars`}
              className={cn(
                "grid h-11 w-11 place-items-center rounded-xl border bg-card text-muted-foreground transition hover:border-amber-400 hover:text-amber-500",
                selected && "border-amber-400 bg-amber-500/10 text-amber-500",
              )}
              key={rating}
              onClick={() => updateAnswer(question, rating)}
              type="button"
            >
              <Star className={cn("h-5 w-5", selected && "fill-current")} />
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === "rating_10" || question.type === "nps") {
    const max = 10;
    const min = question.type === "nps" ? 0 : 1;
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: max - min + 1 }).map((_, index) => {
            const rating = String(min + index);
            return (
              <button
                className={cn(
                  "grid h-10 min-w-10 place-items-center rounded-lg border bg-card px-3 text-sm text-muted-foreground transition hover:border-primary hover:text-primary",
                  value === rating && "border-primary bg-primary text-primary-foreground",
                )}
                key={rating}
                onClick={() => updateAnswer(question, rating)}
                type="button"
              >
                {rating}
              </button>
            );
          })}
        </div>
        {question.type === "nps" ? (
          <div className="flex max-w-md justify-between text-xs text-muted-foreground">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
        ) : null}
      </div>
    );
  }

  if (question.type === "yes_no") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
        <Button
          onClick={() => updateAnswer(question, true)}
          type="button"
          variant={value === true ? "default" : "outline"}
        >
          Yes
        </Button>
        <Button
          onClick={() => updateAnswer(question, false)}
          type="button"
          variant={value === false ? "default" : "outline"}
        >
          No
        </Button>
      </div>
    );
  }

  if (question.type === "checkbox") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="grid gap-2">
        {options.map((option) => (
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-sm transition hover:border-primary/60",
              selected.includes(option) && "border-primary bg-primary/5",
            )}
            key={option}
          >
            <input
              checked={selected.includes(option)}
              className="h-4 w-4"
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, option]
                  : selected.filter((item) => item !== option);
                updateAnswer(question, next);
              }}
              type="checkbox"
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {options.map((option) => (
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-sm transition hover:border-primary/60",
            value === option && "border-primary bg-primary/5",
          )}
          key={option}
        >
          <input
            checked={value === option}
            className="h-4 w-4"
            onChange={() => updateAnswer(question, option)}
            type="radio"
          />
          {option}
        </label>
      ))}
    </div>
  );
}

function buildAnswerPayload(question: Question, value: AnswerState[number]): AnswerSubmit {
  if (value === undefined || value === null || value === "") {
    return { question_id: question.id };
  }
  if (question.type === "text" || question.type === "long_text") {
    return { question_id: question.id, value_text: String(value) };
  }
  if (
    question.type === "rating_5" ||
    question.type === "rating_10" ||
    question.type === "nps"
  ) {
    return { question_id: question.id, value_number: Number(value) };
  }
  return { question_id: question.id, value_options: value };
}

function validateQuestions(questions: Question[], answers: AnswerState) {
  const missing = questions.find((question) => !hasAnswer(question, answers[question.id]));
  if (missing) {
    throw new Error(`${missing.label} is required.`);
  }
}
