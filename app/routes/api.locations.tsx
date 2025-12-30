import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { GET_LOCATIONS_QUERY } from "../lib/graphql/get-inventory";

interface Location {
  id: string;
  name: string;
  isActive: boolean;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(GET_LOCATIONS_QUERY);
    const data = await response.json();

    const locations: Location[] = (data?.data?.locations?.edges || []).map(
      (edge: any) => ({
        id: edge.node.id,
        name: edge.node.name,
        isActive: edge.node.isActive,
      })
    );

    // Filter to only active locations
    const activeLocations = locations.filter((loc) => loc.isActive);

    return { locations: activeLocations };
  } catch (error) {
    console.error("Get locations error:", error);
    return Response.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}
