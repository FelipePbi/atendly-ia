import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
export default async function EditServicePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <ProductServicesScreen scenario="edit" serviceId={id} />;
}
