import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  ClipboardList,
  FilePlus2,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, getErrorMessage } from "@/api/client";
import { EmptyState } from "@/components/EmptyState";
import { SentimentBadge } from "@/components/SentimentBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Company, LatestResponseSummary, OverviewAnalytics } from "@/types";
import { formatDate, formatScore, formatShortDate } from "@/utils/answers";

const sentimentColors: Record<string, string> = {
  positive: "#10b981",
  neutral: "#f59e0b",
  negative: "#ef4444",
  unknown: "#64748b",
};

async function fetchCompany() {
  try {
    const response = await api.get<Company>("/api/companies/me");
    return response.data;
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function fetchOverview() {
  const response = await api.get<OverviewAnalytics>("/api/analytics/overview");
  return response.data;
}

function averageSentiment(distribution: Record<string, number> = {}) {
  const positive = distribution.positive ?? 0;
  const neutral = distribution.neutral ?? 0;
  const negative = distribution.negative ?? 0;
  const total = positive + neutral + negative;
  if (!total) {
    return null;
  }
  return (positive - negative) / total;
}

function buildTrend(responses: LatestResponseSummary[] = []) {
  const buckets = new Map<string, number>();
  responses.forEach((response) => {
    const key = new Date(response.submitted_at).toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  });

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, responsesCount]) => ({
      date,
      label: formatShortDate(date),
      responses: responsesCount,
    }));
}

function sentimentSignal(score: number | null) {
  if (score === null) {
    return "Waiting for text feedback";
  }
  if (score > 0.25) {
    return "Customer sentiment is trending positive";
  }
  if (score < -0.25) {
    return "Negative signals need attention";
  }
  return "Sentiment is balanced";
}

function sentimentPulse(distribution: Record<string, number> = {}) {
  const positive = distribution.positive ?? 0;
  const neutral = distribution.neutral ?? 0;
  const negative = distribution.negative ?? 0;
  const total = positive + neutral + negative;
  return {
    positive: total ? Math.round((positive / total) * 100) : 0,
    neutral: total ? Math.round((neutral / total) * 100) : 0,
    negative: total ? Math.round((negative / total) * 100) : 0,
    total,
  };
}

function pulseRecommendation(score: number | null, negativeRate: number) {
  if (score === null) {
    return "Collect text feedback to unlock customer sentiment analysis.";
  }
  if (score >= 0.35) {
    return "Customers are responding positively. Promote what works and keep monitoring keywords.";
  }
  if (score <= -0.15 || negativeRate >= 40) {
    return "Negative signals are visible. Open recent responses and solve repeated issues first.";
  }
  return "Sentiment is mixed. Compare positive and negative comments to find quick improvements.";
}

