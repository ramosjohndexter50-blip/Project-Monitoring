import { permission } from "@/lib/platform/auth";
import PortalLayout from "../portal/layout";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await permission("admin.access");
  return <PortalLayout>{children}</PortalLayout>;
}
