import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Hash, MessageSquareText } from "lucide-react";
import { api, getErrorMessage } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/LoadingStates";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { SentimentBadge } from "@/components/SentimentBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeedbackResponse } from "@/types";
import {
  formatAnswerValue,
  formatDate,
  formatQuestionType,
  formatScore,
} from "@/utils/answers";

async function fetchResponse(id: string) {
  const response = await api.get<FeedbackResponse>(`/api/responses/${id}`);
  return response.data;
}

function keywordsFrom(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String).filter(Boolean);
}

export function ResponseDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const responseQuery = useQuery({
    queryKey: ["response", id],
    queryFn: () => fetchResponse(id!),
    enabled: Boolean(id),
  });

  if (responseQuery.isLoading) {
    return <PageSkeleton />;
  }

  if (responseQuery.isError || !responseQuery.data) {
    return (
      <section className="page-shell">
        <EmptyState
          title="Response could not be loaded"
          description={getErrorMessage(responseQuery.error)}
          actionLabel="Go back"
          onAction={() => window.history.back()}
        />
      </section>
    );
  }

  const response = responseQuery.data;
  const backPath = user?.role === "business" ? `/forms/${response.form_id}` : "/responses";

  return (
    <section className="page-shell">
      <PageHeader
        eyebrow="Response detail"
        title={`Response #${response.id}`}
        description={`Submitted ${formatDate(response.submitted_at)}`}
        actions={
          <Button asChild variant="outline">
            <Link to={backPath}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={MessageSquareText}
          label="Overall sentiment"
          value={response.overall_sentiment_label || "N/A"}
          helper={formatScore(response.overall_sentiment_score, 2)}
        />
        <MetricCard icon={Hash} label="Answers" value={response.answers.length} tone="teal" />
        <MetricCard label="Form ID" value={response.form_id} tone="amber" />
      </div>

      <div className="grid gap-4">
        {response.answers
          .slice()
          .sort((a, b) => a.question.order - b.question.order)
          .map((answer) => {
            const keywords = keywordsFrom(answer.keywords);
            return (
              <Card className="shadow-none" key={answer.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{answer.question.label}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatQuestionType(answer.question.type)}
                      </p>
                    </div>
                    <SentimentBadge label={answer.sentiment_label} />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="rounded-lg border bg-muted/25 p-4">
                    <p className="text-sm text-muted-foreground">Answer</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium">
                      {formatAnswerValue(answer) || "No value"}
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium">Sentiment score</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {formatScore(answer.sentiment_score, 2)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium">Keywords</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {keywords.length ? (
                          keywords.map((keyword) => (
                            <Badge key={keyword} variant="secondary">
                              {keyword}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">No keywords</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </section>
  );
}
