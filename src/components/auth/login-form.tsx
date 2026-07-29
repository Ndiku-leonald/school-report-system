"use client";

import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/schemas";

type LoginFields = {
  email: string;
  password: string;
};

export function LoginForm({ next }: { next?: string }) {
  const [state, dispatch] = useActionState(
    signInAction,
    initialAuthActionState,
  );
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LoginFields>();

  const submit = handleSubmit((values) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    if (next) formData.set("next", next);
    startTransition(() => dispatch(formData));
  });

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="staff@example.edu"
          invalid={Boolean(errors.email || state.fieldErrors?.email)}
          {...register("email", {
            required: "Enter your email address.",
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: "Enter a valid email address.",
            },
          })}
        />
        <p className="text-danger text-xs" role="alert">
          {errors.email?.message ?? state.fieldErrors?.email?.[0]}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          invalid={Boolean(errors.password || state.fieldErrors?.password)}
          {...register("password", { required: "Enter your password." })}
        />
        <p className="text-danger text-xs" role="alert">
          {errors.password?.message ?? state.fieldErrors?.password?.[0]}
        </p>
      </div>
      <Button
        className="w-full"
        type="submit"
        loading={isPending}
        loadingLabel="Signing in"
      >
        Sign in
      </Button>
      {state.message ? (
        <Alert title="Unable to sign in" variant="warning">
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
