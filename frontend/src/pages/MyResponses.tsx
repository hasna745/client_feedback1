import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Filter,
  MessageSquareText,
  Search,
} from "lucide-react";
import { api, getErrorMessage } from "@/api/client";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/LoadingStates";
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
import { cn } from "@/lib/utils";
import type { FeedbackResponse } from "@/types";
import { formatAnswerValue, formatDate } from "@/utils/answers";

async function fetchMyResponses(page: number, pageSize: number) {
  const response = await api.get<FeedbackResponse[]>("/api/responses/me", {
    params: { limit: pageSize, offset: page * pageSize },
  });
  return response.data;
}

function responseMatchesSearch(response: FeedbackResponse, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [
    `response ${response.id}`,
    response.overall_sentiment_label ?? "",
    ...response.answers.flatMap((answer) => [
      answer.question.label,
      formatAnswerValue(answer),
    ]),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

export function MyResponses() {
  const [page, setPage] = useState(0);
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const pageSize = 10;
  const responsesQuery = useQuery({
    queryKey: ["my-responses", page, pageSize],
    queryFn: () => fetchMyResponses(page, pageSize),
  });

  const responses = responsesQuery.data ?? [];
  const filteredResponses = useMemo(
    () =>
      responses.filter((response) => {
        if (!responseMatchesSearch(response, search)) {
          return false;
        }
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
    [responses, sentimentFilter, dateFrom, dateTo, search],
  );

  const totalAnswers = responses.reduce(
    (count, response) => count + response.answers.length,
    0,
  );

  if (responsesQuery.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="page-shell">
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,hsl(var(--primary)/0.14),transparent_30%),radial-gradient(circle_at_90%_10%,hsl(var(--accent)/0.13),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <MessageSquareText className="h-3.5 w-3.5 text-primary" />
              Submission history
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal md:text-4xl">
              My responses
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              Review every feedback submission, sentiment label, answer preview,
              and response detail from one clean history view.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border bg-background/70 px-4 py-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Responses</p>
              <p className="mt-1 text-xl font-semibold">{responses.length}</p>
            </div>
            <div className="rounded-xl border bg-background/70 px-4 py-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Answers</p>
              <p className="mt-1 text-xl font-semibold">{totalAnswers}</p>
            </div>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-primary" />
            Filters
          </CardTitle>
          <CardDescription>
            Narrow your history by keyword, sentiment, or submission date.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_180px_180px_180px]">
          <div className="flex items-center gap-2 rounded-xl border bg-background/70 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            <Search className="h-4 w-4 shrink-0" />
            <input
              aria-label="Search responses"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search responses..."
              type="search"
              value={search}
            />
          </div>
          <select
            className="select-input bg-background/70"
            value={sentimentFilter}
            onChange={(event) => setSentimentFilter(event.target.value)}
          >
            <option value="all">All sentiments</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
            <option value="unknown">No sentiment</option>
          </select>
          <Input
            aria-label="From date"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <Input
            aria-label="To date"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </CardContent>
      </Card>

      {responsesQuery.isError ? (
        <EmptyState
          title="Responses could not be loaded"
          description={getErrorMessage(responsesQuery.error)}
          actionLabel="Try again"
          onAction={() => void responsesQuery.refetch()}
        />
      ) : filteredResponses.length ? (
        <div className="grid gap-4">
          {filteredResponses.map((response) => (
            <ResponseHistoryCard key={response.id} response={response} />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Page {page + 1}</p>
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
                disabled={responses.length < pageSize}
                onClick={() => setPage((current) => current + 1)}
                type="button"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : responses.length ? (
        <EmptyState
          icon={Search}
          title="No responses match"
          description="Adjust your filters or search terms to find a submitted response."
        />
      ) : (
        <EmptyState
          icon={MessageSquareText}
          title="No submissions yet"
          description="Submitted feedback history will appear after you complete an active form."
        />
      )}
    </section>
  );
}

function ResponseHistoryCard({ response }: { response: FeedbackResponse }) {
  const previewAnswers = response.answers.slice(0, 3);

  return (
    <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Response #{response.id}</Badge>
              <SentimentBadge label={response.overall_sentiment_label} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {formatDate(response.submitted_at)}
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to={`/responses/${response.id}`}>
              Open details
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {previewAnswers.map((answer) => (
            <div
              className={cn(
                "rounded-xl border bg-background/55 p-4",
                answer.sentiment_label === "positive" && "border-emerald-500/20",
                answer.sentiment_label === "negative" && "border-red-500/20",
              )}
              key={answer.id}
            >
              <p className="line-clamp-2 text-sm font-medium">{answer.question.label}</p>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {formatAnswerValue(answer) || "No value"}
              </p>
            </div>
          ))}
        </div>

        {response.answers.length > previewAnswers.length ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {response.answers.length - previewAnswers.length} more answers in details
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