function DashboardSkeleton() {
  return (
    <>
      <div className="rounded-2xl border bg-card/80 p-6 shadow-sm">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-10 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-[34rem] max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card className="shadow-none" key={index}>
            <CardContent className="space-y-4 p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <Skeleton className="h-[360px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
      <Skeleton className="h-[320px] rounded-2xl" />
    </>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
  className,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: typeof MessageSquareText;
  tone: "blue" | "teal" | "amber" | "rose";
  className?: string;
}) {
  const tones = {
    blue: "from-blue-500/15 to-blue-500/0 text-blue-700 dark:text-blue-300",
    teal: "from-teal-500/15 to-teal-500/0 text-teal-700 dark:text-teal-300",
    amber: "from-amber-500/20 to-amber-500/0 text-amber-700 dark:text-amber-300",
    rose: "from-rose-500/15 to-rose-500/0 text-rose-700 dark:text-rose-300",
  };

  return (
    <Card
      className={cn(
        "group overflow-hidden border-border/80 bg-card/80 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
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
        <div className="relative mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {helper}
        </div>
      </CardContent>
    </Card>
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

function PulseBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-background/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="text-sm font-semibold">{value}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function BusinessDashboard() {
  const navigate = useNavigate();
  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: fetchCompany,
    retry: false,
  });
  const overviewQuery = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
    enabled: Boolean(companyQuery.data),
  });

  if (companyQuery.isLoading) {
    return (
      <section className="page-shell">
        <DashboardSkeleton />
      </section>
    );
  }

  if (companyQuery.isError) {
    return (
      <section className="page-shell">
        <ErrorPanel
          title="Dashboard could not be loaded"
          description={getErrorMessage(companyQuery.error)}
          onRetry={() => void companyQuery.refetch()}
        />
      </section>
    );
  }

  if (!companyQuery.data) {
    return (
      <section className="page-shell">
        <div className="rounded-2xl border bg-card/80 p-6 shadow-sm">
          <p className="eyebrow">Business dashboard</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            Set up FeedbackIQ for your company
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Create a company workspace before building forms, viewing analytics,
            and exporting customer intelligence.
          </p>
        </div>
        <EmptyState
          icon={FilePlus2}
          title="No company workspace yet"
          description="Business users need one company profile to scope forms, responses, analytics, and notifications."
          actionLabel="Create company"
          onAction={() => navigate("/company")}
        />
      </section>
    );
  }

  const overview = overviewQuery.data;
  const sentimentScore = averageSentiment(overview?.sentiment_distribution);
  const sentimentData = Object.entries(overview?.sentiment_distribution ?? {})
    .filter(([, count]) => count > 0)
    .map(([name, value]) => ({ name, value }));
  const trendData = buildTrend(overview?.latest_responses);
  const hasResponses = Boolean(overview?.total_responses);
  const pulse = sentimentPulse(overview?.sentiment_distribution);

  return (
    <section className="page-shell">
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,hsl(var(--primary)/0.16),transparent_30%),radial-gradient(circle_at_90%_10%,hsl(var(--accent)/0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Feedback intelligence
              </span>
              <span className="rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-sm">
                {overview?.active_forms ?? 0} active forms
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal md:text-4xl">
              {companyQuery.data.name} dashboard
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              {sentimentSignal(sentimentScore)} across{" "}
              <span className="font-medium text-foreground">
                {overview?.total_responses ?? 0}
              </span>{" "}
              responses, with an average rating of{" "}
              <span className="font-medium text-foreground">
                {formatScore(overview?.average_rating)}
              </span>
              .
            </p>
          </div>
          <Button asChild className="w-full sm:w-fit">
            <Link to="/forms/new">
              <FilePlus2 className="h-4 w-4" />
              Create form
            </Link>
          </Button>
        </div>
      </div>

      {overviewQuery.isLoading ? (
        <DashboardSkeleton />
      ) : overviewQuery.isError ? (
        <ErrorPanel
          title="Analytics could not be loaded"
          description={getErrorMessage(overviewQuery.error)}
          onRetry={() => void overviewQuery.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={MessageSquareText}
              label="Total responses"
              value={overview?.total_responses ?? 0}
              helper="All submitted feedback"
              tone="blue"
            />
            <KpiCard
              icon={ClipboardList}
              label="Active forms"
              value={overview?.active_forms ?? 0}
              helper={`${overview?.total_forms ?? 0} forms total`}
              tone="teal"
            />
            <KpiCard
              icon={Star}
              label="Average rating"
              value={formatScore(overview?.average_rating)}
              helper="Across numeric questions"
              tone="amber"
            />
            <KpiCard
              icon={Activity}
              label="Sentiment score"
              value={sentimentScore === null ? "N/A" : formatScore(sentimentScore, 2)}
              helper="Positive minus negative ratio"
              tone="rose"
            />
          </div>

          <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Customer pulse
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pulseRecommendation(sentimentScore, pulse.negative)}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/analytics">
                  Deep analysis
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <PulseBar label="Positive" value={pulse.positive} color="#10b981" />
              <PulseBar label="Neutral" value={pulse.neutral} color="#f59e0b" />
              <PulseBar label="Negative" value={pulse.negative} color="#ef4444" />
            </CardContent>
          </Card>

          {!hasResponses ? (
            <EmptyState
              icon={MessageSquareText}
              title="No feedback yet"
              description="Create and share an active feedback form. Response trends, sentiment, and recent feedback will appear here as submissions arrive."
              actionLabel="Create form"
              onAction={() => navigate("/forms/new")}
            />
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
                <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Response trend
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Recent response activity from the latest submissions.
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/forms">
                        View forms
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {trendData.length ? (
                      <div className="h-[320px] w-full">
                        <ResponsiveContainer>
                          <LineChart data={trendData} margin={{ left: -20, right: 18, top: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tickLine={false}
                              axisLine={false}
                              tickMargin={10}
                            />
                            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                            <Tooltip
                              contentStyle={{
                                borderRadius: 12,
                                border: "1px solid hsl(var(--border))",
                              }}
                            />
                            <Line
                              activeDot={{ r: 6 }}
                              dataKey="responses"
                              dot={{ r: 4 }}
                              stroke="#2563eb"
                              strokeWidth={3}
                              type="monotone"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <EmptyState
                        title="No trend data yet"
                        description="Responses will appear here once clients start submitting feedback."
                      />
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Sentiment distribution
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      NLP labels from text and long-text answers.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {sentimentData.length ? (
                      <div className="grid gap-4">
                        <div className="h-[250px] w-full">
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie
                                data={sentimentData}
                                dataKey="value"
                                innerRadius={64}
                                nameKey="name"
                                outerRadius={98}
                                paddingAngle={3}
                              >
                                {sentimentData.map((entry) => (
                                  <Cell
                                    fill={sentimentColors[entry.name] ?? "#64748b"}
                                    key={entry.name}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{
                                  borderRadius: 12,
                                  border: "1px solid hsl(var(--border))",
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid gap-2">
                          {sentimentData.map((entry) => (
                            <div
                              className="flex items-center justify-between rounded-lg border bg-background/50 px-3 py-2 text-sm"
                              key={entry.name}
                            >
                              <span className="flex items-center gap-2 capitalize text-muted-foreground">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor:
                                      sentimentColors[entry.name] ?? "#64748b",
                                  }}
                                />
                                {entry.name}
                              </span>
                              <span className="font-semibold">{entry.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <EmptyState
                        title="No sentiment yet"
                        description="Text feedback will populate sentiment analytics automatically."
                      />
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">Recent feedback</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Latest responses across active and paused forms.
                    </p>
                  </div>
                  <MessageSquareText className="h-5 w-5 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-0">
                  {overview?.latest_responses.length ? (
                    <div className="overflow-x-auto">
                      <table className="surface-table min-w-[760px]">
                        <thead>
                          <tr>
                            <th>Form</th>
                            <th>Submitted</th>
                            <th>Sentiment</th>
                            <th className="text-right">Open</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.latest_responses.map((response) => (
                            <tr key={response.id}>
                              <td>
                                <Link
                                  className="font-medium text-foreground hover:text-primary hover:underline"
                                  to={`/forms/${response.form_id}`}
                                >
                                  {response.form_title}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                  Response #{response.id}
                                </p>
                              </td>
                              <td>{formatDate(response.submitted_at)}</td>
                              <td>
                                <SentimentBadge label={response.overall_sentiment_label} />
                              </td>
                              <td className="text-right">
                                <Button asChild size="sm" variant="outline">
                                  <Link to={`/responses/${response.id}`}>View</Link>
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6">
                      <EmptyState
                        title="No recent feedback"
                        description="New responses will appear in this table."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </section>
  );
}
