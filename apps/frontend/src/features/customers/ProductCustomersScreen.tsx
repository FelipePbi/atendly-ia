"use client";

import { CustomerForm } from "./CustomerForm";
import { CustomerList } from "./CustomerList";
import { CustomerProfile } from "./CustomerProfile";

type ProductCustomersProps = {
  customerId?: string;
  scenario?: "detail" | "list" | "new";
};

export function ProductCustomersScreen(props: ProductCustomersProps) {
  const scenario = props.scenario ?? "list";
  if (scenario === "detail") {
    return <CustomerProfile customerId={props.customerId} />;
  }
  if (scenario === "new") {
    return <CustomerForm />;
  }
  return <CustomerList />;
}
