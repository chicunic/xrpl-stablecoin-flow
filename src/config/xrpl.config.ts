import 'dotenv/config';
import { Client } from 'xrpl';

let client: Client;

export const initializeXRPLClient = async (): Promise<void> => {
  try {
    const network = process.env.XRPL_NETWORK ?? 'devnet';
    const defaultEndpoints = {
      devnet: 'wss://s.devnet.rippletest.net:51233',
      testnet: 'wss://s.altnet.rippletest.net:51233',
    };
    const xrplEndpoint =
      process.env.XRPL_ENDPOINT ??
      defaultEndpoints[network as keyof typeof defaultEndpoints] ??
      defaultEndpoints.devnet;

    client = new Client(xrplEndpoint);
    await client.connect();

    console.log(`✅ Connected to XRPL ${network}: ${xrplEndpoint}`);
  } catch (error) {
    console.error('❌ Failed to connect to XRPL:', error);
    throw error;
  }
};

export const getXRPLClient = (): Client => {
  if (!client?.isConnected()) {
    throw new Error('XRPL client not initialized or connected');
  }
  return client;
};

export const disconnectXRPLClient = async (): Promise<void> => {
  if (client?.isConnected()) {
    await client.disconnect();
    console.log('✅ Disconnected from XRPL');
  }
};
