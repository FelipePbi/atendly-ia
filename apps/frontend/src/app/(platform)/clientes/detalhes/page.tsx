import { ProductDirectoryScreen } from "@/features/directory/ProductDirectoryScreen";
export default async function CustomerDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return (
    <ProductDirectoryScreen
      area="customers"
      customerId={id}
      scenario="detail"
    />
  );
}
