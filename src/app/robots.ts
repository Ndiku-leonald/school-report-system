import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/teacher",
        "/parent",
        "/staff-login",
        "/forgot-password",
        "/reset-password",
        "/complete-invitation",
        "/select-school",
        "/account-unavailable",
        "/auth/",
      ],
    },
  };
}
