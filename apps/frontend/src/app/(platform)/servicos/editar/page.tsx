import { ProductDirectoryScreen } from "@/features/directory/ProductDirectoryScreen";
export default async function EditServicePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return (
    <ProductDirectoryScreen area="services" scenario="edit" serviceId={id} />
  );
}
