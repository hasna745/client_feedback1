import { Link, useParams } from "react-router-dom";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  Copy,
  Download,
  Edit3,
  FileText,
  Hash,
  ListChecks,
  Mail,
  MessageSquareText,
  RadioTower,
  SlidersHorizontal,
  Star,
  Tags,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, getErrorMessage } from "@/api/client";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/LoadingStates";
import { MetricCard } from "@/components/MetricCard";
import { SentimentBadge } from "@/components/SentimentBadge";
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
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import type { Form, FormAnalytics, PaginatedResponses } from "@/types";
import {
  formatAnswerValue,
  formatDate,
  formatQuestionType,
  formatScore,
  formatValue,
} from "@/utils/answers";

type FormDetailsTab = "overview" | "responses" | "analytics";

const sentimentColors: Record<string, string> = {
  positive: "#10b981",
  neutral: "#f59e0b",
  negative: "#ef4444",
  unknown: "#64748b",
};

const palette = ["#2563eb", "#0f766e", "#f59e0b", "#e11d48", "#7c3aed", "#475569"];
const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
};

async function fetchForm(id: string) {
  const response = await api.get<Form>(`/api/forms/${id}`);
  return response.data;
}

async function fetchResponses(id: string, page: number, pageSize: number) {
  const response = await api.get<PaginatedResponses>(`/api/forms/${id}/responses`, {
    params: { limit: pageSize, offset: page * pageSize },
  });
  return response.data;
}

async function fetchFormAnalytics(id: string) {
  const response = await api.get<FormAnalytics>(`/api/analytics/forms/${id}`);
  return response.data;
}

