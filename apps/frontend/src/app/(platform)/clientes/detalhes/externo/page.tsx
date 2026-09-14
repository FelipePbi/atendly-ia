import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";

export default async function ExternalCustomerDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <ProductCustomersScreen customerId={id} scenario="detail" />;
}
