import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Send, Trash2, UsersRound } from "lucide-react";
import { api, getErrorMessage } from "@/api/client";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/LoadingStates";
import { PageHeader } from "@/components/PageHeader";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import type {
  ClientContact,
  ClientContactInviteResult,
  Form,
} from "@/types";
import { formatDate } from "@/utils/answers";

type ClientForm = {
  email: string;
  full_name: string;
  notes: string;
};

const emptyClientForm: ClientForm = {
  email: "",
  full_name: "",
  notes: "",
};

async function fetchContacts() {
  const response = await api.get<ClientContact[]>("/api/client-contacts");
  return response.data;
}

async function fetchForms() {
  const response = await api.get<Form[]>("/api/forms");
  return response.data;
}

export function Clients() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [message, setMessage] = useState("");

  const contactsQuery = useQuery({
    queryKey: ["client-contacts"],
    queryFn: fetchContacts,
  });
  const formsQuery = useQuery({
    queryKey: ["forms"],
    queryFn: fetchForms,
  });

  const activeForms = useMemo(
    () => (formsQuery.data ?? []).filter((form) => form.is_active),
    [formsQuery.data],
  );
  const selectedContacts = useMemo(
    () =>
      (contactsQuery.data ?? []).filter((contact) =>
        selectedContactIds.includes(contact.id),
      ),
    [contactsQuery.data, selectedContactIds],
  );

  const createContact = useMutation({
    mutationFn: async () => {
      const response = await api.post<ClientContact>("/api/client-contacts", {
        email: clientForm.email,
        full_name: clientForm.full_name || null,
        notes: clientForm.notes || null,
      });
      return response.data;
    },
    onSuccess: async () => {
      setClientForm(emptyClientForm);
      await queryClient.invalidateQueries({ queryKey: ["client-contacts"] });
      toast({
        title: "Client saved",
        description: "The client can now receive feedback forms.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Client was not saved",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: number) => {
      await api.delete(`/api/client-contacts/${contactId}`);
    },
    onSuccess: async (_data, contactId) => {
      setSelectedContactIds((current) => current.filter((id) => id !== contactId));
      await queryClient.invalidateQueries({ queryKey: ["client-contacts"] });
      toast({
        title: "Client deleted",
        description: "The saved client was removed.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const inviteContacts = useMutation({
    mutationFn: async () => {
      const formId = Number(selectedFormId);
      if (!formId) {
        throw new Error("Select an active form.");
      }
      if (!selectedContactIds.length) {
        throw new Error("Select at least one client.");
      }

      const response = await api.post<ClientContactInviteResult>(
        "/api/client-contacts/invite",
        {
          form_id: formId,
          contact_ids: selectedContactIds,
          message: message.trim() || null,
        },
      );
      return response.data;
    },
    onSuccess: (result) => {
      if (result.smtp_configured) {
        toast({
          title: "Form sent to clients",
          description: `${result.assigned} client${result.assigned === 1 ? "" : "s"} can now see it in their space. Email invitations were also queued.`,
          variant: "success",
        });
        setMessage("");
        return;
      }

      toast({
        title: "Form added to client space",
        description: `${result.assigned} client${result.assigned === 1 ? "" : "s"} can now see it after logging in.`,
        variant: "success",
      });
      setMessage("");
    },
    onError: (error) => {
      toast({
        title: "Invitation failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  function updateClientForm(field: keyof ClientForm, value: string) {
    setClientForm((current) => ({ ...current, [field]: value }));
  }

  function toggleContact(contactId: number) {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  }

  function toggleAllContacts() {
    const contacts = contactsQuery.data ?? [];
    if (selectedContactIds.length === contacts.length) {
      setSelectedContactIds([]);
      return;
    }
    setSelectedContactIds(contacts.map((contact) => contact.id));
  }

  if (contactsQuery.isLoading || formsQuery.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="page-shell">
      <PageHeader
        eyebrow="Client directory"
        title="Clients"
        description="Save customer contacts, choose an active feedback form, and send invitations from one workspace."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
        <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" />
              Add client
            </CardTitle>
            <CardDescription>Register a client email for later form sending.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                createContact.mutate();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="client-email">Email</Label>
                <Input
                  id="client-email"
                  onChange={(event) => updateClientForm("email", event.target.value)}
                  placeholder="client@example.com"
                  type="email"
                  value={clientForm.email}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="client-name">Name</Label>
                <Input
                  id="client-name"
                  onChange={(event) => updateClientForm("full_name", event.target.value)}
                  placeholder="Client name"
                  value={clientForm.full_name}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="client-notes">Notes</Label>
                <Textarea
                  id="client-notes"
                  onChange={(event) => updateClientForm("notes", event.target.value)}
                  placeholder="Segment, company, context..."
                  value={clientForm.notes}
                />
              </div>
              <Button disabled={createContact.isPending} type="submit">
                <Plus className="h-4 w-4" />
                {createContact.isPending ? "Saving..." : "Save client"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UsersRound className="h-4 w-4 text-primary" />
                  Saved clients
                </CardTitle>
                <CardDescription>
                  Select clients from your directory before sending a form.
                </CardDescription>
              </div>
              <Badge variant="secondary">{contactsQuery.data?.length ?? 0} clients</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {contactsQuery.isError ? (
              <EmptyState
                title="Clients could not be loaded"
                description={getErrorMessage(contactsQuery.error)}
                actionLabel="Try again"
                onAction={() => void contactsQuery.refetch()}
              />
            ) : contactsQuery.data?.length ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/60 px-4 py-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      checked={selectedContactIds.length === contactsQuery.data.length}
                      onChange={toggleAllContacts}
                      type="checkbox"
                    />
                    Select all
                  </label>
                  <span className="text-sm text-muted-foreground">
                    {selectedContacts.length} selected
                  </span>
                </div>

                {contactsQuery.data.map((contact) => (
                  <div
                    className="flex flex-col gap-3 rounded-xl border bg-background/55 p-4 md:flex-row md:items-start md:justify-between"
                    key={contact.id}
                  >
                    <label className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        checked={selectedContactIds.includes(contact.id)}
                        className="mt-1"
                        onChange={() => toggleContact(contact.id)}
                        type="checkbox"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {contact.full_name || contact.email}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          {contact.email}
                        </span>
                        {contact.notes ? (
                          <span className="mt-2 block text-sm text-muted-foreground">
                            {contact.notes}
                          </span>
                        ) : null}
                        <span className="mt-2 block text-xs text-muted-foreground">
                          Added {formatDate(contact.created_at)}
                        </span>
                      </span>
                    </label>
                    <Button
                      aria-label={`Delete ${contact.email}`}
                      disabled={deleteContact.isPending}
                      onClick={() => deleteContact.mutate(contact.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={UsersRound}
                title="No saved clients"
                description="Add client contacts to build a reusable directory for feedback campaigns."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/80 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-primary" />
            Send a feedback form
          </CardTitle>
          <CardDescription>
            Choose one active form and send it to the selected saved clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(260px,0.45fr)_minmax(0,1fr)_auto] lg:items-end">
          <div className="grid gap-2">
            <Label htmlFor="client-form">Feedback form</Label>
            <select
              className="select-input bg-background/70"
              id="client-form"
              onChange={(event) => setSelectedFormId(event.target.value)}
              value={selectedFormId}
            >
              <option value="">Select active form</option>
              {activeForms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="client-invite-message">Message</Label>
            <Textarea
              className="min-h-11 bg-background/70"
              id="client-invite-message"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Please complete this feedback form."
              value={message}
            />
          </div>
          <Button
            disabled={!selectedContactIds.length || !selectedFormId || inviteContacts.isPending}
            onClick={() => inviteContacts.mutate()}
            type="button"
          >
            <Send className="h-4 w-4" />
            {inviteContacts.isPending ? "Sending..." : "Send"}
          </Button>
          <p className="text-sm text-muted-foreground lg:col-span-3">
            {selectedContacts.length} client{selectedContacts.length === 1 ? "" : "s"} selected.
            {activeForms.length ? "" : " Create or activate a form before sending."}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