function averageRating(analytics: FormAnalytics | undefined) {
  const ratings = (analytics?.average_rating ?? [])
    .map((item) => item.average_rating)
    .filter((value): value is number => value !== null && value !== undefined);

  if (!ratings.length) {
    return null;
  }

  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

function sentimentScore(distribution: Record<string, number> = {}) {
  const total =
    (distribution.positive ?? 0) +
    (distribution.neutral ?? 0) +
    (distribution.negative ?? 0);

  if (!total) {
    return null;
  }

  return ((distribution.positive ?? 0) - (distribution.negative ?? 0)) / total;
}

export function FormDetails() {
  const { id } = useParams();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<FormDetailsTab>("overview");
  const [page, setPage] = useState(0);
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const pageSize = 10;

  const formQuery = useQuery({
    queryKey: ["form", id],
    queryFn: () => fetchForm(id!),
    enabled: Boolean(id),
  });
  const responsesQuery = useQuery({
    queryKey: ["form-responses", id, page, pageSize],
    queryFn: () => fetchResponses(id!, page, pageSize),
    enabled: Boolean(id),
  });
  const analyticsQuery = useQuery({
    queryKey: ["form-analytics", id],
    queryFn: () => fetchFormAnalytics(id!),
    enabled: Boolean(id),
  });

  async function downloadExport(type: "csv" | "pdf") {
    if (!id || !formQuery.data) {
      return;
    }

    try {
      const response = await api.get<Blob>(`/api/forms/${id}/export/${type}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `form_${id}_responses.${type}`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: `${type.toUpperCase()} export ready`,
        description: `${formQuery.data.title} was downloaded.`,
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

  async function copyPublicLink(formId: number) {
    const url = `${window.location.origin}/submit?form=${formId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied",
        description: "The client submission link is ready to share.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: url,
        variant: "destructive",
      });
    }
  }

  const responses = responsesQuery.data?.items ?? [];
  const filteredResponses = useMemo(
    () =>
      responses.filter((response) => {
        if (
          sentimentFilter !== "all" &&
          (response.overall_sentiment_label || "unknown") !== sentimentFilter
        ) {
          return false;
        }
        const submitted = new Date(response.submitted_at).toISOString().slice(0, 10);
        if (dateFrom && submitted < dateFrom) {
          return false;
        }
        if (dateTo && submitted > dateTo) {
          return false;
        }
        return true;
      }),
    [responses, sentimentFilter, dateFrom, dateTo],
  );

  if (formQuery.isLoading) {
    return <PageSkeleton />;
  }

  if (formQuery.isError || !formQuery.data) {
    return (
      <section className="page-shell">
        <EmptyState
          title="Form could not be loaded"
          description={getErrorMessage(formQuery.error)}
          actionLabel="Back to forms"
          onAction={() => window.history.back()}
        />
      </section>
    );
  }

  const form = formQuery.data;
  const totalResponses = responsesQuery.data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(totalResponses / pageSize), 1);

  return (
    <section className="page-shell">
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,hsl(var(--primary)/0.13),transparent_30%),radial-gradient(circle_at_90%_10%,hsl(var(--accent)/0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Form workspace
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal md:text-4xl">
              {form.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              {form.description || "No description"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to={`/forms/${form.id}/edit`}>
                <Edit3 className="h-4 w-4" />
                Edit
              </Link>
            </Button>
            <Button onClick={() => void downloadExport("csv")} type="button" variant="outline">
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button onClick={() => void downloadExport("pdf")} type="button" variant="outline">
              <FileText className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={RadioTower}
          label="Status"
          value={form.is_active ? "Active" : "Paused"}
          tone={form.is_active ? "teal" : "amber"}
        />
        <MetricCard icon={ListChecks} label="Questions" value={form.questions.length} />
        <MetricCard
          icon={MessageSquareText}
          label="Responses"
          value={totalResponses}
          tone="rose"
        />
        <MetricCard label="Public form ID" value={form.id} helper="Use this for direct links." />
      </div>

      <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-primary" />
                Share or assign form
              </CardTitle>
              <CardDescription>
                Copy a direct link, or use Clients to add the form to a client's space.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void copyPublicLink(form.id)}
                type="button"
                variant="outline"
              >
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
              <Button asChild>
                <Link to="/clients">Open Clients</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The recommended workflow is Clients: save the client email, select this form, then
            send it. The form appears inside the client account without SMTP.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 rounded-2xl border bg-card/80 p-2 shadow-sm">
        <TabButton
          active={activeTab === "overview"}
          icon={ListChecks}
          label="Overview"
          onClick={() => setActiveTab("overview")}
        />
        <TabButton
          active={activeTab === "responses"}
          icon={MessageSquareText}
          label="Responses"
          onClick={() => setActiveTab("responses")}
        />
        <TabButton
          active={activeTab === "analytics"}
          icon={BarChart3}
          label="Analytics"
          onClick={() => setActiveTab("analytics")}
        />
      </div>

      {activeTab === "overview" ? (
        <OverviewTab form={form} totalResponses={totalResponses} />
      ) : null}

      {activeTab === "responses" ? (
        <ResponsesTab
          dateFrom={dateFrom}
          dateTo={dateTo}
          filteredResponses={filteredResponses}
          page={page}
          responsesQuery={responsesQuery}
          sentimentFilter={sentimentFilter}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          setPage={setPage}
          setSentimentFilter={setSentimentFilter}
          totalPages={totalPages}
        />
      ) : null}

      {activeTab === "analytics" ? (
        <AnalyticsTab analyticsQuery={analyticsQuery} />
      ) : null}
    </section>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
        active && "bg-foreground text-background shadow-sm hover:bg-foreground hover:text-background",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function OverviewTab({
  form,
  totalResponses,
}: {
  form: Form;
  totalResponses: number;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Form overview</CardTitle>
          <CardDescription>Operational details for this feedback form.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <OverviewRow label="Status" value={form.is_active ? "Active" : "Paused"} />
          <OverviewRow label="Created" value={formatDate(form.created_at)} />
          <OverviewRow label="Public form ID" value={String(form.id)} />
          <OverviewRow label="Questions" value={String(form.questions.length)} />
          <OverviewRow label="Responses" value={String(totalResponses)} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Questions</CardTitle>
          <CardDescription>Question structure shown to clients.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {form.questions
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((question) => (
              <div className="rounded-xl border bg-background/55 p-4" key={question.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{question.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatQuestionType(question.type)}
                      {question.required ? " - Required" : " - Optional"}
                    </p>
                  </div>
                  <Badge variant="outline">#{question.order + 1}</Badge>
                </div>
                {question.options ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {formatValue(question.options)}
                  </p>
                ) : null}
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-background/55 px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function ResponsesTab({
  responsesQuery,
  filteredResponses,
  sentimentFilter,
  dateFrom,
  dateTo,
  page,
  totalPages,
  setSentimentFilter,
  setDateFrom,
  setDateTo,
  setPage,
}: {
  responsesQuery: UseQueryResult<PaginatedResponses>;
  filteredResponses: PaginatedResponses["items"];
  sentimentFilter: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  totalPages: number;
  setSentimentFilter: (value: string) => void;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  setPage: Dispatch<SetStateAction<number>>;
}) {
  return (
    <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Responses</CardTitle>
            <CardDescription>Review and filter submissions for this form.</CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="sentiment-filter">Sentiment</Label>
              <select
                className="select-input h-9 bg-background/70"
                id="sentiment-filter"
                value={sentimentFilter}
                onChange={(event) => setSentimentFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="negative">Negative</option>
                <option value="unknown">No sentiment</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="details-date-from">From</Label>
              <Input
                className="h-9 bg-background/70"
                id="details-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="details-date-to">To</Label>
              <Input
                className="h-9 bg-background/70"
                id="details-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {responsesQuery.isLoading ? (
          <PageSkeleton />
        ) : responsesQuery.isError ? (
          <EmptyState
            title="Responses could not be loaded"
            description={getErrorMessage(responsesQuery.error)}
            actionLabel="Try again"
            onAction={() => void responsesQuery.refetch()}
          />
        ) : filteredResponses.length ? (
          <div className="grid gap-3">
            {filteredResponses.map((response) => (
              <div className="rounded-xl border bg-background/55 p-4" key={response.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Response #{response.id}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(response.submitted_at)}
                    </p>
                  </div>
                  <SentimentBadge label={response.overall_sentiment_label} />
                </div>
                <div className="mt-4 grid gap-2">
                  {response.answers.slice(0, 3).map((answer) => (
                    <p className="text-sm" key={answer.id}>
                      <span className="font-medium">{answer.question.label}:</span>{" "}
                      <span className="text-muted-foreground">
                        {formatAnswerValue(answer)}
                      </span>
                    </p>
                  ))}
                </div>
                <Button asChild className="mt-4" size="sm" variant="outline">
                  <Link to={`/responses/${response.id}`}>Open detail</Link>
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(current - 1, 0))}
                  type="button"
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  type="button"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No responses match"
            description="Adjust filters or wait for new submissions to appear here."
          />
        )}
      </CardContent>
    </Card>
  );
}

function AnalyticsTab({
  analyticsQuery,
}: {
  analyticsQuery: UseQueryResult<FormAnalytics>;
}) {
  const analytics = analyticsQuery.data;
  const sentimentData = Object.entries(analytics?.sentiment_distribution ?? {})
    .filter(([, count]) => count > 0)
    .map(([name, value]) => ({ name, value }));
  const ratingData = (analytics?.average_rating ?? []).map((item) => ({
    name: item.label,
    average: item.average_rating ?? 0,
  }));
  const choiceSections = analytics?.choice_distribution ?? [];
  const score = sentimentScore(analytics?.sentiment_distribution);

  if (analyticsQuery.isLoading) {
    return <PageSkeleton />;
  }

  if (analyticsQuery.isError || !analytics) {
    return (
      <EmptyState
        title="Analytics could not be loaded"
        description={getErrorMessage(analyticsQuery.error)}
        actionLabel="Try again"
        onAction={() => void analyticsQuery.refetch()}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={MessageSquareText}
          label="Total responses"
          value={analytics.total_responses}
          tone="teal"
        />
        <MetricCard
          icon={Star}
          label="Average rating"
          value={formatScore(averageRating(analytics))}
          tone="amber"
        />
        <MetricCard
          icon={TrendingUp}
          label="Sentiment score"
          value={score === null ? "N/A" : formatScore(score, 2)}
          tone="rose"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Sentiment distribution
            </CardTitle>
            <CardDescription>Overall sentiment labels for this form.</CardDescription>
          </CardHeader>
          <CardContent>
            {sentimentData.length ? (
              <div className="h-[280px]">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={sentimentData}
                      dataKey="value"
                      innerRadius={62}
                      nameKey="name"
                      outerRadius={96}
                      paddingAngle={3}
                    >
                      {sentimentData.map((entry) => (
                        <Cell
                          fill={sentimentColors[entry.name] ?? "#64748b"}
                          key={entry.name}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                title="No sentiment yet"
                description="Text responses will populate sentiment analytics."
              />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-primary" />
              Rating averages
            </CardTitle>
            <CardDescription>Average values for rating and NPS questions.</CardDescription>
          </CardHeader>
          <CardContent>
            {ratingData.length ? (
              <div className="h-[280px]">
                <ResponsiveContainer>
                  <BarChart data={ratingData} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" hide />
                    <YAxis />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="average" fill="#2563eb" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                title="No rating data"
                description="Rating analytics will appear after responses arrive."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4 text-primary" />
              Choice distributions
            </CardTitle>
            <CardDescription>Multiple choice, checkbox, and yes/no answer counts.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {choiceSections.length ? (
              choiceSections.map((section, sectionIndex) => (
                <div className="rounded-xl border bg-background/55 p-4" key={section.question_id}>
                  <p className="font-medium">{section.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatQuestionType(section.type)}
                  </p>
                  {section.choices.length ? (
                    <div className="mt-3 grid gap-2">
                      {section.choices.map((choice, choiceIndex) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-lg border bg-card/70 px-3 py-2 text-sm"
                          key={`${section.question_id}-${formatValue(choice.value)}`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  palette[(sectionIndex + choiceIndex) % palette.length],
                              }}
                            />
                            <span className="truncate">{formatValue(choice.value)}</span>
                          </span>
                          <span className="font-semibold">{choice.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No answers yet.</p>
                  )}
                </div>
              ))
            ) : (
              <EmptyState
                title="No choice questions"
                description="Choice distributions will appear for selectable questions."
              />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hash className="h-4 w-4 text-primary" />
              Top keywords
            </CardTitle>
            <CardDescription>Extracted themes from text answers.</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.top_keywords.length ? (
              <div className="flex flex-wrap gap-2">
                {analytics.top_keywords.map((keyword) => (
                  <Badge key={keyword.keyword} variant="secondary">
                    {keyword.keyword} ({keyword.count})
                  </Badge>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No keywords yet"
                description="Keywords will appear after text responses are analyzed."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
