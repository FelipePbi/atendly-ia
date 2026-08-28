import { PreviewScreen, previewSlugs } from "@/features/preview/PreviewScreen";

export function generateStaticParams() {
  return previewSlugs.map((slug) => ({ slug }));
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PreviewScreen slug={slug} />;
}
