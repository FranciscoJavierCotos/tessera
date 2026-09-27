import { notFound } from "next/navigation";

/** Unknown paths inside a workspace get the in-shell 404 (`../not-found`). */
export default function MissingWorkspacePage() {
  notFound();
}
