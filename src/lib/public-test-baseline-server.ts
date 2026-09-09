import { cookies } from "next/headers";

import {
  isServerPublicTestBaselineEnabled,
  isPublicTestBaselineBuildEnabled,
  PUBLIC_TEST_BASELINE_COOKIE_NAME
} from "@/lib/supabase/rh-cursos-api";

/**
 * O cookie do baseline só existe nos builds E2E determinísticos. Em produção
 * não chamamos cookies(), permitindo que as páginas públicas usem ISR/cache.
 */
export async function getServerPublicTestBaselineEnabled() {
  if (!isPublicTestBaselineBuildEnabled()) return false;

  const cookieStore = await cookies();
  return isServerPublicTestBaselineEnabled(
    cookieStore.get(PUBLIC_TEST_BASELINE_COOKIE_NAME)?.value
  );
}
