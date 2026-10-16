import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Edit3,
  FilePlus2,
  FileText,
  PauseCircle,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { api, getErrorMessage } from "@/api/client";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/LoadingStates";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import type { Form } from "@/types";
import { formatDate } from "@/utils/answers";

async function fetchForms() {
  const response = await api.get<Form[]>("/api/forms");
  return response.data;
}

export function FormList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const formsQuery = useQuery({ queryKey: ["forms"], queryFn: fetchForms });

  const toggleMutation = useMutation({
    mutationFn: async (form: Form) => api.patch(`/api/forms/${form.id}/toggle-active`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["forms"] });
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast({ title: "Form status updated", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "Status update failed",
        description: getErrorMessage(error),
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (form: Form) => api.delete(`/api/forms/${form.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["forms"] });
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast({ title: "Form deleted", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "Delete failed",
        description: getErrorMessage(error),
        variant: "destructive",
      }),
  });

  async function downloadExport(form: Form, type: "csv" | "pdf") {
    try {
      const response = await api.get<Blob>(`/api/forms/${form.id}/export/${type}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `form_${form.id}_responses.${type}`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: `${type.toUpperCase()} export ready`,
        description: `${form.title} was downloaded.`,
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

  function deleteForm(form: Form) {
    if (window.confirm(`Delete "${form.title}"?`)) {
      deleteMutation.mutate(form);
    }
  }

  const forms = formsQuery.data ?? [];

  return (
    <section className="page-shell">
      <PageHeader
        eyebrow="Forms"
        title="Feedback forms"
        description="Create, publish, export, and monitor every form owned by your company."
        actions={
          <Button asChild>
            <Link to="/forms/new">
              <FilePlus2 className="h-4 w-4" />
              New form
            </Link>
          </Button>
        }
      />

      {formsQuery.isLoading ? (
        <TableSkeleton />
      ) : formsQuery.isError ? (
        <EmptyState
          title="Forms could not be loaded"
          description={getErrorMessage(formsQuery.error)}
          actionLabel="Try again"
          onAction={() => void formsQuery.refetch()}
        />
      ) : forms.length ? (
        <Card className="shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="surface-table min-w-[820px]">
                <thead>
                  <tr>
                    <th>Form</th>
                    <th>Status</th>
                    <th>Questions</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map((form) => (
                    <tr key={form.id}>
                      <td>
                        <Link className="font-medium hover:underline" to={`/forms/${form.id}`}>
                          {form.title}
                        </Link>
                        <p className="mt-1 line-clamp-2 max-w-md text-sm text-muted-foreground">
                          {form.description || "No description"}
                        </p>
                      </td>
                      <td>
                        <Badge variant={form.is_active ? "success" : "secondary"}>
                          {form.is_active ? "Active" : "Paused"}
                        </Badge>
                      </td>
                      <td>{form.questions.length}</td>
                      <td>{formatDate(form.created_at)}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <Button asChild size="icon" type="button" variant="ghost" title="Open details">
                            <Link to={`/forms/${form.id}`}>
                              <FileText className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button asChild size="icon" type="button" variant="ghost" title="Edit form">
                            <Link to={`/forms/${form.id}/edit`}>
                              <Edit3 className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            type="button"
                            variant="ghost"
                            title={form.is_active ? "Pause form" : "Activate form"}
                            onClick={() => toggleMutation.mutate(form)}
                          >
                            {form.is_active ? (
                              <PauseCircle className="h-4 w-4" />
                            ) : (
                              <PlayCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            type="button"
                            variant="ghost"
                            title="Download CSV"
                            onClick={() => void downloadExport(form, "csv")}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            type="button"
                            variant="ghost"
                            title="Download PDF"
                            onClick={() => void downloadExport(form, "pdf")}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            type="button"
                            variant="ghost"
                            title="Delete form"
                            onClick={() => deleteForm(form)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={FilePlus2}
          title="No forms yet"
          description="Build a feedback form with ratings, choices, text analysis, and response tracking."
          actionLabel="Build a form"
          onAction={() => navigate("/forms/new")}
        />
      )}
    </section>
  );
}
