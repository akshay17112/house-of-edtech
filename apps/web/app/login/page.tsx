import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const raw = params.callbackUrl;
  const callbackUrl =
    typeof raw === "string" && raw.startsWith("/") ? raw : "/documents";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <LoginForm callbackUrl={callbackUrl} />
    </main>
  );
}
