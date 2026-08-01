import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth";
import AuthLayout from "@/components/AuthLayout";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; identifier?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { error, identifier } = await searchParams;
  return (
    <AuthLayout>
      <div className="auth-card">
        <h2 className="auth-title">Welcome back</h2>
        <p className="auth-sub">Sign in to your logbook</p>
        {error && <div className="error">{error}</div>}
        <form action={login} className="stack">
          <div className="field">
            <label htmlFor="identifier">Username or email</label>
            <input
              id="identifier"
              name="identifier"
              required
              autoComplete="username"
              autoFocus
              defaultValue={identifier ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <button type="submit">Sign in</button>
        </form>
        <p className="auth-switch">
          New here? <Link href="/register">Create an account</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
