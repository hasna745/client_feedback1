import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, Building2, Loader2, Mail } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { api, getErrorMessage } from "@/api/client";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
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
import { PageSkeleton } from "@/components/LoadingStates";
import type { Company } from "@/types";

const companySchema = z.object({
  name: z.string().min(1, "Company name is required.").max(255),
  description: z.string().max(2000).optional(),
  notification_email: z
    .string()
    .email("Enter a valid notification email.")
    .or(z.literal(""))
    .optional(),
  notify_on_response: z.boolean(),
});

type CompanyForm = z.infer<typeof companySchema>;

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

export function CompanyProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: fetchCompany,
    retry: false,
  });
  const form = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      description: "",
      notification_email: "",
      notify_on_response: true,
    },
  });

  useEffect(() => {
    if (companyQuery.data) {
      form.reset({
        name: companyQuery.data.name,
        description: companyQuery.data.description || "",
        notification_email: companyQuery.data.notification_email || "",
        notify_on_response: companyQuery.data.notify_on_response,
      });
    }
  }, [companyQuery.data, form]);

  const saveCompany = useMutation({
    mutationFn: async (values: CompanyForm) => {
      const payload = {
        name: values.name,
        description: values.description || null,
        notification_email: values.notification_email || null,
        notify_on_response: values.notify_on_response,
      };
      const response = companyQuery.data
        ? await api.patch<Company>("/api/companies/me", payload)
        : await api.post<Company>("/api/companies", payload);
      return response.data;
    },
    onSuccess: async (company) => {
      queryClient.setQueryData(["company"], company);
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast({
        title: companyQuery.data ? "Company updated" : "Company created",
        description: "Business workspace settings were saved.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Company save failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  if (companyQuery.isLoading) {
    return <PageSkeleton />;
  }

  const company = companyQuery.data;

  return (
    <section className="page-shell">
      <PageHeader
        eyebrow="Company"
        title={company ? "Company profile" : "Create company"}
        description="Manage the business workspace that owns your forms, analytics, exports, and email alerts."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={Building2}
          label="Workspace"
          value={company?.name || "Not created"}
          helper="One company is allowed per business account."
        />
        <MetricCard
          icon={Mail}
          label="Notification email"
          value={company?.notification_email || "Not set"}
          helper="Used for new feedback alerts."
          tone="teal"
        />
        <MetricCard
          icon={Bell}
          label="Email alerts"
          value={company?.notify_on_response ? "Enabled" : "Paused"}
          helper="Missing SMTP config is skipped safely by the backend."
          tone="amber"
        />
      </div>

      <Card className="max-w-3xl shadow-none">
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>
            Keep this information clear for reports and client-facing form browsing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-5"
            onSubmit={form.handleSubmit((values) => saveCompany.mutate(values))}
          >
            <div className="grid gap-2">
              <Label htmlFor="company-name">Company name</Label>
              <Input id="company-name" {...form.register("name")} />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company-description">Description</Label>
              <Textarea
                id="company-description"
                rows={4}
                {...form.register("description")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notification-email">Notification email</Label>
              <Input
                id="notification-email"
                type="email"
                placeholder="ops@example.com"
                {...form.register("notification_email")}
              />
              {form.formState.errors.notification_email ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.notification_email.message}
                </p>
              ) : null}
            </div>
            <Controller
              control={form.control}
              name="notify_on_response"
              render={({ field }) => (
                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <Label htmlFor="notify-on-response">New response email</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Send a short notification when a client submits feedback.
                    </p>
                  </div>
                  <Switch
                    id="notify-on-response"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
            <Button className="w-fit" disabled={saveCompany.isPending} type="submit">
              {saveCompany.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Save company
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
