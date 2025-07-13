import z from "zod";

export const zLmResponseBasic = z.object({
  type: z.string().describe("Type of the response, sub types should override this with a literal type"),
});

export type LmResponseBasic = z.infer<typeof zLmResponseBasic>;

export const zLmErrorResponse = zLmResponseBasic.merge(
  z.object({
    type: z.literal("error"),
    error: z.string().describe("Error message from the language model provider"),
  }),
);

export type LmErrorResponse = z.infer<typeof zLmErrorResponse>;
