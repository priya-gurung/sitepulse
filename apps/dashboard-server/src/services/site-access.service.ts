import { prisma } from "@sitepulse/shared";

/**
 * Verifies the requesting user owns the site before we ever forward a
 * query to Tinybird. Tinybird pipes are scoped by site_id parameter, so
 * without this check a user could read another site's analytics simply
 * by guessing/passing a different siteId.
 */
export async function assertSiteOwnership(
  siteId: string,
  userId: string
): Promise<boolean> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { ownerId: true },
  });
  return site?.ownerId === userId;
}
