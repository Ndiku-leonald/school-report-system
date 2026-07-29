"use client";

import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { selectActiveSchoolAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/schemas";

type SchoolOption = {
  membershipId: string;
  schoolName: string;
  employeeNumber: string;
};

export function SchoolSelector({
  next,
  options,
}: {
  next?: string;
  options: SchoolOption[];
}) {
  const [state, dispatch] = useActionState(
    selectActiveSchoolAction,
    initialAuthActionState,
  );
  const [isPending, startTransition] = useTransition();
  const { handleSubmit, register } = useForm<{ membershipId: string }>();

  const submit = handleSubmit(({ membershipId }) => {
    const formData = new FormData();
    formData.set("membershipId", membershipId);
    if (next) formData.set("next", next);
    startTransition(() => dispatch(formData));
  });

  return (
    <form className="space-y-5" onSubmit={submit}>
      <fieldset className="grid gap-3">
        <legend className="sr-only">Available schools</legend>
        {options.map((option) => (
          <label
            key={option.membershipId}
            className="border-border has-checked:border-primary has-checked:bg-primary-soft/40 flex cursor-pointer gap-3 rounded-lg border p-4"
          >
            <input
              type="radio"
              value={option.membershipId}
              {...register("membershipId", { required: true })}
            />
            <span>
              <span className="text-foreground block font-semibold">
                {option.schoolName}
              </span>
              <span className="text-muted-foreground text-sm">
                Employee number: {option.employeeNumber}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button
        className="w-full"
        type="submit"
        loading={isPending}
        loadingLabel="Opening school"
      >
        Continue
      </Button>
      {state.message ? (
        <Alert title="School unavailable" variant="warning">
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
