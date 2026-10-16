import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CheckSquare2,
  CircleDot,
  Eye,
  Gauge,
  GripVertical,
  Layers3,
  Loader2,
  MessageSquareText,
  Plus,
  Save,
  Sparkles,
  Star,
  ToggleRight,
  Trash2,
  Type,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import type { Form, QuestionDraft, QuestionType } from "@/types";
import { formatQuestionType } from "@/utils/answers";

interface DraftQuestion extends QuestionDraft {
  localId: string;
  options: string[];
}

type QuestionTypeConfig = {
  value: QuestionType;
  helper: string;
  icon: LucideIcon;
};

const questionTypes: QuestionTypeConfig[] = [
  { value: "rating_5", helper: "Five-star satisfaction", icon: Star },
  { value: "rating_10", helper: "Ten-point score", icon: Gauge },
  { value: "nps", helper: "0 to 10 loyalty scale", icon: Sparkles },
  { value: "text", helper: "Short written answer", icon: Type },
  { value: "long_text", helper: "Detailed written answer", icon: AlignLeft },
  { value: "multiple_choice", helper: "Single selected option", icon: CircleDot },
  { value: "checkbox", helper: "Multiple selected options", icon: CheckSquare2 },
  { value: "yes_no", helper: "Binary decision", icon: ToggleRight },
];

function needsOptions(type: QuestionType) {
  return type === "multiple_choice" || type === "checkbox";
}

function getTypeConfig(type: QuestionType) {
  return questionTypes.find((item) => item.value === type) ?? questionTypes[0];
}

function createQuestion(order: number): DraftQuestion {
  return {
    localId: crypto.randomUUID(),
    type: "rating_5",
    label: "",
    order,
    required: true,
    options: ["Option 1", "Option 2"],
  };
}

function normalizeQuestions(questions: DraftQuestion[]) {
  return questions.map((question, order) => ({ ...question, order }));
}

async function fetchForm(id: string) {
  const response = await api.get<Form>(`/api/forms/${id}`);
  return response.data;
}

