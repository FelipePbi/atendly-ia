import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
export default async function CustomerDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; aba?: string; voltar?: string }>;
}) {
  const { id, aba, voltar } = await searchParams;
  return (
    <ProductCustomersScreen
      customerId={id}
      initialTab={aba}
      returnTo={voltar}
      scenario="detail"
    />
  );
}
