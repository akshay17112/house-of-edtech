"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  loginAction,
  registerAction,
  type AuthActionState,
} from "./actions";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");

  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(action, undefined);

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        {mode === "login"
          ? "Sign in to your documents."
          : "Start writing in seconds."}
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        {mode === "register" && (
          <Field
            label="Name"
            name="name"
            type="text"
            autoComplete="name"
            required
          />
        )}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={8}
          required
          hint={mode === "register" ? "At least 8 characters." : undefined}
        />

        {state?.error && (
          <p
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
        >
          {pending
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-neutral-500">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("register")}
              className="font-medium text-neutral-900 underline-offset-4 hover:underline dark:text-white"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("login")}
              className="font-medium text-neutral-900 underline-offset-4 hover:underline dark:text-white"
            >
              Sign in
            </button>
          </>
        )}
      </p>

      <p className="mt-8 text-center text-sm">
        <Link href="/" className="text-neutral-400 hover:text-neutral-600">
          ← Back home
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  ...props
}: {
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        className="mt-1 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-white/15"
      />
      {hint && <span className="mt-1 block text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}
