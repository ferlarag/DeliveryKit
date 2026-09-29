import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { DeliveryDetailPage } from "@/pages/delivery-detail-page";
import { DeliveriesPage } from "@/pages/deliveries-page";
import { DestinationsPage } from "@/pages/destinations-page";
import { IncomingPage } from "@/pages/incoming-page";
import { IncomingEndpointDetailPage } from "@/pages/incoming-endpoint-detail-page";
import "./index.css";

const rootRoute = createRootRoute({ component: AppShell });
const incomingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IncomingPage,
});
const incomingDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/incoming/$endpointId",
  component: IncomingDetailRoute,
});
function IncomingDetailRoute() {
  const { endpointId } = incomingDetailRoute.useParams();
  return <IncomingEndpointDetailPage key={endpointId} id={endpointId} />;
}
const destinationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/destinations",
  component: DestinationsPage,
});
const deliveriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deliveries",
  component: DeliveriesPage,
});
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deliveries/$deliveryId",
  component: DetailRoute,
});

function DetailRoute() {
  const { deliveryId } = detailRoute.useParams();
  return <DeliveryDetailPage key={deliveryId} id={deliveryId} />;
}

const router = createRouter({
  routeTree: rootRoute.addChildren([
    incomingRoute,
    incomingDetailRoute,
    destinationsRoute,
    deliveriesRoute,
    detailRoute,
  ]),
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
