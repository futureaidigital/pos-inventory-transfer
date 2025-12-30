// GraphQL mutation for adjusting inventory (transfer between locations)

export const ADJUST_INVENTORY_MUTATION = `
  mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      inventoryAdjustmentGroup {
        id
        createdAt
        reason
        changes(first: 10) {
          edges {
            node {
              name
              delta
              location {
                name
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Helper to build the input for a transfer
export function buildTransferInput(
  inventoryItemId: string,
  originLocationId: string,
  destinationLocationId: string,
  quantity: number
) {
  return {
    reason: "movement",
    name: "available",
    changes: [
      {
        inventoryItemId,
        locationId: originLocationId,
        delta: -Math.abs(quantity), // Remove from origin
      },
      {
        inventoryItemId,
        locationId: destinationLocationId,
        delta: Math.abs(quantity), // Add to destination
      },
    ],
  };
}
