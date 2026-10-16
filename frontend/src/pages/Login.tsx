import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
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

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type LoginForm = z.infer<typeof loginSchema>;

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (user) {
    return <Navigate to={defaultRouteForRole(user.role)} replace />;
  }

  async function onSubmit(values: LoginForm) {
    try {
      const nextUser = await login(values.email, values.password);
      toast({
        title: "Signed in",
        description: "Your workspace is ready.",
        variant: "success",
      });
      const fallback = defaultRouteForRole(nextUser.role);
      const fromLocation = (location.state as {
        from?: { pathname?: string; search?: string };
      })?.from;
      const from = fromLocation?.pathname
        ? `${fromLocation.pathname}${fromLocation.search ?? ""}`
        : null;
      navigate(from || fallback, { replace: true });
    } catch (caughtError) {
      toast({
        title: "Sign in failed",
        description: getErrorMessage(caughtError),
        variant: "destructive",
      });
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-md shadow-soft">
        <CardHeader className="space-y-2">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            FP
          </div>
          <div>
            <p className="eyebrow">Welcome back</p>
            <CardTitle className="mt-2 text-2xl">Sign in</CardTitle>
            <CardDescription>
              Access dashboards, feedback forms, and submission history.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
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
                autoComplete="current-password"
                placeholder="Enter your password"
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              ) : null}
            </div>
            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link className="font-medium text-primary hover:underline" to="/register">
                Create an account
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
