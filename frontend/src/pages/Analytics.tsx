import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import WordCloud from "react-wordcloud";
import {
  AlertCircle,
  Brain,
  Download,
  FileText,
  Gauge,
  Hash,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import {
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  CartesianGrid as RechartsGrid,
  Cell as RechartsCell,
  Pie as RechartsPie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, getErrorMessage } from "@/api/client";
import { EmptyState } from "@/components/EmptyState";
import { SentimentBadge } from "@/components/SentimentBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import type { Form, FormAnalytics, OverviewAnalytics, Question } from "@/types";
import { formatQuestionType, formatScore, formatValue } from "@/utils/answers";

const sentimentColors: Record<string, string> = {
  positive: "#10b981",
  neutral: "#f59e0b",
  negative: "#ef4444",
  unknown: "#64748b",
};

const palette = ["#2563eb", "#0f766e", "#f59e0b", "#e11d48", "#7c3aed", "#475569"];

type RatingAverage = FormAnalytics["average_rating"][number];
type ChoiceDistribution = FormAnalytics["choice_distribution"][number];
type ChoiceCount = ChoiceDistribution["choices"][number];

async function fetchOverview() {
  const response = await api.get<OverviewAnalytics>("/api/analytics/overview");
  return response.data;
}

async function fetchForms() {
  const response = await api.get<Form[]>("/api/forms");
  return response.data;
}

async function fetchFormAnalytics(formId: number) {
  const response = await api.get<FormAnalytics>(`/api/analytics/forms/${formId}`);
  return response.data;
}

function knownSentimentTotal(distribution: Record<string, number> = {}) {
  return (
    (distribution.positive ?? 0) +
    (distribution.neutral ?? 0) +
    (distribution.negative ?? 0)
  );
}

function sentimentScore(distribution: Record<string, number> = {}) {
  const total = knownSentimentTotal(distribution);
  if (!total) {
    return null;
  }
  return ((distribution.positive ?? 0) - (distribution.negative ?? 0)) / total;
}

function averageRatingForForm(analytics: FormAnalytics | undefined) {
  const ratings = (analytics?.average_rating ?? [])
    .filter((item) => item.type !== "nps")
    .map((item) => item.average_rating)
    .filter((value): value is number => value !== null && value !== undefined);
  if (!ratings.length) {
    return null;
  }
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

function npsScoreForForm(analytics: FormAnalytics | undefined) {
  const nps = analytics?.average_rating.find((item) => item.type === "nps");
  if (!nps?.average_rating && nps?.average_rating !== 0) {
    return null;
  }
  return Math.round(((nps.average_rating - 5) / 5) * 100);
}

function sentimentPercentages(distribution: Record<string, number> = {}) {
  const total = knownSentimentTotal(distribution);
  return {
    positive: total ? Math.round(((distribution.positive ?? 0) / total) * 100) : 0,
    neutral: total ? Math.round(((distribution.neutral ?? 0) / total) * 100) : 0,
    negative: total ? Math.round(((distribution.negative ?? 0) / total) * 100) : 0,
    total,
  };
}

function customerHealth(score: number | null, negativeRate: number) {
  if (score === null) {
    return {
      label: "Waiting for signals",
      tone: "border-slate-300 bg-slate-50 text-slate-700",
      action: "Collect more text responses to unlock sentiment guidance.",
    };
  }
  if (score >= 0.35 && negativeRate <= 20) {
    return {
      label: "Excellent",
      tone: "border-emerald-300 bg-emerald-50 text-emerald-700",
      action: "Use positive keywords in testimonials and keep the current experience stable.",
    };
  }
  if (score >= 0.05 && negativeRate <= 35) {
    return {
      label: "Healthy",
      tone: "border-teal-300 bg-teal-50 text-teal-700",
      action: "Review neutral responses to find quick improvements before they become issues.",
    };
  }
  if (score <= -0.15 || negativeRate >= 45) {
    return {
      label: "At risk",
      tone: "border-rose-300 bg-rose-50 text-rose-700",
      action: "Prioritize negative responses and identify the repeated pain points in keywords.",
    };
  }
  return {
    label: "Mixed",
    tone: "border-amber-300 bg-amber-50 text-amber-700",
    action: "Compare high and low rating answers to understand what creates inconsistent satisfaction.",
  };
}

function AnalyticsSkeleton() {
  return (
    <section className="page-shell">
      <div className="rounded-2xl border bg-card/80 p-6 shadow-sm">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-10 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-[36rem] max-w-full" />
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-36 rounded-2xl" key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Skeleton className="h-[360px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
      <Skeleton className="h-[420px] rounded-2xl" />
    </section>
  );
}

function ErrorPanel({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <Card className="border-destructive/25 bg-card/80 shadow-sm">
      <CardContent className="flex flex-col items-start gap-4 p-6">
        <div className="rounded-xl bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <Button onClick={onRetry} type="button" variant="outline">
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function KpiTile({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: typeof MessageSquareText;
  tone: "blue" | "teal" | "amber" | "rose";
}) {
  const tones = {
    blue: "from-blue-500/15 to-blue-500/0 text-blue-700 dark:text-blue-300",
    teal: "from-teal-500/15 to-teal-500/0 text-teal-700 dark:text-teal-300",
    amber: "from-amber-500/20 to-amber-500/0 text-amber-700 dark:text-amber-300",
    rose: "from-rose-500/15 to-rose-500/0 text-rose-700 dark:text-rose-300",
  };

  return (
    <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
      <CardContent className="relative p-5">
        <div className={cn("absolute inset-0 bg-gradient-to-br", tones[tone])} />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-3 truncate text-3xl font-semibold tracking-normal">
              {value}
            </p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-background/80 shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="relative mt-5 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

export function Analytics() {
  const { toast } = useToast();
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const overviewQuery = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  const formsQuery = useQuery({ queryKey: ["forms"], queryFn: fetchForms });

  useEffect(() => {
    if (!selectedFormId && formsQuery.data?.[0]) {
      setSelectedFormId(formsQuery.data[0].id);
    }
  }, [formsQuery.data, selectedFormId]);

  const formAnalyticsQuery = useQuery({
    queryKey: ["form-analytics", selectedFormId],
    queryFn: () => fetchFormAnalytics(selectedFormId!),
    enabled: Boolean(selectedFormId),
  });

  const selectedForm = formsQuery.data?.find((form) => form.id === selectedFormId) ?? null;
  const formAnalytics = formAnalyticsQuery.data;
  const formAverageRating = averageRatingForForm(formAnalytics);
  const formNpsScore = npsScoreForForm(formAnalytics);
  const formSentimentScore = sentimentScore(formAnalytics?.sentiment_distribution);
  const sentimentData = Object.entries(formAnalytics?.sentiment_distribution ?? {})
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));
  const keywordWords = useMemo(
    () =>
      (formAnalytics?.top_keywords ?? []).map((keyword) => ({
        text: keyword.keyword,
        value: Math.max(keyword.count, 1),
      })),
    [formAnalytics?.top_keywords],
  );

  async function downloadExport(type: "csv" | "pdf") {
    if (!selectedFormId || !selectedForm) {
      return;
    }

    try {
      const response = await api.get<Blob>(`/api/forms/${selectedFormId}/export/${type}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `form_${selectedFormId}_analytics.${type}`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: `${type.toUpperCase()} export ready`,
        description: `${selectedForm.title} was downloaded.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  if (overviewQuery.isLoading || formsQuery.isLoading) {
    return <AnalyticsSkeleton />;
  }

  if (overviewQuery.isError || formsQuery.isError) {
    return (
      <section className="page-shell">
        <ErrorPanel
          title="Analytics could not be loaded"
          description={getErrorMessage(overviewQuery.error ?? formsQuery.error)}
          onRetry={() => {
            void overviewQuery.refetch();
            void formsQuery.refetch();
          }}
        />
      </section>
    );
  }

  return (
    <section className="page-shell">
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,hsl(var(--primary)/0.14),transparent_30%),radial-gradient(circle_at_90%_10%,hsl(var(--accent)/0.13),transparent_28%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.55fr)] xl:items-end">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <Brain className="h-3.5 w-3.5 text-primary" />
              Analytics intelligence
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal md:text-4xl">
              Feedback analytics
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              Analyze form performance, sentiment patterns, rating quality, choices,
              and extracted keywords from customer responses.
            </p>
          </div>

          <div className="grid gap-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="analytics-form">
                Form
              </label>
              <select
                className="select-input bg-background/80"
                id="analytics-form"
                value={selectedFormId ?? ""}
                onChange={(event) => setSelectedFormId(Number(event.target.value))}
              >
                {(formsQuery.data ?? []).map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                disabled={!selectedFormId}
                onClick={() => void downloadExport("csv")}
                type="button"
                variant="outline"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button
                disabled={!selectedFormId}
                onClick={() => void downloadExport("pdf")}
                type="button"
                variant="outline"
              >
                <FileText className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      {!selectedForm ? (
        <EmptyState
          title="No forms to analyze"
          description="Create a form and collect responses to unlock per-form analytics."
        />
      ) : formAnalyticsQuery.isLoading ? (
        <AnalyticsSkeleton />
      ) : formAnalyticsQuery.isError ? (
        <ErrorPanel
          title="Form analytics could not be loaded"
          description={getErrorMessage(formAnalyticsQuery.error)}
          onRetry={() => void formAnalyticsQuery.refetch()}
        />
      ) : formAnalytics ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              icon={MessageSquareText}
              label="Total responses"
              value={formAnalytics.total_responses}
              helper={`${overviewQuery.data?.total_responses ?? 0} company responses`}
              tone="blue"
            />
            <KpiTile
              icon={Star}
              label="Average rating"
              value={formatScore(formAverageRating)}
              helper="Across non-NPS rating questions"
              tone="amber"
            />
            <KpiTile
              icon={Gauge}
              label="NPS"
              value={formNpsScore === null ? "N/A" : formNpsScore}
              helper="Derived from NPS average when available"
              tone="teal"
            />
            <KpiTile
              icon={TrendingUp}
              label="Sentiment score"
              value={formSentimentScore === null ? "N/A" : formatScore(formSentimentScore, 2)}
              helper="Positive minus negative ratio"
              tone="rose"
            />
          </div>

          <CustomerInsightPanel
            analytics={formAnalytics}
            averageRating={formAverageRating}
            npsScore={formNpsScore}
            sentimentScore={formSentimentScore}
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Sentiment distribution
                </CardTitle>
                <CardDescription>
                  NLP sentiment labels across text responses for the selected form.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartShell empty={!sentimentData.length}>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px]">
                    <div className="h-[280px]">
                      <ResponsiveContainer>
                        <RechartsPieChart>
                          <RechartsPie
                            data={sentimentData}
                            dataKey="value"
                            innerRadius={70}
                            nameKey="name"
                            outerRadius={108}
                            paddingAngle={3}
                          >
                            {sentimentData.map((entry) => (
                              <RechartsCell
                                fill={sentimentColors[entry.name] ?? "#64748b"}
                                key={entry.name}
                              />
                            ))}
                          </RechartsPie>
                          <Tooltip contentStyle={tooltipStyle} />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid content-center gap-2">
                      {sentimentData.map((entry) => (
                        <div
                          className="flex items-center justify-between rounded-lg border bg-background/50 px-3 py-2"
                          key={entry.name}
                        >
                          <SentimentBadge label={entry.name} />
                          <span className="text-sm font-semibold">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </ChartShell>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Keyword intelligence
                </CardTitle>
                <CardDescription>
                  Extracted themes from text and long-text answers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {keywordWords.length ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="h-[280px] rounded-xl border bg-background/45 p-3">
                      <WordCloud
                        options={{
                          rotations: 1,
                          rotationAngles: [0, 0],
                          fontSizes: [14, 44],
                          fontFamily: "Inter, sans-serif",
                        }}
                        words={keywordWords}
                      />
                    </div>
                    <div className="grid content-start gap-2">
                      {formAnalytics.top_keywords.slice(0, 8).map((keyword) => (
                        <div
                          className="flex items-center justify-between rounded-lg border bg-background/50 px-3 py-2 text-sm"
                          key={keyword.keyword}
                        >
                          <span className="truncate">{keyword.keyword}</span>
                          <span className="font-semibold text-muted-foreground">
                            {keyword.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No keywords yet"
                    description="Text responses will generate extracted keywords."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Hash className="h-4 w-4 text-primary" />
                Question-level analytics
              </CardTitle>
              <CardDescription>
                Each question uses the chart type best suited to its answer format.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {selectedForm.questions.length ? (
                selectedForm.questions
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((question) => (
                    <QuestionAnalyticsCard
                      analytics={formAnalytics}
                      key={question.id}
                      question={question}
                    />
                  ))
              ) : (
                <EmptyState
                  title="No questions on this form"
                  description="Question analytics will appear after questions are added."
                />
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </section>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
};

function CustomerInsightPanel({
  analytics,
  averageRating,
  npsScore,
  sentimentScore,
}: {
  analytics: FormAnalytics;
  averageRating: number | null;
  npsScore: number | null;
  sentimentScore: number | null;
}) {
  const percentages = sentimentPercentages(analytics.sentiment_distribution);
  const health = customerHealth(sentimentScore, percentages.negative);
  const strongestKeyword = analytics.top_keywords[0]?.keyword ?? "No keyword yet";

  return (
    <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" />
              Customer insight
            </CardTitle>
            <CardDescription>
              Automatic interpretation of satisfaction, sentiment, and recurring themes.
            </CardDescription>
          </div>
          <span className={cn("w-fit rounded-full border px-3 py-1 text-xs font-semibold", health.tone)}>
            {health.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)]">
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <InsightMiniCard
              label="Positive"
              value={`${percentages.positive}%`}
              helper={`${analytics.sentiment_distribution.positive ?? 0} responses`}
              color="#10b981"
            />
            <InsightMiniCard
              label="Neutral"
              value={`${percentages.neutral}%`}
              helper={`${analytics.sentiment_distribution.neutral ?? 0} responses`}
              color="#f59e0b"
            />
            <InsightMiniCard
              label="Negative"
              value={`${percentages.negative}%`}
              helper={`${analytics.sentiment_distribution.negative ?? 0} responses`}
              color="#ef4444"
            />
          </div>

          <div className="grid gap-3">
            <SentimentMeter label="Positive" value={percentages.positive} color="#10b981" />
            <SentimentMeter label="Neutral" value={percentages.neutral} color="#f59e0b" />
            <SentimentMeter label="Negative" value={percentages.negative} color="#ef4444" />
          </div>
        </div>

        <div className="grid content-start gap-3 rounded-xl border bg-background/55 p-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Recommended action</p>
            <p className="mt-2 text-sm leading-6">{health.action}</p>
          </div>
          <div className="grid gap-2 rounded-lg border bg-card/70 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Top theme</span>
              <span className="truncate font-semibold">{strongestKeyword}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Avg rating</span>
              <span className="font-semibold">{formatScore(averageRating)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">NPS</span>
              <span className="font-semibold">{npsScore === null ? "N/A" : npsScore}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightMiniCard({
  label,
  value,
  helper,
  color,
}: {
  label: string;
  value: string;
  helper: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-background/55 p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function SentimentMeter({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function ChartShell({
  children,
  empty,
}: {
  children: ReactNode;
  empty: boolean;
}) {
  if (empty) {
    return (
      <EmptyState
        title="No chart data"
        description="This visualization will populate after responses arrive."
      />
    );
  }

  return <>{children}</>;
}

function QuestionAnalyticsCard({
  question,
  analytics,
}: {
  question: Question;
  analytics: FormAnalytics;
}) {
  const rating = analytics.average_rating.find(
    (item) => item.question_id === question.id,
  );
  const choices = analytics.choice_distribution.find(
    (item) => item.question_id === question.id,
  );

  return (
    <Card className="overflow-hidden border-border/80 bg-background/45 shadow-none">
      <CardHeader className="border-b bg-card/70">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{question.label}</CardTitle>
            <CardDescription>{formatQuestionType(question.type)}</CardDescription>
          </div>
          <span className="rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
            Question {question.order + 1}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {question.type === "rating_5" ? (
          <RatingBarChart max={5} rating={rating} tone="#2563eb" />
        ) : question.type === "rating_10" ? (
          <RatingHistogram max={10} rating={rating} tone="#0f766e" />
        ) : question.type === "nps" ? (
          <NpsBarChart rating={rating} />
        ) : question.type === "multiple_choice" ? (
          <ChoicePie choices={choices?.choices ?? []} />
        ) : question.type === "checkbox" ? (
          <ChoiceBar choices={choices?.choices ?? []} />
        ) : question.type === "yes_no" ? (
          <YesNoChart choices={choices?.choices ?? []} />
        ) : (
          <TextAnalytics analytics={analytics} />
        )}
      </CardContent>
    </Card>
  );
}

function RatingSummary({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-xl border bg-card/80 p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-normal">{value}</p>
      <p className="mt-3 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function RatingBarChart({
  rating,
  max,
  tone,
}: {
  rating?: RatingAverage;
  max: number;
  tone: string;
}) {
  const average = rating?.average_rating ?? 0;
  const data = [{ name: "Average", value: average }];

  return (
    <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
      <RatingSummary
        label="Average"
        value={rating?.average_rating === null || rating?.average_rating === undefined ? "N/A" : formatScore(rating.average_rating)}
        helper={`${rating?.response_count ?? 0} responses`}
      />
      <ChartShell empty={!rating?.response_count}>
        <div className="h-[260px]">
          <ResponsiveContainer>
            <RechartsBarChart data={data} layout="vertical" margin={{ left: 18, right: 18 }}>
              <RechartsGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis domain={[0, max]} type="number" />
              <YAxis dataKey="name" type="category" width={90} />
              <Tooltip contentStyle={tooltipStyle} />
              <RechartsBar dataKey="value" fill={tone} radius={[0, 8, 8, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </ChartShell>
    </div>
  );
}

function RatingHistogram({
  rating,
  max,
  tone,
}: {
  rating?: RatingAverage;
  max: number;
  tone: string;
}) {
  const average = rating?.average_rating ?? 0;
  const rounded = Math.round(average);
  const data = Array.from({ length: max }, (_, index) => {
    const score = index + 1;
    return {
      score: String(score),
      responses: rating?.response_count && score === rounded ? rating.response_count : 0,
    };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
      <RatingSummary
        label="Average"
        value={rating?.average_rating === null || rating?.average_rating === undefined ? "N/A" : formatScore(rating.average_rating)}
        helper={`${rating?.response_count ?? 0} responses`}
      />
      <ChartShell empty={!rating?.response_count}>
        <div className="h-[260px]">
          <ResponsiveContainer>
            <RechartsBarChart data={data}>
              <RechartsGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="score" />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <RechartsBar dataKey="responses" fill={tone} radius={[8, 8, 0, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </ChartShell>
    </div>
  );
}

function NpsBarChart({ rating }: { rating?: RatingAverage }) {
  const average = rating?.average_rating ?? null;
  const nps = average === null ? null : Math.round(((average - 5) / 5) * 100);
  const data = [
    { name: "NPS", value: nps === null ? 0 : nps },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
      <RatingSummary
        label="NPS score"
        value={nps === null ? "N/A" : nps}
        helper={`${rating?.response_count ?? 0} responses`}
      />
      <ChartShell empty={!rating?.response_count}>
        <div className="h-[260px]">
          <ResponsiveContainer>
            <RechartsBarChart data={data} layout="vertical" margin={{ left: 18, right: 18 }}>
              <RechartsGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis domain={[-100, 100]} type="number" />
              <YAxis dataKey="name" type="category" width={80} />
              <Tooltip contentStyle={tooltipStyle} />
              <RechartsBar dataKey="value" fill="#7c3aed" radius={[0, 8, 8, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </ChartShell>
    </div>
  );
}

function ChoicePie({ choices }: { choices: ChoiceCount[] }) {
  const data = choices.map((choice) => ({
    name: formatValue(choice.value),
    value: choice.count,
  }));

  return (
    <ChartShell empty={!data.length}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="h-[280px]">
          <ResponsiveContainer>
            <RechartsPieChart>
              <RechartsPie data={data} dataKey="value" nameKey="name" outerRadius={104}>
                {data.map((entry, index) => (
                  <RechartsCell fill={palette[index % palette.length]} key={entry.name} />
                ))}
              </RechartsPie>
              <Tooltip contentStyle={tooltipStyle} />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
        <ChoiceLegend data={data} />
      </div>
    </ChartShell>
  );
}

function ChoiceBar({ choices }: { choices: ChoiceCount[] }) {
  const data = choices.map((choice) => ({
    name: formatValue(choice.value),
    count: choice.count,
  }));

  return (
    <ChartShell empty={!data.length}>
      <div className="h-[280px]">
        <ResponsiveContainer>
          <RechartsBarChart data={data} margin={{ left: 10, right: 10 }}>
            <RechartsGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <RechartsBar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} />
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

function YesNoChart({ choices }: { choices: ChoiceCount[] }) {
  const byValue = new Map(choices.map((choice) => [String(choice.value), choice.count]));
  const data = [
    { name: "Yes", count: byValue.get("true") ?? byValue.get("Yes") ?? 0 },
    { name: "No", count: byValue.get("false") ?? byValue.get("No") ?? 0 },
  ];

  return (
    <ChartShell empty={!data.some((item) => item.count > 0)}>
      <div className="h-[260px]">
        <ResponsiveContainer>
          <RechartsBarChart data={data}>
            <RechartsGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <RechartsBar dataKey="count" fill="#0f766e" radius={[8, 8, 0, 0]} />
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

function TextAnalytics({ analytics }: { analytics: FormAnalytics }) {
  const sentimentData = Object.entries(analytics.sentiment_distribution)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartShell empty={!analytics.top_keywords.length}>
        <div className="h-[280px] rounded-xl border bg-card/70 p-3">
          <WordCloud
            options={{
              rotations: 1,
              rotationAngles: [0, 0],
              fontSizes: [14, 36],
              fontFamily: "Inter, sans-serif",
            }}
            words={analytics.top_keywords.map((keyword) => ({
              text: keyword.keyword,
              value: Math.max(keyword.count, 1),
            }))}
          />
        </div>
      </ChartShell>
      <ChartShell empty={!sentimentData.length}>
        <div className="h-[280px]">
          <ResponsiveContainer>
            <RechartsBarChart data={sentimentData}>
              <RechartsGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <RechartsBar dataKey="value" radius={[8, 8, 0, 0]}>
                {sentimentData.map((entry) => (
                  <RechartsCell
                    fill={sentimentColors[entry.name] ?? "#64748b"}
                    key={entry.name}
                  />
                ))}
              </RechartsBar>
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </ChartShell>
    </div>
  );
}

function ChoiceLegend({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <div className="grid content-center gap-2">
      {data.map((entry, index) => (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border bg-card/70 px-3 py-2 text-sm"
          key={entry.name}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: palette[index % palette.length] }}
            />
            <span className="truncate">{entry.name}</span>
          </span>
          <span className="font-semibold">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}
