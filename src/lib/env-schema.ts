import { z } from "zod";

const optionalText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const origin = z
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  })
  .transform((value) => new URL(value).origin);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8081),
    DATABASE_URL: z
      .url()
      .refine(
        (value) =>
          URL.canParse(value) &&
          ["postgres:", "postgresql:"].includes(new URL(value).protocol),
      ),
    BETTER_AUTH_SECRET: z.string().min(32),
    API_BASE_URL: origin.optional(),
    BETTER_AUTH_URL: origin.optional(),
    WEB_APP_BASE_URL: origin.optional(),
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    COOKIE_DOMAIN: optionalText,
    ANTHROPIC_BASE_URL: z
      .url()
      .default("https://gpt.teamsoclo.site/v1")
      .refine((value) => {
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          url.pathname.replace(/\/$/, "") === "/v1" &&
          !url.search &&
          !url.hash
        );
      }),
    // Optional to preserve the existing 503 response when the Coach is not configured.
    ANTHROPIC_AUTH_TOKEN: optionalText,
  })
  .superRefine((value, ctx) => {
    const issue = (path: string) =>
      ctx.addIssue({
        code: "custom",
        path: [path],
        message: "Invalid configuration",
      });
    if (Boolean(value.GOOGLE_CLIENT_ID) !== Boolean(value.GOOGLE_CLIENT_SECRET))
      issue("GOOGLE_CLIENT_ID");
    if (
      value.API_BASE_URL &&
      value.BETTER_AUTH_URL &&
      value.API_BASE_URL !== value.BETTER_AUTH_URL
    )
      issue("API_BASE_URL");
    const api = value.API_BASE_URL ?? value.BETTER_AUTH_URL;
    if (value.NODE_ENV === "production") {
      if (!api || !api.startsWith("https://")) issue("API_BASE_URL");
      if (!value.WEB_APP_BASE_URL?.startsWith("https://"))
        issue("WEB_APP_BASE_URL");
      if (!value.ANTHROPIC_BASE_URL.startsWith("https://"))
        issue("ANTHROPIC_BASE_URL");
    }
    if (value.COOKIE_DOMAIN) {
      const domain = value.COOKIE_DOMAIN.replace(/^\./, "");
      const urls = [api, value.WEB_APP_BASE_URL];
      if (
        !domain.includes(".") ||
        urls.some((url) => {
          if (!url || !URL.canParse(url)) return true;
          const host = new URL(url).hostname;
          return host !== domain && !host.endsWith(`.${domain}`);
        })
      )
        issue("COOKIE_DOMAIN");
    }
  })
  .transform((value) => ({
    ...value,
    API_BASE_URL:
      value.API_BASE_URL ??
      value.BETTER_AUTH_URL ??
      `http://localhost:${value.PORT}`,
    WEB_APP_BASE_URL: value.WEB_APP_BASE_URL ?? "http://localhost:3000",
  }));

export function parseEnv(values: Record<string, unknown>) {
  const result = envSchema.safeParse(values);
  if (!result.success) {
    // Never include input values or Zod's full error (which can contain secrets).
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Invalid environment variables: ${fields.join(", ")}`);
  }
  return result.data;
}
