import { Link, Navigate, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getErrorMessage } from "@/api/client";
import { defaultRouteForRole, useAuth } from "@/auth/AuthContext";
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
import type { Role } from "@/types";

const registerSchema = z.object({
  full_name: z.string().max(160, "Full name is too long.").optional(),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  role: z.enum(["business", "client"]),
});

type RegisterForm = z.infer<typeof registerSchema>;

export function Register() {
  const { user, register: registerUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      role: "business",
    },
  });

  if (user) {
    return <Navigate to={defaultRouteForRole(user.role)} replace />;
  }

  async function onSubmit(values: RegisterForm) {
    try {
      const nextUser = await registerUser({
        email: values.email,
        password: values.password,
        full_name: values.full_name || "",
        role: values.role as Role,
      });
      toast({
        title: "Account created",
        description: "You are signed in and ready to continue.",
        variant: "success",
      });
      navigate(defaultRouteForRole(nextUser.role), { replace: true });
    } catch (caughtError) {
      toast({
        title: "Registration failed",
        description: getErrorMessage(caughtError),
        variant: "destructive",
      });
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg shadow-soft">
        <CardHeader className="space-y-2">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            FP
          </div>
          <div>
            <p className="eyebrow">Create account</p>
            <CardTitle className="mt-2 text-2xl">Start collecting feedback</CardTitle>
            <CardDescription>
              Choose a business workspace or a client account for submissions.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" placeholder="Your name" {...register("full_name")} />
              {errors.full_name ? (
                <p className="text-xs text-destructive">{errors.full_name.message}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <select className="select-input" id="role" {...register("role")}>
                <option value="business">Business</option>
                <option value="client">Client</option>
              </select>
              {errors.role ? (
                <p className="text-xs text-destructive">{errors.role.message}</p>
              ) : null}
            </div>
            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create account
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already registered?{" "}
              <Link className="font-medium text-primary hover:underline" to="/login">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
