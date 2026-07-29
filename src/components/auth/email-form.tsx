"use client";

import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/schemas";

export function PasswordResetRequestForm() {
  const [state, dispatch] = useActionState(
    requestPasswordResetAction,
    initialAuthActionState,
  );
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<{ email: string }>();

  const submit = handleSubmit(({ email }) => {
    const formData = new FormData();
    formData.set("email", email);
    startTransition(() => dispatch(formData));
  });

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
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
      <Button
        className="w-full"
        type="submit"
        loading={isPending}
        loadingLabel="Sending instructions"
      >
        Send reset instructions
      </Button>
      {state.message ? (
        <Alert
          title={state.status === "success" ? "Check your email" : "Try again"}
          variant={state.status === "success" ? "success" : "warning"}
        >
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
