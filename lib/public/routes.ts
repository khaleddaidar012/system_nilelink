export const brandedPublicPaths = ["/", "/about", "/services", "/request-quote", "/contact"] as const
export function isBrandedPublicPath(pathname: string) {
  return brandedPublicPaths.some(path => path === pathname.replace(/\/$/, "") || (path === "/" && pathname === "/"))
}
