import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-01";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  restResources,
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });

      const { shop, accessToken } = session;
      console.log('Shop: ', shop);
      console.log('Access Token: ', accessToken)
      await sendShop(shop, accessToken);
    },
  },
  future: {
    v3_webhookAdminContext: true,
    v3_authenticatePublic: true,
    unstable_newEmbeddedAuthStrategy: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

async function fetchWithHeaders(url, options) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

async function getShop(domain, accessToken) {
  const url = `https://${domain}/admin/api/${LATEST_API_VERSION}/shop.json`;
  
  console.log('Get Shop Endpoint: ', url);
  console.log('Get Shop Access Token: ', accessToken);
  
  const options = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    }
  };

  try {
    const data = await fetchWithHeaders(url, options);
    console.log('Shop data:', data.shop);
    return data.shop;
  } catch (error) {
    console.error('Error fetching shop data:', error);
  }
}

async function sendShop(domain, accessToken) {
  try {
    const shop = await getShop(domain, accessToken);
    if (!shop) {
      console.error('Failed to retrieve shop data');
      return;
    }

    shop.access_token = accessToken;
    shop.installation_status = true;
    shop.protection_percentage = 5;
    shop.minimum_protection_cost = 3;

    const url = 'http://localhost:7071/api/upsert';
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shop)
    };

    await fetchWithHeaders(url, options);
    console.log('Shop data sent successfully');
  } catch (error) {
    console.error('There was an error sending the request:', error);
  }
}

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
