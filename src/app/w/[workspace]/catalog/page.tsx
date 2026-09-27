import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { workspaceMetadata } from "@/lib/workspace/metadata";

import { CatalogTable } from "./catalog-table";

export const generateMetadata = workspaceMetadata("Catalog");

/** The asset catalog. Assets arrive with C02; until then the list is empty. */
export default function CatalogPage() {
  return (
    <Page>
      <PageHeader
        title="Catalog"
        description="Every dataset, dashboard, source system and model the team owns."
      />
      <CatalogTable assets={[]} />
    </Page>
  );
}
