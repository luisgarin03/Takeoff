export function authReturnPath(value = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  const url = new URL(value, "https://workspace.invalid");
  if (url.origin !== "https://workspace.invalid" || ["/auth", "/sign-in", "/sign-up"].includes(url.pathname)) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
export function signInPath(returnTo) {
  return `/auth?${new URLSearchParams({ returnTo: authReturnPath(returnTo) })}`;
}
