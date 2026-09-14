"use client";

import { ServiceForm } from "./ServiceForm";
import { ServiceList } from "./ServiceList";

type ProductServicesProps = {
  scenario?: "edit" | "list" | "new";
  serviceId?: string;
};

export function ProductServicesScreen(props: ProductServicesProps) {
  const scenario = props.scenario ?? "list";
  if (scenario === "new" || scenario === "edit") {
    return (
      <ServiceForm edit={scenario === "edit"} serviceId={props.serviceId} />
    );
  }
  return <ServiceList />;
}
