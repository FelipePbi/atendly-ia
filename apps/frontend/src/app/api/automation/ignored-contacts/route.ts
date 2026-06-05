import { proxyBffJson } from "@/lib/bff";

export const runtime = "nodejs";

type IgnoredContactsListData = {
  contacts?: unknown[];
  pagination?: unknown;
};

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyBffJson<IgnoredContactsListData>(request, `/ignored-contacts${search}`, {
    transform: (data) => ({
      data: data.contacts ?? [],
      pagination: data.pagination,
    }),
  });
}

export async function POST(request: Request) {
  return proxyBffJson(request, "/ignored-contacts");
}
