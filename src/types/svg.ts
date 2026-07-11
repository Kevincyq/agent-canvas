import { z } from "zod";

export const SvgSpecSchema = z.object({
  title: z.string().max(120).optional(),
  alt: z.string().min(1).max(500),
  svg: z
    .string()
    .min(1)
    .max(200_000)
    .refine((value) => /^\s*<svg[\s>]/i.test(value), "SVG content must start with an <svg> element."),
});

export type SvgSpec = z.infer<typeof SvgSpecSchema>;
