import { LoginForm } from "./form";

export const metadata = { title: "Sign in · Ledger" };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-card">
        <h1>Ledger</h1>
        <p className="muted">Charges, credits and subscriptions. Owner only.</p>
        <LoginForm />
      </div>
    </main>
  );
}
