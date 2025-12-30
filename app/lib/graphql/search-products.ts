// GraphQL queries for searching products by title, SKU, or barcode

export const SEARCH_PRODUCTS_QUERY = `
  query SearchProducts($query: String!) {
    products(first: 10, query: $query) {
      edges {
        node {
          id
          title
          featuredImage {
            url
          }
          variants(first: 20) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Search by barcode specifically (for scanner input)
export const SEARCH_BY_BARCODE_QUERY = `
  query SearchByBarcode($barcode: String!) {
    productVariants(first: 1, query: $barcode) {
      edges {
        node {
          id
          title
          sku
          barcode
          price
          product {
            id
            title
            featuredImage {
              url
            }
          }
          inventoryItem {
            id
          }
        }
      }
    }
  }
`;
