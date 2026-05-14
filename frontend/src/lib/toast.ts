import { toast } from "sonner";
import { getApiErrorMessage } from "@/api/client";

/** Thin wrappers around sonner so toast styling stays consistent. */
export const notify = {
  success(message: string, description?: string) {
    toast.success(message, description ? { description } : undefined);
  },
  error(error: unknown, fallback = "Something went wrong") {
    toast.error(getApiErrorMessage(error, fallback));
  },
  info(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  },
};
