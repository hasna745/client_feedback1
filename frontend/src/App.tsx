import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Analytics } from "./pages/Analytics";
import { BusinessDashboard } from "./pages/BusinessDashboard";
import { ClientSubmitFeedback } from "./pages/ClientSubmitFeedback";
import { Clients } from "./pages/Clients";
import { CompanyProfile } from "./pages/CompanyProfile";
import { FormBuilder } from "./pages/FormBuilder";
import { FormDetails } from "./pages/FormDetails";
import { FormList } from "./pages/FormList";
import { Login } from "./pages/Login";
import { MyResponses } from "./pages/MyResponses";
import { Register } from "./pages/Register";
import { ResponseDetails } from "./pages/ResponseDetails";
import { PageSkeleton } from "./components/LoadingStates";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <main className="px-4 py-6 md:px-6 lg:px-8">
        <PageSkeleton />
      </main>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={user.role === "business" ? "/business" : "/submit"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute roles={["business"]} />}>
        <Route element={<AppLayout />}>
          <Route path="/business" element={<BusinessDashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/company" element={<CompanyProfile />} />
          <Route path="/forms" element={<FormList />} />
          <Route path="/forms/new" element={<FormBuilder />} />
          <Route path="/forms/:id" element={<FormDetails />} />
          <Route path="/forms/:id/edit" element={<FormBuilder />} />
          <Route path="/analytics" element={<Analytics />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute roles={["client"]} />}>
        <Route element={<AppLayout />}>
          <Route path="/submit" element={<ClientSubmitFeedback />} />
          <Route path="/responses" element={<MyResponses />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/responses/:id" element={<ResponseDetails />} />
        </Route>
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