export function FormBuilder() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [questions, setQuestions] = useState<DraftQuestion[]>([createQuestion(0)]);

  const formQuery = useQuery({
    queryKey: ["form", id],
    queryFn: () => fetchForm(id!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (!formQuery.data) {
      return;
    }

    setTitle(formQuery.data.title);
    setDescription(formQuery.data.description || "");
    setIsActive(formQuery.data.is_active);
    setQuestions(
      formQuery.data.questions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((question, order) => ({
          localId: String(question.id),
          type: question.type,
          label: question.label,
          order,
          required: question.required,
          options: Array.isArray(question.options)
            ? question.options.map(String)
            : ["Option 1", "Option 2"],
        })),
    );
  }, [formQuery.data]);

  const saveForm = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        throw new Error("Form title is required.");
      }
      if (!questions.length) {
        throw new Error("Add at least one question.");
      }
      const invalidQuestion = questions.find((question) => !question.label.trim());
      if (invalidQuestion) {
        throw new Error("Every question needs a label.");
      }
      const invalidOptions = questions.find(
        (question) =>
          needsOptions(question.type) &&
          question.options.map((option) => option.trim()).filter(Boolean).length < 2,
      );
      if (invalidOptions) {
        throw new Error("Choice questions need at least two options.");
      }

      const payload = {
        title: trimmedTitle,
        description: description.trim() || null,
        is_active: isActive,
        questions: questions.map((question, order) => ({
          type: question.type,
          label: question.label.trim(),
          order,
          required: question.required,
          options: needsOptions(question.type)
            ? question.options.map((option) => option.trim()).filter(Boolean)
            : null,
        })),
      };

      const response = isEditing
        ? await api.put<Form>(`/api/forms/${id}`, payload)
        : await api.post<Form>("/api/forms", payload);
      return response.data;
    },
    onSuccess: async (savedForm) => {
      await queryClient.invalidateQueries({ queryKey: ["forms"] });
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
      await queryClient.invalidateQueries({ queryKey: ["form", String(savedForm.id)] });
      toast({
        title: isEditing ? "Form updated" : "Form created",
        description: "The form builder changes were saved.",
        variant: "success",
      });
      navigate(`/forms/${savedForm.id}`);
    },
    onError: (error) => {
      toast({
        title: "Form save failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  function updateQuestion(localId: string, patch: Partial<DraftQuestion>) {
    setQuestions((current) =>
      current.map((question) =>
        question.localId === localId ? { ...question, ...patch } : question,
      ),
    );
  }

  function addQuestion(type: QuestionType = "rating_5") {
    setQuestions((current) =>
      normalizeQuestions([
        ...current,
        {
          ...createQuestion(current.length),
          type,
          options: needsOptions(type) ? ["Option 1", "Option 2"] : [],
        },
      ]),
    );
  }

  function removeQuestion(localId: string) {
    setQuestions((current) =>
      normalizeQuestions(current.filter((question) => question.localId !== localId)),
    );
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) {
        return current;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return normalizeQuestions(next);
    });
  }

  function updateOption(question: DraftQuestion, optionIndex: number, value: string) {
    updateQuestion(question.localId, {
      options: question.options.map((option, index) =>
        index === optionIndex ? value : option,
      ),
    });
  }

  const requiredCount = useMemo(
    () => questions.filter((question) => question.required).length,
    [questions],
  );

  if (formQuery.isLoading) {
    return <PageSkeleton />;
  }

  if (formQuery.isError) {
    return (
      <section className="page-shell">
        <EmptyState
          title="Form could not be loaded"
          description={getErrorMessage(formQuery.error)}
          actionLabel="Back to forms"
          onAction={() => navigate("/forms")}
        />
      </section>
    );
  }

  return (
    <section className="page-shell">
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,hsl(var(--primary)/0.14),transparent_30%),radial-gradient(circle_at_90%_10%,hsl(var(--accent)/0.13),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <Layers3 className="h-3.5 w-3.5 text-primary" />
              Premium form builder
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal md:text-4xl">
              {isEditing ? "Edit feedback form" : "Create feedback form"}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              Build a structured client experience with polished question controls,
              response-ready validation, and a live preview that mirrors the final form.
            </p>
          </div>
          <Button
            className="w-full sm:w-fit"
            disabled={saveForm.isPending}
            onClick={() => saveForm.mutate()}
          >
            {saveForm.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEditing ? "Save changes" : "Create form"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(390px,0.88fr)]">
        <div className="grid gap-5">
          <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle>Form setup</CardTitle>
                  <CardDescription>
                    Define the form identity and whether clients can submit responses.
                  </CardDescription>
                </div>
                <Badge variant={isActive ? "success" : "secondary"}>
                  {isActive ? "Accepting responses" : "Paused"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="form-title">Title</Label>
                <Input
                  id="form-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Customer onboarding feedback"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="form-description">Description</Label>
                <Textarea
                  id="form-description"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Help us understand your experience."
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border bg-background/60 p-4">
                <div>
                  <Label htmlFor="form-active">Accept responses</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Active forms are visible to clients and can receive feedback.
                  </p>
                </div>
                <Switch id="form-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>Question palette</CardTitle>
                  <CardDescription>
                    Add any supported question type to the form.
                  </CardDescription>
                </div>
                <div className="rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                  {questions.length} total, {requiredCount} required
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {questionTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      className="group rounded-xl border bg-background/55 p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/5 hover:shadow-sm"
                      key={type.value}
                      onClick={() => addQuestion(type.value)}
                      type="button"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="mt-3 block text-sm font-medium">
                        {formatQuestionType(type.value)}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {type.helper}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Question editor</h2>
              <p className="text-sm text-muted-foreground">
                Reorder, configure, and validate the client-facing flow.
              </p>
            </div>
            <Button onClick={() => addQuestion()} type="button" variant="outline">
              <Plus className="h-4 w-4" />
              Add question
            </Button>
          </div>

          {questions.length ? (
            <div className="grid gap-4">
              {questions.map((question, index) => (
                <QuestionCard
                  index={index}
                  key={question.localId}
                  moveQuestion={moveQuestion}
                  question={question}
                  questionCount={questions.length}
                  removeQuestion={removeQuestion}
                  updateOption={updateOption}
                  updateQuestion={updateQuestion}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MessageSquareText}
              title="No questions yet"
              description="Use the question palette to add ratings, choices, text prompts, NPS, or yes/no questions."
              actionLabel="Add rating question"
              onAction={() => addQuestion("rating_5")}
            />
          )}
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <LivePreview
            description={description}
            isActive={isActive}
            questions={questions}
            title={title}
          />
        </aside>
      </div>
    </section>
  );
}

function QuestionCard({
  question,
  index,
  questionCount,
  updateQuestion,
  updateOption,
  removeQuestion,
  moveQuestion,
}: {
  question: DraftQuestion;
  index: number;
  questionCount: number;
  updateQuestion: (localId: string, patch: Partial<DraftQuestion>) => void;
  updateOption: (question: DraftQuestion, optionIndex: number, value: string) => void;
  removeQuestion: (localId: string) => void;
  moveQuestion: (index: number, direction: -1 | 1) => void;
}) {
  const config = getTypeConfig(question.type);
  const Icon = config.icon;

  return (
    <Card className="group overflow-hidden border-border/80 bg-card/80 shadow-sm transition hover:shadow-md">
      <CardContent className="grid gap-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border bg-background/80 text-muted-foreground shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <p className="font-semibold">Question {index + 1}</p>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {formatQuestionType(question.type)} - {config.helper}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              disabled={index === 0}
              onClick={() => moveQuestion(index, -1)}
              size="icon"
              title="Move up"
              type="button"
              variant="ghost"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              disabled={index === questionCount - 1}
              onClick={() => moveQuestion(index, 1)}
              size="icon"
              title="Move down"
              type="button"
              variant="ghost"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => removeQuestion(question.localId)}
              size="icon"
              title="Delete question"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(270px,0.72fr)]">
          <div className="grid gap-2">
            <Label htmlFor={`label-${question.localId}`}>Question label</Label>
            <Input
              id={`label-${question.localId}`}
              value={question.label}
              onChange={(event) =>
                updateQuestion(question.localId, { label: event.target.value })
              }
              placeholder="How satisfied are you?"
            />
          </div>
          <QuestionTypeSelector
            selected={question.type}
            onSelect={(type) =>
              updateQuestion(question.localId, {
                type,
                options: needsOptions(type)
                  ? question.options.length
                    ? question.options
                    : ["Option 1", "Option 2"]
                  : [],
              })
            }
          />
        </div>

        <div className="grid gap-4 rounded-xl border bg-background/55 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Question behavior</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Required questions must be answered before submission.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Required
              <Switch
                checked={question.required}
                onCheckedChange={(checked) =>
                  updateQuestion(question.localId, { required: checked })
                }
              />
            </label>
          </div>

          {needsOptions(question.type) ? (
            <OptionsEditor
              question={question}
              updateOption={updateOption}
              updateQuestion={updateQuestion}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function QuestionTypeSelector({
  selected,
  onSelect,
}: {
  selected: QuestionType;
  onSelect: (type: QuestionType) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>Question type</Label>
      <div className="grid grid-cols-2 gap-2">
        {questionTypes.map((type) => {
          const Icon = type.icon;
          const isSelected = selected === type.value;
          return (
            <button
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-background/65 px-3 py-2 text-left text-xs transition hover:border-primary/60 hover:bg-primary/5",
                isSelected && "border-primary bg-primary/10 text-primary",
              )}
              key={type.value}
              onClick={() => onSelect(type.value)}
              type="button"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{formatQuestionType(type.value)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OptionsEditor({
  question,
  updateQuestion,
  updateOption,
}: {
  question: DraftQuestion;
  updateQuestion: (localId: string, patch: Partial<DraftQuestion>) => void;
  updateOption: (question: DraftQuestion, optionIndex: number, value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label>Options</Label>
        <Button
          onClick={() =>
            updateQuestion(question.localId, {
              options: [...question.options, `Option ${question.options.length + 1}`],
            })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          Add option
        </Button>
      </div>
      <div className="grid gap-2">
        {question.options.map((option, optionIndex) => (
          <div className="flex gap-2" key={optionIndex}>
            <div className="grid h-10 w-10 place-items-center rounded-md border bg-muted text-xs font-medium text-muted-foreground">
              {optionIndex + 1}
            </div>
            <Input
              value={option}
              onChange={(event) => updateOption(question, optionIndex, event.target.value)}
            />
            <Button
              disabled={question.options.length <= 2}
              onClick={() =>
                updateQuestion(question.localId, {
                  options: question.options.filter(
                    (_, indexToKeep) => indexToKeep !== optionIndex,
                  ),
                })
              }
              size="icon"
              type="button"
              variant="outline"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LivePreview({
  title,
  description,
  isActive,
  questions,
}: {
  title: string;
  description: string;
  isActive: boolean;
  questions: DraftQuestion[];
}) {
  return (
    <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
      <CardHeader className="border-b bg-background/45">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-foreground text-background">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Live preview</CardTitle>
              <CardDescription>Client submission experience</CardDescription>
            </div>
          </div>
          <Badge variant={isActive ? "success" : "secondary"}>
            {isActive ? "Active" : "Paused"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.11),transparent_18rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.34))] p-4 sm:p-5">
          <div className="rounded-2xl border bg-card/90 p-5 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-primary">
                FeedbackIQ form
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-normal">
                {title.trim() || "Untitled feedback form"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description || "Form description will appear here."}
              </p>
            </div>

            <div className="mt-6 grid gap-4">
              {questions.length ? (
                questions.map((question, index) => (
                  <div className="rounded-xl border bg-background/65 p-4" key={question.localId}>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {index + 1}. {question.label || "Question label"}
                          {question.required ? (
                            <span className="text-destructive"> *</span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatQuestionType(question.type)}
                        </p>
                      </div>
                    </div>
                    {renderPreviewControl(question)}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed bg-background/65 p-6">
                  <p className="text-sm font-medium">No questions added</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The client preview will update as questions are added.
                  </p>
                </div>
              )}
            </div>

            <Button className="mt-6 w-full" disabled type="button">
              Submit feedback
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function renderPreviewControl(question: DraftQuestion) {
  if (question.type === "long_text") {
    return <Textarea disabled placeholder="Write your detailed answer" rows={4} />;
  }

  if (question.type === "text") {
    return <Input disabled placeholder="Write a short answer" />;
  }

  if (question.type === "yes_no") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
        <Button disabled type="button" variant="outline">
          Yes
        </Button>
        <Button disabled type="button" variant="outline">
          No
        </Button>
      </div>
    );
  }

  if (question.type === "multiple_choice" || question.type === "checkbox") {
    return (
      <div className="grid gap-2">
        {question.options.filter(Boolean).map((option) => (
          <label
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
            key={option}
          >
            <input
              className="h-4 w-4"
              disabled
              type={question.type === "checkbox" ? "checkbox" : "radio"}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "rating_5") {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <button
            className="grid h-10 w-10 place-items-center rounded-lg border bg-card text-amber-500"
            disabled
            key={index}
            type="button"
          >
            <Star className="h-5 w-5" />
          </button>
        ))}
      </div>
    );
  }

  const max = question.type === "nps" ? 10 : 10;
  const min = question.type === "nps" ? 0 : 1;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: max - min + 1 }).map((_, index) => (
          <button
            className="grid h-9 w-9 place-items-center rounded-md border bg-card text-sm text-muted-foreground"
            disabled
            key={index}
            type="button"
          >
            {min + index}
          </button>
        ))}
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
