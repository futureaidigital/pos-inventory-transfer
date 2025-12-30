// GraphQL query for fetching inventory levels at locations

export const GET_INVENTORY_LEVELS_QUERY = `
  query GetInventoryLevels($inventoryItemId: ID!) {
    inventoryItem(id: $inventoryItemId) {
      id
      inventoryLevels(first: 10) {
        edges {
          node {
            id
            location {
              id
              name
            }
            quantities(names: ["available", "on_hand"]) {
              name
              quantity
            }
          }
        }
      }
    }
  }
`;

// Query to get all locations for the shop
export const GET_LOCATIONS_QUERY = `
  query GetLocations {
    locations(first: 20) {
      edges {
        node {
          id
          name
          isActive
        }
      }
    }
  }
`;
