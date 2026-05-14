import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Skip the global error toast — call site handles errors itself. */
      silent?: boolean;
    };
    queryMeta: {
      silent?: boolean;
    };
  }
}
